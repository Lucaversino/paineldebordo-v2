import hashlib
import hmac
import json
import math
import os
from datetime import datetime, timedelta
from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlparse
from zoneinfo import ZoneInfo

import copernicusmarine

DATASET_ID = "cmems_mod_glo_bgc-pft_anfc_0.25deg_P1D-m"
TZ = ZoneInfo("America/Sao_Paulo")


def _json(handler, status, payload, cache_control="no-store"):
    body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Cache-Control", cache_control)
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def _expected_internal_token(username: str, password: str) -> str:
    raw = f"{username}:{password}:painel-de-bordo-copernicus".encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def _to_float(value):
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(number) or abs(number) > 1e20:
        return None
    return number


def _forecast(lat: float, lon: float, days: int, username: str, password: str):
    start = datetime.now(TZ).date()
    end = start + timedelta(days=days - 1)

    dataset = copernicusmarine.open_dataset(
        dataset_id=DATASET_ID,
        variables=["chl"],
        minimum_longitude=lon,
        maximum_longitude=lon,
        minimum_latitude=lat,
        maximum_latitude=lat,
        minimum_depth=0.0,
        maximum_depth=1.0,
        start_datetime=f"{start.isoformat()}T00:00:00",
        end_datetime=f"{end.isoformat()}T23:59:59",
        coordinates_selection_method="nearest",
        username=username,
        password=password,
    )

    chl = dataset["chl"]
    if "depth" in chl.dims:
        chl = chl.isel(depth=0)
    if "latitude" in chl.dims:
        chl = chl.sel(latitude=lat, method="nearest")
    if "longitude" in chl.dims:
        chl = chl.sel(longitude=lon, method="nearest")
    chl = chl.squeeze(drop=True).load()

    by_date = {}
    if "time" in chl.dims:
        times = chl["time"].values
        values = chl.values.reshape(-1)
        for stamp, raw_value in zip(times, values):
            key = str(stamp)[:10]
            value = _to_float(raw_value)
            if value is not None:
                by_date[key] = value
    else:
        value = _to_float(chl.values)
        if value is not None:
            by_date[start.isoformat()] = value

    values = []
    for offset in range(days):
        date_key = (start + timedelta(days=offset)).isoformat()
        values.append({
            "date": date_key,
            "mgM3": by_date.get(date_key),
            "model": "Copernicus Marine / NEMO" if date_key in by_date else None,
        })

    return {
        "source": "Copernicus Marine / GLOBAL_ANALYSISFORECAST_BGC_001_028",
        "dataset": DATASET_ID,
        "variable": "chl",
        "units": "mg m-3",
        "depth": "surface (~0.49 m)",
        "values": values,
    }


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        username = os.environ.get("COPERNICUSMARINE_SERVICE_USERNAME", "").strip()
        password = os.environ.get("COPERNICUSMARINE_SERVICE_PASSWORD", "").strip()

        if not username or not password:
            return _json(self, 503, {
                "error": "Copernicus Marine não configurado.",
                "required": [
                    "COPERNICUSMARINE_SERVICE_USERNAME",
                    "COPERNICUSMARINE_SERVICE_PASSWORD",
                ],
            })

        supplied = self.headers.get("x-panel-copernicus", "")
        expected = _expected_internal_token(username, password)
        if not supplied or not hmac.compare_digest(supplied, expected):
            return _json(self, 403, {"error": "Acesso interno negado."})

        try:
            query = parse_qs(urlparse(self.path).query)
            lat = float(query.get("lat", [""])[0])
            lon = float(query.get("lon", [""])[0])
            days = int(query.get("days", ["7"])[0])
        except (TypeError, ValueError):
            return _json(self, 400, {"error": "Latitude, longitude ou período inválido."})

        if lat < -80 or lat > 90 or lon < -180 or lon > 180:
            return _json(self, 400, {"error": "Posição fora da cobertura do produto Copernicus."})
        days = max(1, min(days, 10))

        try:
            payload = _forecast(lat, lon, days, username, password)
            return _json(self, 200, payload, "private, max-age=0, s-maxage=900, stale-while-revalidate=3600")
        except Exception as exc:
            print("copernicus chlorophyll error:", repr(exc))
            return _json(self, 502, {
                "error": "Copernicus Marine temporariamente indisponível.",
                "dataset": DATASET_ID,
            })

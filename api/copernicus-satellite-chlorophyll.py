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

# V223 - leitura ATUAL por satélite. Este endpoint é separado do endpoint de
# previsão para não alterar em nada o Copernicus NEMO/PISCES que já funciona.
DATASET_ID = "cmems_obs-oc_glo_bgc-plankton_nrt_l4-gapfree-multi-4km_P1D"
VARIABLE = "CHL"
TZ = ZoneInfo("America/Sao_Paulo")
GRID_STEP = 0.18
SOURCE = "Copernicus Marine Ocean Colour · SATÉLITE NRT"


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
    if not math.isfinite(number) or number < 0.001 or number > 1000:
        return None
    return number


def _stamp_to_iso(value):
    text = str(value)
    if not text:
        return None
    # numpy.datetime64 costuma chegar como YYYY-MM-DDTHH:MM:SS.000000000.
    # Para o painel basta uma data/hora ISO estável.
    return text.replace(" ", "T")


def _grid_points(lat: float, lon: float):
    rows = []
    for row in range(3):
        for col in range(3):
            rows.append({
                "lat": lat + (1 - row) * GRID_STEP,
                "lon": lon + (col - 1) * GRID_STEP,
                "row": row,
                "col": col,
            })
    return rows


def _value_at(chl_slice, lat: float, lon: float):
    try:
        selected = chl_slice
        if "latitude" in selected.dims:
            selected = selected.sel(latitude=lat, method="nearest")
        if "longitude" in selected.dims:
            selected = selected.sel(longitude=lon, method="nearest")
        return _to_float(selected.squeeze(drop=True).values)
    except Exception:
        return None


def _current_satellite(lat: float, lon: float, username: str, password: str):
    # O produto NRT tem pequena latência operacional. Consultamos os últimos
    # 10 dias e escolhemos a observação MAIS RECENTE realmente disponível.
    today = datetime.now(TZ).date()
    start = today - timedelta(days=10)
    margin = GRID_STEP + 0.08

    dataset = copernicusmarine.open_dataset(
        dataset_id=DATASET_ID,
        variables=[VARIABLE],
        minimum_longitude=max(-179.99, lon - margin),
        maximum_longitude=min(179.99, lon + margin),
        minimum_latitude=max(-89.99, lat - margin),
        maximum_latitude=min(89.99, lat + margin),
        start_datetime=f"{start.isoformat()}T00:00:00",
        end_datetime=f"{today.isoformat()}T23:59:59",
        coordinates_selection_method="nearest",
        username=username,
        password=password,
    )

    chl = dataset[VARIABLE].load()
    points = _grid_points(lat, lon)

    if "time" in chl.dims:
        times = list(chl["time"].values)
        # A célula central deve ter dado válido. Se por algum motivo não tiver,
        # aceitamos o dia mais recente que possua ao menos uma célula válida na
        # grade e deixamos a central nula para o fallback NOAA no Next.js.
        chosen_slice = None
        chosen_time = None
        for index in range(len(times) - 1, -1, -1):
            day = chl.isel(time=index)
            center = _value_at(day, lat, lon)
            if center is not None:
                chosen_slice = day
                chosen_time = _stamp_to_iso(times[index])
                break
            if chosen_slice is None:
                if any(_value_at(day, p["lat"], p["lon"]) is not None for p in points):
                    chosen_slice = day
                    chosen_time = _stamp_to_iso(times[index])
        if chosen_slice is None:
            return {
                "source": SOURCE,
                "dataset": DATASET_ID,
                "variable": VARIABLE,
                "units": "mg m-3",
                "current": None,
                "grid": [],
            }
    else:
        chosen_slice = chl
        chosen_time = None

    grid = []
    for point in points:
        value = _value_at(chosen_slice, point["lat"], point["lon"])
        grid.append({
            **point,
            "mgM3": value,
            "time": chosen_time,
            "source": SOURCE if value is not None else None,
            "dataset": DATASET_ID if value is not None else None,
        })

    center = next((item for item in grid if item["row"] == 1 and item["col"] == 1), None)
    return {
        "source": SOURCE,
        "dataset": DATASET_ID,
        "variable": VARIABLE,
        "units": "mg m-3",
        "current": center,
        "grid": grid,
    }


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        username = os.environ.get("COPERNICUSMARINE_SERVICE_USERNAME", "").strip()
        password = os.environ.get("COPERNICUSMARINE_SERVICE_PASSWORD", "").strip()

        if not username or not password:
            return _json(self, 503, {
                "error": "Copernicus Marine não configurado para a leitura de satélite.",
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
        except (TypeError, ValueError):
            return _json(self, 400, {"error": "Latitude ou longitude inválida."})

        if lat < -80 or lat > 80 or lon < -180 or lon > 180:
            return _json(self, 400, {"error": "Posição fora da cobertura operacional."})

        try:
            payload = _current_satellite(lat, lon, username, password)
            return _json(self, 200, payload, "private, max-age=0, s-maxage=600, stale-while-revalidate=1800")
        except Exception as exc:
            print("copernicus satellite chlorophyll error:", repr(exc))
            return _json(self, 502, {
                "error": "Clorofila por satélite temporariamente indisponível.",
                "dataset": DATASET_ID,
            })

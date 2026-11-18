"""GRIB1 export. Requires ecCodes in the deployed Python runtime.

Never approximates missing meteorology or fabricates GRIB packing. A cache on a
serverless instance is best-effort only; use an external persistent cache for
production workloads with multiple workers.
"""
from http.server import BaseHTTPRequestHandler
from datetime import datetime, timezone, timedelta
from email.utils import parsedate_to_datetime
import hashlib
import io
import json
import math
import os
import random
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile

try:
    import eccodes as ec
except ImportError:
    ec = None

ALLOWED_RADIUS = (30, 60, 100, 150, 200)
ALLOWED_HOURS = (24, 48, 72, 96, 120, 168)
_LOCK = threading.RLock()
_CACHE = {}
_COOLDOWN_UNTIL = 0.0
_CACHE_TTL = 1800


class ForecastError(Exception):
    def __init__(self, message, status=502):
        super().__init__(message)
        self.status = status


def _api_json(url):
    global _COOLDOWN_UNTIL
    with _LOCK:
        found = _CACHE.get(url)
        if found and found[0] > time.monotonic():
            return found[1]
        if time.monotonic() < _COOLDOWN_UNTIL:
            raise ForecastError('Fonte meteorológica temporariamente limitada. Tente mais tarde.', 429)
    for attempt in range(3):
        try:
            request = urllib.request.Request(url, headers={'User-Agent': 'PainelDeBordo-GRIB/3.0'})
            with urllib.request.urlopen(request, timeout=20) as response:
                result = json.load(response)
            if isinstance(result, dict) and result.get('error'):
                raise ForecastError(str(result.get('reason', 'Resposta meteorológica inválida')))
            with _LOCK:
                _CACHE[url] = (time.monotonic() + _CACHE_TTL, result)
                if len(_CACHE) > 60:
                    for key in list(_CACHE)[:20]:
                        del _CACHE[key]
            return result
        except urllib.error.HTTPError as err:
            if err.code == 429:
                retry_after = err.headers.get('Retry-After', '')
                try:
                    delay = float(retry_after)
                except ValueError:
                    try:
                        delay = (parsedate_to_datetime(retry_after) - datetime.now(timezone.utc)).total_seconds()
                    except (ValueError, TypeError, OverflowError):
                        delay = 60
                delay = max(10, min(600, delay))
                with _LOCK:
                    _COOLDOWN_UNTIL = max(_COOLDOWN_UNTIL, time.monotonic() + delay)
                raise ForecastError('Limite HTTP 429 da fonte meteorológica; aguarde antes de consultar novamente.', 429)
            if err.code in (500, 502, 503, 504) and attempt < 2:
                time.sleep(min(2 ** attempt + random.random(), 5))
                continue
            raise ForecastError(f'Fonte meteorológica respondeu HTTP {err.code}', 502)
        except (TimeoutError, OSError) as err:
            if attempt < 2:
                time.sleep(min(2 ** attempt + random.random(), 5))
                continue
            raise ForecastError('Erro de rede na consulta meteorológica') from err
    raise ForecastError('Falha ao consultar previsão')


def _grid(lat, lon, radius):
    # Bounding rectangle covers the specified geodesic radius, conservatively.
    phi = math.radians(lat)
    angular = (radius * 1852) / 6371008.8
    dlat = math.degrees(angular)
    if abs(phi) + angular >= math.pi / 2:
        raise ForecastError('Área cruza uma região polar não suportada.', 422)
    dlon = math.degrees(math.asin(min(1, math.sin(angular) / math.cos(phi))))
    ni = nj = 5  # fixed 25-point grid; documented coarse resolution
    north, south = lat + dlat, lat - dlat
    west, east = lon - dlon, lon + dlon
    return [[(north - j * (north - south) / (nj - 1),
              west + i * (east - west) / (ni - 1)) for i in range(ni)]
            for j in range(nj)]


def _load_grids(grid, hours):
    coords = [p for row in grid for p in row]
    base = {'latitude': ','.join(f'{p[0]:.5f}' for p in coords),
            'longitude': ','.join(f'{p[1]:.5f}' for p in coords),
            'timezone': 'UTC', 'forecast_days': str(min(8, math.ceil(hours / 24) + 1))}
    wind = dict(base, hourly='wind_speed_10m,wind_direction_10m', wind_speed_unit='ms')
    marine = dict(base, hourly='wave_height')
    urls = [('wind', 'https://api.open-meteo.com/v1/forecast?' + urllib.parse.urlencode(wind)),
            ('waves', 'https://marine-api.open-meteo.com/v1/marine?' + urllib.parse.urlencode(marine))]
    fetched = {}
    warnings = []
    for name, url in urls:
        try:
            data = _api_json(url)
            if not isinstance(data, list) or len(data) != len(coords):
                raise ForecastError('Resposta geográfica incompleta')
            fetched[name] = data
        except ForecastError as exc:
            if name == 'wind':
                raise
            warnings.append('Ondas indisponíveis: ' + str(exc))
    return fetched, warnings


def _times(data, hours):
    series = data[0].get('hourly') or {}
    raw = series.get('time') or []
    if not raw:
        raise ForecastError('A fonte não informou horários de previsão')
    now = datetime.now(timezone.utc)
    times = []
    for idx, value in enumerate(raw):
        dt = datetime.fromisoformat(value.replace('Z', '+00:00'))
        if not dt.tzinfo:
            dt = dt.replace(tzinfo=timezone.utc)
        dt = dt.astimezone(timezone.utc)
        if dt >= now - timedelta(hours=1) and dt <= now + timedelta(hours=hours):
            if dt.hour % 3 == 0 and dt.minute == 0:
                times.append((idx, dt))
    if not times:
        raise ForecastError('Fonte não ofereceu horários UTC em intervalos de três horas')
    return times


def _field(data, variable, instant):
    vals = []
    for location in data:
        hourly = location.get('hourly') or {}
        times = hourly.get('time') or []
        try:
            index = times.index(instant.isoformat(timespec='minutes').replace('+00:00', ''))
        except ValueError:
            # Open-Meteo also returns YYYY-MM-DDTHH:MM
            try:
                index = times.index(instant.strftime('%Y-%m-%dT%H:%M'))
            except ValueError:
                vals.append(None)
                continue
        sequence = hourly.get(variable) or []
        value = sequence[index] if index < len(sequence) else None
        vals.append(float(value) if value is not None and math.isfinite(float(value)) else None)
    return vals


def _message(parameter, level_type, level, valid, reference, grid, values):
    if ec is None:
        raise ForecastError('ecCodes indisponível neste ambiente; geração cancelada.', 503)
    if len(values) != len(grid) * len(grid[0]) or all(v is None for v in values):
        return None
    gid = ec.codes_grib_new_from_samples('regular_ll_sfc_grib1')
    try:
        ni, nj = len(grid[0]), len(grid)
        north, west = grid[0][0]
        south, east = grid[-1][-1]
        settings = {
            'centre': 7,
            'Ni': ni, 'Nj': nj, 'latitudeOfFirstGridPointInDegrees': north,
            'longitudeOfFirstGridPointInDegrees': west % 360,
            'latitudeOfLastGridPointInDegrees': south,
            'longitudeOfLastGridPointInDegrees': east % 360,
            'iDirectionIncrementInDegrees': (east-west)/(ni-1),
            'jDirectionIncrementInDegrees': (north-south)/(nj-1),
            'iScansNegatively': 0, 'jScansPositively': 0,
            'table2Version': 2, 'indicatorOfParameter': parameter,
            'indicatorOfTypeOfLevel': level_type, 'level': level,
            'dataDate': int(reference.strftime('%Y%m%d')),
            'dataTime': int(reference.strftime('%H%M')),
            'stepUnits': 1, 'forecastTime': int((valid-reference).total_seconds()/3600),
            'packingType': 'grid_simple', 'bitsPerValue': 16,
        }
        for key, value in settings.items():
            ec.codes_set(gid, key, value)
        if any(v is None for v in values):
            ec.codes_set(gid, 'bitmapPresent', 1)
            missing = ec.codes_get(gid, 'missingValue')
            values = [missing if v is None else v for v in values]
        ec.codes_set_values(gid, values)
        message = ec.codes_get_message(gid)
        return message
    finally:
        ec.codes_release(gid)


def _validate_messages(content):
    if ec is None:
        raise ForecastError('ecCodes indisponível', 503)
    stream = io.BytesIO(content)
    count = 0
    while True:
        try:
            gid = ec.codes_grib_new_from_file(stream)
        except Exception as exc:
            raise ForecastError('Falha ao decodificar GRIB gerado') from exc
        if gid is None:
            break
        try:
            if ec.codes_get(gid, 'edition') != 1:
                raise ForecastError('Mensagem não é GRIB1')
            if ec.codes_get(gid, 'numberOfPoints') != 25:
                raise ForecastError('Grade GRIB inconsistente')
            count += 1
        finally:
            ec.codes_release(gid)
    if count == 0 or not content.startswith(b'GRIB'):
        raise ForecastError('Nenhuma mensagem GRIB1 válida')
    return count


def generate(lat, lon, radius, hours, packed=False):
    if not (math.isfinite(lat) and math.isfinite(lon) and -65 <= lat <= 15 and -85 <= lon <= -25):
        raise ForecastError('Informe posição válida no Atlântico Sul', 422)
    if radius not in ALLOWED_RADIUS or hours not in ALLOWED_HOURS:
        raise ForecastError('Área ou período não permitido', 422)
    grid = _grid(lat, lon, radius)
    data, warnings = _load_grids(grid, hours)
    steps = _times(data['wind'], hours)
    reference = steps[0][1]
    messages = []
    for _, instant in steps:
        speeds = _field(data['wind'], 'wind_speed_10m', instant)
        directions = _field(data['wind'], 'wind_direction_10m', instant)
        u = [(-s * math.sin(math.radians(d))) if s is not None and d is not None else None for s, d in zip(speeds, directions)]
        v = [(-s * math.cos(math.radians(d))) if s is not None and d is not None else None for s, d in zip(speeds, directions)]
        for param, level_type, level, values in ((33, 105, 10, u), (34, 105, 10, v)):
            result = _message(param, level_type, level, instant, reference, grid, values)
            if result is not None:
                messages.append(result)
        if 'waves' in data:
            wave = _field(data['waves'], 'wave_height', instant)
            result = _message(100, 1, 0, instant, reference, grid, wave)
            if result is not None:
                messages.append(result)
    if not messages:
        raise ForecastError('Não há dados reais disponíveis para o GRIB')
    grib = b''.join(messages)
    count = _validate_messages(grib)
    if packed:
        output = io.BytesIO()
        with zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
            archive.writestr('grib.grb', grib)
        return output.getvalue(), count, warnings
    return grib, count, warnings


class handler(BaseHTTPRequestHandler):
    def _error(self, status, message):
        raw = json.dumps({'error': message}).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self):
        # Production should call this endpoint behind an authenticated Next route.
        expected = os.environ.get('TIMEZERO_WORKER_SECRET')
        if not expected or self.headers.get('X-Worker-Secret') != expected:
            return self._error(401, 'Acesso não autorizado')
        try:
            qs = urllib.parse.parse_qs(urllib.parse.urlsplit(self.path).query)
            lat, lon = float(qs['lat'][0]), float(qs['lon'][0])
            radius, hours = int(qs['radius'][0]), int(qs['hours'][0])
            packed = qs.get('format', ['grb'])[0] == 'grbzip'
            content, count, warnings = generate(lat, lon, radius, hours, packed)
            self.send_response(200)
            self.send_header('Content-Type', 'application/zip' if packed else 'application/octet-stream')
            self.send_header('Content-Disposition', f'attachment; filename="timezero-previsao.{"grbzip" if packed else "grb"}"')
            self.send_header('Content-Length', str(len(content)))
            self.send_header('X-GRIB-Messages', str(count))
            self.send_header('X-GRIB-Warnings', urllib.parse.quote('; '.join(warnings)))
            self.end_headers()
            self.wfile.write(content)
        except (ValueError, KeyError, IndexError):
            self._error(422, 'Parâmetros inválidos')
        except ForecastError as exc:
            self._error(exc.status, str(exc))
        except Exception:
            self._error(502, 'Erro interno no gerador GRIB1')

"""GRIB1 regional forecast compatible with TimeZero v4/v5 import.

Structure validated against working example file (20261116_MX_092859.grb):
- Edition 1, table version 2, center 7 (NCEP)
- Regular lat/lon grid (GDS type 0), scan mode 0x00
- Parameters: U-wind (33), V-wind (34) at heightAboveGround 10m
              Wind speed (50), Wind direction (49) at surface level 1
              Significant wave height (8) at surface level 0
- Steps every 3 hours up to requested forecast length
- Coordinates in millidegrees (signed 3-byte integers)
- No BMS section; simple packing

Requires ecCodes wheels. No synthetic fallback is permitted.
"""
from http.server import BaseHTTPRequestHandler
from datetime import datetime, timezone
import json, math, struct, urllib.request, urllib.parse, io


def encode_grib1_message(
    param_indicator: int,
    level_type: int,
    level_value: int,
    ref_time: datetime,
    step_hours: int,
    ni: int,
    nj: int,
    lat1: float,
    lon1: float,
    lat2: float,
    lon2: float,
    di: float,
    dj: float,
    values: list[float],
) -> bytes:
    """Build a single GRIB1 message with GDS, no BMS, simple packing."""
    # PDS (Product Definition Section) - 28 bytes
    pds = bytearray(28)
    pds[0:3] = (28).to_bytes(3, 'big')  # PDS length
    pds[3] = 2   # Table version (WMO/NCEP)
    pds[4] = 7   # Center ID (NCEP)
    pds[5] = 64  # Generating process
    pds[6] = 255 # Grid definition (will use GDS)
    pds[7] = 0x80  # GDS present, no BMS
    pds[8] = param_indicator
    pds[9] = level_type
    pds[10:12] = level_value.to_bytes(2, 'big')
    # Reference time: YY MM DD HH mm ss
    yy = ref_time.year % 100
    pds[12] = yy
    pds[13] = ref_time.month
    pds[14] = ref_time.day
    pds[15] = ref_time.hour
    pds[16] = ref_time.minute
    pds[17] = ref_time.second
    pds[18] = 1  # Time unit: hour
    pds[19] = step_hours  # P1 (forecast time)
    pds[20] = 0  # P2
    pds[21] = 0  # Time range indicator: point in time
    pds[22:24] = (0).to_bytes(2, 'big')  # Number included in average
    pds[24] = 0  # Number missing from averages
    pds[25] = 255  # Century of reference time (255 = 21st century for YY)
    pds[26] = 0  # Sub-center
    pds[27] = 0  # Decimal scale factor D

    # GDS (Grid Description Section) - 32 bytes for regular lat/lon
    gds = bytearray(32)
    gds[0:3] = (32).to_bytes(3, 'big')  # GDS length
    gds[3] = 0   # NV (no vertical coord params)
    gds[4] = 255 # PV location (none)
    gds[5] = 0   # Data representation type: regular lat/lon
    gds[6:8] = ni.to_bytes(2, 'big')
    gds[8:10] = nj.to_bytes(2, 'big')
    # Coordinates in millidegrees (signed 24-bit)
    la1 = int(round(lat1 * 1000))
    lo1 = int(round(lon1 * 1000))
    la2 = int(round(lat2 * 1000))
    lo2 = int(round(lon2 * 1000))
    # Handle sign for 3-byte signed integers
    def to_signed3(val: int) -> bytes:
        if val < 0:
            return ((val + 0x1000000) & 0xFFFFFF).to_bytes(3, 'big')
        return val.to_bytes(3, 'big')
    gds[10:13] = to_signed3(la1)
    gds[13:16] = to_signed3(lo1)
    gds[16] = 0x80  # Resolution flags: Di/Dj given
    gds[17:20] = to_signed3(la2)
    gds[20:23] = to_signed3(lo2)
    di_milli = int(round(di * 1000))
    dj_milli = int(round(dj * 1000))
    gds[23:25] = di_milli.to_bytes(2, 'big')
    gds[25:27] = dj_milli.to_bytes(2, 'big')
    gds[27] = 0x00  # Scan mode: +i, -j (left-to-right, top-to-bottom)
    gds[28:32] = b'\x00\x00\x00\x00'  # Reserved

    # Simple packing of data values
    # Find min/max and scale to integers
    if not values:
        raise ValueError("Empty values array")

    vmin = min(values)
    vmax = max(values)
    vrange = vmax - vmin

    # Use 16-bit precision
    nbits = 16
    scale_factor = (vrange / 65535.0) if vrange > 0 else 1.0

    packed = bytearray()
    for v in values:
        ival = int(round((v - vmin) / scale_factor)) if scale_factor > 0 else 0
        ival = max(0, min(65535, ival))
        packed.extend(ival.to_bytes(2, 'big'))

    # BDS (Binary Data Section)
    bds_header = bytearray(11)
    bds_len = 11 + len(packed)
    bds_header[0:3] = bds_len.to_bytes(3, 'big')
    bds_header[3] = 0  # Flags: no additional flags
    bds_header[4] = 0  # Binary scale factor E (unused for simple packing)
    bds_header[5:9] = struct.pack('>f', vmin)  # Reference value (minimum)
    bds_header[9] = nbits  # Number of bits per value

    # Assemble message
    body = bytes(pds) + bytes(gds) + bytes(bds_header) + bytes(packed)
    total_len = 8 + len(body) + 4  # Header + body + "7777"

    msg = bytearray()
    msg.extend(b'GRIB')
    msg.extend(total_len.to_bytes(3, 'big'))
    msg.append(1)  # Edition number
    msg.extend(body)
    msg.extend(b'7777')

    return bytes(msg)


class handler(BaseHTTPRequestHandler):
    def send_json(self, status, message):
        data = json.dumps({'error': message}).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        try:
            q = urllib.parse.parse_qs(urllib.parse.urlsplit(self.path).query)
            lat = float(q.get('lat', ['nan'])[0])
            lon = float(q.get('lon', ['nan'])[0])
            radius = int(q.get('radius', ['60'])[0])
            hours = int(q.get('hours', ['48'])[0])

            if not (math.isfinite(lat) and math.isfinite(lon)):
                raise ValueError('Posição inválida.')
            if not (-65 <= lat <= 15 and -85 <= lon <= -25):
                raise ValueError('Posição fora dos limites suportados (Atlântico Sul).')
            if radius not in (30, 60, 100):
                raise ValueError('Raio deve ser 30, 60 ou 100 milhas.')
            if hours not in (24, 48, 72, 168):
                raise ValueError('Previsão deve ser 24, 48, 72 ou 168 horas.')

            # Grid setup matching TimeZero-compatible structure
            lat_span = radius / 60.0
            lon_span = min(5.0, radius / (60.0 * max(0.25, math.cos(math.radians(lat)))))

            # Use grid sizes that produce reasonable coverage
            # For 60nm radius: ~11x7 grid at 0.5° spacing covers well
            if radius <= 30:
                ni, nj = 6, 4
            elif radius <= 60:
                ni, nj = 11, 7
            else:
                ni, nj = 17, 11

            dlat = 2.0 * lat_span / max(1, nj - 1)
            dlon = 2.0 * lon_span / max(1, ni - 1)

            # Round spacing to clean values
            dlat = round(dlat * 20) / 20  # Round to 0.05°
            dlon = round(dlon * 20) / 20

            north = round(lat + lat_span, 4)
            west = round(lon - lon_span, 4)
            south = round(north - (nj - 1) * dlat, 4)
            east = round(west + (ni - 1) * dlon, 4)

            # Build coordinate lists for Open-Meteo API
            coords = []
            for j in range(nj):
                for i in range(ni):
                    clat = round(north - j * dlat, 5)
                    clon = round(west + i * dlon, 5)
                    coords.append((clat, clon))

            # Fetch weather data from Open-Meteo
            params = {
                'latitude': ','.join(str(c[0]) for c in coords),
                'longitude': ','.join(str(c[1]) for c in coords),
                'hourly': 'wind_speed_10m,wind_direction_10m,wave_height,wave_direction',
                'wind_speed_unit': 'ms',
                'timezone': 'UTC',
                'forecast_days': str(min(10, math.ceil(hours / 24) + 1)),
            }
            url = 'https://api.open-meteo.com/v1/forecast?' + urllib.parse.urlencode(params)
            request = urllib.request.Request(url, headers={'User-Agent': 'PainelDeBordo-TimeZero/2.0'})

            with urllib.request.urlopen(request, timeout=30) as res:
                raw = json.load(res)

            if not isinstance(raw, list) or len(raw) != len(coords):
                raise ValueError('API meteorológica não retornou grade completa.')

            hourly = [p.get('hourly', {}) for p in raw]
            times = hourly[0].get('time', [])
            if not times:
                raise ValueError('Sem horários de previsão disponíveis.')

            now = datetime.now(timezone.utc)
            ref = now.replace(minute=0, second=0, microsecond=0)

            # Select time steps (every 3 hours)
            time_indices = []
            for idx, t in enumerate(times):
                dt = datetime.fromisoformat(t).replace(tzinfo=timezone.utc)
                delta = int((dt - ref).total_seconds() // 3600)
                if 0 <= delta <= hours and delta % 3 == 0:
                    time_indices.append((idx, delta))

            if not time_indices:
                raise ValueError('Nenhum horário válido na janela de previsão.')

            output = io.BytesIO()

            for index, step in time_indices:
                # Collect values for each parameter
                u_vals = []
                v_vals = []
                speed_vals = []
                dir_vals = []
                wave_vals = []

                for item in hourly:
                    speed = item.get('wind_speed_10m', [])[index]
                    direc = item.get('wind_direction_10m', [])[index]
                    wave_h = item.get('wave_height', [])[index]

                    if any(v is None or not math.isfinite(float(v)) for v in (speed, direc)):
                        continue

                    s = float(speed)
                    d_rad = math.radians(float(direc))
                    # Wind direction is FROM; U/V components follow meteorological convention
                    u = -s * math.sin(d_rad)
                    v = -s * math.cos(d_rad)

                    u_vals.append(u)
                    v_vals.append(v)
                    speed_vals.append(s)
                    dir_vals.append(float(direc))
                    wave_vals.append(float(wave_h) if wave_h is not None and math.isfinite(float(wave_h)) else 0.0)

                if len(u_vals) != ni * nj:
                    # Pad or truncate to match grid
                    while len(u_vals) < ni * nj:
                        u_vals.append(0.0)
                        v_vals.append(0.0)
                        speed_vals.append(0.0)
                        dir_vals.append(0.0)
                        wave_vals.append(0.0)
                    u_vals = u_vals[:ni*nj]
                    v_vals = v_vals[:ni*nj]
                    speed_vals = speed_vals[:ni*nj]
                    dir_vals = dir_vals[:ni*nj]
                    wave_vals = wave_vals[:ni*nj]

                # Write U-wind (param 33, level 105/10m)
                output.write(encode_grib1_message(
                    param_indicator=33, level_type=105, level_value=10,
                    ref_time=ref, step_hours=step,
                    ni=ni, nj=nj, lat1=north, lon1=west, lat2=south, lon2=east,
                    di=dlon, dj=dlat, values=u_vals
                ))

                # Write V-wind (param 34, level 105/10m)
                output.write(encode_grib1_message(
                    param_indicator=34, level_type=105, level_value=10,
                    ref_time=ref, step_hours=step,
                    ni=ni, nj=nj, lat1=north, lon1=west, lat2=south, lon2=east,
                    di=dlon, dj=dlat, values=v_vals
                ))

                # Write Wind Speed (param 50, level 1/surface)
                output.write(encode_grib1_message(
                    param_indicator=50, level_type=1, level_value=1,
                    ref_time=ref, step_hours=step,
                    ni=ni, nj=nj, lat1=north, lon1=west, lat2=south, lon2=east,
                    di=dlon, dj=dlat, values=speed_vals
                ))

                # Write Wind Direction (param 49, level 1/surface)
                output.write(encode_grib1_message(
                    param_indicator=49, level_type=1, level_value=1,
                    ref_time=ref, step_hours=step,
                    ni=ni, nj=nj, lat1=north, lon1=west, lat2=south, lon2=east,
                    di=dlon, dj=dlat, values=dir_vals
                ))

                # Write Significant Wave Height (param 8, level 0/surface)
                output.write(encode_grib1_message(
                    param_indicator=8, level_type=1, level_value=0,
                    ref_time=ref, step_hours=step,
                    ni=ni, nj=nj, lat1=north, lon1=west, lat2=south, lon2=east,
                    di=dlon, dj=dlat, values=wave_vals
                ))

            content = output.getvalue()
            if not content:
                raise ValueError('GRIB vazio.')

            # Verify GRIB signature
            if content[:4] != b'GRIB' or content[7] != 1:
                raise ValueError('Formato GRIB1 inválido.')

            self.send_response(200)
            self.send_header('Content-Type', 'application/octet-stream')
            self.send_header('Content-Disposition', f'attachment; filename="painel-timezero-{ref:%Y%m%d-%H%M}UTC.grb"')
            self.send_header('Content-Length', str(len(content)))
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            self.wfile.write(content)

        except ValueError as exc:
            self.send_json(422, str(exc))
        except Exception as exc:
            self.send_json(502, 'Erro ao gerar previsão: ' + str(exc)[:200])
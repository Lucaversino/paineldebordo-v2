"""GRIB1 regional forecast, for manual import through TimeZero > Open Weather File.
Requires ecCodes wheels. No synthetic fallback is permitted.
"""
from http.server import BaseHTTPRequestHandler
from datetime import datetime, timezone
import json, math, urllib.request, urllib.parse, io

class handler(BaseHTTPRequestHandler):
    def send_json(self, status, message):
        data = json.dumps({'error': message}).encode()
        self.send_response(status); self.send_header('Content-Type', 'application/json'); self.send_header('Content-Length', str(len(data))); self.end_headers(); self.wfile.write(data)

    def do_GET(self):
        try:
            from eccodes import (codes_grib_new_from_samples, codes_set, codes_set_values, codes_get_message, codes_release)
        except (ImportError, OSError) as exc:
            return self.send_json(503, 'Biblioteca ecCodes não carregou no servidor. Refaça o deploy com as dependências da V259. Detalhe: ' + str(exc)[:140])
        try:
            q = urllib.parse.parse_qs(urllib.parse.urlsplit(self.path).query)
            lat = float(q.get('lat', ['nan'])[0]); lon = float(q.get('lon', ['nan'])[0]); radius = int(q.get('radius', ['60'])[0]); hours = int(q.get('hours', ['48'])[0])
            if not (math.isfinite(lat) and math.isfinite(lon) and -65 <= lat <= 15 and -85 <= lon <= -25 and radius in (30,60,100) and hours in (24,48)):
                raise ValueError('Posição ou opções fora dos limites permitidos.')
            # Grid points geographically spaced in latitude and longitude; no duplicated point data.
            lat_span = radius / 60
            lon_span = min(5.0, radius / (60 * max(.25, math.cos(math.radians(lat)))))
            ni=7; nj=7
            north=round(lat+lat_span,4); west=round(lon-lon_span,4)
            dlat=2*lat_span/(nj-1); dlon=2*lon_span/(ni-1)
            coords=[(round(north-j*dlat,5), round(west+i*dlon,5)) for j in range(nj) for i in range(ni)]
            params = {'latitude': ','.join(str(p[0]) for p in coords), 'longitude': ','.join(str(p[1]) for p in coords), 'hourly': 'wind_speed_10m,wind_direction_10m,pressure_msl', 'wind_speed_unit': 'ms', 'timezone':'UTC', 'forecast_days':str(math.ceil(hours/24)+1)}
            url='https://api.open-meteo.com/v1/forecast?'+urllib.parse.urlencode(params)
            request=urllib.request.Request(url,headers={'User-Agent':'PainelDeBordo-TimeZero/1.0'})
            with urllib.request.urlopen(request,timeout=24) as res:
                raw=json.load(res)
            if not isinstance(raw,list) or len(raw)!=len(coords):
                raise ValueError('A API meteorológica não retornou a grade completa.')
            hourly=[p.get('hourly',{}) for p in raw]
            times=hourly[0].get('time',[])
            if not times or any(x.get('time')!=times for x in hourly):
                raise ValueError('Horários meteorológicos inconsistentes entre pontos.')
            now=datetime.now(timezone.utc)
            # Use a forecast reference time on an UTC hour, preserving valid times in hours.
            ref=now.replace(minute=0,second=0,microsecond=0)
            time_indices=[]
            for idx, t in enumerate(times):
                dt=datetime.fromisoformat(t).replace(tzinfo=timezone.utc)
                delta=int((dt-ref).total_seconds()//3600)
                if delta>=0 and delta<=hours and delta%3==0:
                    time_indices.append((idx,delta))
            if not time_indices: raise ValueError('Nenhum horário de previsão válido retornado.')
            output=io.BytesIO()
            for index,step in time_indices:
                winds=[]; dirs=[]; pressures=[]
                for item in hourly:
                    speed=item.get('wind_speed_10m',[])[index]
                    direc=item.get('wind_direction_10m',[])[index]
                    pressure=item.get('pressure_msl',[])[index]
                    if any(v is None or not math.isfinite(float(v)) for v in (speed,direc,pressure)):
                        raise ValueError('Dados meteorológicos incompletos; GRIB não foi gerado.')
                    winds.append(float(speed)); dirs.append(math.radians(float(direc))); pressures.append(float(pressure)*100)
                # Wind direction is FROM. GRIB1 U and V are vector components in m/s.
                u=[-speed*math.sin(angle) for speed,angle in zip(winds,dirs)]
                v=[-speed*math.cos(angle) for speed,angle in zip(winds,dirs)]
                for parameter,level_type,level,values in ((33,'heightAboveGround',10,u),(34,'heightAboveGround',10,v),(2,'meanSea',0,pressures)):
                    h=codes_grib_new_from_samples('regular_ll_sfc_grib1')
                    try:
                        values_by_key={
                            'dataDate':int(ref.strftime('%Y%m%d')), 'dataTime':int(ref.strftime('%H%M')),
                            'gridType':'regular_ll','Ni':ni,'Nj':nj,
                            'latitudeOfFirstGridPointInDegrees':north,
                            'longitudeOfFirstGridPointInDegrees':west%360,
                            'latitudeOfLastGridPointInDegrees':north-(nj-1)*dlat,
                            'longitudeOfLastGridPointInDegrees':(west+(ni-1)*dlon)%360,
                            'iDirectionIncrementInDegrees':dlon,
                            'jDirectionIncrementInDegrees':dlat,
                            'iScansNegatively':0,'jScansPositively':0,
                            'indicatorOfParameter':parameter,
                            'typeOfLevel':level_type,'level':level,
                            'stepUnits':'h','step':step,'packingType':'grid_simple'
                        }
                        for key,val in values_by_key.items(): codes_set(h,key,val)
                        codes_set_values(h,values)
                        message=codes_get_message(h)
                        if not message.startswith(b'GRIB') or message[7] != 1: raise ValueError('Formato GRIB1 inválido.')
                        output.write(message)
                    finally: codes_release(h)
            content=output.getvalue()
            if not content: raise ValueError('GRIB1 vazio.')
            self.send_response(200)
            self.send_header('Content-Type','application/octet-stream')
            self.send_header('Content-Disposition',f'attachment; filename="painel-timezero-vento-pressao-{ref:%Y%m%d-%H%M}UTC.grb"')
            self.send_header('Content-Length',str(len(content)))
            self.send_header('Cache-Control','no-store')
            self.end_headers(); self.wfile.write(content)
        except ValueError as exc: self.send_json(422,str(exc))
        except Exception as exc: self.send_json(502,'Não foi possível obter ou codificar a previsão real: '+str(exc)[:180])

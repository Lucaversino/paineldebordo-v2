import importlib.util
from pathlib import Path
import sys
import types
import unittest
from datetime import timedelta
import numpy as np
import xarray as xr
sys.modules['copernicusmarine'] = types.SimpleNamespace()
root = Path(__file__).resolve().parents[1]
def module(name):
    spec = importlib.util.spec_from_file_location(name, root/'api'/f'{name}.py')
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m
forecast = module('copernicus-chlorophyll')
satellite = module('copernicus-satellite-chlorophyll')
class ChlorophyllTests(unittest.TestCase):
    def test_missing_invalid_values(self):
        for value in [None, float('nan'), float('inf'), -1, 1001]:
            self.assertIsNone(forecast._to_float(value))
            self.assertIsNone(satellite._to_float(value))
        self.assertEqual(forecast._to_float(0),0)
    def test_single_forecast_day_keeps_actual_date(self):
        tomorrow = forecast.datetime.now(forecast.TZ).date()+timedelta(days=1)
        data = xr.Dataset({'chl':(('time','depth','latitude','longitude'),np.array([[[[2.5]]]]))},coords={'time':[np.datetime64(tomorrow)],'depth':[0.49],'latitude':[-27.15],'longitude':[-48.3]})
        forecast.copernicusmarine.open_dataset = lambda **kwargs: data
        result = forecast._forecast(-27.15,-48.3,3,'test','test')
        self.assertIsNone(result['values'][0]['mgM3'])
        self.assertEqual(result['values'][1]['mgM3'],2.5)
        self.assertIsNone(result['values'][2]['mgM3'])
    def test_satellite_missing_center_stays_missing(self):
        values=np.ones((1,3,3))*2
        values[0,1,1]=np.nan
        data=xr.Dataset({'CHL':(('time','latitude','longitude'),values)},coords={'time':[np.datetime64('2026-10-21T12:00:00')],'latitude':[-27.33,-27.15,-26.97],'longitude':[-48.48,-48.3,-48.12]})
        satellite.copernicusmarine.open_dataset=lambda **kwargs:data
        result=satellite._current_satellite(-27.15,-48.3,'test','test')
        self.assertIsNone(result['current']['mgM3'])
        self.assertEqual(sum(x['mgM3'] is not None for x in result['grid']),8)
        self.assertEqual(result['grid'][0]['time'],'2026-10-21T12:00:00Z')
if __name__=='__main__': unittest.main()

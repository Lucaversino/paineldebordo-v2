"""Offline regression tests. Run: python -m unittest discover -s tests -p test_timezero_grib.py -v"""
import importlib.util
import io
import math
import pathlib
import unittest
import urllib.error
import unittest.mock as mock
import zipfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('grib_module', ROOT / 'api/timezero-grib.py')
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


class ReferenceChecks(unittest.TestCase):
    def test_reference_gribzip_messages(self):
        p = ROOT / 'tests/fixtures/reference.grbzip'
        if not p.exists():
            self.skipTest('Reference .grbzip not provided')
        with zipfile.ZipFile(p) as z:
            self.assertEqual(z.namelist(), ['grib.grb'])
            buf = z.read('grib.grb')
        offset, count, params = 0, 0, {}
        while offset < len(buf):
            self.assertEqual(buf[offset:offset + 4], b'GRIB')
            self.assertEqual(buf[offset + 7], 1)
            size = int.from_bytes(buf[offset + 4:offset + 7], 'big')
            self.assertGreater(size, 16)
            self.assertLessEqual(offset + size, len(buf))
            self.assertEqual(buf[offset + size - 4:offset + size], b'7777')
            code = buf[offset + 16]
            params[code] = params.get(code, 0) + 1
            offset += size
            count += 1
        self.assertEqual(offset, len(buf))
        self.assertEqual(count, 290)
        self.assertEqual(params[33], 57)
        self.assertEqual(params[34], 57)
        self.assertEqual(params[100], 57)

    def test_grid_not_equal_degree_increments(self):
        g = mod._grid(-26, -48, 200)
        self.assertEqual((len(g), len(g[0])), (5, 5))
        lat_delta = g[0][0][0] - g[-1][0][0]
        lon_delta = g[0][-1][1] - g[0][0][1]
        self.assertGreater(lon_delta, lat_delta)
        self.assertAlmostEqual((g[0][0][0] + g[-1][0][0]) / 2, -26)
        self.assertAlmostEqual((g[0][0][1] + g[0][-1][1]) / 2, -48)

    def test_wind_conversion(self):
        s, d = 10, 270
        u = -s * math.sin(math.radians(d))
        v = -s * math.cos(math.radians(d))
        self.assertAlmostEqual(u, 10)
        self.assertAlmostEqual(v, 0)

    def test_missing_meteorology_not_replaced_with_zero(self):
        instant = mod.datetime(2026, 11, 18, 12, tzinfo=mod.timezone.utc)
        rows = [{'hourly': {'time': ['2026-11-18T12:00'], 'wave_height': [None]}},
                {'hourly': {'time': ['2026-11-18T12:00'], 'wave_height': [2.4]}}]
        self.assertEqual(mod._field(rows, 'wave_height', instant), [None, 2.4])

    def test_http429_starts_cooldown(self):
        mod._CACHE.clear()
        mod._COOLDOWN_UNTIL = 0
        ex = urllib.error.HTTPError('https://example.test', 429, 'Too Many Requests', {'Retry-After': '30'}, None)
        with mock.patch.object(mod.urllib.request, 'urlopen', side_effect=ex) as urlopen:
            with self.assertRaises(mod.ForecastError) as result:
                mod._api_json('https://example.test/a')
            self.assertEqual(result.exception.status, 429)
            self.assertEqual(urlopen.call_count, 1)
            with self.assertRaises(mod.ForecastError):
                mod._api_json('https://example.test/b')
            self.assertEqual(urlopen.call_count, 1)
        mod._COOLDOWN_UNTIL = 0

    def test_cache_prevents_repeat_fetch(self):
        mod._CACHE.clear()
        mod._COOLDOWN_UNTIL = 0
        response = io.BytesIO(b'{"data":42}')
        with mock.patch.object(mod.urllib.request, 'urlopen') as urlopen:
            urlopen.return_value.__enter__.return_value = response
            self.assertEqual(mod._api_json('https://example.test/cache'), {'data': 42})
            self.assertEqual(mod._api_json('https://example.test/cache'), {'data': 42})
            self.assertEqual(urlopen.call_count, 1)


if __name__ == '__main__':
    unittest.main()

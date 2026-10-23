import test from 'node:test';
import assert from 'node:assert/strict';
import { chlorophyllValue } from '../lib/chlorophyllValue.ts';
import { fetchNoaaChlorophyllPoint, fetchNoaaChlorophyllGrid, fetchNoaaHistoricalChlorophyll } from '../lib/noaaChlorophyll.ts';
const csv = (date, value) => `time,altitude,latitude,longitude,chlor_a\nUTC,m,degrees_north,degrees_east,mg m-3\n${date},0,-27.15,-48.3,${value}\n`;
const recent = new Date().toISOString();
const original = globalThis.fetch;
const mock = (text, status = 200) => { globalThis.fetch = async () => new Response(text, {status}); };
test('ausência e valores inválidos não viram zero', () => {
 for(const v of [null,undefined,'',' ',NaN,Infinity,-1,1001,false,[],{}]) assert.equal(chlorophyllValue(v),null);
 assert.equal(chlorophyllValue(0),0);
 assert.equal(chlorophyllValue('2.35'),2.35);
});
test('NOAA ponto, grade, histórico e falhas', async () => {
 try {
  mock(csv(recent,2.35));
  assert.equal((await fetchNoaaChlorophyllPoint(-27.15,-48.3)).mgM3,2.35);
  assert.equal((await fetchNoaaChlorophyllGrid([{lat:-27.15,lon:-48.3}]))[0].mgM3,2.35);
  mock(csv('2020-01-01T12:00:00Z',3));
  assert.equal((await fetchNoaaChlorophyllPoint(-27.15,-48.3)).mgM3,null);
  assert.equal((await fetchNoaaChlorophyllGrid([{lat:-27.15,lon:-48.3}]))[0].mgM3,null);
  assert.equal((await fetchNoaaHistoricalChlorophyll(-27.15,-48.3,'2020-01-02')).mgM3,null);
  assert.equal((await fetchNoaaHistoricalChlorophyll(-27.15,-48.3,'2020-01-01')).mgM3,3);
  mock(csv(recent,'NaN'));
  assert.equal((await fetchNoaaChlorophyllPoint(-27.15,-48.3)).mgM3,null);
  mock('time,foo\nUTC,mg\n'+recent+',2');
  assert.equal((await fetchNoaaChlorophyllPoint(-27.15,-48.3)).mgM3,null);
  mock('unavailable',503);
  assert.equal((await fetchNoaaChlorophyllPoint(-27.15,-48.3)).mgM3,null);
  globalThis.fetch = async () => { throw new Error('timeout'); };
  assert.equal((await fetchNoaaChlorophyllPoint(-27.15,-48.3)).mgM3,null);
 } finally { globalThis.fetch = original; }
});

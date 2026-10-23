import test from 'node:test';
import assert from 'node:assert/strict';
import {isAutomaticFishingVessel as fishing, validAutomaticPosition as valid, automaticPositionIsOld as old} from '../lib/aisAutomatic.ts';
test('classifies fishing by provider type or navigation status, never name', () => {
  for (const v of [{vesselType:'30'}, {vesselType:'Fishing vessel (30)'}, {navStatusText:'Em pesca'}, {navStatusText:'7'}]) assert.equal(fishing(v), true);
  for (const v of [{}, {vesselType:'130'}, {vesselType:'Cargo', name:'PESCA'}]) assert.equal(fishing(v), false);
});
test('rejects missing, out-of-range and nonnumeric positions', () => {
  const boat = {mmsi:'710123456', lat:-27.15, lon:-48.55};
  assert.equal(valid(boat), true);
  for(const v of [null, {}, {...boat, lat:null}, {...boat, lon:181}, {...boat, lat:NaN}, {...boat, mmsi:''}, {...boat, lat:'-27'}]) assert.equal(valid(v), false);
});
test('unknown, future and old timestamps are never described as current', () => {
  const now = Date.parse('2026-10-23T20:00:00Z');
  assert.equal(old({positionReceived:'2026-10-23T19:50:00Z'}, now), false);
  for(const positionReceived of [undefined, 'invalid', '2026-10-23T18:00:00Z', '2026-10-24T20:00:00Z']) assert.equal(old({positionReceived},now), true);
});

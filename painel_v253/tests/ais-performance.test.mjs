import test from 'node:test';
import assert from 'node:assert/strict';
import { aisMapPixelRatio, officialWaypointStyleBucket, reuseUnchangedMapItems } from '../lib/aisMapPerformance.ts';
import VectorSource from 'ol/source/Vector.js';
import Feature from 'ol/Feature.js';
import Point from 'ol/geom/Point.js';
test('resolução limitada, preservando telas de menor densidade',()=>{
 assert.equal(aisMapPixelRatio(3,true),1.5); assert.equal(aisMapPixelRatio(3,false),2);
 assert.equal(aisMapPixelRatio(1,true),1); assert.equal(aisMapPixelRatio(1.25,false),1.25);
 for(const v of [NaN,Infinity,0,-1]) assert.equal(aisMapPixelRatio(v,true),1);
});
test('limiares visuais dos símbolos oficiais preservados',()=>{
 const visual=z=>[z<8?36:z<11?46:56,z>=9];
 const zooms=[3,7.99,8,8.99,9,10.99,11,14,18];
 for(const a of zooms) for(const b of zooms) assert.equal(officialWaypointStyleBucket(a)===officialWaypointStyleBucket(b),JSON.stringify(visual(a))===JSON.stringify(visual(b)));
});
test('resposta idêntica não redesenha; mudanças são aplicadas',()=>{
 const previous=[{id:1,latitude:-27,longitude:-48,name:'Pedra',visible:true}];
 assert.equal(reuseUnchangedMapItems(previous,JSON.parse(JSON.stringify(previous))),previous);
 for(const incoming of [[],[...previous,{id:2}],[{...previous[0],visible:false}],[{...previous[0],latitude:-28}],[{...previous[0],name:'Novo'}]]) assert.equal(reuseUnchangedMapItems(previous,incoming),incoming);
});
test('lote mantém 2000 geometrias e metadados com menos notificações',()=>{
 function populate(batch){
  const source=new VectorSource(); let changes=0; source.on('change',()=>changes++);
  const features=Array.from({length:2000},(_,i)=>new Feature({geometry:new Point([i,i+1]),id:i}));
  if(batch) source.addFeatures(features); else features.forEach(f=>source.addFeature(f));
  assert.equal(source.getFeatures().length,2000);
  for(const f of source.getFeatures()) assert.deepEqual(f.getGeometry().getCoordinates(),[f.get('id'),f.get('id')+1]);
  return changes;
 }
 assert.equal(populate(false),2000); assert.equal(populate(true),1);
});

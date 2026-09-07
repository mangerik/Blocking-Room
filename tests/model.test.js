import { test } from 'node:test';
import assert from 'node:assert/strict';
import {initialProject,sample,putKey,validateProject} from '../src/model.js';
test('interpolates position and shortest angular path',()=>{const p=sample([{t:0,x:0,r:350},{t:10,x:20,r:10}],5);assert.equal(p.x,10);assert.equal(p.r,360);});
test('clamps playback before and after track',()=>{const k=[{t:2,x:3},{t:5,x:7}];assert.equal(sample(k,0).x,3);assert.equal(sample(k,9).x,7);});
test('upserts keyframes without duplicating timestamps',()=>{const k=[{t:0,x:0}];putKey(k,{x:2},2);putKey(k,{x:4},2.01);assert.equal(k.length,2);assert.equal(k[1].x,4);});
test('validates project roundtrip and rejects corrupt data',()=>{assert.deepEqual(validateProject(JSON.parse(JSON.stringify(initialProject()))),initialProject());const bad=initialProject();bad.actors[0].keys[0].x=null;assert.throws(()=>validateProject(bad));const duplicate=initialProject();duplicate.actors[0].id=duplicate.rooms[0].id;assert.throws(()=>validateProject(duplicate));});

test('legacy projects receive safe object states without losing poses',()=>{const p=initialProject();for(const o of [...p.actors,...p.rooms,p.camera]){delete o.locked;delete o.visible;}const keys=structuredClone(p.actors[0].keys);validateProject(p);assert.equal(p.rooms[0].locked,true);assert.equal(p.actors[0].visible,true);assert.deepEqual(p.actors[0].keys,keys);p.rooms[0].locked=false;assert.equal(validateProject(p).rooms[0].locked,false);p.actors[0].visible='false';assert.throws(()=>validateProject(p));});

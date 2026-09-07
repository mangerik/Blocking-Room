import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ProjectHistory} from '../src/history.js';
test('undo and redo preserve snapshots independently',()=>{const p={x:0};const h=new ProjectHistory(p);p.x=1;h.commit(p);p.x=2;h.commit(p);assert.deepEqual(h.undo(),{x:1});assert.deepEqual(h.undo(),{x:0});assert.equal(h.undo(),null);assert.deepEqual(h.redo(),{x:1});});
test('one gesture produces one history entry and new edits discard redo',()=>{const p={x:0};const h=new ProjectHistory(p);h.begin();for(let i=1;i<=20;i++){p.x=i;h.commit(p);}h.end(p);assert.deepEqual(h.undo(),{x:0});assert.deepEqual(h.redo(),{x:20});h.undo();h.commit({x:7});assert.equal(h.canRedo,false);assert.deepEqual(h.undo(),{x:0});});
test('history is bounded and no-op changes create no entries',()=>{const h=new ProjectHistory({x:0},2);h.commit({x:0});assert.equal(h.canUndo,false);for(let x=1;x<=3;x++)h.commit({x});assert.deepEqual(h.undo(),{x:2});assert.deepEqual(h.undo(),{x:1});assert.equal(h.canUndo,false);});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {gait,validDoors,wallPanels,wallCrossings,wallEnds} from '../src/spatial.js';
import {initialProject,validateProject} from '../src/model.js';
test('walk is deterministic, opposite limbs can share phase, idle and rotating actors do not walk',()=>{
 const keys=[{t:0,x:0,z:0},{t:4,x:4,z:0}];const p=gait(keys,.4);assert.notEqual(p.angle,0);assert.deepEqual(gait(keys,.4),p);assert.equal(gait(keys,4).angle,0);assert.equal(gait([{t:0,x:0,z:0,r:0},{t:4,x:0,z:0,r:90}],2).angle,0);
});
test('wall panels leave a real hole with a lintel',()=>{const r={w:6,d:8,h:3,doors:[{wall:'back',offset:1,width:1.4,height:2.2}]};assert.ok(validDoors(r));const panels=wallPanels(r,'back');assert.equal(panels.length,3);assert.ok(panels.every(p=>!(1>=p.center-p.width/2&&1<=p.center+p.width/2&&1>=p.y-p.height/2&&1<=p.y+p.height/2)));assert.equal(wallPanels(r,'left').length,1);assert.equal(validDoors({...r,w:2}),false);assert.equal(validDoors({...r,doors:[...r.doors,...r.doors]}),false);});
test('crossing wall warns; a correctly sized opening clears the crossing',()=>{const room={id:'room',x:0,z:0,w:6,d:8,h:3,doors:[]};const actor={height:1.8,keys:[{t:0,x:-4,z:1},{t:4,x:0,z:1}]};assert.equal(wallCrossings(actor,[room]).length,1);room.doors=[{wall:'left',offset:1,width:1.4,height:2.2}];assert.equal(wallCrossings(actor,[room]).length,0);assert.equal(wallCrossings({...actor,height:2.5},[room]).length,1);});
test('deleted camera and doors survive JSON validation; invalid door does not pass',()=>{const p=initialProject();p.camera=null;assert.equal(validateProject(JSON.parse(JSON.stringify(p))).camera,null);p.rooms[0].doors=[{wall:'left',offset:20,width:1,height:2}];assert.throws(()=>validateProject(p));});

// F4-08 (SC-01): dinding modular ikut memberi PERINGATAN tembus — bukan collision.
test('dinding modular: ujung segmen, peringatan tembus, dan dinding tersembunyi diabaikan',()=>{
 assert.deepEqual(wallEnds({x:0,z:0,r:0,length:4}),{ax:0,az:-2,bx:0,bz:2});
 const across=wallEnds({x:1,z:0,r:90,length:4});
 assert.ok(Math.abs(across.ax-(-1))<1e-9&&Math.abs(across.bx-3)<1e-9,'90° membentang searah +X');
 const wall={id:'w1',x:0,z:0,r:0,length:4,height:2.6,visible:true};
 const actor={height:1.8,keys:[{t:0,x:-3,z:0},{t:4,x:3,z:0}]};
 const hits=wallCrossings(actor,[],[wall]);
 assert.equal(hits.length,1);
 assert.equal(hits[0].wall,'segment');
 assert.equal(hits[0].wallId,'w1');
 assert.ok(Math.abs(hits[0].t-2)<1e-9,'perpotongan tepat di tengah gerak');
 // Di luar panjang segmen, sejajar, dan tersembunyi: tidak ada peringatan.
 assert.equal(wallCrossings({height:1.8,keys:[{t:0,x:-3,z:9},{t:4,x:3,z:9}]},[],[wall]).length,0);
 assert.equal(wallCrossings({height:1.8,keys:[{t:0,x:0,z:-1},{t:4,x:0,z:1}]},[],[wall]).length,0);
 assert.equal(wallCrossings(actor,[],[{...wall,visible:false}]).length,0);
 // Tanpa daftar dinding, hasilnya persis seperti R1 (golden Fase 0 tidak bergeser).
 assert.deepEqual(wallCrossings(actor,[]),[]);
});

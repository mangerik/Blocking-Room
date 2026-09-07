import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000},acceptDownloads:true});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://localhost:5174');await page.waitForSelector('#viewport canvas');
const state=()=>page.evaluate(()=>window.blockingRoom.getProject());
const point=(x,y,z)=>page.evaluate(([x,y,z])=>window.blockingRoom.projectPoint(x,y,z),[x,y,z]);
const drag=async(p,dx,dy)=>{await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.move(p.x+dx,p.y+dy,{steps:8});await page.mouse.up();};
const blur=()=>page.locator('#inspector-name').click();
const change=async(prop,value)=>{await page.locator(`[data-prop="${prop}"]`).fill(String(value));await page.locator(`[data-prop="${prop}"]`).press('Tab');};
const original=await state();
// Rename, undo, redo, branch invalidation; title is also part of document history.
await change('name','Alex edit');await page.locator('#undo').click();assert.equal((await state()).actors[0].name,'Alex');await page.locator('#redo').click();assert.equal((await state()).actors[0].name,'Alex edit');
await page.locator('#undo').click();await change('name','Alex baru');assert.equal(await page.locator('#redo').isDisabled(),true);await page.locator('#undo').click();
// Real object controls, persisted state, hidden actors cannot be moved.
const beforePOV=await page.locator('#camera-preview canvas').screenshot();
await page.locator('[data-visible="a1"]').click();assert.equal((await state()).actors[0].visible,false);assert.equal(await page.evaluate(()=>window.blockingRoom.getObjectState('a1').visible),false);assert.equal(await page.locator('[data-prop="x"]').isDisabled(),true);
const hiddenPOV=await page.locator('#camera-preview canvas').screenshot();assert.notDeepEqual(beforePOV,hiddenPOV);
await page.locator('#undo').click();assert.equal((await state()).actors[0].visible,true);
await page.locator('[data-lock="a1"]').click();assert.equal(await page.locator('[data-prop="r"]').isDisabled(),true);assert.equal(await page.locator('#delete-object').isDisabled(),true);
await blur();await page.keyboard.press('ArrowRight');assert.deepEqual((await state()).actors[0].keys,original.actors[0].keys);
await page.locator('#move-tool').click();await drag(await point(-5,.95,2),60,20);assert.deepEqual((await state()).actors[0].keys,original.actors[0].keys);assert.deepEqual((await state()).rooms,original.rooms);
await page.locator('[data-lock="a1"]').click();
// Clicking a room while moving actors must never start moving that room or the actor.
await page.locator('[data-select="a1"]').click();const beforeMiss=await state();await drag(await point(-7,.1,-2),45,15);assert.deepEqual(await state(),beforeMiss);
// One actual actor drag = one undo, preserving room positions and facing.
await drag(await point(-5,.95,2),55,10);const moved=await state();assert.notEqual(moved.actors[0].keys[0].x,-5);assert.equal(moved.actors[0].keys[0].r,0);assert.deepEqual(moved.rooms,original.rooms);
await page.locator('#undo').click();assert.deepEqual((await state()).actors[0].keys,original.actors[0].keys);
// Rooms are locked by default; explicit unlock permits edits and remains undoable.
await page.locator('[data-tab="rooms"]').click();assert.equal(await page.locator('[data-prop="x"]').isDisabled(),true);await page.locator('[data-lock="r1"]').click();await change('x',-6);assert.equal((await state()).rooms[0].x,-6);await page.locator('#undo').click();assert.equal((await state()).rooms[0].x,-5);await page.locator('#undo').click();assert.equal((await state()).rooms[0].locked,true);
await page.locator('[data-visible="r1"]').click();assert.equal(await page.evaluate(()=>window.blockingRoom.getObjectState('r1').visible),false);await page.locator('#undo').click();
// Camera final view: rotation and translation manipulate the actor, not the camera.
await page.locator('[data-tab="actors"]').click();await page.locator('[data-view="camera"]').click();assert.equal(await page.evaluate(()=>window.blockingRoom.getView()),'camera');
await page.locator('#rotate-tool').click();await drag(await point(-5,.95,2),70,0);assert.ok((await state()).actors[0].keys[0].r>35);const rotatedPOV=await page.locator('#camera-preview canvas').screenshot();assert.notDeepEqual(rotatedPOV,beforePOV);await page.locator('#undo').click();assert.equal((await state()).actors[0].keys[0].r,0);
await page.locator('#move-tool').click();await drag(await point(-5,.95,2),40,10);assert.notDeepEqual((await state()).actors[0].keys,original.actors[0].keys);assert.deepEqual((await state()).camera,original.camera);await page.locator('#undo').click();
// Direction is independently keyed at a later time and preserved by translation.
await page.locator('#scrub').fill('3');await page.locator('#scrub').dispatchEvent('input');await page.locator('[data-turn="15"]').click();assert.equal((await state()).actors[0].keys.find(k=>k.t===3).r,15);await blur();await page.keyboard.press('ArrowRight');assert.equal((await state()).actors[0].keys.find(k=>k.t===3).r,15);await page.keyboard.press('Meta+z');assert.equal((await state()).actors[0].keys.find(k=>k.t===3).r,15);await page.keyboard.press('Meta+z');assert.equal((await state()).actors[0].keys.some(k=>k.t===3),false);
// Recording keeps its selected actor, and a whole take can be undone in one step.
await page.locator('#rewind').click();const beforeRecord=await state();await page.locator('#record').click();await blur();await page.keyboard.down('ArrowRight');await page.keyboard.down('e');await page.waitForTimeout(420);await page.keyboard.up('ArrowRight');await page.keyboard.up('e');await page.locator('[data-select="a2"]').click();await page.locator('#record').click();assert.notDeepEqual((await state()).actors[0].keys,beforeRecord.actors[0].keys);assert.deepEqual((await state()).actors[1].keys,beforeRecord.actors[1].keys);await page.locator('#undo').click();assert.deepEqual(await state(),beforeRecord);
// A locked follow camera must not be changed indirectly by actor deletion or duration trim.
await page.locator('[data-tab="camera"]').click();await page.locator('[data-lock="camera"]').click();await page.locator('[data-tab="actors"]').click();const beforeProtectedDelete=await state();await page.locator('#delete-object').click();assert.deepEqual(await state(),beforeProtectedDelete);await page.locator('#duration').fill('1');await page.locator('#duration').press('Tab');assert.deepEqual(await state(),beforeProtectedDelete);await page.locator('#undo').click();
// Hide/lock survive export JSON, import, reload and project load itself is undoable.
await page.locator('[data-lock="a1"]').click();await page.locator('[data-visible="a2"]').click();const persisted=await state();const savedPromise=page.waitForEvent('download');await page.locator('#save').click();const saved=await savedPromise;await saved.saveAs('artifacts/revision-project.json');
await page.reload();await page.waitForSelector('#viewport canvas');assert.deepEqual(await state(),persisted);assert.equal(await page.evaluate(()=>window.blockingRoom.getObjectState('a2').visible),false);
await page.locator('#add-object').click();const beforeImport=await state();await page.locator('#file-input').setInputFiles('artifacts/revision-project.json');await page.waitForFunction(expected=>JSON.stringify(window.blockingRoom.getProject())===expected,JSON.stringify(persisted));assert.deepEqual(await state(),persisted);await page.locator('#undo').click();assert.deepEqual(await state(),beforeImport);await page.locator('#redo').click();assert.deepEqual(await state(),persisted);
await page.locator('[data-view="camera"]').click();await page.screenshot({path:'artifacts/revision-final-view.png'});await page.locator('[data-view="perspective"]').click();await page.screenshot({path:'artifacts/revision-desktop.png'});
await page.setViewportSize({width:390,height:844});await page.screenshot({path:'artifacts/revision-mobile.png',fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
assert.deepEqual(errors,[]);console.log('PASS: undo/redo branches, lock, hide/POV, safe picking, grouped drag, final-camera rotation & movement, independent heading, grouped recording, JSON, reload, import undo, mobile.');await browser.close();

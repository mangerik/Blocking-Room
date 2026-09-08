import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
await mkdir('artifacts',{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000},acceptDownloads:true});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://localhost:5174');await page.waitForSelector('#viewport canvas');
const project=()=>page.evaluate(()=>window.blockingRoom.getProject());
const scrub=async t=>{await page.locator('#scrub').fill(String(t));await page.locator('#scrub').dispatchEvent('input');};
await scrub(.4);const legs=await page.evaluate(()=>window.blockingRoom.getWalk('a1'));assert.ok(Math.abs(legs[0])>.01);assert.equal(legs[0],-legs[1]);assert.ok((await page.evaluate(()=>window.blockingRoom.getWalk('a3'))).every(n=>n===0));
await scrub(1);await scrub(.4);assert.deepEqual(await page.evaluate(()=>window.blockingRoom.getWalk('a1')),legs);
await page.locator('[data-view="camera"]').click();await page.screenshot({path:'artifacts/walking-camera.png'});await page.locator('[data-view="perspective"]').click();
// Delete actor and its following-camera reference; Undo restores both.
const original=await project();await page.locator('[data-delete="a1"]').click();assert.equal((await project()).actors.length,2);assert.equal((await project()).camera.target,'');await page.locator('#undo').click();assert.deepEqual(await project(),original);
// Locked rooms cannot be deleted. Actual deletion and undo work after unlock.
await page.locator('[data-tab="rooms"]').click();assert.equal(await page.locator('[data-delete="r1"]').isDisabled(),true);await page.locator('[data-lock="r1"]').click();await page.locator('[data-delete="r1"]').click();assert.equal((await project()).rooms.length,2);await page.locator('#undo').click();assert.equal((await project()).rooms.length,3);
await page.locator('[data-select="r1"]').click();await page.locator('#add-door').click();assert.equal((await project()).rooms[0].doors.length,1);let panels=await page.evaluate(()=>window.blockingRoom.getWalls('r1'));assert.equal(panels.filter(p=>p.wall==='back').length,3);
await page.locator('[data-door-prop="wall"]').selectOption('left');await page.locator('[data-door-prop="offset"]').fill('1');await page.locator('[data-door-prop="offset"]').press('Tab');assert.equal((await project()).rooms[0].doors[0].offset,1);
await page.locator('[data-door-prop="width"]').fill('99');await page.locator('[data-door-prop="width"]').press('Tab');assert.equal((await project()).rooms[0].doors[0].width,1.4);
await page.locator('[data-lock="r1"]').click();assert.equal(await page.locator('#add-door').isDisabled(),true);assert.equal(await page.locator('[data-remove-door]').isDisabled(),true);await page.locator('[data-lock="r1"]').click();await page.locator('[data-remove-door]').click();assert.equal((await project()).rooms[0].doors.length,0);await page.locator('#undo').click();assert.equal((await project()).rooms[0].doors.length,1);
// Demo door clears Alex's trajectory; removing it reports the solid wall crossing.
await page.locator('[data-select="r2"]').click();await page.locator('[data-lock="r2"]').click();await page.locator('[data-remove-door]').click();assert.equal(await page.locator('#path-warning').isVisible(),true);await page.locator('#undo').click();assert.equal(await page.locator('#path-warning').isVisible(),false);
await page.locator('#toggle-walls').click();await page.screenshot({path:'artifacts/doors-solid.png'});
// Actual camera removal, no-camera state, reload, undo creation, export.
await page.locator('[data-tab="camera"]').click();await page.locator('#delete-object').click();assert.equal((await project()).camera,null);assert.equal(await page.locator('#export').isDisabled(),true);assert.equal(await page.locator('#no-camera').isVisible(),true);assert.equal(await page.locator('[data-select="camera"]').count(),0);await page.locator('#undo').click();assert.ok((await project()).camera);await page.locator('#redo').click();assert.equal((await project()).camera,null);
const noCamera=await project();const dl=page.waitForEvent('download');await page.locator('#save').click();await (await dl).saveAs('artifacts/no-camera-project.json');await page.reload();await page.waitForSelector('#viewport canvas');assert.equal((await project()).camera,null);
await page.locator('[data-tab="camera"]').click();await page.locator('#add-object').click();assert.ok((await project()).camera);await page.locator('#undo').click();assert.equal((await project()).camera,null);await page.locator('#redo').click();assert.ok((await project()).camera);
await page.locator('#file-input').setInputFiles('artifacts/no-camera-project.json');await page.waitForFunction(()=>window.blockingRoom.getProject().camera===null);assert.deepEqual(await project(),noCamera);await page.locator('[data-tab="camera"]').click();await page.locator('#add-object').click();
await page.locator('#duration').fill('1');await page.locator('#duration').press('Tab');await page.locator('#export').click();await page.waitForSelector('#export-dialog:not([hidden])');
await page.waitForFunction(()=>[...document.querySelectorAll('#export-codec option')].some(o=>!o.disabled));
const video=page.waitForEvent('download',{timeout:60000});await page.locator('#export-start').click();await (await video).saveAs('artifacts/walk-door-export.webm');
await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(errors,[]);
console.log('PASS: deterministic walking, idle stance, all object deletion/undo, door geometry & validation, lock, crossing warning, camera empty/reload/import/recreate, video export.');await browser.close();

// F1-06/F1-07 di dalam editor: migrasi v1 saat load, impor JSON v1 lama, impor invalid
// tidak menimpa dokumen aktif, dan schema yang lebih baru tidak pernah ditimpa.
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const v1 = name => readFileSync(new URL(`./fixtures/v1/${name}.json`, import.meta.url), 'utf8');
const baseline = name => JSON.parse(readFileSync(new URL(`./fixtures/baseline/${name}.json`, import.meta.url), 'utf8'));

const browser = await chromium.launch({channel: 'chrome', headless: true});
const page = await browser.newPage({viewport: {width: 1440, height: 1000}, acceptDownloads: true});
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.goto('http://localhost:5174');
await page.waitForSelector('#viewport canvas');

const project = () => page.evaluate(() => window.blockingRoom.getProject());
const document_ = () => page.evaluate(() => window.blockingRoom.getDocument());
const stored = key => page.evaluate(k => localStorage.getItem(k), key);

// 1. Proyek v1 yang masih tersimpan di localStorage dimigrasikan saat dimuat.
const raw = v1('walk-path');
await page.evaluate(value => {localStorage.clear(); localStorage.setItem('blocking-room', value);}, raw);
await page.reload();
await page.waitForSelector('#viewport canvas');
const doc = await document_();
assert.equal(doc.schemaVersion, 2);
assert.equal(doc.scenes.length, 1);
assert.equal(doc.scenes[0].shots.length, 1);
assert.equal(doc.scenes[0].shots[0].duration, 10);
assert.equal(doc.scenes[0].shots[0].tracks.length, 3);
assert.equal((await project()).title, 'Jalur berjalan');
assert.equal(await stored('blocking-room.backup'), raw, 'sumber v1 harus dicadangkan sebelum ditimpa');
// Fase 2: hasil migrasi tinggal di IndexedDB, bukan lagi di kunci localStorage.
// Sumber lama justru DIPERTAHANKAN apa adanya (copy-first) dan penanda migrasi
// mencegah proyek duplikat pada pemuatan berikutnya.
assert.equal(await stored('blocking-room'), raw, 'sumber v1 tidak boleh ditimpa oleh hasil migrasi');
assert.equal(await stored('blocking-room.migrated'), doc.id, 'penanda migrasi berisi id proyek hasil migrasi');
assert.equal(await stored('blocking-room.activeProject'), doc.id);
const persisted = await page.evaluate(() => window.blockingRoom.getStoredDocument());
assert.equal(persisted.schemaVersion, 2, 'dokumen hasil migrasi tersimpan di IndexedDB');
assert.equal(persisted.id, doc.id);

// Pose awal/tengah/akhir sama dengan golden Fase 0.
const golden = baseline('walk-path');
for (const mark of golden.actors[0].poses) {
  await page.locator('#scrub').fill(String(mark.t));
  await page.locator('#scrub').dispatchEvent('input');
  const state = await page.evaluate(() => window.blockingRoom.getObjectState('walker'));
  assert.ok(Math.abs(state.position[0] - mark.x) < 1e-6, `x pada ${mark.t}s`);
  assert.ok(Math.abs(state.position[2] - mark.z) < 1e-6, `z pada ${mark.t}s`);
}

// 2. Impor berkas JSON v1 lama tetap berfungsi dan menjadi dokumen v2 baru.
await page.locator('#file-input').setInputFiles('tests/fixtures/v1/locked-hidden.json');
await page.waitForFunction(() => window.blockingRoom.getProject().title === 'Status objek terkunci dan tersembunyi');
const imported = await project();
assert.equal(imported.actors[0].locked, true);
assert.equal(imported.actors[1].visible, false);
assert.equal(imported.rooms[0].locked, false);
assert.equal(imported.rooms[1].visible, false);
assert.equal(imported.camera.locked, true);
assert.equal(imported.camera.target, 'a1');
assert.equal(imported.camera.focal, 35);
assert.equal((await document_()).schemaVersion, 2);

// 3. Impor invalid tidak boleh mengubah dokumen aktif.
const before = await document_();
await page.locator('#file-input').setInputFiles('tests/fixtures/v1/invalid-duplicate-id.json');
await page.waitForTimeout(300);
assert.deepEqual(await document_(), before, 'impor invalid tidak boleh menimpa dokumen aktif');
await page.locator('#file-input').setInputFiles('tests/fixtures/v1/invalid-door.json');
await page.waitForTimeout(300);
assert.deepEqual(await document_(), before);

// 4. Dokumen v2 dari editor dapat dibuka kembali tanpa migrasi dan tanpa perubahan.
const download = page.waitForEvent('download');
await page.locator('#save').click();
await (await download).saveAs('artifacts/migrated-v2-project.json');
const saved = await project();
await page.locator('#file-input').setInputFiles('artifacts/migrated-v2-project.json');
await page.waitForTimeout(300);
assert.deepEqual(await project(), saved);

// 5. Schema lebih baru: dokumen tidak dibuka dan tidak pernah ditimpa.
const future = JSON.stringify({...before, schemaVersion: 99});
await page.evaluate(value => {localStorage.clear(); localStorage.setItem('blocking-room', value);}, future);
await page.reload();
await page.waitForSelector('#viewport canvas');
assert.equal(await stored('blocking-room'), future, 'schema lebih baru tidak boleh ditimpa');
assert.equal((await project()).title, 'Pertemuan di galeri', 'editor jatuh ke proyek demo');
await page.locator('[data-prop="name"]').fill('Tidak boleh tersimpan');
await page.locator('[data-prop="name"]').press('Tab');
assert.equal(await stored('blocking-room'), future, 'penyimpanan dinonaktifkan saat schema lebih baru');

assert.deepEqual(errors, []);
console.log('PASS: migrasi localStorage v1→v2, kesetaraan pose baseline, impor v1, impor invalid tidak menimpa, roundtrip v2, schema lebih baru tidak ditimpa.');
await browser.close();

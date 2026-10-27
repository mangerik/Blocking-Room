// F3-10 — perjalanan dashboard di Chrome sungguhan.
//
// Cakupan: buat A → tambah scene → buka B → kembali ke A → reload (scene aktif pulih),
// duplicate → edit salinan tidak mengubah asal, delete → restore → hapus permanen dengan
// konfirmasi, ekspor/impor paket (roundtrip setara + paket rusak ditolak), impor JSON v1
// sebagai proyek baru, dua proyek berjudul sama tetap terisolasi, pencarian + urutan,
// empty state, target sentuh ≥44 px dan layout 390 px tanpa overflow horizontal.
//
// Setiap BrowserContext Playwright punya partisi storage sendiri, jadi dashboard selalu
// mulai dari keadaan kosong.
import {chromium} from '@playwright/test';
import {SCHEMA_VERSION} from '../src/schema.js';
import assert from 'node:assert/strict';
import {mkdir, readFile, writeFile} from 'node:fs/promises';

const APP = 'http://localhost:5174';
await mkdir('artifacts', {recursive: true});
const browser = await chromium.launch({channel: 'chrome', headless: true});
const context = await browser.newContext({viewport: {width: 1440, height: 1000}, acceptDownloads: true});
const errors = [];
const page = await context.newPage();
page.on('pageerror', e => errors.push(e.message));

const openDashboard = async () => {
  await page.goto(`${APP}#/`);
  await page.waitForFunction(() => window.blockingRoomDashboard?.getState() === 'ready', null, {timeout: 15000});
};
const openEditor = () => page.waitForSelector('#viewport canvas', {timeout: 20000});
const metas = () => page.evaluate(() => window.blockingRoomDashboard.listProjects());
const doc = id => page.evaluate(pid => window.blockingRoomDashboard.getDocument(pid), id);
const scenes = () => page.evaluate(() => window.blockingRoom.getScenes());
const editorDoc = () => page.evaluate(() => window.blockingRoom.getDocument());
// Judul dicocokkan PERSIS: "Proyek A" tidak boleh ikut memilih "Proyek A (salinan)".
const exact = title => new RegExp(`^${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
const cardOf = title => page.locator('.dash-card').filter({has: page.locator('h2', {hasText: exact(title)})}).first();
const cardById = id => page.locator(`.dash-card[data-project="${id}"]`);

/** Bentuk dokumen tanpa ID/waktu/judul — untuk membandingkan kesetaraan roundtrip. */
const shape = document_ => ({
  schemaVersion: document_.schemaVersion,
  scenes: document_.scenes.map(scene => ({
    name: scene.name, order: scene.order, notes: scene.notes,
    actors: scene.actors.map(a => ({name: a.name, color: a.color, height: a.height, locked: a.locked, visible: a.visible})),
    rooms: scene.setObjects.map(r => ({name: r.name, x: r.x, z: r.z, w: r.w, d: r.d, h: r.h, doors: r.doors, locked: r.locked, visible: r.visible})),
    shots: scene.shots.map(shot => ({
      name: shot.name, duration: shot.duration, fps: shot.fps, aspectRatio: shot.aspectRatio,
      camera: shot.camera ? {name: shot.camera.name, focal: shot.camera.focal, hasTarget: !!shot.camera.targetId} : null,
      keys: shot.tracks.map(t => t.keys),
    })),
  })),
});

async function createProject(title, template = 'demo') {
  await page.locator('#dash-new').click();
  await page.locator('#dash-new-title').fill(title);
  await page.locator('#dash-new-template').selectOption(template);
  await page.locator('#dash-create').click();
  await openEditor();
  return page.evaluate(() => window.blockingRoom.getProjectId());
}
const backToDashboard = async () => {
  await page.locator('#back-dashboard').click();
  await page.waitForFunction(() => window.blockingRoomDashboard?.getState() === 'ready', null, {timeout: 15000});
};

// ---------------------------------------------------------------- 1. empty state
await openDashboard();
assert.equal(await page.locator('[data-state="empty"]').count(), 1, 'dashboard kosong menampilkan empty state');
assert.match(await page.locator('[data-state="empty"]').textContent(), /Belum ada proyek/);
assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'light');
await page.locator('#dash-theme').click();
assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark');
await openDashboard();
assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark', 'preferensi tema bertahan setelah reload');
await page.locator('#dash-theme').click();
assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'light');
await page.screenshot({path: 'artifacts/dashboard-empty.png'});

// ---------------------------------------------------------------- 2. buat A, tambah scene, buka B, kembali ke A
const idA = await createProject('Proyek A');
assert.equal((await scenes()).length, 1);
await page.locator('#add-scene').click();
await page.waitForFunction(() => window.blockingRoom.getScenes().length === 2, null, {timeout: 5000});
const sceneIds = (await scenes()).map(s => s.id);
assert.equal(await page.evaluate(() => window.blockingRoom.getActiveSceneId()), sceneIds[1], 'scene baru menjadi aktif');
assert.equal((await page.evaluate(() => window.blockingRoom.getProject())).actors.length, 0, 'scene baru punya set/aktor sendiri');
await page.locator('#add-object').click();
await page.locator('[data-prop="name"]').fill('Aktor scene dua');
await page.locator('[data-prop="name"]').press('Tab');
await page.locator('#scene-notes').fill('Catatan scene dua.');
await page.locator('#scene-notes').press('Tab');
await page.evaluate(() => window.blockingRoom.flushSave());

// Scene pertama tidak boleh ikut berubah.
const savedA = await editorDoc();
assert.equal(savedA.scenes[0].actors.length, 3, 'scene 1 tetap memiliki aktor demo');
assert.equal(savedA.scenes[1].actors.length, 1);
assert.equal(savedA.scenes[1].notes, 'Catatan scene dua.');

await backToDashboard();
const idB = await createProject('Proyek B', 'empty');
assert.notEqual(idA, idB);
assert.equal((await page.evaluate(() => window.blockingRoom.getProject())).actors.length, 0, 'template kosong tidak membawa aktor demo');
await backToDashboard();

// Kembali ke A: scene aktif (scene kedua) harus pulih.
await cardById(idA).locator('[data-open]').click();
await openEditor();
assert.equal(await page.evaluate(() => window.blockingRoom.getProjectId()), idA);
assert.equal(await page.evaluate(() => window.blockingRoom.getActiveSceneId()), sceneIds[1], 'scene aktif dipulihkan saat proyek dibuka kembali');
await page.reload();
await openEditor();
assert.equal(await page.evaluate(() => window.blockingRoom.getActiveSceneId()), sceneIds[1], 'scene aktif dipulihkan setelah reload');
assert.equal((await page.evaluate(() => window.blockingRoom.getProject())).actors[0].name, 'Aktor scene dua');

// Pindah scene dan reload lagi: SessionState mengikuti scene yang terakhir dibuka.
await page.evaluate(id => window.blockingRoom.switchScene(id), sceneIds[0]);
await page.evaluate(() => window.blockingRoom.flushSave());
await page.evaluate(() => window.blockingRoom.flushSession());
await page.reload();
await openEditor();
assert.equal(await page.evaluate(() => window.blockingRoom.getActiveSceneId()), sceneIds[0], 'perpindahan scene ikut dipulihkan');

// ---------------------------------------------------------------- 3. thumbnail per scene
await page.evaluate(() => window.blockingRoom.captureThumbnail());
await page.waitForFunction(() => window.blockingRoom.getProjectMeta().then(m => !!m.thumbnailRef), null, {timeout: 8000});
const metaA = await page.evaluate(() => window.blockingRoom.getProjectMeta());
assert.match(metaA.thumbnailRef, /^thumb-/, 'thumbnail disimpan di store assets dan ditunjuk metadata');
assert.equal(metaA.sceneCount, 2);
await backToDashboard();
assert.equal(await cardById(idA).locator('.dash-thumb img').count(), 1, 'kartu memakai thumbnail tersimpan');
assert.equal(await cardById(idB).locator('.dash-thumb.is-missing').count(), 1, 'proyek tanpa thumbnail memakai placeholder');

// ---------------------------------------------------------------- 4. pencarian & urutan
await page.locator('#dash-query').fill('proyek b');
await page.waitForFunction(() => document.querySelectorAll('.dash-card').length === 1);
assert.match(await page.locator('.dash-card h2').textContent(), /Proyek B/);
await page.locator('#dash-query').fill('tidak ada');
assert.equal(await page.locator('[data-state="empty"]').count(), 1);
await page.locator('#dash-query').fill('');
await page.locator('#dash-sort').selectOption('opened');
await page.waitForTimeout(120);
assert.match(await page.locator('.dash-card h2').first().textContent(), /Proyek A/, 'urutan "terakhir dibuka" menaruh A di depan');
await page.locator('#dash-sort').selectOption('updated');

// ---------------------------------------------------------------- 5. duplicate: mengedit salinan tidak mengubah asal
const beforeDuplicate = await doc(idA);
await cardOf('Proyek A').locator('[data-duplicate]').click();
await page.waitForFunction(() => document.querySelectorAll('.dash-card').length === 3, null, {timeout: 8000});
const copyMeta = (await metas()).find(p => p.title === 'Proyek A (salinan)');
assert.ok(copyMeta, 'salinan memakai sufiks judul');
const copyDoc = await doc(copyMeta.id);
assert.notEqual(copyDoc.id, idA);
assert.deepEqual(shape(copyDoc), shape(beforeDuplicate), 'isi salinan setara dengan aslinya');
const originalIds = new Set(JSON.stringify(beforeDuplicate).match(/[0-9a-f-]{36}/g) ?? []);
const copyIds = JSON.stringify(copyDoc).match(/[0-9a-f-]{36}/g) ?? [];
assert.ok(copyIds.length > 0 && copyIds.every(id => !originalIds.has(id)), 'seluruh ID internal salinan dipetakan ulang');
// Relasi tetap: kamera mengikuti aktor di scene yang sama, track menunjuk objek yang ada.
for (const scene of copyDoc.scenes) {
  const ids = new Set([...scene.actors.map(a => a.id), ...scene.setObjects.map(o => o.id)]);
  for (const shot of scene.shots) {
    if (shot.camera?.targetId) assert.ok(ids.has(shot.camera.targetId), 'target kamera salinan menunjuk aktor salinan');
    for (const track of shot.tracks) assert.ok(ids.has(track.objectId) || track.objectId === shot.camera?.id, 'track salinan menunjuk objek salinan');
  }
}
await cardById(copyMeta.id).locator('[data-open]').click();
await openEditor();
await page.locator('[data-prop="name"]').fill('Hanya di salinan');
await page.locator('[data-prop="name"]').press('Tab');
await page.evaluate(() => window.blockingRoom.flushSave());
await backToDashboard();
assert.deepEqual((await doc(idA)).scenes, beforeDuplicate.scenes, 'mengedit salinan tidak mengubah proyek asal');
assert.ok(JSON.stringify(await doc(copyMeta.id)).includes('Hanya di salinan'));

// ---------------------------------------------------------------- 6. dua proyek berjudul sama tetap terisolasi
await page.locator('#dash-new').click();
await page.locator('#dash-new-title').fill('Proyek B');
await page.locator('#dash-new-template').selectOption('demo');
await page.locator('#dash-create').click();
await openEditor();
const twinId = await page.evaluate(() => window.blockingRoom.getProjectId());
await page.locator('#project-title').fill('Proyek B');
await page.locator('#project-title').press('Tab');
await page.locator('[data-prop="name"]').fill('Kembar');
await page.locator('[data-prop="name"]').press('Tab');
await page.evaluate(() => window.blockingRoom.flushSave());
await backToDashboard();
const twins = (await metas()).filter(p => p.title === 'Proyek B');
assert.equal(twins.length, 2, 'dua proyek boleh berjudul sama');
const twinDocs = await Promise.all(twins.map(p => doc(p.id)));
assert.equal(twinDocs.filter(d => JSON.stringify(d).includes('Kembar')).length, 1, 'judul sama tidak membuat isi tercampur');
assert.equal((await doc(idB)).scenes[0].actors.length, 0, 'proyek kosong tetap kosong');

// ---------------------------------------------------------------- 7. ekspor/impor paket
const exportPromise = page.waitForEvent('download');
await cardById(copyMeta.id).locator('[data-export]').click();
const packageFile = await exportPromise;
assert.ok(packageFile.suggestedFilename().endsWith('.blockingroom.json'), 'paket memakai ekstensi paket');
await packageFile.saveAs('artifacts/paket-uji.blockingroom.json');
const packageRaw = JSON.parse(await readFile('artifacts/paket-uji.blockingroom.json', 'utf8'));
assert.equal(packageRaw.manifest.format, 'blockingroom.package');
assert.equal(packageRaw.manifest.schemaVersion, SCHEMA_VERSION);
assert.ok(packageRaw.manifest.createdAt && packageRaw.manifest.app.version);
for (const part of ['project', 'scenes', 'assets']) assert.match(packageRaw.manifest.checksums[part], /^[0-9a-f]{64}$/, `checksum ${part} ada`);
assert.equal(packageRaw.manifest.counts.scenes, packageRaw.scenes.length);

const beforeImport = (await metas()).length;
await page.locator('#dash-file').setInputFiles('artifacts/paket-uji.blockingroom.json');
await page.waitForFunction(n => document.querySelectorAll('.dash-card').length === n + 1, beforeImport, {timeout: 10000});
const importedMeta = (await metas()).find(p => p.title.includes('(impor)'));
assert.ok(importedMeta, 'paket dengan ID bentrok menjadi proyek baru bersufiks');
assert.deepEqual(shape(await doc(importedMeta.id)), shape(await doc(copyMeta.id)), 'roundtrip paket setara');

// Paket rusak (checksum tidak cocok) ditolak tanpa mengubah proyek yang ada.
const tampered = JSON.parse(JSON.stringify(packageRaw));
tampered.scenes[0].name = 'Diubah tanpa izin';
await writeFile('artifacts/paket-rusak.blockingroom.json', JSON.stringify(tampered));
const countBeforeBroken = (await metas()).length;
await page.locator('#dash-file').setInputFiles('artifacts/paket-rusak.blockingroom.json');
await page.waitForFunction(() => document.querySelector('#dash-toast').textContent.includes('Impor ditolak'), null, {timeout: 8000});
assert.equal((await metas()).length, countBeforeBroken, 'paket rusak tidak menambah proyek');
assert.ok(JSON.stringify(await doc(idA)).includes('Alex'), 'paket rusak tidak menyentuh proyek yang ada');

// Paket tanpa aset tetap valid.
assert.ok(Array.isArray(packageRaw.assets));

// ---------------------------------------------------------------- 8. impor JSON v1 sebagai proyek baru
const before1 = (await metas()).length;
await page.locator('#dash-file').setInputFiles('tests/fixtures/v1/demo-scene.json');
await page.waitForFunction(n => document.querySelectorAll('.dash-card').length === n + 1, before1, {timeout: 10000});
const v1Meta = (await metas()).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
const v1Doc = await doc(v1Meta.id);
assert.equal(v1Doc.schemaVersion, SCHEMA_VERSION, 'JSON v1 dimigrasikan saat impor');
assert.equal(v1Doc.scenes.length, 1);
assert.notEqual(v1Doc.id, idA);
assert.equal((await doc(idA)).id, idA, 'impor v1 tidak menimpa proyek lain');

// Impor rusak ditolak tanpa mengubah apa pun.
const beforeCorrupt = (await metas()).length;
await page.evaluate(() => window.blockingRoomDashboard.importText('rusak.json', '{"version":1,"title":'));
await page.waitForFunction(() => document.querySelector('#dash-toast').textContent.includes('Impor ditolak'), null, {timeout: 8000});
assert.equal((await metas()).length, beforeCorrupt);
await page.evaluate(() => window.blockingRoomDashboard.importText('invalid.json', JSON.stringify({version: 1, title: '', duration: 12, actors: [], rooms: [], camera: null})));
await page.waitForTimeout(400);
assert.equal((await metas()).length, beforeCorrupt, 'proyek v1 invalid ditolak');

// ---------------------------------------------------------------- 9. trash: hapus → restore → hapus permanen
const totalBeforeDelete = (await metas()).length;
await cardById(copyMeta.id).locator('[data-delete]').click();
await page.waitForFunction(t => document.querySelectorAll('.dash-card').length === t - 1, totalBeforeDelete, {timeout: 8000});
assert.ok((await metas()).find(p => p.id === copyMeta.id).deletedAt, 'delete hanya menandai deletedAt');
assert.ok(await doc(copyMeta.id), 'dokumen tetap ada selama di tempat sampah');
await page.locator('#dash-trash-toggle').click();
assert.equal(await page.locator('.dash-card').count(), 1, 'tempat sampah menampilkan proyek yang dihapus');
assert.match(await page.locator('.dash-card .dash-meta.warn').first().textContent(), /Di tempat sampah/);
// Hapus permanen menuntut konfirmasi eksplisit.
await page.locator('[data-purge]').click();
assert.equal(await page.locator('[data-purge-confirm]').count(), 1, 'hapus permanen meminta konfirmasi');
await page.locator('[data-purge-cancel]').click();
assert.equal(await page.locator('[data-purge]').count(), 1, 'batal mengembalikan tombol semula');
assert.ok(await doc(copyMeta.id), 'batal tidak menghapus apa pun');
// Restore mengembalikan isi utuh.
await page.locator('[data-restore]').click();
await page.waitForFunction(() => document.querySelectorAll('.dash-card').length === 0, null, {timeout: 8000});
await page.locator('#dash-trash-toggle').click();
await page.waitForFunction(t => document.querySelectorAll('.dash-card').length === t, totalBeforeDelete, {timeout: 8000});
assert.ok(JSON.stringify(await doc(copyMeta.id)).includes('Hanya di salinan'), 'restore menjaga isi proyek');
// Sekarang hapus permanen sungguhan.
await cardById(copyMeta.id).locator('[data-delete]').click();
await page.waitForFunction(t => document.querySelectorAll('.dash-card').length === t - 1, totalBeforeDelete, {timeout: 8000});
await page.locator('#dash-trash-toggle').click();
await page.locator('[data-purge]').click();
await page.locator('[data-purge-confirm]').click();
await page.waitForFunction(() => document.querySelectorAll('.dash-card').length === 0, null, {timeout: 8000});
assert.equal(await doc(copyMeta.id), null, 'hapus permanen membuang dokumen');
assert.equal((await metas()).find(p => p.id === copyMeta.id), undefined);
await page.locator('#dash-trash-toggle').click();
await page.waitForFunction(() => window.blockingRoomDashboard.view() === 'projects');

// ---------------------------------------------------------------- 10. rename inline
await cardById(idA).locator('[data-rename]').click();
await page.locator('.dash-rename').fill('Proyek A — final');
await page.locator('.dash-rename').press('Enter');
await page.waitForFunction(() => document.body.textContent.includes('Proyek A — final'), null, {timeout: 8000});
assert.equal((await doc(idA)).title, 'Proyek A — final', 'rename memperbarui metadata dan dokumen');

// ---------------------------------------------------------------- 11. aksesibilitas & layout 390 px
for (const selector of ['[data-open]', '[data-rename]', '[data-duplicate]', '[data-delete]', '[data-export]']) {
  const button = page.locator(selector).first();
  assert.ok((await button.getAttribute('aria-label'))?.length > 0, `${selector} punya nama aksesibel`);
  const box = await button.boundingBox();
  assert.ok(box.width >= 44 && box.height >= 44, `${selector} target sentuh ≥44 px (${box.width}×${box.height})`);
}
await page.setViewportSize({width: 390, height: 844});
await page.waitForTimeout(300);
assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'dashboard 390 px tanpa overflow horizontal');
await page.screenshot({path: 'artifacts/dashboard-mobile.png', fullPage: true});
await cardById(idA).locator('[data-open]').click();
await openEditor();
await page.waitForTimeout(300);
assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'editor 390 px tanpa overflow horizontal');
for (const selector of ['[data-lock]', '[data-visible]', '[data-delete]', '#scene-rename', '#scene-delete', '#add-scene']) {
  const box = await page.locator(selector).first().boundingBox();
  assert.ok(box.width >= 44 && box.height >= 44, `${selector} target sentuh ≥44 px (${box.width}×${box.height})`);
  assert.ok((await page.locator(selector).first().getAttribute('aria-label'))?.length > 0, `${selector} punya nama aksesibel`);
}
await page.screenshot({path: 'artifacts/editor-scenes-mobile.png', fullPage: true});
await page.setViewportSize({width: 1440, height: 1000});

// Fokus keyboard tetap terlihat pada kontrol inti.
await page.locator('#add-scene').focus();
assert.equal(await page.evaluate(() => document.activeElement.id), 'add-scene');

// ---------------------------------------------------------------- 12. tab lain sedang menulis (F3-09)
// Kembali ke dashboard melepaskan kunci writer (F3-05), sehingga tab lain boleh menulis.
await backToDashboard();
const writer = await context.newPage();
writer.on('pageerror', e => errors.push(e.message));
await writer.goto(`${APP}#/project/${idA}`);
await writer.waitForSelector('#viewport canvas', {timeout: 20000});
assert.equal(await writer.evaluate(() => window.blockingRoom.isReadOnly()), false, 'kunci writer dilepas saat kembali ke dashboard');
await page.evaluate(() => window.blockingRoomDashboard.refresh());
await page.waitForFunction(id => document.querySelector(`.dash-card[data-project="${id}"]`)?.textContent.includes('tab lain'), idA, {timeout: 8000});
assert.match(await cardById(idA).textContent(), /Sedang dibuka di tab lain/);
await writer.close();

// ---------------------------------------------------------------- 13. rute trash langsung & error state
await page.goto(`${APP}#/trash`);
await page.waitForFunction(() => window.blockingRoomDashboard?.getState() === 'ready', null, {timeout: 15000});
assert.equal(await page.evaluate(() => window.blockingRoomDashboard.view()), 'trash', 'rute #/trash membuka tempat sampah');

const blind = await browser.newContext({viewport: {width: 1200, height: 900}});
const blindPage = await blind.newPage();
blindPage.on('pageerror', e => errors.push(e.message));
await blindPage.addInitScript(() => {Object.defineProperty(window, 'indexedDB', {get: () => undefined});});
await blindPage.goto(`${APP}#/`);
await blindPage.waitForSelector('[data-state="error"]', {timeout: 15000});
assert.match(await blindPage.locator('[data-state="error"]').textContent(), /tidak dapat dibaca|tidak tersedia/i, 'dashboard menampilkan error state saat penyimpanan mati');
assert.equal(await blindPage.locator('#dash-retry').count(), 1, 'error state menawarkan coba lagi');
await blind.close();

assert.deepEqual(errors, []);
console.log('PASS: dashboard empty/loading/error, buat A + scene + buka B + kembali + reload (scene aktif pulih), thumbnail, pencarian & urutan, duplicate terisolasi, judul sama terisolasi, paket export/import setara + paket rusak ditolak, impor v1 sebagai proyek baru, trash restore/hapus permanen berkonfirmasi, rename inline, banner tab lain sedang menulis, rute #/trash, error state penyimpanan mati, target sentuh 44 px dan 390 px tanpa overflow.');
await browser.close();

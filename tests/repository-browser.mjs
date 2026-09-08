// F2-09 di Chrome sungguhan (IndexedDB, Web Locks, BroadcastChannel).
//
// Cakupan: status simpan jujur + transaksi atomik, snapshot recovery ≥10 dan pemulihan
// sebagai langkah undo, session state, dua tab (writer/read-only, tanpa silent
// last-write-wins), dua proyek berjudul sama tetap terisolasi, pergantian proyek saat
// save pending, kegagalan penyimpanan buatan + pemulihannya, serta 100 siklus
// edit/save (dengan reload berkala) tanpa beda data.
//
// Setiap BrowserContext Playwright punya partisi storage sendiri, jadi tidak perlu
// membersihkan IndexedDB secara manual.
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';

const APP = 'http://localhost:5174';
const browser = await chromium.launch({channel: 'chrome', headless: true});
const context = await browser.newContext({viewport: {width: 1440, height: 1000}, acceptDownloads: true});
const errors = [];

async function open() {
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(APP);
  await page.waitForSelector('#viewport canvas');
  return page;
}

const project = page => page.evaluate(() => window.blockingRoom.getProject());
const savedDoc = (page, id) => page.evaluate(pid => window.blockingRoom.getStoredDocument(pid), id ?? null);
const status = page => page.evaluate(() => window.blockingRoom.getSaveStatus());
const settled = page => page.waitForFunction(() => window.blockingRoom.getSaveStatus().status === 'saved', null, {timeout: 5000});

const page = await open();

// ---------------------------------------------------------------- 1. autosave & status
assert.equal(await page.evaluate(() => window.blockingRoom.isReadOnly()), false);
await page.locator('[data-prop="name"]').fill('Alex Uji');
await page.locator('[data-prop="name"]').press('Tab');
await settled(page);
assert.equal((await status(page)).text, 'Tersimpan lokal', 'status sukses hanya setelah transaksi commit');

const stored1 = await savedDoc(page);
assert.equal(stored1.scenes[0].actors[0].name, 'Alex Uji');
const projectId = stored1.id;

// Transaksi atomik: metadata proyek dan isi dokumen selalu commit bersama.
const metas = await page.evaluate(() => window.blockingRoom.listProjects());
const meta = metas.find(m => m.id === projectId);
assert.equal(meta.updatedAt, stored1.updatedAt, 'metadata dan dokumen berasal dari satu transaksi');
assert.equal(meta.sceneCount, stored1.scenes.length);
assert.equal(meta.title, stored1.title);

// Penggabungan save: banyak perubahan beruntun tidak menghasilkan dokumen setengah jadi.
for (const value of ['1', '2', '3', '4', '5']) {
  await page.locator('[data-prop="x"]').fill(value);
  await page.locator('[data-prop="x"]').press('Tab');
}
await page.evaluate(() => window.blockingRoom.flushSave());
await settled(page);
assert.equal((await savedDoc(page)).scenes[0].shots[0].tracks[0].keys[0].x, 5);

// ---------------------------------------------------------------- 2. snapshot recovery
for (let i = 1; i <= 14; i += 1) {
  await page.locator('#project-title').fill(`Versi ${i}`);
  await page.locator('#project-title').press('Tab');
  await page.evaluate(() => window.blockingRoom.saveRevisionNow());
}
const revisions = await page.evaluate(() => window.blockingRoom.listRevisions());
assert.ok(revisions.length >= 10, `minimal 10 snapshot per proyek, ada ${revisions.length}`);
assert.ok(revisions.length <= 20, 'revisi dipangkas agar tidak tumbuh tanpa batas');
assert.ok(revisions[0].createdAt >= revisions[1].createdAt, 'terbaru lebih dahulu');

await page.locator('#revisions').click();
await page.waitForSelector('#revision-panel .revision-row');
const rows = await page.locator('#revision-panel .revision-row').count();
assert.equal(rows, revisions.length, 'daftar waktu revisi tampil di UI');

const titleNow = (await project(page)).title;
const oldest = revisions.at(-1);
await page.locator(`[data-revision="${oldest.id}"]`).click();
await page.waitForFunction(t => window.blockingRoom.getProject().title !== t, titleNow);
const restoredTitle = (await project(page)).title;
assert.notEqual(restoredTitle, titleNow, 'versi lama dipulihkan');
await page.locator('#undo').click();
assert.equal((await project(page)).title, titleNow, 'pemulihan revisi adalah satu langkah undo');
await page.evaluate(() => window.blockingRoom.flushSave());
await settled(page);

// "Buka versi tersimpan terakhir" mengambil dokumen dari IndexedDB, bukan dari memori.
await page.locator('#revisions').click();
await page.locator('#open-last-saved').click();
await page.waitForSelector('#revision-panel', {state: 'hidden'});
assert.equal((await project(page)).title, titleNow);

// ---------------------------------------------------------------- 3. session state
await page.locator('#scrub').fill('5');
await page.locator('#scrub').dispatchEvent('input');
await page.locator('[data-select="a2"]').click();
await page.waitForTimeout(150); // beri satu frame agar session tracker mencatat seleksi baru
await page.evaluate(() => window.blockingRoom.flushSession());
const sessionState = await page.evaluate(() => window.blockingRoom.getStoredSession());
assert.equal(sessionState.selectedId, 'a2');
assert.ok(Math.abs(sessionState.playhead - 5) < 0.2);
assert.ok(Number.isFinite(sessionState.observerPose.x));

await page.reload();
await page.waitForSelector('#viewport canvas');
assert.ok(Math.abs(await page.evaluate(() => window.blockingRoom.getTime()) - 5) < 0.2, 'playhead dipulihkan');
assert.equal(await page.evaluate(() => document.querySelector('.object-row.selected [data-select]')?.dataset.select), 'a2');

// Seleksi yang sudah dihapus tidak boleh menggagalkan pemulihan sesi.
await page.locator('[data-select="a2"]').click();
await page.waitForTimeout(150);
await page.locator('#delete-object').click();
await page.evaluate(() => window.blockingRoom.flushSave());
await page.evaluate(() => window.blockingRoom.flushSession());
await page.reload();
await page.waitForSelector('#viewport canvas');
assert.equal(await page.evaluate(() => window.blockingRoom.getProject().actors.some(a => a.id === 'a2')), false);
assert.ok(await page.evaluate(() => !!window.blockingRoom.getProject()), 'editor tetap terbuka walaupun seleksi tersimpan sudah hilang');

// ---------------------------------------------------------------- 4. dua tab
const second = await open();
assert.equal(await second.evaluate(() => window.blockingRoom.isReadOnly()), true, 'tab kedua harus baca-saja');
assert.equal(await second.locator('#tab-banner').isVisible(), true);
assert.match(await second.locator('#tab-banner-text').textContent(), /baca-saja/i);
assert.equal(await second.locator('#add-object').isDisabled(), true);

// Blokir di lapisan command: memaksa jalur edit tetap tidak mengubah dokumen.
const beforeReadOnlyEdit = await second.evaluate(() => window.blockingRoom.getDocument());
await second.evaluate(() => document.getElementById('add-object').click());
await second.evaluate(() => {
  const input = document.querySelector('[data-prop="name"]');
  input.disabled = false;
  input.value = 'Ditulis dari tab baca-saja';
  input.dispatchEvent(new Event('change', {bubbles: true}));
});
await second.waitForTimeout(300);
assert.deepEqual(await second.evaluate(() => window.blockingRoom.getDocument()), beforeReadOnlyEdit,
  'tab baca-saja tidak boleh mengubah dokumen walaupun UI dipaksa');
assert.equal((await savedDoc(second)).title, (await savedDoc(page)).title, 'tidak ada silent last-write-wins');

// Ambil alih ditolak selama writer masih hidup.
await second.locator('#take-over').click();
await second.waitForTimeout(400);
assert.equal(await second.evaluate(() => window.blockingRoom.isReadOnly()), true, 'writer yang hidup tidak dapat direbut');

// Writer menutup tab → kunci dilepas → tab kedua boleh mengambil alih.
await page.close();
await second.locator('#take-over').click();
await second.waitForFunction(() => window.blockingRoom.isReadOnly() === false, null, {timeout: 5000});
assert.equal(await second.locator('#tab-banner').isVisible(), false);
await second.locator('[data-prop="name"]').fill('Ditulis setelah ambil alih');
await second.locator('[data-prop="name"]').press('Tab');
await second.evaluate(() => window.blockingRoom.flushSave());
await settled(second);
assert.ok(JSON.stringify(await savedDoc(second)).includes('Ditulis setelah ambil alih'));

// ---------------------------------------------------------------- 5. dua proyek judul sama
const originalId = await second.evaluate(() => window.blockingRoom.getProjectId());
const originalDoc = await savedDoc(second);
await second.evaluate(() => document.getElementById('open-copy').click());
// `?.` disengaja: "Buka salinan" memuat ulang halaman, sehingga predikat ini dapat
// dievaluasi pada dokumen baru sebelum `src/app.js` selesai memasang kait uji.
// Tanpa optional chaining, suite gagal secara acak karena balapan itu — bukan karena
// isolasi proyek gagal (asersi isolasinya sendiri tidak diubah).
await second.waitForFunction(id => window.blockingRoom?.getProjectId() !== id, originalId, {timeout: 15000});
await second.waitForSelector('#viewport canvas');
const copyId = await second.evaluate(() => window.blockingRoom.getProjectId());
assert.notEqual(copyId, originalId);
assert.equal((await second.evaluate(() => window.blockingRoom.listProjects())).length, 2);

// Judul dibuat persis sama; isolasi tidak boleh bergantung pada judul.
await second.locator('#project-title').fill(originalDoc.title);
await second.locator('#project-title').press('Tab');
await second.locator('[data-prop="name"]').fill('Hanya ada di salinan');
await second.locator('[data-prop="name"]').press('Tab');
await second.evaluate(() => window.blockingRoom.flushSave());
await settled(second);

const originalAfter = await savedDoc(second, originalId);
assert.equal(originalAfter.title, originalDoc.title);
assert.deepEqual(originalAfter.scenes, originalDoc.scenes, 'mengedit salinan tidak boleh mengubah proyek asal');
assert.ok(JSON.stringify(await savedDoc(second, copyId)).includes('Hanya ada di salinan'));

// Pergantian proyek saat save masih pending: perubahan tetap masuk ke proyek asalnya.
await second.locator('[data-prop="name"]').fill('Perubahan menit terakhir');
await second.locator('[data-prop="name"]').press('Tab');
await second.evaluate(id => localStorage.setItem('blocking-room.activeProject', id), originalId);
await second.reload();
await second.waitForSelector('#viewport canvas');
assert.equal(await second.evaluate(() => window.blockingRoom.getProjectId()), originalId);
assert.deepEqual((await savedDoc(second, originalId)).scenes, originalDoc.scenes,
  'save yang tertunda milik proyek lain tidak boleh mendarat di proyek aktif');
assert.ok(JSON.stringify(await savedDoc(second, copyId)).includes('Perubahan menit terakhir'),
  'save yang tertunda tetap masuk ke proyek asalnya');

// ---------------------------------------------------------------- 6. kegagalan & pemulihan
await second.evaluate(() => window.blockingRoom.breakStorage());
await second.locator('[data-prop="name"]').fill('Saat penyimpanan rusak');
await second.locator('[data-prop="name"]').press('Tab');
await second.waitForFunction(() => window.blockingRoom.getSaveStatus().status === 'error', null, {timeout: 5000});
assert.equal((await status(second)).text, 'Gagal menyimpan');
assert.equal(await second.locator('#download-backup').isVisible(), true, 'kegagalan menawarkan unduh cadangan');
assert.equal((await project(second)).actors[0].name, 'Saat penyimpanan rusak', 'data tetap ada di memori');

const backup = second.waitForEvent('download');
await second.locator('#download-backup').click();
assert.ok((await backup).suggestedFilename().endsWith('.json'));

await second.evaluate(() => window.blockingRoom.restoreStorage());
await second.locator('[data-prop="height"]').fill('1.8');
await second.locator('[data-prop="height"]').press('Tab');
await second.evaluate(() => window.blockingRoom.flushSave());
await settled(second);
const recovered = await savedDoc(second);
assert.equal(recovered.scenes[0].actors[0].name, 'Saat penyimpanan rusak', 'perubahan saat gagal ikut tersimpan setelah pulih');
assert.equal(recovered.scenes[0].actors[0].height, 1.8);

// ---------------------------------------------------------------- 7. 100 siklus edit/save
// Setiap siklus: edit → autosave commit → baca ulang dari IndexedDB dan bandingkan.
// Setiap 10 siklus ditambah reload penuh, sehingga jalur buka-kembali ikut teruji.
for (let i = 1; i <= 100; i += 1) {
  const value = (i % 40) - 20 + 0.5;
  await second.locator('[data-prop="x"]').fill(String(value));
  await second.locator('[data-prop="x"]').press('Tab');
  await second.evaluate(() => window.blockingRoom.flushSave());
  const memory = await second.evaluate(() => window.blockingRoom.getDocument());
  const disk = await savedDoc(second);
  assert.deepEqual(disk.scenes, memory.scenes, `siklus ${i}: dokumen tersimpan berbeda dengan memori`);
  if (i % 10 === 0) {
    await second.reload();
    await second.waitForSelector('#viewport canvas');
    const afterReload = await second.evaluate(() => window.blockingRoom.getDocument());
    assert.deepEqual(afterReload.scenes, disk.scenes, `siklus ${i}: data berubah setelah reload`);
  }
}

assert.deepEqual(errors, []);
console.log('PASS: autosave atomik & status jujur, ≥10 snapshot recovery + pulihkan sebagai undo, session state, dua tab read-only tanpa last-write-wins + ambil alih, dua proyek judul sama terisolasi, ganti proyek saat save pending, kegagalan simpan + cadangan + pemulihan, 100 siklus edit/save/reload tanpa beda data.');
await browser.close();

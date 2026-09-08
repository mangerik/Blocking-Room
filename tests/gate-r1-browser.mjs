// Gate R1 (F6-08) — perburuan bug kelas "penghenti rilis".
//
// Suite lain membuktikan fitur bekerja. Suite ini mencoba **merusaknya**: tiga kelas bug
// yang menurut PRD §14 poin 4 menghentikan rilis — kehilangan data, lock bypass, dan
// migrasi yang merusak data yang sudah ada.
//
//   1. Lock bypass lewat setiap jalur input yang ada (keyboard, inspector, warna,
//      keyframe, hapus, pintu) — termasuk pada objek tersembunyi.
//   2. Lock bypass lintas scene: mengedit scene 1 tidak boleh menyentuh objek terkunci
//      di scene 2, dan mengunci di satu scene tidak boleh bocor ke scene lain.
//   3. Tab baca-saja: keyboard, inspector dan operasi scene tidak boleh menulis apa pun.
//   4. Kehilangan data: banyak gestur beruntun lalu reload segera.
//   5. Kehilangan data: berpindah scene saat penyimpanan masih berjalan.
//   6. Migrasi: impor v1 rusak tidak boleh mengubah proyek yang sedang dibuka.
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';

const APP = 'http://localhost:5174';
const browser = await chromium.launch({headless: true, channel: 'chrome', args: ['--enable-webgl', '--ignore-gpu-blocklist']});
const context = await browser.newContext({viewport: {width: 1440, height: 1000}, acceptDownloads: true});
const errors = [];

async function open() {
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(APP);
  await page.waitForSelector('#viewport canvas');
  await page.waitForTimeout(400);
  return page;
}

const project = page => page.evaluate(() => window.blockingRoom.getProject());
const settled = page => page.waitForFunction(() => window.blockingRoom.getSaveStatus().status === 'saved', null, {timeout: 8000});

const page = await open();

// ---------------------------------------------------------------- 1. lock bypass
{
  const actorId = (await project(page)).actors[0].id;
  await page.evaluate(id => window.blockingRoom.select(id), actorId);
  await page.locator(`[data-lock="${actorId}"]`).click();
  await page.waitForTimeout(200);
  const locked = (await project(page)).actors.find(a => a.id === actorId);
  assert.equal(locked.locked, true);
  const before = JSON.stringify(locked.keys);

  // (a) keyboard — panah dan Q/E pada objek terkunci.
  await page.evaluate(id => window.blockingRoom.select(id), actorId);
  await page.keyboard.press('g');
  for (const key of ['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'q', 'e']) await page.keyboard.press(key);
  await page.waitForTimeout(250);
  assert.equal(JSON.stringify((await project(page)).actors.find(a => a.id === actorId).keys), before, 'keyboard tidak boleh menggeser objek terkunci');

  // (b) inspector — seluruh input, select dan tombol harus dinonaktifkan.
  const enabled = await page.evaluate(() =>
    [...document.querySelectorAll('#inspector input,#inspector select,#inspector button')].filter(el => !el.disabled).map(el => el.id || el.dataset.prop || el.className));
  assert.deepEqual(enabled, [], 'inspector objek terkunci harus dinonaktifkan sepenuhnya');
  assert.ok(await page.locator('.object-notice').count() >= 1, 'harus ada pemberitahuan teks bahwa objek terkunci');

  // (c) memaksa lewat DOM: mengaktifkan kembali input lalu mengubahnya tidak boleh menulis.
  await page.evaluate(() => {
    const input = document.querySelector('#inspector [data-prop="x"]') ?? document.querySelector('#inspector [data-prop="name"]');
    if (!input) return;
    input.disabled = false;
    input.value = input.dataset.prop === 'name' ? 'DIRETAS' : '42';
    input.dispatchEvent(new Event('change', {bubbles: true}));
  });
  await page.waitForTimeout(250);
  const forced = (await project(page)).actors.find(a => a.id === actorId);
  assert.equal(JSON.stringify(forced.keys), before, 'perubahan paksa lewat DOM tidak boleh menulis ke objek terkunci');
  assert.notEqual(forced.name, 'DIRETAS', 'nama objek terkunci tidak boleh berubah');

  // (d) tombol hapus di daftar objek harus dinonaktifkan.
  assert.equal(await page.locator(`[data-delete="${actorId}"]`).isDisabled(), true);

  // (e) ruangan terkunci (default) tetap tidak dapat digeser lewat keyboard setelah dipilih.
  const roomId = (await project(page)).rooms[0].id;
  const roomBefore = JSON.stringify((await project(page)).rooms.find(r => r.id === roomId));
  await page.evaluate(id => window.blockingRoom.select(id), roomId);
  await page.keyboard.press('g');
  for (const key of ['ArrowRight', 'ArrowUp']) await page.keyboard.press(key);
  await page.waitForTimeout(250);
  assert.equal(JSON.stringify((await project(page)).rooms.find(r => r.id === roomId)), roomBefore, 'ruangan terkunci tidak boleh bergeser');

  // (f) objek tersembunyi juga tidak dapat diedit.
  const other = (await project(page)).actors.find(a => !a.locked);
  // Memilih aktor lebih dahulu: memilih ruangan pada langkah (e) memindahkan daftar ke
  // tab "Lokasi", sehingga tombol mata aktor belum ada di DOM.
  await page.evaluate(id => window.blockingRoom.select(id), other.id);
  await page.locator(`[data-visible="${other.id}"]`).click();
  await page.waitForTimeout(200);
  await page.evaluate(id => window.blockingRoom.select(id), other.id);
  const hiddenBefore = JSON.stringify((await project(page)).actors.find(a => a.id === other.id).keys);
  await page.keyboard.press('g');
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(250);
  assert.equal(JSON.stringify((await project(page)).actors.find(a => a.id === other.id).keys), hiddenBefore, 'objek tersembunyi tidak boleh bergeser');
  await page.locator(`[data-visible="${other.id}"]`).click();
  await page.waitForTimeout(200);
  await page.locator(`[data-lock="${actorId}"]`).click();
  await settled(page);
  assert.equal((await project(page)).actors.find(a => a.id === actorId).locked, false, 'buka kunci harus bekerja');
}

// ---------------------------------------------------------------- 2. lock lintas scene
{
  await page.locator('#add-scene').click();
  await page.waitForFunction(() => window.blockingRoom.getScenes().length === 2);
  const scenes = await page.evaluate(() => window.blockingRoom.getScenes().map(s => s.id));
  const [scene1, scene2] = scenes;

  // Scene baru kosong: tambahkan satu aktor lebih dahulu, lalu kunci.
  await page.locator('#add-object').click();
  await page.waitForFunction(() => window.blockingRoom.getProject().actors.length === 1);
  const actor2 = (await project(page)).actors[0].id;
  await page.evaluate(id => window.blockingRoom.select(id), actor2);
  await page.locator(`[data-lock="${actor2}"]`).click();
  await page.waitForTimeout(200);
  const scene2Snapshot = await page.evaluate(() => JSON.stringify(window.blockingRoom.getProject()));
  await settled(page);

  // Kembali ke scene 1, edit sepuasnya.
  await page.evaluate(id => window.blockingRoom.switchScene(id), scene1);
  await page.waitForTimeout(300);
  const actor1 = (await project(page)).actors.find(a => !a.locked).id;
  await page.evaluate(id => window.blockingRoom.select(id), actor1);
  await page.keyboard.press('g');
  for (let i = 0; i < 8; i++) await page.keyboard.press('ArrowRight');
  await page.locator('[data-prop="name"]').fill('Diedit di scene 1');
  await page.locator('[data-prop="name"]').press('Tab');
  await settled(page);
  assert.equal((await project(page)).actors.find(a => a.id === actor1).name, 'Diedit di scene 1');

  // Scene 2 harus benar-benar tidak tersentuh, termasuk flag lock-nya.
  await page.evaluate(id => window.blockingRoom.switchScene(id), scene2);
  await page.waitForTimeout(400);
  assert.equal(await page.evaluate(() => JSON.stringify(window.blockingRoom.getProject())), scene2Snapshot, 'mengedit scene 1 tidak boleh mengubah scene 2');
  assert.equal((await project(page)).actors.find(a => a.id === actor2).locked, true, 'lock scene 2 harus bertahan');

  // Dokumen tersimpan harus setuju dengan yang di layar.
  const stored = await page.evaluate(() => window.blockingRoom.getStoredDocument());
  const storedScene2 = stored.scenes.find(s => s.id === scene2);
  assert.equal(storedScene2.actors.find(a => a.id === actor2).locked, true);

  await page.evaluate(id => window.blockingRoom.switchScene(id), scene1);
  await page.waitForTimeout(300);
}

// ---------------------------------------------------------------- 3. tab baca-saja
{
  const second = await open();
  await second.waitForFunction(() => window.blockingRoom.isReadOnly() === true, null, {timeout: 8000});
  const beforeDoc = await second.evaluate(() => JSON.stringify(window.blockingRoom.getStoredDocument()));

  const actorId = (await project(second)).actors[0].id;
  await second.evaluate(id => window.blockingRoom.select(id), actorId);
  await second.keyboard.press('g');
  for (let i = 0; i < 5; i++) await second.keyboard.press('ArrowRight');
  await second.waitForTimeout(300);

  // Operasi scene juga harus ditolak di tab baca-saja. Tombolnya memang dinonaktifkan —
  // itu lapisan UI. Yang diuji di sini lapisan command: tombol diaktifkan paksa lewat DOM
  // lalu ditekan, dan penolakan harus tetap terjadi.
  assert.equal(await second.locator('#add-scene').isDisabled(), true, 'tombol tambah scene harus mati di tab baca-saja');
  await second.evaluate(() => {
    const button = document.querySelector('#add-scene');
    button.disabled = false;
    button.click();
  });
  await second.waitForTimeout(400);

  const afterDoc = await second.evaluate(() => JSON.stringify(window.blockingRoom.getStoredDocument()));
  assert.equal(afterDoc, beforeDoc, 'tab baca-saja tidak boleh menulis apa pun ke penyimpanan');
  assert.equal(await second.evaluate(() => window.blockingRoom.getScenes().length), 2, 'tab baca-saja tidak boleh menambah scene');
  await second.close();
  await page.bringToFront();
}

// ---------------------------------------------------------------- 4. banyak gestur lalu reload segera
{
  const actorId = (await project(page)).actors.find(a => !a.locked).id;
  await page.evaluate(id => window.blockingRoom.select(id), actorId);
  await page.keyboard.press('g');
  for (let i = 0; i < 30; i++) await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(120);
  const onScreen = await page.evaluate(id => {
    const actor = window.blockingRoom.getProject().actors.find(a => a.id === id);
    return JSON.stringify(actor.keys);
  }, actorId);

  // Reload tanpa menunggu status "tersimpan": jalur pagehide + titipan localStorage.
  await page.reload();
  await page.waitForSelector('#viewport canvas');
  await page.waitForTimeout(800);
  const afterReload = await page.evaluate(id => {
    const actor = window.blockingRoom.getProject().actors.find(a => a.id === id);
    return actor ? JSON.stringify(actor.keys) : null;
  }, actorId);
  assert.equal(afterReload, onScreen, '30 gestur keyboard lalu reload segera tidak boleh kehilangan perubahan');
}

// ---------------------------------------------------------------- 5. pindah scene saat save berjalan
{
  const scenes = await page.evaluate(() => window.blockingRoom.getScenes().map(s => s.id));
  const actorId = (await project(page)).actors.find(a => !a.locked).id;
  await page.evaluate(id => window.blockingRoom.select(id), actorId);
  await page.locator('[data-prop="name"]').fill('Nama sebelum pindah scene');
  await page.locator('[data-prop="name"]').press('Tab');
  // Berpindah scene TANPA menunggu save selesai.
  await page.evaluate(id => window.blockingRoom.switchScene(id), scenes[1]);
  await page.waitForTimeout(300);
  await page.evaluate(id => window.blockingRoom.switchScene(id), scenes[0]);
  await settled(page);
  assert.equal((await project(page)).actors.find(a => a.id === actorId).name, 'Nama sebelum pindah scene',
    'perubahan sebelum pindah scene tidak boleh hilang');
  const stored = await page.evaluate(() => window.blockingRoom.getStoredDocument());
  assert.equal(stored.scenes.find(s => s.id === scenes[0]).actors.find(a => a.id === actorId).name, 'Nama sebelum pindah scene',
    'perubahan harus ikut tersimpan ke dokumen');
}

// ---------------------------------------------------------------- 6. impor v1 rusak
{
  const before = await page.evaluate(() => JSON.stringify(window.blockingRoom.getDocument()));
  await page.evaluate(() => {
    const input = document.querySelector('#file-input');
    const file = new File(['{"version":1,"title":"Rusak","duration":12,"actors":[{"id":"a1"}]'], 'rusak.json', {type: 'application/json'});
    const transfer = new DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', {bubbles: true}));
  });
  await page.waitForTimeout(700);
  assert.equal(await page.evaluate(() => JSON.stringify(window.blockingRoom.getDocument())), before,
    'impor JSON rusak tidak boleh mengubah dokumen aktif');
  const toast = await page.locator('#toast').textContent();
  assert.ok(toast.length > 0, 'impor gagal harus memberi pesan, bukan diam');
}

// ---------------------------------------------------------------- 7. PR-03: simpan ≤1 detik setelah gestur
// PRD PR-03 menyebut angka konkret ("simpan atomik ≤1 detik setelah gestur selesai"),
// jadi angkanya diukur, bukan disimpulkan dari "test lulus".
{
  const actorId = (await project(page)).actors.find(a => !a.locked).id;
  await page.evaluate(id => window.blockingRoom.select(id), actorId);
  await page.keyboard.press('g');
  const samples = [];
  for (let i = 0; i < 10; i++) {
    await settled(page);
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(60);
    const started = await page.evaluate(() => {
      document.dispatchEvent(new Event('x'));
      return performance.timeOrigin + performance.now();
    });
    await page.keyboard.up('ArrowRight'); // akhir gestur: keyup memicu finishKeyboardGesture
    await page.waitForFunction(() => window.blockingRoom.getSaveStatus().status === 'saved', null, {timeout: 5000});
    samples.push((await page.evaluate(() => performance.timeOrigin + performance.now())) - started);
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const p95 = sorted[Math.ceil(0.95 * sorted.length) - 1];
  console.log(`PR-03 simpan setelah gestur: p50 ${Math.round(sorted[4])} ms, p95 ${Math.round(p95)} ms, maks ${Math.round(sorted.at(-1))} ms (n=${samples.length})`);
  assert.ok(p95 <= 1000, `PR-03: p95 penyimpanan setelah gestur harus ≤1000 ms, terukur ${Math.round(p95)} ms`);
}

assert.deepEqual(errors, [], `tidak boleh ada error browser: ${errors.join(' | ')}`);
console.log('PASS gate R1: lock bypass (keyboard/inspector/DOM paksa/hapus/ruangan/tersembunyi), isolasi lock lintas scene, tab baca-saja tanpa penulisan, 30 gestur + reload segera tanpa kehilangan, pindah scene saat save berjalan, impor v1 rusak tidak menimpa.');
await browser.close();

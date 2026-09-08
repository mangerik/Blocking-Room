// F6-05/F6-06/F6-07 di Chrome sungguhan.
//
// Cakupan:
//   1. Kehilangan konteks WebGL (WEBGL_lose_context) → banner + pemulihan aman.
//   2. Tanpa WebGL sama sekali → layar fallback, dashboard tetap terbuka,
//      ekspor JSON tetap tersedia.
//   3. Metrik lokal: event tercatat, ekspor JSON tidak memuat nama proyek.
//   4. Feature flag dashboard mati → rute dashboard langsung membuka editor.
//   5. Ekspor kompatibel v1 dari editor (rollback aplikasi).
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir, readFile} from 'node:fs/promises';

const APP = 'http://localhost:5174';
await mkdir('artifacts', {recursive: true});
const browser = await chromium.launch({headless: true, channel: 'chrome', args: ['--enable-webgl', '--ignore-gpu-blocklist']});
const errors = [];

async function newPage(context) {
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  return page;
}

// ---------------------------------------------------------------- 1. context loss
{
  const context = await browser.newContext({viewport: {width: 1280, height: 800}});
  const page = await newPage(context);
  await page.goto(APP);
  await page.waitForSelector('#viewport canvas');
  await page.waitForTimeout(500);

  const objectsBefore = await page.evaluate(() => window.blockingRoom.getSceneObjectCount());
  assert.ok(objectsBefore > 0);
  assert.equal(await page.evaluate(() => window.blockingRoom.isContextLost()), false);

  assert.equal(await page.evaluate(() => window.blockingRoom.loseWebGLContext()), true, 'WEBGL_lose_context tersedia');
  await page.waitForFunction(() => window.blockingRoom.isContextLost() === true, null, {timeout: 5000});
  await page.waitForSelector('#context-banner:not([hidden])');
  assert.match(await page.locator('#context-banner b').innerText(), /terputus/i);
  // Editor tidak boleh mati: dokumen tetap dapat dibaca selama konteks hilang.
  assert.ok((await page.evaluate(() => window.blockingRoom.getProject().actors.length)) > 0);

  await page.locator('#context-retry').click();
  await page.waitForFunction(() => window.blockingRoom.isContextLost() === false, null, {timeout: 10_000});
  await page.waitForSelector('#context-banner[hidden]', {state: 'attached'});
  await page.waitForTimeout(400);
  assert.equal(await page.evaluate(() => window.blockingRoom.getSceneObjectCount()), objectsBefore, 'scene dibangun ulang utuh');
  await page.screenshot({path: 'artifacts/context-restored.png'});
  await context.close();
}

// ---------------------------------------------------------------- 2. tanpa WebGL
{
  const context = await browser.newContext({viewport: {width: 1280, height: 800}, acceptDownloads: true});
  // WebGL diblokir sebelum skrip aplikasi berjalan; konteks 2d tetap tersedia
  // supaya jalur non-3D (thumbnail, dashboard) benar-benar diuji apa adanya.
  await context.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
      if (['webgl', 'webgl2', 'experimental-webgl'].includes(String(type))) return null;
      return original.call(this, type, ...rest);
    };
  });
  const page = await newPage(context);
  await page.goto(APP);
  await page.waitForSelector('.fallback');
  assert.equal(await page.locator('#viewport canvas').count(), 0, 'tidak ada canvas 3D yang dipaksakan');
  assert.match(await page.locator('.fallback h1').innerText(), /WebGL|3D/i);
  assert.equal(await page.locator('[data-warning="webgl"]').count(), 1);
  assert.equal(await page.locator('[data-warning="webgl"]').getAttribute('data-level'), 'blocking');

  // Penyimpanan kosong: fallback mengatakannya apa adanya, tidak menawarkan unduhan palsu.
  await page.waitForFunction(() => /Belum ada proyek/.test(document.querySelector('#fallback-status').textContent), null, {timeout: 15_000});
  assert.equal(await page.locator('#fallback-export').isDisabled(), true);

  // Setelah ada proyek tersimpan, ekspor JSON tetap bekerja tanpa WebGL sama sekali.
  await page.evaluate(async () => {
    const [{ProjectRepository}, {openProjectData}, {initialProject}] = await Promise.all([
      import('/src/repository.js'), import('/src/migrate.js'), import('/src/model.js'),
    ]);
    const repository = new ProjectRepository();
    await repository.open();
    const doc = openProjectData(initialProject()).document;
    await repository.saveDocument(doc, {revision: true, revisionToken: 1});
    localStorage.setItem('blocking-room.activeProject', doc.id);
    repository.close();
  });
  await page.reload();
  await page.waitForSelector('.fallback');
  await page.waitForFunction(() => !document.querySelector('#fallback-export').disabled, null, {timeout: 15_000});
  const download = page.waitForEvent('download');
  await page.locator('#fallback-export').click();
  const file = await download;
  await file.saveAs('artifacts/fallback-project.json');
  const exported = JSON.parse(await readFile('artifacts/fallback-project.json', 'utf8'));
  assert.equal(exported.schemaVersion, 2);
  assert.ok(exported.scenes.length >= 1);

  // Dashboard tetap dapat dibuka tanpa WebGL.
  await page.locator('#fallback-dashboard').click();
  await page.waitForSelector('.dashboard');
  assert.ok(await page.locator('.dash-card').count() >= 1);
  await page.screenshot({path: 'artifacts/no-webgl-fallback.png'});
  await context.close();
}

// ---------------------------------------------------------------- 3. metrik lokal
{
  const context = await browser.newContext({viewport: {width: 1280, height: 800}, acceptDownloads: true});
  const page = await newPage(context);
  await page.goto(APP);
  await page.waitForSelector('#viewport canvas');
  await page.waitForTimeout(400);

  await page.evaluate(() => window.blockingRoom.clearMetrics());
  // Judul proyek yang khas: dipakai untuk membuktikan judul tidak bocor ke metrik.
  await page.locator('#project-title').fill('Rahasia Klien Akbar');
  await page.locator('#project-title').press('Tab');
  await page.locator('[data-prop="name"]').fill('Karakter Rahasia');
  await page.locator('[data-prop="name"]').press('Tab');
  await page.locator('#add-scene').click();
  await page.locator('#undo').click();
  await page.waitForTimeout(400);

  const summary = await page.evaluate(() => window.blockingRoom.metricsSummary());
  assert.ok(summary.editor_command >= 1, `editor_command tercatat (${JSON.stringify(summary)})`);
  assert.ok(summary.history_used >= 1, 'history_used tercatat');
  assert.ok(summary.autosave_completed >= 1, 'autosave_completed tercatat');

  const raw = JSON.stringify(await page.evaluate(() => window.blockingRoom.getMetrics()));
  for (const secret of ['Rahasia Klien Akbar', 'Karakter Rahasia']) {
    assert.ok(!raw.includes(secret), `metrik tidak boleh memuat "${secret}"`);
  }

  // Panel dan ekspor JSON.
  await page.locator('#metrics-open').click();
  await page.waitForSelector('#metrics-panel:not([hidden])');
  assert.ok((await page.locator('.metrics-row').count()) >= 1);
  const metricsDownload = page.waitForEvent('download');
  await page.locator('#metrics-export').click();
  const metricsFile = await metricsDownload;
  await metricsFile.saveAs('artifacts/metrics-local.json');
  const payload = JSON.parse(await readFile('artifacts/metrics-local.json', 'utf8'));
  assert.ok(payload.count >= 1);
  assert.ok(!JSON.stringify(payload.events).includes('Rahasia'));

  // Opt-in telemetry hanya disimpan; tidak ada permintaan jaringan keluar.
  const requests = [];
  page.on('request', request => {if (!request.url().startsWith(APP)) requests.push(request.url());});
  await page.locator('#metrics-optin').check();
  await page.waitForTimeout(800);
  assert.equal(await page.evaluate(() => localStorage.getItem('blocking-room.telemetryOptIn')), 'true');
  assert.deepEqual(requests.filter(url => !url.startsWith('data:') && !url.startsWith('blob:') && !url.includes('fonts.g')), []);

  await page.locator('#metrics-clear').click();
  assert.deepEqual(await page.evaluate(() => window.blockingRoom.getMetrics()), []);
  await context.close();
}

// ---------------------------------------------------------------- 4. flag dashboard mati
{
  const context = await browser.newContext({viewport: {width: 1280, height: 800}});
  const page = await newPage(context);
  await page.goto(APP);
  await page.waitForSelector('#viewport canvas');
  await page.evaluate(() => localStorage.setItem('blocking-room.flags.dashboard', 'off'));

  await page.goto(`${APP}#/`);
  await page.waitForSelector('#viewport canvas');
  assert.equal(await page.locator('.dashboard').count(), 0, 'rute dashboard tidak boleh membuka daftar proyek saat flag mati');
  assert.equal(await page.locator('#back-dashboard').isVisible(), false, 'jalan ke dashboard disembunyikan');
  assert.equal(await page.evaluate(() => location.hash), '', 'hash rute dashboard dibersihkan');

  // Data tidak berubah: menyalakan flag kembali memunculkan dashboard lagi.
  await page.evaluate(() => localStorage.setItem('blocking-room.flags.dashboard', 'on'));
  await page.goto(`${APP}#/`);
  await page.waitForSelector('.dashboard');
  assert.ok((await page.locator('.dash-card').count()) >= 1);
  await context.close();
}

// ---------------------------------------------------------------- 5. ekspor kompatibel v1
{
  const context = await browser.newContext({viewport: {width: 1280, height: 800}, acceptDownloads: true});
  const page = await newPage(context);
  await page.goto(APP);
  await page.waitForSelector('#viewport canvas');
  await page.waitForTimeout(300);
  const expected = await page.evaluate(() => {
    const project = window.blockingRoom.getProject();
    return {actors: project.actors.length, rooms: project.rooms.length, duration: project.duration};
  });
  await page.locator('#revisions').click();
  const v1Download = page.waitForEvent('download');
  await page.locator('#export-v1').click();
  const v1File = await v1Download;
  await v1File.saveAs('artifacts/export-v1.json');
  const v1 = JSON.parse(await readFile('artifacts/export-v1.json', 'utf8'));
  assert.equal(v1.version, 1);
  assert.equal(v1.actors.length, expected.actors);
  assert.equal(v1.rooms.length, expected.rooms);
  assert.equal(v1.duration, expected.duration);
  assert.ok(v1.actors.every(actor => Array.isArray(actor.keys) && actor.keys.length >= 1));

  // Berkas hasil rollback harus dapat dibuka kembali oleh aplikasi (jalur impor v1).
  await page.locator('#file-input').setInputFiles('artifacts/export-v1.json');
  await page.waitForTimeout(600);
  assert.equal(await page.evaluate(() => window.blockingRoom.getProject().actors.length), expected.actors);
  await context.close();
}

assert.deepEqual(errors, [], `tidak boleh ada error browser: ${errors.join(' | ')}`);
console.log('PASS: context loss + pemulihan, fallback no-WebGL + ekspor JSON + dashboard, metrik lokal tanpa isi karya + opt-in tanpa pengiriman, feature flag dashboard, ekspor kompatibel v1 dan impor ulangnya.');
await browser.close();

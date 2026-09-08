// Gate R2 (F6-09) — perburuan bug kelas "penghenti rilis" untuk lingkup R2.
//
// Gate R1 (`tests/gate-r1-browser.mjs`) berburu kehilangan data, lock bypass dan migrasi
// rusak pada lingkup proyek/scene. Berkas ini melanjutkannya ke tiga permukaan baru R2:
// shot, timeline per-track/props, dan ekspor.
//
//   1. Mismatch preview ↔ ekspor pada kombinasi yang TIDAK dicakup Fase 5: aspect
//      9:16 dan 2.39:1, fps 24, aktor tersembunyi, prop dan dinding modular v3, serta
//      burn-in aktif. Yang dibandingkan adalah frame hasil DECODE berkas ekspor dengan
//      render preview pada waktu yang sama — bukan dua kali render dari jalur yang sama.
//   2. Lock bypass lewat operasi massal keyframe (geser, tempel, hapus) dan lewat
//      objek set baru (prop dan dinding modular): inspector, keyboard, duplikasi, hapus.
//   3. Isolasi shot A/B yang bertahan melewati undo/redo DAN reload penuh.
//   4. Kehilangan data saat job ekspor berjalan lalu tab dimuat ulang.
//
// Suite ini sengaja mencoba merusak. Setiap asersi menyebut alasannya.
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';

const APP = 'http://localhost:5174';
const browser = await chromium.launch({headless: true, channel: 'chrome', args: ['--enable-webgl', '--ignore-gpu-blocklist']});
const context = await browser.newContext({viewport: {width: 1440, height: 1000}, acceptDownloads: true});
const errors = [];
const report = {};

async function open() {
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(APP);
  await page.waitForSelector('#viewport canvas');
  await page.waitForTimeout(600);
  return page;
}

const project = page => page.evaluate(() => window.blockingRoom.getProject());
const shots = page => page.evaluate(() => window.blockingRoom.getShots());
const settled = page => page.waitForFunction(() => window.blockingRoom.getSaveStatus().status === 'saved', null, {timeout: 10_000});

/** Menyiapkan util ekspor di dalam halaman (pola yang sama dengan tests/export-browser.mjs). */
async function installExportUtils(page) {
  await page.evaluate(async () => {
    const [{ShotFrameSource}, service, {readSceneView}] = await Promise.all([
      import('/src/export/frame-source.js'),
      import('/src/export/export-service.js'),
      import('/src/document.js'),
    ]);
    const SW = 48, SH = 27;
    const small = document.createElement('canvas');
    small.width = SW; small.height = SH;
    const ctx = small.getContext('2d', {willReadFrequently: true});
    window.__r2 = {
      ShotFrameSource, readSceneView, ...service,
      signature(source) {
        ctx.drawImage(source, 0, 0, SW, SH);
        return Array.from(ctx.getImageData(0, 0, SW, SH).data);
      },
      diff(a, b) {
        let sum = 0, n = 0;
        for (let i = 0; i < a.length; i += 4) {
          sum += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
          n += 3;
        }
        return Number((sum / n).toFixed(3));
      },
      async decodeAt(blob, times) {
        const url = URL.createObjectURL(blob);
        const video = document.createElement('video');
        video.muted = true; video.preload = 'auto'; video.src = url;
        await new Promise((resolve, reject) => {
          video.onloadedmetadata = resolve;
          video.onerror = () => reject(new Error('video hasil ekspor tidak dapat dibuka'));
        });
        const out = {duration: video.duration, width: video.videoWidth, height: video.videoHeight, frames: []};
        for (const t of times) {
          await new Promise(resolve => {video.onseeked = () => resolve(); video.currentTime = t;});
          out.frames.push(window.__r2.signature(video));
        }
        video.src = '';
        URL.revokeObjectURL(url);
        return out;
      },
      /**
       * Satu kasus: render preview → ekspor → decode → bandingkan.
       * `mutate(view)` boleh mengubah scene view (mis. menyembunyikan aktor).
       */
      async caseOf({aspectRatio, fps, burnIn = false, hideActors = false, frames = 60}) {
        const E = window.__r2;
        const doc = window.blockingRoom.getSnapshot();
        const scene = doc.scenes[0], shot = scene.shots[0];
        const view = E.readSceneView(doc, scene.id, shot.id);
        if (hideActors) view.actors.forEach(a => {a.visible = false;});
        const size = E.exportSize(aspectRatio, '720p');
        const make = () => new E.ShotFrameSource({
          view, aspectRatio, width: size.width, height: size.height, fps,
          shotName: shot.name, sceneName: scene.name, burnIn,
          burnInFields: {shot: shot.name, timecode: true, lens: true},
        });
        const times = [0, Math.floor((frames - 1) / 2) / fps, (frames - 1) / fps];
        const preview = make();
        const refs = times.map(t => E.signature(preview.render(t, Math.round(t * fps))));
        preview.dispose();

        const source = make();
        const job = new E.ExportJob({
          naming: {project: doc.title, scene: scene.name, shot: shot.name},
          settings: {
            width: size.width, height: size.height, fps, codecId: 'vp9',
            duration: shot.duration, range: {mode: 'frames', start: 0, end: frames - 1},
          },
          renderFrame: (t, i, f) => source.render(t, f),
        });
        const result = await job.run();
        source.dispose();
        const decoded = await E.decodeAt(result.blob, times.map(t => t + 1 / (fps * 2)));
        return {
          frameCount: result.frameCount,
          width: decoded.width, height: decoded.height,
          expectedWidth: size.width, expectedHeight: size.height,
          duration: Number(decoded.duration.toFixed(3)),
          match: times.map((_, i) => E.diff(decoded.frames[i], refs[i])),
          refSpread: E.diff(refs[0], refs[2]),
        };
      },
    };
  });
}

const page = await open();

// ---------------------------------------------------------------------------
// 0. Scene uji: prop dan dinding modular v3 wajib ada di frame yang dibandingkan.
// ---------------------------------------------------------------------------
{
  const propsBefore = (await page.evaluate(() => window.blockingRoom.getProps())).length;
  await page.evaluate(() => window.blockingRoom.addProp('box'));
  await page.evaluate(() => window.blockingRoom.addProp('wall'));
  await page.waitForTimeout(300);
  const props = await page.evaluate(() => window.blockingRoom.getProps());
  assert.equal(props.length, propsBefore + 2, 'prop dan dinding modular berhasil ditambahkan');
  assert.ok(props.some(p => p.type === 'wall'), 'scene uji memuat dinding modular v3');
  report.setObjects = props.length;
}

await installExportUtils(page);

// ---------------------------------------------------------------------------
// 1. Mismatch preview ↔ ekspor (EX-02 / CA-01)
// ---------------------------------------------------------------------------
// Ambang 3 (skala 0–255 per kanal) sama dengan tests/export-browser.mjs: cukup ketat
// untuk menangkap pergeseran pose/framing, cukup longgar untuk kompresi lossy VP9.
const cases = [
  {label: '16:9 · 24 fps', aspectRatio: '16:9', fps: 24},
  {label: '9:16 · 24 fps', aspectRatio: '9:16', fps: 24},
  {label: '2.39:1 · 24 fps', aspectRatio: '2.39:1', fps: 24},
  {label: '2.39:1 · 30 fps · burn-in', aspectRatio: '2.39:1', fps: 30, burnIn: true},
  {label: '9:16 · 24 fps · aktor tersembunyi', aspectRatio: '9:16', fps: 24, hideActors: true},
];
report.mismatch = [];
for (const item of cases) {
  const result = await page.evaluate(options => window.__r2.caseOf(options), item);
  assert.equal(result.frameCount, 60, `${item.label}: rentang 0–59 harus menghasilkan 60 frame`);
  assert.equal(result.width, result.expectedWidth, `${item.label}: lebar berkas mengikuti aspect shot`);
  assert.equal(result.height, result.expectedHeight, `${item.label}: tinggi berkas mengikuti aspect shot`);
  assert.equal(result.width % 2, 0, `${item.label}: lebar genap (syarat encoder)`);
  assert.equal(result.height % 2, 0, `${item.label}: tinggi genap (syarat encoder)`);
  for (const [index, value] of result.match.entries()) {
    assert.ok(value < 3, `${item.label}: frame ${['awal', 'tengah', 'akhir'][index]} menyimpang ${value} dari preview (batas 3)`);
  }
  // Pengaman "uji yang tidak menguji apa-apa": frame awal dan akhir harus BERBEDA,
  // kalau tidak, kesamaan di atas bisa berarti tiga frame kosong yang identik.
  assert.ok(result.refSpread > 0.2, `${item.label}: scene harus benar-benar bergerak antara frame awal dan akhir (${result.refSpread})`);
  report.mismatch.push({...item, match: result.match, size: `${result.width}×${result.height}`});
}

// Aspect ratio shot juga harus mengubah crop PREVIEW, bukan hanya berkas ekspor —
// kalau tidak, "preview menunjukkan crop ekspor" (CA-01) tidak terpenuhi.
for (const ratio of ['9:16', '2.39:1', '16:9']) {
  await page.evaluate(r => window.blockingRoom.setShotSetting('aspectRatio', r), ratio);
  await page.waitForTimeout(250);
  const aspect = await page.evaluate(() => window.blockingRoom.getAspect());
  assert.equal(aspect.ratio, ratio, `preview memakai aspect ${ratio}`);
  const povRatio = aspect.pov[0] / aspect.pov[1];
  assert.ok(Math.abs(povRatio - aspect.value) < 0.02, `canvas POV mengikuti aspect ${ratio} (${povRatio.toFixed(3)} vs ${aspect.value.toFixed(3)})`);
}

// fps shot tidak boleh menggeser satu pun keyframe (TL-01 / DATA-MODEL §5 aturan 3).
{
  const before = JSON.stringify((await shots(page))[0].tracks);
  await page.evaluate(() => window.blockingRoom.setShotSetting('fps', 24));
  await page.waitForTimeout(200);
  await page.evaluate(() => window.blockingRoom.setShotSetting('fps', 30));
  await page.waitForTimeout(200);
  await page.evaluate(() => window.blockingRoom.setShotSetting('fps', 24));
  await page.waitForTimeout(200);
  assert.equal(JSON.stringify((await shots(page))[0].tracks), before, 'mengubah fps tidak boleh menggeser keyframe');
}

// ---------------------------------------------------------------------------
// 2. Lock bypass lewat operasi massal keyframe dan lewat props/dinding
// ---------------------------------------------------------------------------
{
  const actors = (await project(page)).actors;
  const lockedId = actors[0].id;
  const freeId = actors[1].id;
  await page.evaluate(id => window.blockingRoom.select(id), lockedId);
  await page.locator(`[data-lock="${lockedId}"]`).click();
  await page.waitForTimeout(200);
  assert.equal((await project(page)).actors.find(a => a.id === lockedId).locked, true);

  const keysOf = async id => JSON.stringify((await project(page)).actors.find(a => a.id === id).keys);
  const lockedBefore = await keysOf(lockedId);

  // (a) geser massal: seleksi mencakup aktor terkunci DAN aktor bebas.
  await page.evaluate(([a, b]) => window.blockingRoom.selectKeys([{id: a, t: 0}, {id: b, t: 0}]), [lockedId, freeId]);
  const nudge = await page.evaluate(() => window.blockingRoom.nudgeKeys(1));
  await page.waitForTimeout(250);
  assert.equal(await keysOf(lockedId), lockedBefore, 'geser keyframe massal tidak boleh menyentuh aktor terkunci');
  assert.ok(nudge === null || (nudge.skipped ?? []).length > 0, 'operasi massal harus melaporkan item terkunci yang dilewati');
  const freeAfterNudge = await keysOf(freeId);
  assert.notEqual(freeAfterNudge, JSON.stringify(actors[1].keys), 'aktor bebas dalam seleksi yang sama tetap boleh bergeser');

  // (b) tempel: salin dari aktor bebas lalu tempel ke seleksi berisi aktor terkunci.
  await page.evaluate(id => window.blockingRoom.selectKeys([{id, t: 0}]), freeId);
  await page.evaluate(() => window.blockingRoom.copyKeys());
  await page.evaluate(id => window.blockingRoom.select(id), lockedId);
  await page.evaluate(id => window.blockingRoom.selectKeys([{id, t: 0}]), lockedId);
  await page.evaluate(() => window.blockingRoom.setFrame(48));
  await page.evaluate(() => window.blockingRoom.pasteKeys());
  await page.waitForTimeout(250);
  assert.equal(await keysOf(lockedId), lockedBefore, 'tempel keyframe tidak boleh menulis ke aktor terkunci');

  // (c) hapus massal.
  await page.evaluate(([a, b]) => window.blockingRoom.selectKeys([{id: a, t: 0}, {id: b, t: 0}]), [lockedId, freeId]);
  await page.evaluate(() => window.blockingRoom.deleteKeys());
  await page.waitForTimeout(250);
  assert.equal(await keysOf(lockedId), lockedBefore, 'hapus keyframe massal tidak boleh menghapus keyframe aktor terkunci');

  // (d) drag penanda keyframe di timeline (pointer sungguhan) pada lane terkunci.
  await page.evaluate(id => window.blockingRoom.select(id), lockedId);
  await page.waitForTimeout(200);
  const marker = page.locator(`.key[data-key-id^="${lockedId}"]`).first();
  if (await marker.count()) {
    const box = await marker.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2, {steps: 8});
      await page.mouse.up();
      await page.waitForTimeout(250);
    }
  }
  assert.equal(await keysOf(lockedId), lockedBefore, 'drag penanda keyframe tidak boleh menggeser keyframe terkunci');

  await page.locator(`[data-lock="${lockedId}"]`).click();
  await page.waitForTimeout(200);
}

{
  // Props dan dinding modular memakai jalur command yang sama; lock harus berlaku sama.
  const props = await page.evaluate(() => window.blockingRoom.getProps());
  const box = props.find(p => p.type === 'prop');
  const wall = props.find(p => p.type === 'wall');
  assert.ok(box && wall, 'scene uji memuat prop dan dinding modular');

  for (const target of [box, wall]) {
    await page.evaluate(id => window.blockingRoom.select(id), target.id);
    await page.waitForTimeout(200);
    await page.locator(`[data-lock="${target.id}"]`).click();
    await page.waitForTimeout(250);
    const snapshot = JSON.stringify((await page.evaluate(() => window.blockingRoom.getProps())).find(p => p.id === target.id));
    assert.match(snapshot, /"locked":true/, `${target.type} berhasil dikunci`);

    // Inspector harus mati sepenuhnya, bukan hanya "terlihat" mati.
    const enabled = await page.evaluate(() =>
      [...document.querySelectorAll('#inspector input,#inspector select,#inspector button')].filter(el => !el.disabled)
        .map(el => el.id || el.dataset.prop || el.className));
    assert.deepEqual(enabled, [], `inspector ${target.type} terkunci harus dinonaktifkan sepenuhnya`);
    assert.equal(await page.locator('#delete-object').isDisabled(), true, `hapus ${target.type} terkunci harus dinonaktifkan`);
    assert.equal(await page.locator('#duplicate-object').isDisabled(), true, `duplikasi ${target.type} terkunci harus dinonaktifkan`);

    // Keyboard: tool geser + panah + Q/E.
    await page.locator('#inspector-name').click().catch(() => {});
    await page.keyboard.press('g');
    for (const key of ['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'q', 'e']) await page.keyboard.press(key);
    await page.waitForTimeout(250);
    assert.equal(JSON.stringify((await page.evaluate(() => window.blockingRoom.getProps())).find(p => p.id === target.id)), snapshot,
      `keyboard tidak boleh menggeser ${target.type} terkunci`);

    // Memaksa lewat DOM: aktifkan kembali input lalu ubah nilainya.
    await page.evaluate(() => {
      document.querySelectorAll('#inspector input,#inspector select,#inspector button').forEach(el => {el.disabled = false;});
    });
    const xField = page.locator('#inspector [data-prop="x"]');
    if (await xField.count()) {
      await xField.fill('12');
      await xField.press('Tab');
      await page.waitForTimeout(250);
    }
    assert.equal(JSON.stringify((await page.evaluate(() => window.blockingRoom.getProps())).find(p => p.id === target.id)), snapshot,
      `mengaktifkan input lewat DOM tidak boleh menulis ke ${target.type} terkunci`);

    // Duplikasi objek terkunci ditolak di lapisan command, bukan hanya lewat tombol mati:
    // salinan lahir TIDAK terkunci dan hanya bergeser 0,5 m, jadi bagi pengguna ia terbaca
    // seperti objek terkunci yang berpindah.
    const countBefore = (await page.evaluate(() => window.blockingRoom.getProps())).length;
    await page.evaluate(id => window.blockingRoom.duplicateProp(id), target.id).catch(() => {});
    await page.waitForTimeout(250);
    const propsAfter = await page.evaluate(() => window.blockingRoom.getProps());
    assert.equal(propsAfter.length, countBefore, `duplikasi ${target.type} terkunci tidak boleh menghasilkan salinan`);
    assert.equal(JSON.stringify(propsAfter.find(p => p.id === target.id)), snapshot,
      `duplikasi tidak boleh mengubah ${target.type} terkunci yang menjadi sumbernya`);

    await page.locator(`[data-lock="${target.id}"]`).click();
    await page.waitForTimeout(200);
  }
}

// ---------------------------------------------------------------------------
// 3. Isolasi shot A/B melewati undo/redo dan reload (SH-01 / F4-02)
// ---------------------------------------------------------------------------
{
  await settled(page);
  const shotA = (await shots(page))[0];
  const trackSignature = list => JSON.stringify(list.map(t => ({o: t.objectId, p: t.property, k: t.keys})));
  const signatureA = trackSignature(shotA.tracks);

  await page.evaluate(() => window.blockingRoom.addShot());
  await page.waitForTimeout(400);
  let list = await shots(page);
  assert.equal(list.length, 2, 'shot kedua dibuat');
  const shotBId = (await page.evaluate(() => window.blockingRoom.getActiveShotId()));
  assert.notEqual(shotBId, shotA.id, 'shot B menjadi shot aktif');

  // Edit shot B: keyframe, lensa, durasi dan aspect.
  const actorId = (await project(page)).actors[0].id;
  await page.evaluate(id => window.blockingRoom.select(id), actorId);
  await page.evaluate(() => window.blockingRoom.setFrame(24));
  await page.locator('#inspector [data-prop="x"]').fill('6.25');
  await page.locator('#inspector [data-prop="x"]').press('Tab');
  await page.evaluate(() => window.blockingRoom.setShotSetting('aspectRatio', '9:16'));
  await page.evaluate(() => window.blockingRoom.setShotSetting('duration', 8));
  await page.waitForTimeout(400);

  list = await shots(page);
  assert.equal(trackSignature(list.find(s => s.id === shotA.id).tracks), signatureA,
    'mengedit shot B tidak boleh menyentuh satu keyframe pun milik shot A');
  assert.equal(list.find(s => s.id === shotA.id).aspectRatio, shotA.aspectRatio, 'aspect shot A tidak ikut berubah');
  assert.equal(list.find(s => s.id === shotA.id).duration, shotA.duration, 'durasi shot A tidak ikut berubah');
  const signatureB = trackSignature(list.find(s => s.id === shotBId).tracks);

  // Undo sampai habis lalu redo kembali: shot A harus tetap utuh di setiap titik.
  for (let i = 0; i < 6; i += 1) {
    await page.keyboard.press('Meta+z');
    await page.waitForTimeout(120);
    const now = await shots(page);
    const a = now.find(s => s.id === shotA.id);
    if (a) assert.equal(trackSignature(a.tracks), signatureA, `undo langkah ${i + 1} tidak boleh mengubah shot A`);
  }
  for (let i = 0; i < 6; i += 1) {
    await page.keyboard.press('Meta+Shift+z');
    await page.waitForTimeout(120);
  }
  await page.waitForTimeout(300);
  list = await shots(page);
  assert.equal(trackSignature(list.find(s => s.id === shotA.id).tracks), signatureA, 'shot A tetap utuh setelah undo/redo penuh');
  assert.equal(trackSignature(list.find(s => s.id === shotBId).tracks), signatureB, 'redo memulihkan shot B apa adanya');

  // Reload penuh: isolasi harus bertahan di dokumen yang tersimpan, bukan hanya di memori.
  await settled(page);
  await page.reload();
  await page.waitForSelector('#viewport canvas');
  await page.waitForTimeout(600);
  list = await shots(page);
  assert.equal(list.length, 2, 'kedua shot bertahan setelah reload');
  assert.equal(trackSignature(list.find(s => s.id === shotA.id).tracks), signatureA, 'shot A identik setelah reload');
  assert.equal(trackSignature(list.find(s => s.id === shotBId).tracks), signatureB, 'shot B identik setelah reload');
  assert.equal(await page.evaluate(() => window.blockingRoom.getActiveShotId()), shotBId, 'shot aktif dipulihkan setelah reload');

  // Menghapus shot B mengembalikan dokumen ke shot A tanpa menyentuh keyframe-nya.
  await page.evaluate(() => window.blockingRoom.removeShot());
  await page.waitForTimeout(400);
  list = await shots(page);
  assert.equal(list.length, 1, 'shot B terhapus');
  assert.equal(trackSignature(list[0].tracks), signatureA, 'menghapus shot B tidak mengubah keyframe shot A');
  report.shotIsolation = 'ok';
}

// ---------------------------------------------------------------------------
// 4. Kehilangan data saat ekspor berjalan lalu reload (PR-03 + EX-01)
// ---------------------------------------------------------------------------
{
  await installExportUtils(page);
  await settled(page);
  const actorId = (await project(page)).actors[0].id;
  await page.evaluate(id => window.blockingRoom.select(id), actorId);

  // Job ekspor panjang dimulai dan sengaja TIDAK di-await.
  await page.evaluate(async () => {
    const E = window.__r2;
    const doc = window.blockingRoom.getSnapshot();
    const scene = doc.scenes[0], shot = scene.shots[0];
    const fps = 30;
    const view = E.readSceneView(doc, scene.id, shot.id);
    const size = E.exportSize(shot.aspectRatio, '720p');
    const source = new E.ShotFrameSource({
      view, aspectRatio: shot.aspectRatio, width: size.width, height: size.height, fps,
      shotName: shot.name, sceneName: scene.name,
    });
    const job = new E.ExportJob({
      naming: {project: doc.title, scene: scene.name, shot: shot.name},
      settings: {width: size.width, height: size.height, fps, codecId: 'vp9', duration: shot.duration, range: {mode: 'all'}},
      renderFrame: (t, i, f) => source.render(t, f),
    });
    window.__job = {job, source, promise: job.run().catch(() => null)};
  });
  await page.waitForFunction(() => window.__job.job.encodedFrames > 3, null, {timeout: 20_000});

  // Editor tetap dapat dipakai selama job berjalan, dan editannya harus tersimpan.
  await page.evaluate(() => window.blockingRoom.setFrame(12));
  await page.locator('#inspector [data-prop="x"]').fill('-2.75');
  await page.locator('#inspector [data-prop="x"]').press('Tab');
  await page.locator('#inspector [data-prop="z"]').fill('4.5');
  await page.locator('#inspector [data-prop="z"]').press('Tab');
  await page.waitForTimeout(200);
  const expected = (await project(page)).actors.find(a => a.id === actorId).keys;
  assert.ok(expected.some(k => Math.abs(k.x + 2.75) < 1e-6), 'editan selama ekspor benar-benar masuk ke dokumen di memori');

  // Reload SEGERA, tanpa menunggu status "tersimpan" dan tanpa menunggu job selesai.
  await page.reload();
  await page.waitForSelector('#viewport canvas');
  await page.waitForTimeout(600);
  const after = (await project(page)).actors.find(a => a.id === actorId).keys;
  assert.equal(JSON.stringify(after), JSON.stringify(expected),
    'reload di tengah job ekspor tidak boleh kehilangan perubahan editor');

  // Job yang mati bersama tab tidak boleh meninggalkan penampung render di DOM.
  const hosts = await page.evaluate(() => document.querySelectorAll('[data-export-host]').length);
  assert.equal(hosts, 0, 'tidak ada penampung render ekspor yang tertinggal setelah reload');
  report.exportReload = 'ok';
}

// ---------------------------------------------------------------------------
// 5. Kegagalan codec lewat DIALOG: pesan + "Coba lagi", tanpa berkas (EX-01)
// ---------------------------------------------------------------------------
// `tests/export-browser.mjs` membuktikan kegagalan codec pada lapisan modul. Yang belum
// dibuktikan adalah jalur UI-nya: EX-01 menuntut "progress, cancel, retry" dan pesan
// unsupported yang benar-benar terlihat pengguna.
{
  await page.locator('#export').click();
  await page.waitForSelector('#export-dialog:not([hidden])');
  await page.waitForFunction(() => document.querySelectorAll('#export-codec option').length > 0);

  // Codec yang tidak akan pernah ada, disuntikkan sebagai opsi supaya jalur kegagalan
  // dialog benar-benar dijalankan (bukan disimulasikan dengan stub).
  await page.evaluate(() => {
    const select = document.querySelector('#export-codec');
    const option = document.createElement('option');
    option.value = 'det:codec-yang-tidak-ada';
    option.textContent = 'Codec uji yang tidak ada';
    select.appendChild(option);
    select.value = option.value;
    select.dispatchEvent(new Event('change', {bubbles: true}));
  });

  let downloaded = null;
  const onDownload = d => {downloaded = d.suggestedFilename();};
  page.on('download', onDownload);
  await page.locator('#export-start').click();
  await page.waitForFunction(() => !document.querySelector('#export-retry').hidden, null, {timeout: 30_000});
  const message = await page.locator('#export-message').textContent();
  assert.ok(/tidak dikenal|tidak didukung|gagal/i.test(message), `pesan kegagalan harus menjelaskan penyebabnya: ${message}`);
  assert.equal(await page.locator('#export-message').getAttribute('data-tone'), 'error', 'pesan kegagalan bernada error');
  assert.equal(await page.locator('#export-retry').isHidden(), false, 'tombol "Coba lagi" muncul setelah kegagalan');
  assert.equal(await page.locator('#export-close').isDisabled(), false, 'dialog dapat ditutup kembali setelah kegagalan');
  await page.waitForTimeout(600);
  assert.equal(downloaded, null, 'codec gagal tidak boleh menghasilkan berkas');
  page.off('download', onDownload);

  // Tidak ada sumber daya render yang tertinggal setelah job gagal.
  assert.equal(await page.evaluate(() => document.querySelectorAll('[data-export-host]').length), 0,
    'penampung render dilepas setelah job gagal');

  await page.evaluate(() => {
    const select = document.querySelector('#export-codec');
    select.querySelector('option[value="det:codec-yang-tidak-ada"]')?.remove();
    select.value = 'det:vp9';
    select.dispatchEvent(new Event('change', {bubbles: true}));
  });
  await page.locator('#export-close').click();
  await page.waitForFunction(() => document.querySelector('#export-dialog').hidden, null, {timeout: 10_000});
  report.codecFailure = 'ok';
}

// ---------------------------------------------------------------------------
assert.deepEqual(errors, [], `tidak boleh ada error halaman: ${errors.join(' | ')}`);
console.log('mismatch preview↔ekspor: ' + report.mismatch.map(m => `${m.label}=${m.match.join('/')}`).join('  '));
console.log('PASS gate R2: preview↔ekspor (9:16, 2.39:1, 24 fps, aktor tersembunyi, prop/dinding, burn-in),'
  + ' lock bypass lewat operasi massal keyframe + props/dinding, isolasi shot A/B melewati undo/redo dan reload,'
  + ' tidak ada kehilangan data saat reload di tengah ekspor, kegagalan codec lewat dialog memberi pesan + "Coba lagi" tanpa berkas.');
await browser.close();

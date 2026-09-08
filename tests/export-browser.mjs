// Browser test Fase 5 — ekspor deterministik (F5-07, EX-01/EX-02/EX-03).
//
// Yang dibuktikan berkas ini, berurutan:
//   1. Dialog ekspor menawarkan hanya yang benar-benar tersedia, menandai MP4
//      sebagai belum tersedia dan fallback real-time sebagai tidak frame-akurat.
//   2. Ekspor 10 detik × 30 fps menghasilkan TEPAT 300 frame, durasi 10,000 detik,
//      dapat dibuka dan di-seek (diverifikasi `ffprobe` bila tersedia, dan selalu
//      dengan decode ulang `<video>` di Chrome).
//   3. Frame awal/tengah/akhir hasil decode sama dengan render preview pada waktu
//      yang sama, dan objek tersembunyi memang tidak ikut terekam.
//   4. Mengedit scene SETELAH job dimulai tidak mengubah hasil job (F5-03), dan
//      seluruh sumber daya dilepas pada selesai/cancel/error.
//   5. Codec yang tidak didukung menghasilkan pesan, bukan berkas; pembatalan
//      tidak menghasilkan berkas; shot tanpa kamera ditolak; batas rentang jelas.
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {mkdir, stat} from 'node:fs/promises';
import {promisify} from 'node:util';

const run = promisify(execFile);
const URL_APP = 'http://localhost:5174';
await mkdir('artifacts', {recursive: true});

/** ffprobe hanya dipakai bila memang terpasang di mesin ini. */
async function ffprobePath() {
  try {
    const {stdout} = await run('which', ['ffprobe']);
    return stdout.trim() || null;
  } catch {return null;}
}

const browser = await chromium.launch({headless: true, channel: 'chrome', args: ['--enable-webgl', '--ignore-gpu-blocklist']});
const page = await browser.newPage({viewport: {width: 1440, height: 1000}, acceptDownloads: true});
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.goto(URL_APP);
await page.waitForSelector('#viewport canvas');
await page.waitForTimeout(1200);

// Durasi shot dibuat 10 detik supaya 30 fps berarti tepat 300 frame.
await page.locator('#duration').fill('10');
await page.locator('#duration').press('Tab');
await page.waitForFunction(() => window.blockingRoom.getProject().duration === 10);

// ---------------------------------------------------------------------------
// 1. Dialog ekspor (F5-02 / EX-01)
// ---------------------------------------------------------------------------
await page.locator('#export').click();
await page.waitForSelector('#export-dialog:not([hidden])');
await page.waitForFunction(() => document.querySelectorAll('#export-codec option').length > 0);

const dialog = await page.evaluate(() => window.blockingRoom.exportDialog.debug());
assert.ok(dialog.shots >= 1, 'dialog memuat daftar shot');
assert.equal(dialog.selected.length, 1, 'shot aktif terpilih otomatis');

const deterministic = dialog.codecs.filter(o => o.value.startsWith('det:'));
assert.ok(deterministic.length >= 4, 'daftar codec deterministik terisi');
assert.ok(deterministic.some(o => o.value === 'det:vp9' && !o.disabled), 'VP9 tersedia di Chrome');
const unavailable = dialog.codecs.filter(o => o.value.startsWith('na:'));
assert.equal(unavailable.length, 1);
assert.ok(unavailable[0].disabled, 'MP4 ditampilkan nonaktif, bukan dijanjikan');
assert.match(unavailable[0].text, /MP4.*belum tersedia/i);
const realtime = dialog.codecs.filter(o => o.value.startsWith('rt:'));
assert.ok(realtime.length >= 1, 'fallback MediaRecorder tetap ditawarkan');
assert.ok(realtime.every(o => /Real-time \(tidak frame-akurat\)/.test(o.text)), 'fallback diberi label keterbatasan');
assert.equal(dialog.codec, 'det:vp9', 'default memakai jalur deterministik');

// Ringkasan menyebut jumlah frame, ukuran dan nama berkas proyek_scene_shot.
await page.locator('#export-fps').selectOption('30');
await page.waitForFunction(() => /300 frame/.test(document.querySelector('#export-summary').textContent));
const summary = await page.locator('#export-summary').textContent();
assert.match(summary, /1280×720/);
assert.match(summary, /_Scene-01_Shot-01\.webm/);

// Batas rentang: clamp di atas durasi, penolakan bila kosong.
await page.locator('#export-range-mode').selectOption('frames');
await page.locator('#export-range-end').fill('999');
await page.locator('#export-range-end').dispatchEvent('input');
assert.match(await page.locator('#export-summary').textContent(), /dipotong ke frame 299/);
await page.locator('#export-range-start').fill('100');
await page.locator('#export-range-start').dispatchEvent('input');
await page.locator('#export-range-end').fill('50');
await page.locator('#export-range-end').dispatchEvent('input');
assert.match(await page.locator('#export-summary').textContent(), /kosong/);
assert.equal(await page.locator('#export-start').isDisabled(), true, 'rentang kosong tidak dapat diekspor');
await page.locator('#export-range-mode').selectOption('seconds');
await page.waitForFunction(() => /300 frame/.test(document.querySelector('#export-summary').textContent));
assert.match(await page.locator('#export-summary').textContent(), /300 frame/, '0–10 detik pada 30 fps = 300 frame');
await page.locator('#export-range-mode').selectOption('all');

// ---------------------------------------------------------------------------
// 2. Ekspor deterministik lewat dialog → berkas nyata (EX-02)
// ---------------------------------------------------------------------------
await page.evaluate(() => localStorage.removeItem('blocking-room.metrics'));
const downloadPromise = page.waitForEvent('download', {timeout: 60_000});
await page.locator('#export-start').click();
// Progress harus terlihat bergerak; loop ekspor tidak boleh membekukan tab.
await page.waitForFunction(() => !document.querySelector('#export-progress-row').hidden, null, {timeout: 20_000});
const download = await downloadPromise;
assert.match(download.suggestedFilename(), /^.+_Scene-01_Shot-01\.webm$/);
await download.saveAs('artifacts/export-deterministic.webm');
await page.waitForFunction(() => /Ekspor selesai/.test(document.querySelector('#export-message').textContent), null, {timeout: 30_000});
const doneMessage = await page.locator('#export-message').textContent();
assert.match(doneMessage, /300 frame/, 'pesan sukses menyebut jumlah frame nyata');

const fileInfo = await stat('artifacts/export-deterministic.webm');
assert.ok(fileInfo.size > 50_000, 'berkas ekspor berisi data');

const metrics = await page.evaluate(() => JSON.parse(localStorage.getItem('blocking-room.metrics') ?? '[]'));
const events = metrics.map(m => m.e);
assert.ok(events.includes('export_started'), 'metrik export_started tercatat');
assert.ok(events.includes('export_completed'), 'metrik export_completed tercatat');
const completed = metrics.findLast(m => m.e === 'export_completed');
assert.equal(completed.p.codec, 'vp9');
assert.equal(completed.p.resolution, '720p');
assert.equal(completed.p.fps, 30);

// Verifikasi independen dengan ffprobe bila tersedia di mesin ini.
const ffprobe = await ffprobePath();
let ffprobeReport = null;
if (ffprobe) {
  const {stdout} = await run(ffprobe, [
    '-v', 'error', '-count_frames', '-select_streams', 'v:0',
    '-show_entries', 'stream=codec_name,width,height,nb_read_frames,r_frame_rate:format=duration',
    '-of', 'default=noprint_wrappers=1', 'artifacts/export-deterministic.webm',
  ]);
  ffprobeReport = Object.fromEntries(stdout.trim().split('\n').map(line => line.split('=')));
  assert.equal(ffprobeReport.nb_read_frames, '300', 'ffprobe menghitung tepat 300 frame');
  assert.equal(ffprobeReport.width, '1280');
  assert.equal(ffprobeReport.height, '720');
  assert.equal(ffprobeReport.codec_name, 'vp9');
  assert.equal(Number(ffprobeReport.duration).toFixed(3), '10.000', 'durasi container 10,000 detik');
} else {
  console.log('  (ffprobe tidak terpasang — verifikasi container hanya lewat decode ulang di Chrome)');
}
await page.locator('#export-close').click();

// ---------------------------------------------------------------------------
// 3–5. Pemeriksaan tingkat modul di dalam halaman.
// ---------------------------------------------------------------------------
/** Menyiapkan util ekspor yang dipakai beberapa langkah di bawah. */
await page.evaluate(async () => {
  const [{ShotFrameSource}, service, {readSceneView}, {ChunkEncoder, encoderConfig}] = await Promise.all([
    import('/src/export/frame-source.js'),
    import('/src/export/export-service.js'),
    import('/src/document.js'),
    import('/src/export/encoder.js'),
  ]);
  const SW = 48, SH = 27;
  const small = document.createElement('canvas');
  small.width = SW; small.height = SH;
  const ctx = small.getContext('2d', {willReadFrequently: true});
  window.__exp = {
    ShotFrameSource, readSceneView, ChunkEncoder, encoderConfig, ...service,
    /** Sidik jari frame: rata-rata warna pada 48×27 piksel. */
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
    source(view, shot, scene, fps) {
      const size = service.exportSize(shot.aspectRatio, '720p');
      return new window.__exp.ShotFrameSource({
        view, aspectRatio: shot.aspectRatio, width: size.width, height: size.height,
        fps, shotName: shot.name, sceneName: scene.name,
      });
    },
    async decodeAt(blob, times) {
      const url = URL.createObjectURL(blob);
      const video = document.createElement('video');
      video.muted = true; video.preload = 'auto'; video.src = url;
      await new Promise((resolve, reject) => {
        video.onloadedmetadata = resolve;
        video.onerror = () => reject(new Error('video hasil ekspor tidak dapat dibuka'));
      });
      const out = {duration: video.duration, width: video.videoWidth, height: video.videoHeight, frames: [], seeked: []};
      for (const t of times) {
        await new Promise(resolve => {video.onseeked = () => resolve(); video.currentTime = t;});
        out.seeked.push(Number(video.currentTime.toFixed(3)));
        out.frames.push(window.__exp.signature(video));
      }
      video.src = '';
      URL.revokeObjectURL(url);
      return out;
    },
  };
});

// --- 3. Kesetaraan frame awal/tengah/akhir dan objek tersembunyi -------------
const equivalence = await page.evaluate(async () => {
  const E = window.__exp;
  const doc = window.blockingRoom.getSnapshot();
  const scene = doc.scenes[0], shot = scene.shots[0];
  const fps = 30;
  const view = E.readSceneView(doc, scene.id, shot.id);
  const times = [0, 149 / fps, 299 / fps];
  const source = E.source(view, shot, scene, fps);
  const refs = times.map(t => E.signature(source.render(t, Math.round(t * fps))));

  // Referensi kedua: seluruh aktor disembunyikan. Kalau aktor memang digambar,
  // dua referensi ini WAJIB berbeda — itu yang membuat uji "hidden" bermakna.
  const hiddenView = JSON.parse(JSON.stringify(view));
  hiddenView.actors.forEach(a => {a.visible = false;});
  const hiddenSource = E.source(hiddenView, shot, scene, fps);
  const hiddenRefs = times.map(t => E.signature(hiddenSource.render(t, Math.round(t * fps))));
  hiddenSource.dispose();

  const job = new E.ExportJob({
    naming: {project: doc.title, scene: scene.name, shot: shot.name},
    settings: {width: source.width, height: source.height, fps, codecId: 'vp9', duration: shot.duration, range: {mode: 'all'}},
    renderFrame: (t, i, f) => source.render(t, f),
  });
  const result = await job.run();
  source.dispose();
  const decoded = await E.decodeAt(result.blob, times.map(t => t + 1 / (fps * 2)));

  // Ekspor kedua: aktor disembunyikan sungguhan → hasil harus cocok dengan
  // referensi tersembunyi, bukan dengan referensi yang menampilkan aktor.
  const hiddenSource2 = E.source(hiddenView, shot, scene, fps);
  const hiddenJob = new E.ExportJob({
    naming: {project: doc.title, scene: scene.name, shot: shot.name},
    settings: {width: hiddenSource2.width, height: hiddenSource2.height, fps, codecId: 'vp9', duration: shot.duration, range: {mode: 'frames', start: 140, end: 160}},
    renderFrame: (t, i, f) => hiddenSource2.render(t, f),
  });
  const hiddenResult = await hiddenJob.run();
  hiddenSource2.dispose();
  const hiddenDecoded = await E.decodeAt(hiddenResult.blob, [(149 - 140) / fps + 1 / (fps * 2)]);

  return {
    frameCount: result.frameCount,
    duration: decoded.duration,
    width: decoded.width, height: decoded.height,
    seeked: decoded.seeked,
    matchPreview: times.map((_, i) => E.diff(decoded.frames[i], refs[i])),
    vsHiddenReference: times.map((_, i) => E.diff(decoded.frames[i], hiddenRefs[i])),
    refVsHidden: E.diff(refs[1], hiddenRefs[1]),
    hiddenFrameCount: hiddenResult.frameCount,
    hiddenMatchesHiddenRef: E.diff(hiddenDecoded.frames[0], hiddenRefs[1]),
    hiddenVsVisibleRef: E.diff(hiddenDecoded.frames[0], refs[1]),
  };
});

assert.equal(equivalence.frameCount, 300);
assert.equal(Number(equivalence.duration.toFixed(3)), 10, 'durasi hasil decode 10,000 detik');
assert.equal(equivalence.width, 1280);
assert.equal(equivalence.height, 720);
assert.ok(equivalence.seeked.every((t, i) => Math.abs(t - [0, 149 / 30, 299 / 30][i]) < 0.2), 'seek mendarat di sekitar waktu yang diminta');
for (const [index, value] of equivalence.matchPreview.entries()) {
  assert.ok(value < 3, `frame ${['awal', 'tengah', 'akhir'][index]} hasil ekspor menyimpang ${value} dari preview (batas 3)`);
}
assert.ok(equivalence.refVsHidden > 2, 'aktor benar-benar tergambar (referensi tampil vs tersembunyi berbeda)');
assert.ok(equivalence.matchPreview[1] < equivalence.vsHiddenReference[1], 'frame ekspor lebih dekat ke preview yang menampilkan aktor');
assert.equal(equivalence.hiddenFrameCount, 21, 'rentang frame parsial 140–160 = 21 frame');
assert.ok(equivalence.hiddenMatchesHiddenRef < 3, 'aktor tersembunyi tidak muncul pada hasil ekspor');
assert.ok(equivalence.hiddenVsVisibleRef > equivalence.hiddenMatchesHiddenRef * 2, 'hasil tanpa aktor jelas berbeda dari hasil dengan aktor');

// --- 4. Snapshot immutable + pelepasan sumber daya (F5-03) -------------------
// Playhead dipindahkan ke akhir shot lebih dahulu supaya editan yang dilakukan
// SELAMA job berjalan benar-benar mengenai frame yang belum dirender (frame 299),
// bukan frame yang sudah lewat.
await page.locator('#scrub').fill('10');
await page.locator('#scrub').dispatchEvent('input');
const before = await page.evaluate(() => window.blockingRoom.getRendererInfo());
await page.evaluate(async () => {
  const E = window.__exp;
  const doc = window.blockingRoom.getSnapshot();
  const scene = doc.scenes[0], shot = scene.shots[0];
  const fps = 30;
  const view = E.readSceneView(doc, scene.id, shot.id);
  const source = E.source(view, shot, scene, fps);
  window.__snap = {
    fps, shot, scene,
    reference: E.signature(source.render(299 / fps, 299)),
    actorId: view.actors[0].id,
  };
  const job = new E.ExportJob({
    naming: {project: doc.title, scene: scene.name, shot: shot.name},
    settings: {width: source.width, height: source.height, fps, codecId: 'vp9', duration: shot.duration, range: {mode: 'all'}},
    renderFrame: (t, i, f) => source.render(t, f),
  });
  window.__snap.source = source;
  window.__snap.promise = job.run();       // sengaja TIDAK di-await
  window.__snap.job = job;
});

// Sementara job berjalan, editor benar-benar diedit lewat UI.
await page.waitForFunction(() => window.__snap.job.encodedFrames > 5, null, {timeout: 20_000});
await page.locator('[data-prop="x"]').fill('7.5');
await page.locator('[data-prop="x"]').press('Tab');
await page.locator('[data-prop="z"]').fill('-4');
await page.locator('[data-prop="z"]').press('Tab');

const immutability = await page.evaluate(async () => {
  const E = window.__exp;
  const result = await window.__snap.promise;
  window.__snap.source.dispose();
  const decoded = await E.decodeAt(result.blob, [299 / window.__snap.fps - 1 / 60]);

  // Referensi baru dari dokumen SETELAH diedit: harus berbeda dari hasil job.
  const doc = window.blockingRoom.getSnapshot();
  const scene = doc.scenes[0], shot = scene.shots[0];
  const editedView = E.readSceneView(doc, scene.id, shot.id);
  const editedSource = E.source(editedView, shot, scene, window.__snap.fps);
  const editedRef = E.signature(editedSource.render(299 / window.__snap.fps, 299));
  const memoryDuringJob = editedSource.memoryInfo();
  editedSource.dispose();

  return {
    frameCount: result.frameCount,
    encodedFrames: window.__snap.job.encodedFrames,
    matchesSnapshot: E.diff(decoded.frames[0], window.__snap.reference),
    matchesEdited: E.diff(decoded.frames[0], editedRef),
    referenceVsEdited: E.diff(window.__snap.reference, editedRef),
    memoryDuringJob,
    hostsLeft: document.querySelectorAll('[data-export-host]').length,
    encoderReleased: window.__snap.job.encoder === null,
  };
});

assert.equal(immutability.frameCount, 300);
assert.ok(immutability.referenceVsEdited > 2, 'edit yang dilakukan memang mengubah gambar');
assert.ok(immutability.matchesSnapshot < 3, 'hasil job tetap sama dengan snapshot saat job dimulai');
assert.ok(immutability.matchesEdited > immutability.matchesSnapshot,
  'hasil job TIDAK mengikuti editan yang terjadi setelah job dimulai');
assert.equal(immutability.hostsLeft, 0, 'tidak ada penampung renderer ekspor yang tertinggal di DOM');
assert.equal(immutability.encoderReleased, true, 'encoder dilepas setelah job selesai');

const after = await page.evaluate(() => window.blockingRoom.getRendererInfo());
assert.equal(after.geometries, before.geometries, 'renderer editor tidak kebocoran geometri setelah ekspor');
assert.equal(after.textures, before.textures, 'renderer editor tidak kebocoran texture setelah ekspor');

// --- 5. Codec gagal, pembatalan, dan shot tanpa kamera ----------------------
const failures = await page.evaluate(async () => {
  const E = window.__exp;
  const out = {};
  // (a) Codec yang tidak didukung: pesan jelas, tidak ada Blob.
  try {
    await E.ChunkEncoder.create({
      config: E.encoderConfig({codecString: 'bogus.tidak-ada', width: 1280, height: 720, fps: 30}),
      onChunk: () => {},
    });
    out.unsupported = 'TIDAK MELEMPAR';
  } catch (error) {
    out.unsupported = error.name;
    out.unsupportedMessage = error.message;
  }
  // (b) Dimensi ganjil ditolak sebelum configure (spike §9).
  try {
    await E.ChunkEncoder.create({config: E.encoderConfig({codecString: 'vp8', width: 1281, height: 721, fps: 30}), onChunk: () => {}});
    out.oddSize = 'TIDAK MELEMPAR';
  } catch (error) {
    out.oddSize = error.name;
  }
  // (c) Job dengan codec yang tidak didukung: tidak menghasilkan berkas.
  const doc = window.blockingRoom.getSnapshot();
  const scene = doc.scenes[0], shot = scene.shots[0];
  const view = E.readSceneView(doc, scene.id, shot.id);
  const source = E.source(view, shot, scene, 30);
  const badJob = new E.ExportJob({
    naming: {project: doc.title, scene: scene.name, shot: shot.name},
    settings: {width: 1280, height: 720, fps: 30, codecId: 'tidak-ada', duration: shot.duration, range: {mode: 'all'}},
    renderFrame: (t, i, f) => source.render(t, f),
  });
  try {
    await badJob.run();
    out.badJob = 'TIDAK MELEMPAR';
  } catch (error) {
    out.badJob = error.message;
    out.badJobResult = badJob.result;
    out.badJobStatus = badJob.status;
  }

  // (d) Pembatalan di tengah: tidak ada Blob, encoder dan muxer dilepas.
  const cancelJob = new E.ExportJob({
    naming: {project: doc.title, scene: scene.name, shot: shot.name},
    settings: {width: source.width, height: source.height, fps: 30, codecId: 'vp9', duration: shot.duration, range: {mode: 'all'}},
    renderFrame: (t, i, f) => source.render(t, f),
    onProgress: info => {if (info.frame === 12) cancelJob.cancel();},
  });
  try {
    await cancelJob.run();
    out.cancel = 'TIDAK MELEMPAR';
  } catch (error) {
    out.cancel = error.name;
    out.cancelStatus = cancelJob.status;
    out.cancelResult = cancelJob.result;
    out.cancelEncoder = cancelJob.encoder;
    out.cancelMuxer = cancelJob.muxer;
    out.cancelFrames = cancelJob.encodedFrames;
  }
  const memoryAfterCancel = source.memoryInfo();
  source.dispose();
  out.memoryAfterCancel = memoryAfterCancel;
  out.hostsLeft = document.querySelectorAll('[data-export-host]').length;
  return out;
});

assert.equal(failures.unsupported, 'UnsupportedCodecError');
assert.match(failures.unsupportedMessage, /tidak didukung browser ini/);
assert.equal(failures.oddSize, 'UnsupportedCodecError', 'dimensi ganjil ditolak sebelum configure');
assert.match(failures.badJob, /Codec ekspor tidak dikenal/);
assert.equal(failures.badJobResult, null, 'codec gagal tidak menghasilkan berkas');
assert.equal(failures.cancel, 'ExportCancelled');
assert.equal(failures.cancelStatus, 'cancelled');
assert.equal(failures.cancelResult, null, 'pembatalan tidak menghasilkan berkas');
assert.equal(failures.cancelEncoder, null, 'encoder ditutup setelah pembatalan');
assert.equal(failures.cancelMuxer, null, 'buffer muxer dibuang setelah pembatalan');
assert.ok(failures.cancelFrames >= 12 && failures.cancelFrames < 300, 'pembatalan menghentikan loop di tengah');
assert.equal(failures.hostsLeft, 0);

// Shot tanpa kamera: dialog menolak sebelum job dimulai.
await page.locator('[data-tab="camera"]').click();
await page.locator('#delete-object').click();
await page.waitForFunction(() => window.blockingRoom.getProject().camera === null);
assert.equal(await page.locator('#export').isDisabled(), true, 'tombol ekspor mati tanpa kamera');
const noCamera = await page.evaluate(() => {
  window.blockingRoom.exportDialog.open();
  const state = window.blockingRoom.exportDialog.debug();
  window.blockingRoom.exportDialog.close();
  return state;
});
assert.match(noCamera.message, /tidak ada shot yang memiliki kamera/i);
assert.deepEqual(noCamera.selected, [], 'shot tanpa kamera tidak dapat dipilih');
await page.locator('#undo').click();
await page.waitForFunction(() => !!window.blockingRoom.getProject().camera);

// ---------------------------------------------------------------------------
// 6. Antrean batch, burn-in, storyboard dan shot list (F5-06 / EX-03)
// ---------------------------------------------------------------------------
// Durasi dipendekkan supaya batch dua shot tetap cepat: 1 detik × 30 fps = 30 frame.
await page.locator('#duration').fill('1');
await page.locator('#duration').press('Tab');
await page.waitForFunction(() => window.blockingRoom.getProject().duration === 1);
await page.locator('#add-shot').click();
await page.waitForFunction(() => window.blockingRoom.getDocument().scenes[0].shots.length === 2);
await page.locator('#duration').fill('1');
await page.locator('#duration').press('Tab');

const batchFiles = [];
page.on('download', item => batchFiles.push(item.suggestedFilename()));
await page.locator('#export').click();
await page.waitForSelector('#export-dialog:not([hidden])');
await page.waitForFunction(() => document.querySelectorAll('#export-codec option').length > 0);
await page.evaluate(() => {
  for (const input of document.querySelectorAll('#export-shots input[type="checkbox"]')) {
    if (!input.disabled && !input.checked) input.click();
  }
});
await page.locator('#export-fps').selectOption('30');
await page.locator('#export-codec').selectOption('det:vp9');
for (const id of ['#export-burnin', '#export-storyboard', '#export-shotlist']) await page.locator(id).check();
assert.match(await page.locator('#export-summary').textContent(), /2 shot · 60 frame/);
await page.locator('#export-start').click();
await page.waitForFunction(() => /Ekspor selesai/.test(document.querySelector('#export-message').textContent)
  && document.querySelector('#export-cancel').hidden, null, {timeout: 90_000});
await page.waitForTimeout(500);

const videos = batchFiles.filter(name => name.endsWith('.webm'));
const pngs = batchFiles.filter(name => name.endsWith('.png'));
assert.equal(videos.length, 2, `antrean batch menghasilkan dua video, dapat: ${batchFiles.join(', ')}`);
assert.equal(pngs.length, 6, 'storyboard: 3 PNG per shot');
assert.ok(pngs.some(name => /_awal-f0\.png$/.test(name)));
assert.ok(pngs.some(name => /_tengah-f14\.png$/.test(name)));
assert.ok(pngs.some(name => /_akhir-f29\.png$/.test(name)));
assert.ok(batchFiles.some(name => name.endsWith('_shot-list.json')), 'shot list JSON diunduh');
assert.ok(batchFiles.some(name => name.endsWith('_shot-list.csv')), 'shot list CSV diunduh');
assert.match(await page.locator('#export-progress-text').textContent(), /Shot 2\/2/, 'progress dilaporkan per job');
await page.locator('#export-close').click();

// ---------------------------------------------------------------------------
// 7. Fallback real-time berlabel (F5-05)
// ---------------------------------------------------------------------------
await page.locator('#export').click();
await page.waitForSelector('#export-dialog:not([hidden])');
await page.waitForFunction(() => [...document.querySelectorAll('#export-codec option')].some(o => o.value.startsWith('rt:')));
for (const id of ['#export-burnin', '#export-storyboard', '#export-shotlist']) await page.locator(id).uncheck();
await page.evaluate(() => {
  const inputs = [...document.querySelectorAll('#export-shots input[type="checkbox"]')].filter(i => !i.disabled);
  inputs.forEach((input, index) => {if (input.checked !== (index === 0)) input.click();});
});
// Mengubah pilihan shot memicu probe kapabilitas ulang; daftar codec sempat kosong.
await page.waitForFunction(() => [...document.querySelectorAll('#export-codec option')].some(o => o.value.startsWith('rt:')));
await page.evaluate(() => {
  const select = document.querySelector('#export-codec');
  select.value = [...select.options].find(o => o.value.startsWith('rt:')).value;
  select.dispatchEvent(new Event('change'));
});
assert.match(await page.locator('#export-codec-note').textContent(), /tidak dijamin/);
const realtimeDownload = page.waitForEvent('download', {timeout: 60_000});
await page.locator('#export-start').click();
const realtimeFile = await realtimeDownload;
assert.match(realtimeFile.suggestedFilename(), /_realtime\.(webm|mp4)$/, 'nama berkas real-time ditandai');
await page.waitForFunction(() => /Rekaman real-time/.test(document.querySelector('#export-message').textContent), null, {timeout: 30_000});
assert.match(await page.locator('#export-message').textContent(), /tidak dijamin/, 'keterbatasan fallback dinyatakan pada hasil');
await page.locator('#export-close').click();

assert.deepEqual(errors, [], `tidak ada error browser: ${errors.join(' | ')}`);
console.log('PASS: dialog ekspor, 300 frame @10,000 s'
  + `${ffprobeReport ? ` (ffprobe: ${ffprobeReport.codec_name} ${ffprobeReport.width}x${ffprobeReport.height} ${ffprobeReport.nb_read_frames} frame ${Number(ffprobeReport.duration).toFixed(3)} s)` : ''}`
  + `, kesetaraan frame ${equivalence.matchPreview.join('/')}, objek tersembunyi, snapshot immutable, codec gagal, cancel, kamera hilang, batas rentang, batch 2 shot + burn-in + storyboard + shot list, fallback real-time berlabel.`);
await browser.close();

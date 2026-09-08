// F6-02 + F6-03 — harness pengukuran performa di Chrome sungguhan.
//
// Mengukur, pada fixture beban `tests/fixtures/load/load-20a-10r-500k.json`
// (20 aktor, 10 ruang, 500 keyframe, shot 60 detik):
//
//   F6-02  p95 latensi input → viewport (drag pointer, nudge keyboard, scrub playhead,
//          pindah scene), frame-time p95 + dropped frames selama playback 60 detik.
//   F6-03  p95 waktu buka proyek, jumlah transaksi store `documents` saat dashboard
//          100 proyek tampil, dan tren memori/GPU pada 20 siklus buka/tutup/rebuild.
//
// Definisi metrik: `docs/PERF-BASELINE.md` §4. Hasil ditulis ke
// `artifacts/perf-baseline.json` dan diringkas ke stdout.
//
// Menjalankan:
//   npm run dev -- --port 5174 --strictPort   (di background)
//   node tests/perf-browser.mjs               (headed bila ada display, jika tidak headless)
//   PERF_HEADLESS=1 node tests/perf-browser.mjs   (paksa headless)
//   PERF_LABEL=sesudah node tests/perf-browser.mjs (label baris hasil)
//
// Harness ini TIDAK melakukan assertion terhadap target PRD: angka dilaporkan apa
// adanya. Menyatakan target tercapai adalah keputusan manusia yang dicatat di
// `docs/PERF-BASELINE.md` §6.
import {chromium} from '@playwright/test';
import {execSync} from 'node:child_process';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import os from 'node:os';

const APP = process.env.PERF_APP ?? 'http://localhost:5174';
const LABEL = process.env.PERF_LABEL ?? 'baseline';
const PLAYBACK_MS = Number(process.env.PERF_PLAYBACK_MS ?? 60_000);
const INPUT_SAMPLES = Number(process.env.PERF_SAMPLES ?? 200);
const OPEN_CYCLES = Number(process.env.PERF_OPEN_CYCLES ?? 20);
const REBUILD_CYCLES = Number(process.env.PERF_REBUILD_CYCLES ?? 20);

const p = (list, q) => {
  if (!list.length) return null;
  const sorted = [...list].sort((a, b) => a - b);
  return sorted[Math.ceil(q * sorted.length) - 1];
};
const round = (value, digits = 2) => (value === null || value === undefined ? null : Number(value.toFixed(digits)));
const stats = list => ({
  n: list.length,
  p50: round(p(list, 0.5)), p95: round(p(list, 0.95)),
  max: round(list.length ? Math.max(...list) : null),
  mean: round(list.length ? list.reduce((a, b) => a + b, 0) / list.length : null),
});

// ---------------------------------------------------------------- launch
let headless = process.env.PERF_HEADLESS === '1';
let browser = null;
let headedNote = '';
if (!headless) {
  try {
    browser = await chromium.launch({headless: false, channel: 'chrome', args: ['--enable-webgl', '--ignore-gpu-blocklist']});
  } catch (error) {
    headless = true;
    headedNote = `headed gagal dijalankan (${error.message.split('\n')[0]}); jatuh ke headless`;
  }
}
if (!browser) {
  browser = await chromium.launch({headless: true, channel: 'chrome', args: ['--enable-webgl', '--ignore-gpu-blocklist']});
}
const mode = headless ? 'headless' : 'headed';
if (headedNote) console.warn(`CATATAN: ${headedNote}`);

const context = await browser.newContext({viewport: {width: 1280, height: 720}, deviceScaleFactor: 1});

// Instrumentasi IndexedDB: menghitung transaksi per object store, dipasang sebelum
// skrip aplikasi mana pun berjalan sehingga tidak ada pembacaan yang terlewat.
await context.addInitScript(() => {
  window.__idb = {counts: {}, log: []};
  const original = IDBDatabase.prototype.transaction;
  IDBDatabase.prototype.transaction = function (names, ...rest) {
    const list = Array.isArray(names) ? names : [names];
    for (const name of list) window.__idb.counts[name] = (window.__idb.counts[name] ?? 0) + 1;
    window.__idb.log.push(list.join('+'));
    return original.call(this, names, ...rest);
  };
  // Perekam latensi input → viewport. `arm(nama)` mulai merekam; setiap event yang
  // terdaftar mencatat t0 lalu menunggu dua rAF: rAF pertama adalah frame yang
  // merender akibat input, rAF kedua menandai frame itu sudah diserahkan.
  window.__perf = {
    active: null, samples: {},
    arm(name) {this.active = name; this.samples[name] = [];},
    disarm() {this.active = null;},
    mark(t0) {
      const bucket = this.active;
      if (!bucket) return;
      requestAnimationFrame(() => requestAnimationFrame(() => {
        this.samples[bucket]?.push(performance.now() - t0);
      }));
    },
  };
  for (const type of ['pointermove', 'keydown']) {
    window.addEventListener(type, () => window.__perf.mark(performance.now()), {capture: true});
  }
  window.__frames = null;
  window.__startFrameRecorder = () => {
    window.__frames = {times: [], long: 0};
    let previous = null;
    try {
      const observer = new PerformanceObserver(list => {window.__frames.long += list.getEntries().length;});
      observer.observe({entryTypes: ['longtask']});
    } catch {/* longtask tidak tersedia */}
    const step = now => {
      if (!window.__frames) return;
      if (previous !== null) window.__frames.times.push(now - previous);
      previous = now;
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  window.__stopFrameRecorder = () => {const out = window.__frames; window.__frames = null; return out;};
});

const errors = [];
const page = await context.newPage();
page.on('pageerror', error => errors.push(error.message));

const loadDoc = JSON.parse(await readFile(new URL('./fixtures/load/load-20a-10r-500k.json', import.meta.url), 'utf8'));
const corpus = JSON.parse(await readFile(new URL('./fixtures/load/projects-100.json', import.meta.url), 'utf8'));

await page.goto(APP);
await page.waitForSelector('#viewport canvas');

// ---------------------------------------------------------------- muat fixture beban
const writeDoc = async docs => page.evaluate(async list => {
  const {ProjectRepository} = await import('/src/repository.js');
  const repository = new ProjectRepository();
  await repository.open();
  for (const doc of list) await repository.saveDocument(doc, {revision: true, revisionToken: 1});
  repository.close();
  return list.length;
}, docs);

await writeDoc([loadDoc]);
await page.evaluate(id => localStorage.setItem('blocking-room.activeProject', id), loadDoc.id);
await page.goto(APP);
await page.waitForSelector('#viewport canvas');
await page.waitForFunction(() => window.blockingRoom?.getProject().actors.length === 20);
// Warm-up: buang 3 detik pertama (docs/PERF-BASELINE.md §2).
await page.waitForTimeout(3000);

const env = await page.evaluate(() => {
  const gl = document.createElement('canvas').getContext('webgl2');
  const info = gl?.getExtension('WEBGL_debug_renderer_info');
  return {
    renderer: info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : null,
    devicePixelRatio, hardwareConcurrency: navigator.hardwareConcurrency,
    userAgent: navigator.userAgent,
  };
});

const results = {
  label: LABEL,
  ranAt: new Date().toISOString(),
  commit: (() => {try {return execSync('git rev-parse --short HEAD').toString().trim();} catch {return null;}})(),
  mode, headedNote: headedNote || null,
  viewport: {width: 1280, height: 720, deviceScaleFactor: 1},
  machine: {platform: `${os.platform()} ${os.release()}`, cpus: os.cpus().length, memoryBytes: os.totalmem()},
  browser: env,
  fixture: {file: 'tests/fixtures/load/load-20a-10r-500k.json', actors: 20, rooms: 10, keyframes: 500, durationSeconds: 60},
  interaction: {}, playback: {}, open: {}, dashboard: {}, memory: {},
};

// ---------------------------------------------------------------- F6-02 interaksi
// (a) drag pointer pada aktor yang tidak terkunci dan tidak tersembunyi.
// Aktor yang dipilih harus terproyeksi jauh di dalam canvas: menekan pointer di luar
// viewport berarti gestur mendarat di elemen UI lain (dan bisa memicu navigasi),
// sehingga angka latensi menjadi tidak berarti.
const target = await page.evaluate(() => {
  const rect = document.querySelector('#viewport canvas').getBoundingClientRect();
  const margin = 110;
  for (const actor of window.blockingRoom.getProject().actors) {
    if (actor.locked || actor.visible === false) continue;
    const key = actor.keys[0];
    const point = window.blockingRoom.projectPoint(key.x, 0.9, key.z);
    if (point.x > rect.left + margin && point.x < rect.right - margin
      && point.y > rect.top + margin && point.y < rect.bottom - margin) {
      return {id: actor.id, x: key.x, z: key.z, point};
    }
  }
  return null;
});
if (!target) throw new Error('Tidak ada aktor yang dapat digeser di dalam viewport.');

await page.evaluate(id => window.blockingRoom.select(id), target.id);
await page.keyboard.press('g'); // mode geser
const anchor = await page.evaluate(t => window.blockingRoom.projectPoint(t.x, 0.9, t.z), target);
results.dragAnchor = anchor;
// Bukti bahwa input benar-benar mengubah scene: pose sebelum/sesudah tiap skenario.
const pose = id => page.evaluate(actorId => {
  const actor = window.blockingRoom.getProject().actors.find(a => a.id === actorId);
  return {x: actor.keys[0].x, z: actor.keys[0].z, keys: actor.keys.length};
}, id);
const poseBeforeDrag = await pose(target.id);

await page.evaluate(() => window.__perf.arm('drag'));
await page.mouse.move(anchor.x, anchor.y);
await page.mouse.down();
for (let i = 0; i < INPUT_SAMPLES; i++) {
  const angle = (i / INPUT_SAMPLES) * Math.PI * 4;
  await page.mouse.move(anchor.x + Math.cos(angle) * 60, anchor.y + Math.sin(angle) * 40);
}
await page.mouse.up();
await page.waitForTimeout(400);
results.interaction.drag = stats(await page.evaluate(() => {window.__perf.disarm(); return window.__perf.samples.drag ?? [];}));
const poseAfterDrag = await pose(target.id);
results.interaction.drag.effective = poseAfterDrag.keys !== poseBeforeDrag.keys || poseAfterDrag.x !== poseBeforeDrag.x || poseAfterDrag.z !== poseBeforeDrag.z;

// (b) nudge keyboard (panah menggeser aktor terpilih).
// Efektivitas dicek dengan satu tekan terpisah: loop pengukuran memakai kiri/kanan
// bergantian supaya aktor tidak melayang jauh, dan pergeseran itu saling meniadakan.
const poseBeforeOneKey = await pose(target.id);
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(120);
const poseAfterOneKey = await pose(target.id);
const keyboardEffective = poseAfterOneKey.x !== poseBeforeOneKey.x;
await page.evaluate(() => window.__perf.arm('keyboard'));
for (let i = 0; i < INPUT_SAMPLES; i++) await page.keyboard.press(i % 2 ? 'ArrowLeft' : 'ArrowRight');
await page.waitForTimeout(400);
results.interaction.keyboard = stats(await page.evaluate(() => {window.__perf.disarm(); return window.__perf.samples.keyboard ?? [];}));
results.interaction.keyboard.effective = keyboardEffective;

// (c) scrub playhead — event `input` pada slider waktu, satu event per frame.
results.interaction.scrub = stats(await page.evaluate(async n => {
  const el = document.querySelector('#scrub');
  const duration = Number(el.max);
  const samples = [];
  const twoFrames = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  for (let i = 0; i < n; i++) {
    el.value = String(((i / n) * duration).toFixed(1));
    const t0 = performance.now();
    el.dispatchEvent(new Event('input', {bubbles: true}));
    await twoFrames();
    samples.push(performance.now() - t0);
  }
  return samples;
}, INPUT_SAMPLES));
results.interaction.scrub.effective = await page.evaluate(() => window.blockingRoom.getTime() > 0);

// (d) pindah scene/shot — dokumen fixture hanya punya satu scene, jadi scene kedua
// dibuat lebih dahulu supaya jalur `DocumentStore.activate()` benar-benar diukur.
await page.evaluate(() => document.querySelector('#add-scene').click());
await page.waitForFunction(() => window.blockingRoom.getScenes().length === 2);
const sceneIds = await page.evaluate(() => window.blockingRoom.getScenes().map(s => s.id));
results.interaction.sceneSwitch = stats(await page.evaluate(async ({ids, n}) => {
  const samples = [];
  const twoFrames = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  for (let i = 0; i < n; i++) {
    const t0 = performance.now();
    window.blockingRoom.switchScene(ids[i % ids.length]);
    await twoFrames();
    samples.push(performance.now() - t0);
  }
  return samples;
}, {ids: sceneIds, n: Math.min(INPUT_SAMPLES, 40)}));

// Kembali ke scene beban dan buang scene bantu supaya playback memakai beban penuh.
await page.evaluate(id => window.blockingRoom.switchScene(id), sceneIds[0]);
await page.waitForTimeout(300);

// ---------------------------------------------------------------- F6-02 playback 60 s
await page.evaluate(() => {
  document.querySelector('#rewind').click();
  window.__startFrameRecorder();
  document.querySelector('#play').click();
});
await page.waitForTimeout(PLAYBACK_MS + 500);
const frames = await page.evaluate(() => window.__stopFrameRecorder());
await page.evaluate(() => {const el = document.querySelector('#play'); if (el) el.click();});

{
  const times = frames.times.filter(t => t > 0);
  const sorted = [...times].sort((a, b) => a - b);
  const budget = sorted[Math.floor(sorted.length * 0.5)] ?? 16.7;
  const refreshBudget = budget <= 12 ? 8.33 : 16.67; // 120 Hz vs 60 Hz
  let dropped = 0, longestRun = 0, run = 0;
  for (const t of times) {
    if (t > refreshBudget * 1.5) {
      dropped += Math.round(t / refreshBudget) - 1;
      run += 1;
      longestRun = Math.max(longestRun, run);
    } else run = 0;
  }
  const mean = times.reduce((a, b) => a + b, 0) / times.length;
  results.playback = {
    durationMs: PLAYBACK_MS,
    frames: times.length,
    fpsMean: round(1000 / mean),
    fpsMin: round(1000 / Math.max(...times)),
    frameTimeMean: round(mean), frameTimeP95: round(p(times, 0.95)), frameTimeMax: round(Math.max(...times)),
    refreshBudgetMs: refreshBudget,
    droppedFrames: dropped,
    droppedPercent: round(dropped / (times.length + dropped) * 100),
    longestDroppedRun: longestRun,
    longTasks: frames.long,
  };
}

// ---------------------------------------------------------------- F6-03 rebuild/memori
results.memory.rebuild = await page.evaluate(async n => {
  const readings = [];
  for (let i = 0; i < n; i++) {
    window.blockingRoom.rebuildScene();
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const info = window.blockingRoom.getRendererInfo();
    readings.push({
      cycle: i + 1,
      geometries: info.geometries, textures: info.textures, programs: info.programs,
      heap: performance.memory ? performance.memory.usedJSHeapSize : null,
    });
  }
  return readings;
}, REBUILD_CYCLES);

// ---------------------------------------------------------------- F6-03 dashboard 100 proyek
const dashboard = await context.newPage();
dashboard.on('pageerror', error => errors.push(`dashboard: ${error.message}`));
await dashboard.goto(`${APP}#/`);
await dashboard.waitForFunction(() => !!window.blockingRoomDashboard);
await dashboard.evaluate(async list => {
  const {ProjectRepository} = await import('/src/repository.js');
  const repository = new ProjectRepository();
  await repository.open();
  for (const doc of list) await repository.saveDocument(doc, {revisionToken: 1});
  repository.close();
}, corpus);

const dashPage = await context.newPage();
dashPage.on('pageerror', error => errors.push(`dashboard2: ${error.message}`));
const dashStart = Date.now();
await dashPage.goto(`${APP}#/`);
await dashPage.waitForFunction(() => document.querySelectorAll('.dash-card').length >= 100, null, {timeout: 30_000});
const dashRenderMs = Date.now() - dashStart;
results.dashboard = {
  projects: await dashPage.evaluate(() => document.querySelectorAll('.dash-card').length),
  renderMs: dashRenderMs,
  idbTransactions: await dashPage.evaluate(() => window.__idb.counts),
  idbLog: await dashPage.evaluate(() => window.__idb.log.slice(0, 20)),
  heapAfter: await dashPage.evaluate(() => (performance.memory ? performance.memory.usedJSHeapSize : null)),
};
await dashboard.close();

// ---------------------------------------------------------------- F6-03 buka proyek 20×
const openSamples = [];
const openHeap = [];
for (let i = 0; i < OPEN_CYCLES; i++) {
  await dashPage.goto(`${APP}#/`);
  await dashPage.waitForFunction(() => document.querySelectorAll('.dash-card').length > 0, null, {timeout: 30_000});
  const card = dashPage.locator(`.dash-card[data-project="${loadDoc.id}"] [data-open]`).first();
  const clickedAt = Date.now();
  await card.click();
  await dashPage.waitForSelector('#viewport canvas', {timeout: 30_000});
  await dashPage.waitForFunction(() => window.blockingRoom?.getProject().actors.length === 20, null, {timeout: 30_000});
  const readyAt = await dashPage.evaluate(() => performance.timeOrigin + performance.now());
  openSamples.push(readyAt - clickedAt);
  openHeap.push(await dashPage.evaluate(() => (performance.memory ? performance.memory.usedJSHeapSize : null)));
}
results.open = {
  cycles: OPEN_CYCLES,
  documentBytes: Buffer.byteLength(JSON.stringify(loadDoc)),
  ...stats(openSamples),
  samples: openSamples.map(v => round(v)),
  heap: openHeap,
};

// ---------------------------------------------------------------- F6-03 proyek metadata ~5 MB
// Target PRD §9 berbicara tentang proyek metadata **≤5 MB**; fixture beban hanya
// 30 KB. Dokumen besar dibangun dengan menggandakan scene beban (semua id diberi
// sufiks agar tetap unik) sampai mendekati 5 000 000 B, lalu dibuka seperti biasa.
function inflate(doc, targetBytes, maxScenes = 200) {
  const big = JSON.parse(JSON.stringify(doc));
  big.id = `${doc.id}-5mb`;
  big.title = `${doc.title} — metadata 5 MB`;
  big.scenes[0].projectId = big.id;
  const template = doc.scenes[0];
  const ids = new Set([
    template.id, template.activeShotId,
    ...template.shots.flatMap(shot => [shot.id, shot.cameraId, shot.camera?.id].filter(Boolean)),
    ...template.actors.map(a => a.id), ...template.setObjects.map(o => o.id),
  ]);
  let order = 1;
  while (Buffer.byteLength(JSON.stringify(big)) < targetBytes && big.scenes.length < maxScenes) {
    let text = JSON.stringify(template);
    for (const id of ids) text = text.split(`"${id}"`).join(`"${id}-c${order}"`);
    const scene = JSON.parse(text);
    scene.projectId = big.id;
    scene.order = order;
    scene.name = `Scene ${String(order + 1).padStart(2, '0')}`;
    for (const shot of scene.shots) shot.sceneId = scene.id;
    big.scenes.push(scene);
    order += 1;
  }
  return big;
}

const bigDoc = inflate(loadDoc, 5_000_000);
const bigBytes = Buffer.byteLength(JSON.stringify(bigDoc));
const bigCycles = Number(process.env.PERF_BIG_CYCLES ?? 5);
const bigSamples = [];
let bigError = null;
try {
  await dashPage.goto(APP);
  await dashPage.waitForSelector('#viewport canvas');
  await dashPage.evaluate(async doc => {
    const {ProjectRepository} = await import('/src/repository.js');
    const repository = new ProjectRepository();
    await repository.open();
    await repository.saveDocument(doc, {revisionToken: 1});
    repository.close();
  }, bigDoc);
  for (let i = 0; i < bigCycles; i++) {
    await dashPage.goto(`${APP}#/`);
    await dashPage.waitForFunction(() => document.querySelectorAll('.dash-card').length > 0, null, {timeout: 60_000});
    const card = dashPage.locator(`.dash-card[data-project="${bigDoc.id}"] [data-open]`).first();
    const clickedAt = Date.now();
    await card.click();
    await dashPage.waitForSelector('#viewport canvas', {timeout: 60_000});
    await dashPage.waitForFunction(() => window.blockingRoom?.getProject().actors.length === 20, null, {timeout: 60_000});
    bigSamples.push((await dashPage.evaluate(() => performance.timeOrigin + performance.now())) - clickedAt);
  }
} catch (error) {
  bigError = error.message.split('\n')[0];
}
results.openBig = {
  documentBytes: bigBytes, scenes: bigDoc.scenes.length, cycles: bigSamples.length,
  error: bigError, ...stats(bigSamples), samples: bigSamples.map(v => round(v)),
};

results.errors = errors;

await mkdir('artifacts', {recursive: true});
await writeFile('artifacts/perf-baseline.json', `${JSON.stringify(results, null, 2)}\n`);

const geo = results.memory.rebuild;
console.log(`\n=== F6-02/F6-03 (${LABEL}, ${mode}, ${env.renderer ?? 'renderer tidak terbaca'}) ===`);
console.log(`drag        p50 ${results.interaction.drag.p50} ms  p95 ${results.interaction.drag.p95} ms  max ${results.interaction.drag.max} ms  (n=${results.interaction.drag.n})`);
console.log(`keyboard    p50 ${results.interaction.keyboard.p50} ms  p95 ${results.interaction.keyboard.p95} ms  max ${results.interaction.keyboard.max} ms  (n=${results.interaction.keyboard.n})`);
console.log(`scrub       p50 ${results.interaction.scrub.p50} ms  p95 ${results.interaction.scrub.p95} ms  max ${results.interaction.scrub.max} ms  (n=${results.interaction.scrub.n})`);
console.log(`sceneSwitch p50 ${results.interaction.sceneSwitch.p50} ms  p95 ${results.interaction.sceneSwitch.p95} ms  max ${results.interaction.sceneSwitch.max} ms  (n=${results.interaction.sceneSwitch.n})`);
console.log(`playback    fps ${results.playback.fpsMean}  frameTime p95 ${results.playback.frameTimeP95} ms  max ${results.playback.frameTimeMax} ms  dropped ${results.playback.droppedFrames} (${results.playback.droppedPercent}%)  longTasks ${results.playback.longTasks}`);
console.log(`buka proyek p50 ${round(p(openSamples, 0.5))} ms  p95 ${round(p(openSamples, 0.95))} ms  (n=${OPEN_CYCLES})`);
console.log(`buka 5 MB   p50 ${results.openBig.p50} ms  p95 ${results.openBig.p95} ms  (${results.openBig.documentBytes} B, ${results.openBig.scenes} scene, n=${results.openBig.cycles})${results.openBig.error ? ` GAGAL: ${results.openBig.error}` : ''}`);
console.log(`dashboard   ${results.dashboard.projects} kartu dalam ${dashRenderMs} ms; transaksi documents=${results.dashboard.idbTransactions.documents ?? 0}, projects=${results.dashboard.idbTransactions.projects ?? 0}, assets=${results.dashboard.idbTransactions.assets ?? 0}`);
console.log(`rebuild     geometries ${geo[0]?.geometries}→${geo.at(-1)?.geometries}  textures ${geo[0]?.textures}→${geo.at(-1)?.textures}  programs ${geo[0]?.programs}→${geo.at(-1)?.programs}`);
console.log(`efektif     drag=${results.interaction.drag.effective} keyboard=${results.interaction.keyboard.effective} scrub=${results.interaction.scrub.effective}`);
console.log(`errors      ${errors.length ? errors.join(' | ') : 'tidak ada'}`);
console.log('Hasil lengkap: artifacts/perf-baseline.json\n');

await browser.close();

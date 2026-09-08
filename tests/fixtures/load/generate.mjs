// Generator fixture beban Fase 6 (F6-01): `node tests/fixtures/load/generate.mjs`.
//
// Dua fixture dihasilkan, keduanya dokumen schema v2 yang lolos `validateDocument`:
//
//   load-20a-10r-500k.json  Beban referensi NFR PRD §9 — 20 aktor, 10 ruang,
//                           500 keyframe total (posisi + rotasi), durasi 60 detik
//                           sehingga bisa dipakai untuk uji playback 60 detik penuh
//                           (F6-02). Ditulis pretty-print supaya bisa diperiksa manual.
//
//   projects-100.json       Korpus dashboard F6-03 — array 100 dokumen v2 ringkas.
//                           Ditulis compact (tanpa indentasi) karena yang diuji adalah
//                           besar payload tersimpan, bukan keterbacaan. Target ≤5 MB
//                           mengikuti batas "metadata proyek ≤5 MB" pada PRD §9.
//
// Seluruh nilai berasal dari PRNG mulberry32 dengan seed tetap dan nilai dibulatkan,
// sehingga menjalankan ulang generator selalu menghasilkan byte yang identik.
// Tidak ada dependency eksternal. Jangan mengedit file hasil secara manual.
import {writeFileSync, mkdirSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {SCHEMA_VERSION, validateDocument} from '../../../src/schema.js';

const here = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------- utilitas

/** PRNG mulberry32: hanya operasi integer 32-bit, hasilnya sama di semua platform. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const r1 = n => Math.round(n * 10) / 10;      // grid waktu keyframe 0,1 detik (DATA-MODEL §5)
const r3 = n => Math.round(n * 1000) / 1000;  // koordinat: 1 mm, cukup untuk previs
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const pad = (n, width = 2) => String(n).padStart(width, '0');
const pick = (rand, list) => list[Math.floor(rand() * list.length) % list.length];

const ACTOR_COLORS = ['#c16e51', '#477f77', '#8c6fb0', '#c8a34a', '#4f7fb5', '#b05a7a', '#5f8f56', '#a8734d'];
const ROOM_COLORS = ['#b5c2c0', '#c7bfb2', '#aeb8c9', '#c2b8a8', '#b8c4b0'];
const FIRST_NAMES = ['Adi', 'Bima', 'Cindy', 'Dewi', 'Eka', 'Farid', 'Gita', 'Hana', 'Indra', 'Joko',
  'Kirana', 'Lukman', 'Maya', 'Nadia', 'Oki', 'Putra', 'Rani', 'Satria', 'Tari', 'Umar'];
const ROOM_NAMES = ['Ruang Tamu', 'Dapur', 'Koridor', 'Kamar Utama', 'Teras', 'Gudang', 'Studio',
  'Ruang Makan', 'Lobi', 'Balkon'];

/** Timestamp tetap: fixture tidak boleh berubah hanya karena dijalankan di hari lain. */
const CREATED_AT = '2026-01-05T02:00:00.000Z';
const UPDATED_AT = '2026-02-18T09:30:00.000Z';

/**
 * Waktu keyframe: `count` titik yang membentang penuh 0..duration, dengan jitter kecil
 * di titik tengah agar tidak semua track jatuh di frame yang sama. Jarak antar titik
 * selalu jauh di atas grid 0,1 s sehingga waktu dijamin unik dan menaik.
 */
function keyTimes(rand, count, duration, jitter = 0.4) {
  const step = duration / (count - 1);
  if (step < 0.4) throw new Error(`Jarak keyframe ${step.toFixed(3)} s terlalu rapat untuk grid 0,1 s.`);
  // Jitter dibatasi 30% jarak antar titik supaya urutan waktu tidak pernah bertukar.
  const swing = Math.min(jitter, step * 0.3);
  const times = [];
  for (let i = 0; i < count; i++) {
    const base = i * step;
    const offset = i === 0 || i === count - 1 ? 0 : (rand() - 0.5) * 2 * swing;
    times.push(r1(clamp(base + offset, 0, duration)));
  }
  for (let i = 1; i < times.length; i++) {
    if (times[i] <= times[i - 1]) throw new Error(`Waktu keyframe tidak menaik pada indeks ${i}.`);
  }
  return times;
}

/** Jalur jalan kaki: langkah acak berbatas, rotasi mengikuti arah gerak (derajat). */
function walkKeys(rand, times, start, span) {
  const keys = [];
  let x = start.x, z = start.z, heading = start.r;
  for (let i = 0; i < times.length; i++) {
    if (i > 0) {
      const dx = (rand() - 0.5) * 4, dz = (rand() - 0.5) * 4;
      const nx = clamp(x + dx, -span, span), nz = clamp(z + dz, -span, span);
      if (nx !== x || nz !== z) heading = (Math.atan2(nx - x, nz - z) * 180) / Math.PI;
      x = nx; z = nz;
    }
    keys.push({t: times[i], x: r3(x), z: r3(z), r: r3(heading)});
  }
  return keys;
}

/** Orbit kamera + titik pandang manual (tetap diisi meski kamera mengikuti aktor). */
function cameraKeys(rand, times, duration, radius = 16) {
  return times.map(t => {
    const angle = (t / duration) * Math.PI * 2 + rand() * 0.05;
    return {
      t,
      x: r3(Math.cos(angle) * radius),
      y: r3(1.8 + Math.sin(angle * 2) * 0.6),
      z: r3(Math.sin(angle) * radius),
      tx: r3(Math.cos(angle + Math.PI) * 2),
      ty: 1.25,
      tz: r3(Math.sin(angle + Math.PI) * 2),
    };
  });
}

const track = (objectId, keys) => ({objectId, property: 'pose', interpolation: 'linear', keys});

// ------------------------------------------------- fixture beban referensi

export const LOAD_SPEC = Object.freeze({
  seed: 20260908,
  actors: 20,
  rooms: 10,
  duration: 60,
  fps: 24,
  cameraKeys: 40,
  totalKeys: 500,
  // Jumlah keyframe per aktor: 23 ± delta berpasangan (naik pada aktor genap, turun pada
  // aktor ganjil) sehingga totalnya tetap persis 460 sementara sebarannya tidak seragam.
  actorKeyDeltas: [3, -2, 1, 4, -3, 2, -1, 0, 3, -4],
  actorKeyBase: 23,
});

/** Jumlah keyframe tiap aktor (panjang 20, total 460). */
export function actorKeyCounts() {
  const counts = [];
  for (const delta of LOAD_SPEC.actorKeyDeltas) {
    counts.push(LOAD_SPEC.actorKeyBase + delta, LOAD_SPEC.actorKeyBase - delta);
  }
  return counts;
}

/**
 * Dokumen beban referensi: 20 aktor, 10 ruang (5 di antaranya berpintu, satu ruang
 * berpintu ganda), 500 keyframe total, kamera dengan target aktor, dan beberapa objek
 * terkunci/tersembunyi.
 */
export function buildLoadDocument() {
  const rand = rng(LOAD_SPEC.seed);
  const {duration, fps} = LOAD_SPEC;
  const projectId = 'load-20a-10r-500k';
  const sceneId = 'scene-load-01';
  const shotId = 'shot-load-01';

  const setObjects = [];
  for (let i = 0; i < LOAD_SPEC.rooms; i++) {
    const col = i % 5, row = Math.floor(i / 5);
    const w = r3(8 + rand() * 6);          // 8..14 m   (LIMITS.roomSpan 1..40)
    const d = r3(6 + rand() * 6);          // 6..12 m
    const h = r3(2.8 + rand() * 1.2);      // 2,8..4 m  (LIMITS.roomHeight 1..10)
    const room = {
      id: `room-${pad(i + 1)}`, type: 'room', name: `${ROOM_NAMES[i]} ${pad(i + 1)}`,
      color: ROOM_COLORS[i % ROOM_COLORS.length],
      x: r3((col - 2) * 18), z: r3((row - 0.5) * 16),   // dalam LIMITS.roomOrigin ±100
      w, d, h, doors: [],
      // Ruang default terkunci (seperti normalizeDocument); satu ruang sengaja dibuka
      // kuncinya dan satu ruang disembunyikan supaya jalur lock/visibility ikut terbebani.
      locked: i !== 3, visible: i !== 5, assetRef: null,
    };
    if (i % 2 === 0) {
      room.doors.push({wall: 'back', offset: r3((rand() - 0.5) * 2), width: 1.2, height: r3(Math.min(2.1, h - 0.3))});
      if (i === 0) room.doors.push({wall: 'left', offset: r3((rand() - 0.5) * 2), width: 1.1, height: r3(Math.min(2.2, h - 0.3))});
    }
    setObjects.push(room);
  }

  const counts = actorKeyCounts();
  const actors = [], tracks = [];
  for (let i = 0; i < LOAD_SPEC.actors; i++) {
    const home = setObjects[i % LOAD_SPEC.rooms];
    const id = `actor-${pad(i + 1)}`;
    actors.push({
      id, type: 'actor', name: `${FIRST_NAMES[i]} ${pad(i + 1)}`,
      color: ACTOR_COLORS[i % ACTOR_COLORS.length],
      height: r3(1.55 + rand() * 0.4),                  // LIMITS.height 0,5..3
      // Empat aktor mewakili kombinasi lock/hide yang harus tetap tersampling.
      locked: i === 4 || i === 14, visible: !(i === 9 || i === 14), assetRef: null,
    });
    const times = keyTimes(rand, counts[i], duration);
    const start = {x: r3(home.x + (rand() - 0.5) * 4), z: r3(home.z + (rand() - 0.5) * 4), r: r3(rand() * 360 - 180)};
    tracks.push(track(id, walkKeys(rand, times, start, 70)));
  }

  const camera = {
    id: 'camera-load-01', type: 'camera', name: 'Kamera Beban',
    focal: 35, targetId: actors[0].id, locked: false, visible: true,
  };
  tracks.push(track(camera.id, cameraKeys(rand, keyTimes(rand, LOAD_SPEC.cameraKeys, duration, 0.2), duration)));

  return {
    schemaVersion: SCHEMA_VERSION, id: projectId,
    title: 'Beban referensi — 20 aktor / 10 ruang / 500 keyframe',
    createdAt: CREATED_AT, updatedAt: UPDATED_AT,
    activeSceneId: sceneId, thumbnailRef: null, assets: [],
    scenes: [{
      id: sceneId, projectId, name: 'Scene Beban', order: 0,
      notes: 'Fixture beban F6-01. Angka NFR PRD §9 adalah target, bukan hasil ukur.',
      activeShotId: shotId, actors, setObjects,
      shots: [{
        id: shotId, sceneId, name: 'Shot Beban 60s', order: 0,
        duration, fps, aspectRatio: '16:9',
        notes: 'Durasi 60 detik agar playback ≥30 fps selama 60 detik (F6-02) bisa diukur pada satu shot.',
        cameraId: camera.id, camera, tracks,
      }],
    }],
  };
}

// ------------------------------------------------ korpus dashboard 100 proyek

export const CORPUS_SPEC = Object.freeze({
  seed: 611002,
  projects: 100,
  maxBytes: 5_000_000,
});

/** Satu proyek ringkas untuk dashboard: 1–3 scene, 1–2 shot per scene, 2–4 aktor. */
function buildCorpusProject(index, rand) {
  const projectId = `proj-${pad(index, 3)}`;
  const sceneCount = 1 + (index % 3);
  const actorCount = 2 + (index % 3);
  const shotCount = 1 + (index % 2);
  const keyCount = 12 + (index % 5) * 12;      // 12..60 keyframe per track
  const scenes = [];

  for (let s = 0; s < sceneCount; s++) {
    const sceneId = `${projectId}-s${s}`;
    const actors = [], setObjects = [];
    for (let a = 0; a < actorCount; a++) {
      actors.push({
        id: `${sceneId}-a${a}`, type: 'actor', name: `${pick(rand, FIRST_NAMES)} ${pad(a + 1)}`,
        color: pick(rand, ACTOR_COLORS), height: r3(1.55 + rand() * 0.4),
        locked: a === 0 && index % 7 === 0, visible: !(a === 1 && index % 11 === 0), assetRef: null,
      });
    }
    const roomCount = 1 + (index % 2);
    for (let r = 0; r < roomCount; r++) {
      const w = r3(7 + rand() * 5), d = r3(6 + rand() * 4), h = r3(2.8 + rand() * 0.8);
      setObjects.push({
        id: `${sceneId}-r${r}`, type: 'room', name: pick(rand, ROOM_NAMES),
        color: pick(rand, ROOM_COLORS), x: r3((r - 0.5) * 14), z: 0, w, d, h,
        doors: r === 0 ? [{wall: 'left', offset: 0, width: 1.1, height: r3(Math.min(2.1, h - 0.3))}] : [],
        locked: true, visible: true, assetRef: null,
      });
    }

    const shots = [];
    for (let h = 0; h < shotCount; h++) {
      const shotId = `${sceneId}-sh${h}`;
      // Durasi mengikuti jumlah keyframe agar jarak antar keyframe selalu ≥0,6 detik.
      const duration = r1(clamp(keyCount * 0.6 + ((index + h) % 4), 8, 120));
      const tracks = [];
      for (const actor of actors) {
        const times = keyTimes(rand, keyCount, duration, 0.2);
        tracks.push(track(actor.id, walkKeys(rand, times, {x: r3(rand() * 6 - 3), z: r3(rand() * 6 - 3), r: 0}, 20)));
      }
      const camera = {
        id: `${shotId}-cam`, type: 'camera', name: 'Kamera A', focal: 24 + ((index + h) % 5) * 8,
        targetId: (index + h) % 3 === 0 ? '' : actors[0].id, locked: false, visible: true,
      };
      tracks.push(track(camera.id, cameraKeys(rand, keyTimes(rand, Math.max(4, keyCount >> 1), duration, 0.2), duration, 12)));
      shots.push({
        id: shotId, sceneId, name: `Shot ${pad(h + 1)}`, order: h, duration, fps: 24,
        aspectRatio: ['16:9', '9:16', '2.39:1'][(index + h) % 3],
        notes: `Catatan shot ${pad(h + 1)} proyek ${pad(index, 3)}. Fixture dashboard F6-03.`,
        cameraId: camera.id, camera, tracks,
      });
    }

    scenes.push({
      id: sceneId, projectId, name: `Scene ${pad(s + 1)}`, order: s,
      notes: `Director's note scene ${pad(s + 1)} proyek ${pad(index, 3)}. `.repeat(4).trim(),
      activeShotId: shots[0].id, actors, setObjects, shots,
    });
  }

  return {
    schemaVersion: SCHEMA_VERSION, id: projectId,
    title: `Proyek Dashboard ${pad(index, 3)}`,
    createdAt: CREATED_AT, updatedAt: UPDATED_AT,
    activeSceneId: scenes[0].id,
    thumbnailRef: index % 4 === 0 ? `thumb-${pad(index, 3)}` : null,
    assets: [],
    scenes,
  };
}

/** Array 100 dokumen v2 ringkas untuk uji dashboard F6-03. */
export function buildProjectCorpus() {
  const rand = rng(CORPUS_SPEC.seed);
  const projects = [];
  for (let i = 0; i < CORPUS_SPEC.projects; i++) projects.push(buildCorpusProject(i, rand));
  return projects;
}

// ------------------------------------------------------------------- tulis

export const LOAD_FILE = 'load-20a-10r-500k.json';
export const CORPUS_FILE = 'projects-100.json';

/** Serialisasi persis seperti yang tersimpan di disk (dipakai test kesetaraan). */
export const serializeLoad = doc => JSON.stringify(doc, null, 2) + '\n';
export const serializeCorpus = list => JSON.stringify(list) + '\n';

if (import.meta.url === `file://${process.argv[1]}`) {
  mkdirSync(here, {recursive: true});

  const load = buildLoadDocument();
  validateDocument(structuredClone(load));   // gagal cepat bila fixture rusak
  const loadText = serializeLoad(load);
  writeFileSync(join(here, LOAD_FILE), loadText);

  const corpus = buildProjectCorpus();
  for (const doc of corpus) validateDocument(structuredClone(doc));
  const corpusText = serializeCorpus(corpus);
  writeFileSync(join(here, CORPUS_FILE), corpusText);

  const keys = load.scenes[0].shots[0].tracks.reduce((sum, t) => sum + t.keys.length, 0);
  const kb = text => `${(Buffer.byteLength(text) / 1024).toFixed(1)} KB`;
  console.log(`${LOAD_FILE}: ${load.scenes[0].actors.length} aktor, ${load.scenes[0].setObjects.length} ruang, ${keys} keyframe, durasi ${load.scenes[0].shots[0].duration}s — ${kb(loadText)}`);
  console.log(`${CORPUS_FILE}: ${corpus.length} proyek — ${kb(corpusText)} (batas ${CORPUS_SPEC.maxBytes / 1e6} MB)`);
}

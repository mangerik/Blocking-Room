// F6-07 — feature flag dashboard, ekspor kompatibel v1 dan deteksi kemampuan.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {DEFAULT_FLAGS, FLAG_PREFIX, allFlags, readFlag, setFlag} from '../src/flags.js';
import {V2_SCHEMA_VERSION, exportAsV1, exportAsV2, migrateV2ToV3, openProjectData} from '../src/migrate.js';
import {capabilityWarnings, detectCapabilities} from '../src/capabilities.js';
import {sample, validateProject} from '../src/model.js';

function fakeStorage({broken = false} = {}) {
  const map = new Map();
  return {
    map,
    getItem: key => {if (broken) throw new Error('storage diblokir'); return map.has(key) ? map.get(key) : null;},
    setItem: (key, value) => {if (broken) throw new Error('storage diblokir'); map.set(key, String(value));},
    removeItem: key => {if (broken) throw new Error('storage diblokir'); map.delete(key);},
  };
}

const v1 = JSON.parse(await readFile(new URL('./fixtures/v1/demo-scene.json', import.meta.url), 'utf8'));

// ---------------------------------------------------------------- feature flag
test('flag dashboard aktif secara bawaan', () => {
  assert.equal(DEFAULT_FLAGS.dashboard, true);
  assert.equal(readFlag('dashboard', fakeStorage()), true);
});

test('flag dapat dimatikan dan dinyalakan kembali', () => {
  const storage = fakeStorage();
  setFlag('dashboard', false, storage);
  assert.equal(storage.getItem(`${FLAG_PREFIX}dashboard`), 'off');
  assert.equal(readFlag('dashboard', storage), false);
  setFlag('dashboard', true, storage);
  assert.equal(readFlag('dashboard', storage), true);
  setFlag('dashboard', null, storage);
  assert.equal(readFlag('dashboard', storage), true, 'menghapus penyetelan kembali ke bawaan');
});

test('nilai flag menerima beberapa ejaan dan mengabaikan yang tidak dikenal', () => {
  const storage = fakeStorage();
  for (const value of ['off', 'FALSE', '0', 'mati']) {
    storage.setItem(`${FLAG_PREFIX}dashboard`, value);
    assert.equal(readFlag('dashboard', storage), false, value);
  }
  for (const value of ['on', 'True', '1', 'aktif']) {
    storage.setItem(`${FLAG_PREFIX}dashboard`, value);
    assert.equal(readFlag('dashboard', storage), true, value);
  }
  storage.setItem(`${FLAG_PREFIX}dashboard`, 'entahlah');
  assert.equal(readFlag('dashboard', storage), true, 'nilai tak dikenal memakai bawaan');
});

test('storage yang diblokir tidak membuat pembacaan flag melempar', () => {
  const storage = fakeStorage({broken: true});
  assert.doesNotThrow(() => readFlag('dashboard', storage));
  assert.equal(readFlag('dashboard', storage), true);
  assert.equal(setFlag('dashboard', false, storage), false);
});

test('allFlags mengembalikan seluruh flag yang dikenal', () => {
  assert.deepEqual(allFlags(fakeStorage()), {dashboard: true});
});

// ---------------------------------------------------------------- ekspor v1
test('exportAsV1 mengembalikan dokumen v1 yang setara dengan sumbernya', () => {
  const doc = openProjectData(structuredClone(v1)).document;
  const {data, dropped} = exportAsV1(doc);
  assert.deepEqual(data, v1, 'v1 → v3 → v1 harus setara');
  // v3 mengubah dekorasi contoh menjadi prop ber-ID; format v1 tidak mengenalnya,
  // jadi ia HARUS disebutkan pada daftar yang tidak terbawa (bukan hilang diam-diam).
  assert.deepEqual(dropped, [`${doc.scenes[0].setObjects.filter(o => o.type === 'prop').length} prop`]);
});

// Fase 4b: v3 memecah gerak aktor menjadi dua track. Ekspor balik ke v1 karena itu
// harus MENGGABUNGKANNYA kembali, termasuk ketika posisi dan orientasi di-key pada
// waktu yang berbeda — kalau tidak, gerak yang sudah dibuat pengguna akan hilang.
test('exportAsV1 menggabungkan track posisi dan orientasi yang di-key pada waktu berbeda', () => {
  const doc = openProjectData(structuredClone(v1)).document;
  const shot = doc.scenes[0].shots[0];
  const position = shot.tracks.find(t => t.objectId === 'a1' && t.property === 'position');
  const rotation = shot.tracks.find(t => t.objectId === 'a1' && t.property === 'rotation');
  rotation.keys.push({t: 3, r: 45});
  rotation.keys.sort((a, b) => a.t - b.t);
  const {data} = exportAsV1(doc);
  const actor = data.actors.find(a => a.id === 'a1');
  assert.deepEqual(actor.keys.map(k => k.t), [0, 3, 5, 12], 'waktu gabungan adalah union kedua track');
  assert.equal(actor.keys.find(k => k.t === 3).r, 45);
  assert.ok(Math.abs(actor.keys.find(k => k.t === 3).x - sample(position.keys, 3).x) < 1e-12,
    'posisi pada waktu baru diambil dari sampling track posisi');
  // Hasilnya tetap JSON v1 yang sah dan dapat dibuka build lama.
  validateProject(structuredClone(data));
  assert.equal(openProjectData(structuredClone(data)).sourceVersion, 1);
});

test('exportAsV1 tidak memutasi dokumen v2 sumber', () => {
  const doc = openProjectData(structuredClone(v1)).document;
  const before = JSON.stringify(doc);
  const {data} = exportAsV1(doc);
  data.actors[0].name = 'diubah';
  data.rooms[0].doors.push({wall: 'back', offset: 0, width: 1, height: 2});
  assert.equal(JSON.stringify(doc), before);
});

test('exportAsV1 menyebutkan apa yang tidak terbawa ke format lama', () => {
  const doc = openProjectData(structuredClone(v1)).document;
  const second = JSON.parse(JSON.stringify(doc.scenes[0]));
  second.id = 'scene-2';
  second.order = 1;
  for (const shot of second.shots) {shot.id = 'shot-2'; shot.sceneId = 'scene-2';}
  doc.scenes.push(second);
  doc.scenes[0].notes = 'Catatan pengarahan';
  doc.scenes[0].shots[0].fps = 30;
  const {dropped, data} = exportAsV1(doc, {sceneId: doc.scenes[0].id});
  assert.ok(dropped.some(text => text.includes('scene lain')));
  assert.ok(dropped.includes('catatan scene'));
  assert.ok(dropped.some(text => text.includes('fps 30')));
  assert.equal(data.version, 1);
});

test('hasil exportAsV1 dapat dibuka kembali oleh openProjectData sebagai v1', () => {
  const doc = openProjectData(structuredClone(v1)).document;
  const {data} = exportAsV1(doc);
  const reopened = openProjectData(data);
  assert.equal(reopened.migrated, true);
  assert.equal(reopened.sourceVersion, 1);
  assert.equal(reopened.document.scenes[0].actors.length, v1.actors.length);
});

test('exportAsV1 memilih scene dan shot tertentu', () => {
  const doc = openProjectData(structuredClone(v1)).document;
  const second = JSON.parse(JSON.stringify(doc.scenes[0]));
  second.id = 'scene-2';
  second.order = 1;
  second.actors = [second.actors[0]];
  second.shots[0].id = 'shot-2';
  second.shots[0].sceneId = 'scene-2';
  second.shots[0].duration = 7;
  doc.scenes.push(second);
  const {data} = exportAsV1(doc, {sceneId: 'scene-2'});
  assert.equal(data.duration, 7);
  assert.equal(data.actors.length, 1);
});

test('exportAsV1 menolak dokumen tanpa scene', () => {
  assert.throws(() => exportAsV1({scenes: [], activeSceneId: null}), /tidak memiliki scene/);
});

// ---------------------------------------------------------------- kemampuan
test('detectCapabilities aman pada lingkungan tanpa DOM dan tidak melempar', () => {
  const caps = detectCapabilities({});
  assert.equal(caps.webgl, false);
  assert.equal(caps.indexedDB, false);
  assert.equal(caps.mediaRecorder.supported, false);
  assert.deepEqual(caps.mediaRecorder.mimeTypes, []);
});

test('capabilityWarnings memisahkan penghalang dan penurunan kemampuan', () => {
  const warnings = capabilityWarnings(detectCapabilities({}));
  const byId = Object.fromEntries(warnings.map(w => [w.id, w.level]));
  assert.equal(byId.webgl, 'blocking');
  assert.equal(byId.indexeddb, 'blocking');
  assert.equal(byId.mediarecorder, 'degraded');
  assert.equal(byId.weblocks, 'degraded');
  for (const warning of warnings) assert.ok(warning.message.length > 20, 'pesan harus menjelaskan akibatnya');
});

test('browser lengkap tidak menghasilkan peringatan', () => {
  const caps = {
    webgl: true, indexedDB: true, webLocks: true,
    mediaRecorder: {supported: true, preferred: 'video/webm;codecs=vp9'},
  };
  assert.deepEqual(capabilityWarnings(caps), []);
});

// ---------------------------------------------------------------- ekspor v2 (rollback R1)
// `docs/ROLLOUT.md` §6 menetapkan ini sebagai syarat rilis schema v3: build R1 hanya
// mengenal v2, sedangkan `exportAsV1` hanya memuat satu scene dan satu shot.
test('exportAsV2 mengembalikan dokumen v2 yang setara dan tidak memutasi sumbernya', () => {
  const doc = openProjectData(structuredClone(v1)).document;
  const before = JSON.stringify(doc);
  const {data, dropped} = exportAsV2(doc);
  assert.equal(JSON.stringify(doc), before, 'dokumen v3 sumber tidak boleh berubah');
  assert.equal(data.schemaVersion, V2_SCHEMA_VERSION);
  assert.equal(data.id, doc.id, 'seluruh ID dipertahankan');
  assert.equal(data.scenes.length, doc.scenes.length);
  // Prop hasil migrasi tidak dikenal v2 dan disebutkan, bukan hilang diam-diam.
  assert.ok(data.scenes[0].setObjects.every(o => o.type === 'room'));
  assert.deepEqual(dropped, [`${doc.scenes[0].setObjects.filter(o => o.type === 'prop').length} prop`]);
  // Track digabung kembali menjadi satu track pose per aktor + satu track kamera.
  const shot = data.scenes[0].shots[0];
  assert.ok(shot.tracks.every(t => t.property === 'pose'));
  assert.equal(shot.tracks.length, data.scenes[0].actors.length + 1);
  // Naik lagi ke v3 menghasilkan gerak yang sama persis (v3 → v2 → v3 setara).
  const back = migrateV2ToV3(structuredClone(data));
  for (const property of ['position', 'rotation']) {
    const original = doc.scenes[0].shots[0].tracks.filter(t => t.property === property);
    const roundtrip = back.scenes[0].shots[0].tracks.filter(t => t.property === property);
    assert.deepEqual(roundtrip.map(t => t.keys), original.map(t => t.keys), property);
  }
});

test('exportAsV2 menyebut interpolasi non-linear yang diturunkan', () => {
  const doc = openProjectData(structuredClone(v1)).document;
  doc.scenes[0].shots[0].tracks.find(t => t.property === 'position').interpolation = 'ease';
  const {data, dropped} = exportAsV2(doc);
  assert.ok(dropped.some(text => text.includes('non-linear')));
  assert.ok(data.scenes[0].shots[0].tracks.every(t => t.interpolation === 'linear'));
});

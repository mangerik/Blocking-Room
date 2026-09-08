// F6-07 — feature flag dashboard, ekspor kompatibel v1 dan deteksi kemampuan.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {DEFAULT_FLAGS, FLAG_PREFIX, allFlags, readFlag, setFlag} from '../src/flags.js';
import {exportAsV1, migrateV1ToV2, openProjectData} from '../src/migrate.js';
import {capabilityWarnings, detectCapabilities} from '../src/capabilities.js';

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
  const doc = migrateV1ToV2(v1);
  const {data, dropped} = exportAsV1(doc);
  assert.deepEqual(data, v1, 'v1 → v2 → v1 harus setara');
  assert.deepEqual(dropped, []);
});

test('exportAsV1 tidak memutasi dokumen v2 sumber', () => {
  const doc = migrateV1ToV2(v1);
  const before = JSON.stringify(doc);
  const {data} = exportAsV1(doc);
  data.actors[0].name = 'diubah';
  data.rooms[0].doors.push({wall: 'back', offset: 0, width: 1, height: 2});
  assert.equal(JSON.stringify(doc), before);
});

test('exportAsV1 menyebutkan apa yang tidak terbawa ke format lama', () => {
  const doc = migrateV1ToV2(v1);
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
  const doc = migrateV1ToV2(v1);
  const {data} = exportAsV1(doc);
  const reopened = openProjectData(data);
  assert.equal(reopened.migrated, true);
  assert.equal(reopened.sourceVersion, 1);
  assert.equal(reopened.document.scenes[0].actors.length, v1.actors.length);
});

test('exportAsV1 memilih scene dan shot tertentu', () => {
  const doc = migrateV1ToV2(v1);
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

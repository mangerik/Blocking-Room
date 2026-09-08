// F6-01 — fixture beban referensi dan korpus dashboard.
// Test ini mengunci bentuk fixture (jumlah aktor/ruang/keyframe, durasi, ukuran file)
// dan membuktikan `sampleScene` berjalan tanpa error serta deterministik pada beban itu.
// Test ini TIDAK mengukur performa; angka NFR PRD §9 adalah target, bukan hasil.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, statSync} from 'node:fs';
import {LIMITS, validateDocument} from '../src/schema.js';
import {readSceneView} from '../src/document.js';
import {sampleScene} from '../src/timeline-engine.js';
import {
  LOAD_SPEC, CORPUS_SPEC, LOAD_FILE, CORPUS_FILE,
  actorKeyCounts, buildLoadDocument, buildProjectCorpus, serializeLoad, serializeCorpus,
} from './fixtures/load/generate.mjs';

const dir = new URL('./fixtures/load/', import.meta.url).pathname;
const path = name => dir + name;
const readText = name => readFileSync(path(name), 'utf8');
const readJson = name => JSON.parse(readText(name));
const bytes = name => statSync(path(name)).size;
const keyTotal = shot => shot.tracks.reduce((sum, t) => sum + t.keys.length, 0);

test('generator beban deterministik: file tersimpan sama persis dengan hasil generator', () => {
  assert.equal(readText(LOAD_FILE), serializeLoad(buildLoadDocument()));
  assert.equal(readText(CORPUS_FILE), serializeCorpus(buildProjectCorpus()));
});

test('fixture beban memenuhi profil PRD §9: 20 aktor, 10 ruang, 500 keyframe, 60 detik', () => {
  const doc = readJson(LOAD_FILE);
  assert.equal(doc.scenes.length, 1);
  const scene = doc.scenes[0];
  const shot = scene.shots[0];

  assert.equal(scene.actors.length, LOAD_SPEC.actors, 'jumlah aktor');
  assert.equal(scene.setObjects.length, LOAD_SPEC.rooms, 'jumlah ruang');
  assert.equal(keyTotal(shot), LOAD_SPEC.totalKeys, 'total keyframe');
  assert.equal(shot.duration, LOAD_SPEC.duration, 'durasi shot 60 detik untuk uji playback 60 s');

  // Satu track pose per aktor + satu track kamera.
  assert.equal(shot.tracks.length, LOAD_SPEC.actors + 1);
  const counts = actorKeyCounts();
  assert.equal(counts.length, LOAD_SPEC.actors);
  assert.equal(counts.reduce((a, b) => a + b, 0) + LOAD_SPEC.cameraKeys, LOAD_SPEC.totalKeys);
  for (let i = 0; i < LOAD_SPEC.actors; i++) {
    const t = shot.tracks.find(tr => tr.objectId === scene.actors[i].id);
    assert.ok(t, `track aktor ${scene.actors[i].id} hilang`);
    assert.equal(t.keys.length, counts[i]);
    for (const key of t.keys) for (const field of ['x', 'z', 'r']) {
      assert.equal(typeof key[field], 'number', 'keyframe aktor harus posisi + rotasi');
    }
  }
});

test('fixture beban memakai kamera bertarget dan objek terkunci/tersembunyi', () => {
  const scene = readJson(LOAD_FILE).scenes[0];
  const shot = scene.shots[0];
  assert.ok(shot.camera, 'kamera harus ada');
  assert.equal(shot.cameraId, shot.camera.id);
  assert.ok(scene.actors.some(a => a.id === shot.camera.targetId), 'kamera harus mengikuti aktor di scene');
  const cameraKeys = shot.tracks.find(t => t.objectId === shot.camera.id).keys;
  assert.equal(cameraKeys.length, LOAD_SPEC.cameraKeys);
  for (const key of cameraKeys) for (const field of ['x', 'y', 'z', 'tx', 'ty', 'tz']) {
    assert.equal(typeof key[field], 'number');
  }

  const objects = [...scene.actors, ...scene.setObjects];
  assert.ok(objects.some(o => o.locked === true), 'harus ada objek terkunci');
  assert.ok(objects.some(o => o.locked === false), 'harus ada objek tidak terkunci');
  assert.ok(objects.some(o => o.visible === false), 'harus ada objek tersembunyi');
  const withDoors = scene.setObjects.filter(r => r.doors.length > 0);
  assert.ok(withDoors.length >= 2, 'beberapa ruang harus punya pintu');
  assert.ok(withDoors.some(r => r.doors.length === 2), 'satu ruang harus punya dua pintu');
});

test('fixture beban lolos validateDocument tanpa mengubah keyframe', () => {
  const raw = readJson(LOAD_FILE);
  const before = structuredClone(raw);
  const doc = validateDocument(raw);
  assert.deepEqual(doc.scenes[0].shots[0].tracks, before.scenes[0].shots[0].tracks);
  assert.ok(bytes(LOAD_FILE) < LIMITS.documentBytes,
    `fixture beban ${bytes(LOAD_FILE)} B harus di bawah LIMITS.documentBytes ${LIMITS.documentBytes} B`);
});

test('sampleScene pada beban referensi berjalan di t=0, tengah dan akhir serta deterministik', () => {
  const doc = validateDocument(readJson(LOAD_FILE));
  const view = readSceneView(doc);
  assert.equal(view.actors.length, LOAD_SPEC.actors);
  assert.equal(view.duration, LOAD_SPEC.duration);

  for (const t of [0, LOAD_SPEC.duration / 2, LOAD_SPEC.duration]) {
    const first = sampleScene(view, t);
    const second = sampleScene(view, t);
    assert.deepEqual(second, first, `sampling t=${t} tidak deterministik`);
    assert.equal(first.time, t);
    assert.equal(first.actors.length, LOAD_SPEC.actors);
    for (const actor of first.actors) {
      for (const field of ['x', 'z', 'r']) assert.ok(Number.isFinite(actor.pose[field]), `pose ${actor.id}.${field}`);
      assert.ok(Number.isFinite(actor.gait.angle) && Number.isFinite(actor.gait.speed), `gait ${actor.id}`);
    }
    assert.ok(first.camera, 'kamera harus tersampling');
    for (const field of ['x', 'y', 'z']) assert.ok(Number.isFinite(first.camera.pose[field]));
    for (const field of ['x', 'y', 'z']) assert.ok(Number.isFinite(first.camera.target[field]));
    assert.equal(first.camera.following, doc.scenes[0].shots[0].camera.targetId);
  }

  // Sampling tidak boleh memutasi view (syarat agar playback 60 detik bebas efek samping).
  const snapshot = structuredClone(view);
  for (let t = 0; t <= LOAD_SPEC.duration; t += 5) sampleScene(view, t);
  assert.deepEqual(view, snapshot);
});

test('korpus dashboard berisi 100 dokumen v2 valid dengan ID unik dan ukuran ≤5 MB', () => {
  const projects = readJson(CORPUS_FILE);
  assert.ok(Array.isArray(projects));
  assert.equal(projects.length, CORPUS_SPEC.projects);
  assert.equal(new Set(projects.map(p => p.id)).size, CORPUS_SPEC.projects, 'ID proyek harus unik');

  const size = bytes(CORPUS_FILE);
  assert.ok(size <= CORPUS_SPEC.maxBytes, `korpus ${size} B melewati batas ${CORPUS_SPEC.maxBytes} B`);
  for (const project of projects) {
    validateDocument(structuredClone(project));
    assert.ok(project.scenes.length >= 1 && project.scenes.length <= 3);
    assert.ok(JSON.stringify(project).length < LIMITS.documentBytes);
  }
  // Dashboard hanya membaca metadata; field ini harus ada tanpa membaca scenes.
  for (const project of projects) {
    for (const field of ['id', 'title', 'createdAt', 'updatedAt']) {
      assert.ok(project[field], `metadata ${field} hilang pada ${project.id}`);
    }
    assert.ok(project.thumbnailRef === null || typeof project.thumbnailRef === 'string');
  }
  assert.ok(projects.some(p => p.thumbnailRef !== null), 'sebagian proyek harus punya thumbnailRef');
});

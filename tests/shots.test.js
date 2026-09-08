// Unit Fase 4 (F4-01/F4-02): kepemilikan shot, isolasi alternatif, invariant target
// kamera. Yang diuji bukan "kodenya jalan" melainkan janji datanya: mengubah shot B
// tidak boleh menyentuh satu byte pun milik shot A.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {DocumentStore, syncShotTracks, writeSceneView} from '../src/document.js';
import {EditorSession} from '../src/commands.js';
import {openProjectData} from '../src/migrate.js';
import {validateDocument} from '../src/schema.js';
import {
  addShot, compareShots, duplicateShot, moveShot, nextShotName, removeShot,
  renameShot, setShotSettings, summarizeShot,
} from '../src/shots.js';

const dir = new URL('./fixtures/', import.meta.url).pathname;
const readV1 = name => JSON.parse(readFileSync(join(dir, 'v1', `${name}.json`), 'utf8'));
const clone = value => JSON.parse(JSON.stringify(value));
const demoDocument = () => openProjectData(readV1('demo-scene')).document;

let counter = 0;
const ids = () => `id-${++counter}`;

test('shot baru memakai nama berurutan dan tidak pernah bentrok', () => {
  const doc = demoDocument();
  const scene = doc.scenes[0];
  assert.equal(nextShotName(scene), 'Shot 02');
  addShot(scene, {id: ids});
  assert.equal(nextShotName(scene), 'Shot 03');
  assert.equal(nextShotName(scene, 'Shot 01'), 'Shot 01 (2)');
});

test('shot baru menyalin staging awal tanpa membawa gerakan shot sumber', () => {
  const doc = demoDocument();
  const scene = doc.scenes[0];
  const source = scene.shots[0];
  const shot = addShot(scene, {id: ids});
  validateDocument(doc);

  // Setiap aktor scene punya tepat satu track dengan satu keyframe pada t=0…
  for (const actor of scene.actors) {
    const track = shot.tracks.find(t => t.objectId === actor.id);
    assert.ok(track, `${actor.name} harus punya track pada shot baru`);
    assert.equal(track.keys.length, 1);
    assert.equal(track.keys[0].t, 0);
    // …dan pose awalnya sama dengan pose awal shot sumber.
    const seed = source.tracks.find(t => t.objectId === actor.id).keys[0];
    assert.deepEqual({x: track.keys[0].x, z: track.keys[0].z, r: track.keys[0].r},
      {x: seed.x, z: seed.z, r: seed.r});
  }
  // Kamera milik SHOT: ID-nya baru, bukan ID kamera shot sumber.
  assert.ok(shot.camera);
  assert.notEqual(shot.camera.id, source.camera.id);
  assert.equal(shot.cameraId, shot.camera.id);
  assert.equal(shot.camera.focal, source.camera.focal);
  // Shot sumber tidak tersentuh sama sekali.
  assert.deepEqual(scene.shots[0], source);
});

test('mengubah lensa dan keyframe pada shot B tidak mengubah shot A', () => {
  const doc = demoDocument();
  const scene = doc.scenes[0];
  const before = clone(scene.shots[0]);
  const shotB = addShot(scene, {id: ids});
  shotB.camera.focal = 85;
  shotB.tracks[0].keys.push({t: 4, x: 9, z: 9, r: 45});
  setShotSettings(scene, shotB.id, {fps: 30, aspectRatio: '2.39:1', notes: 'alternatif tele'});
  validateDocument(doc);
  assert.deepEqual(scene.shots[0], before);
  assert.equal(scene.shots[0].camera.focal, 35);
  assert.equal(scene.shots[0].fps, 24);
  assert.equal(scene.shots[0].aspectRatio, '16:9');
});

test('duplicate shot menyalin track dan kamera dengan ID kamera baru; aktor tetap milik scene', () => {
  const doc = demoDocument();
  const scene = doc.scenes[0];
  const source = scene.shots[0];
  const copy = duplicateShot(scene, source.id, {id: ids});
  validateDocument(doc);
  assert.notEqual(copy.id, source.id);
  assert.notEqual(copy.camera.id, source.camera.id);
  assert.equal(copy.cameraId, copy.camera.id);
  // Track kamera ikut dipetakan ulang; track aktor TIDAK (aktor milik scene).
  assert.ok(copy.tracks.some(t => t.objectId === copy.camera.id));
  assert.ok(!copy.tracks.some(t => t.objectId === source.camera.id));
  for (const actor of scene.actors) assert.ok(copy.tracks.some(t => t.objectId === actor.id));
  // Isi gerakan identik dengan sumbernya.
  for (const actor of scene.actors) {
    assert.deepEqual(copy.tracks.find(t => t.objectId === actor.id).keys,
      source.tracks.find(t => t.objectId === actor.id).keys);
  }
  // Mengedit salinan tidak menyentuh sumbernya.
  const beforeSource = clone(source);
  copy.tracks[0].keys[0].x = 42;
  copy.camera.focal = 120;
  assert.deepEqual(scene.shots[0], beforeSource);
});

test('shot terakhir tidak boleh dihapus dan urutan dinomori ulang', () => {
  const doc = demoDocument();
  const scene = doc.scenes[0];
  assert.throws(() => removeShot(scene, scene.shots[0].id), /minimal satu shot/);
  const b = addShot(scene, {id: ids});
  const c = addShot(scene, {id: ids});
  assert.deepEqual(scene.shots.map(s => s.order), [0, 1, 2]);
  moveShot(scene, c.id, -1);
  assert.deepEqual(scene.shots.map(s => s.id), [scene.shots[0].id, c.id, b.id]);
  assert.deepEqual(scene.shots.map(s => s.order), [0, 1, 2]);
  const next = removeShot(scene, c.id);
  assert.equal(scene.shots.length, 2);
  assert.equal(scene.activeShotId, next.id);
  assert.deepEqual(scene.shots.map(s => s.order), [0, 1]);
  validateDocument(doc);
});

test('rename shot menolak nama kosong', () => {
  const doc = demoDocument();
  const scene = doc.scenes[0];
  assert.throws(() => renameShot(scene, scene.shots[0].id, '   '), /tidak boleh kosong/);
  renameShot(scene, scene.shots[0].id, '  Wide master  ');
  assert.equal(scene.shots[0].name, 'Wide master');
});

test('mengubah fps shot tidak menggeser satu pun waktu keyframe', () => {
  const doc = demoDocument();
  const scene = doc.scenes[0];
  const times = scene.shots[0].tracks.map(t => t.keys.map(k => k.t));
  setShotSettings(scene, scene.shots[0].id, {fps: 30});
  validateDocument(doc);
  assert.equal(scene.shots[0].fps, 30);
  assert.deepEqual(scene.shots[0].tracks.map(t => t.keys.map(k => k.t)), times);
});

test('perbandingan A/B menyoroti hanya yang benar-benar berbeda', () => {
  const doc = demoDocument();
  const scene = doc.scenes[0];
  const b = addShot(scene, {id: ids});
  b.camera.focal = 85;
  setShotSettings(scene, b.id, {fps: 30, aspectRatio: '9:16'});
  const diff = compareShots(scene, scene.shots[0].id, b.id);
  const labels = diff.differences.map(d => d.label);
  assert.ok(labels.includes('Lensa'));
  assert.ok(labels.includes('fps'));
  assert.ok(labels.includes('Aspect ratio'));
  assert.ok(labels.includes('Total keyframe'));
  assert.ok(!labels.includes('Durasi'), 'durasi sama tidak boleh dilaporkan sebagai perbedaan');
  const same = compareShots(scene, scene.shots[0].id, scene.shots[0].id);
  assert.deepEqual(same.differences, []);
  assert.equal(summarizeShot(scene.shots[0]).frames, 12 * 24);
});

// ---------------------------------------------------------------------------
// syncShotTracks: aktor milik scene, jadi menambah/menghapusnya harus menyentuh
// SETIAP shot. Tanpa ini dokumen langsung tidak valid begitu ada shot kedua.
// ---------------------------------------------------------------------------

test('menambah aktor lewat scene view membuat track di semua shot', () => {
  const doc = demoDocument();
  const scene = doc.scenes[0];
  addShot(scene, {id: ids});
  const store = new DocumentStore(doc);
  store.view.actors.push({id: 'a9', name: 'Baru', color: '#123456', height: 1.7, locked: false, visible: true, keys: [{t: 0, x: 1, z: 2, r: 0}]});
  const snapshot = store.snapshot();
  validateDocument(snapshot);
  for (const shot of snapshot.scenes[0].shots) {
    const track = shot.tracks.find(t => t.objectId === 'a9');
    assert.ok(track, `shot ${shot.name} harus punya track aktor baru`);
    assert.equal(track.keys.length >= 1, true);
  }
  // Shot non-aktif memakai pose awal shot aktif, bukan titik nol.
  const other = snapshot.scenes[0].shots.find(s => s.id !== store.shotId);
  assert.deepEqual(other.tracks.find(t => t.objectId === 'a9').keys, [{t: 0, x: 1, z: 2, r: 0}]);
});

test('menghapus aktor membersihkan track di semua shot dan melepas target kamera', () => {
  const doc = demoDocument();
  const scene = doc.scenes[0];
  const b = addShot(scene, {id: ids});
  b.camera.targetId = 'a1';
  const store = new DocumentStore(doc);
  store.view.actors = store.view.actors.filter(a => a.id !== 'a1');
  store.view.camera.target = '';
  const snapshot = store.snapshot();
  validateDocument(snapshot);
  for (const shot of snapshot.scenes[0].shots) {
    assert.ok(!shot.tracks.some(t => t.objectId === 'a1'), `track a1 tersisa pada ${shot.name}`);
    assert.notEqual(shot.camera?.targetId, 'a1');
  }
});

test('syncShotTracks idempoten: menjalankan dua kali menghasilkan dokumen identik', () => {
  const doc = demoDocument();
  const scene = doc.scenes[0];
  addShot(scene, {id: ids});
  syncShotTracks(scene);
  const once = clone(scene);
  syncShotTracks(scene);
  assert.deepEqual(scene, once);
});

test('operasi shot lewat EditorSession adalah satu langkah undo yang dapat dibatalkan', () => {
  const doc = demoDocument();
  const store = new DocumentStore(doc);
  const session = new EditorSession(store);
  const before = clone(store.doc);
  store.flush();
  const shot = addShot(store.scene, {id: ids});
  store.reload(store.sceneId, shot.id);
  session.commit();
  assert.equal(store.scene.shots.length, 2);
  session.undo();
  assert.equal(store.scene.shots.length, 1);
  assert.deepEqual(store.doc, before);
  session.redo();
  assert.equal(store.scene.shots.length, 2);
});

test('writeSceneView hanya menyentuh shot aktif', () => {
  const doc = demoDocument();
  const scene = doc.scenes[0];
  const b = addShot(scene, {id: ids});
  const beforeB = clone(b);
  const view = {
    title: doc.title, duration: scene.shots[0].duration,
    actors: scene.actors.map(a => ({...a, keys: scene.shots[0].tracks.find(t => t.objectId === a.id).keys})),
    rooms: scene.setObjects.map(r => ({...r})),
    camera: {...scene.shots[0].camera, target: scene.shots[0].camera.targetId,
      keys: scene.shots[0].tracks.find(t => t.objectId === scene.shots[0].camera.id).keys},
  };
  view.actors[0].keys = [...view.actors[0].keys, {t: 8, x: 0, z: 0, r: 0}];
  writeSceneView(doc, scene.id, scene.shots[0].id, view);
  validateDocument(doc);
  assert.deepEqual(scene.shots.find(s => s.id === b.id), beforeB);
  assert.equal(scene.shots[0].tracks[0].keys.length, 4);
});

test('navigasi shot menyegarkan entri history, bukan menambah langkah undo', () => {
  const doc = demoDocument();
  const store = new DocumentStore(doc);
  const session = new EditorSession(store);
  store.flush();
  const shot = addShot(store.scene, {id: ids});
  store.reload(store.sceneId, shot.id);
  session.commit();
  const steps = session.history.entries.length;

  // Pindah kembali ke shot pertama lalu rebase: tidak ada langkah baru…
  store.activate(store.sceneId, store.scene.shots[0].id);
  session.rebase();
  assert.equal(session.history.entries.length, steps, 'navigasi tidak boleh menambah langkah undo');
  assert.equal(JSON.parse(session.history.entries[session.history.index]).scenes[0].activeShotId, store.shotId);

  // …dan undo berikutnya tidak melompat kembali ke shot yang tadi dibuka.
  session.undo();
  assert.equal(store.scene.shots.length, 1);
});

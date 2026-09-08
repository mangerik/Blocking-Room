import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {validateProject} from '../src/model.js';
import {SCHEMA_VERSION, SchemaTooNewError, validateDocument} from '../src/schema.js';
import {DEFAULT_FPS, V2_SCHEMA_VERSION, detectVersion, migrateV1ToV2, migrateV2ToV3, openProjectData} from '../src/migrate.js';
import {DocumentStore, readSceneView} from '../src/document.js';
import {sample} from '../src/model.js';
import {sampleActor} from '../src/timeline-engine.js';
import {baselineOf} from './fixtures/baseline.mjs';
import {validFixtures, invalidFixtures} from './fixtures/generate.mjs';

const dir = new URL('./fixtures/', import.meta.url).pathname;
const readV1 = name => JSON.parse(readFileSync(join(dir, 'v1', `${name}.json`), 'utf8'));
const clone = value => JSON.parse(JSON.stringify(value));

test('deteksi versi membedakan v1, v2 dan data asing', () => {
  assert.equal(detectVersion(readV1('demo-scene')), 1);
  assert.equal(detectVersion({schemaVersion: 2}), 2);
  assert.equal(detectVersion({schemaVersion: 7}), 7);
  assert.equal(detectVersion([1, 2, 3]), null);
  assert.equal(detectVersion(null), null);
});

test('migrasi menghasilkan satu proyek, satu scene, satu shot default', () => {
  const {document, migrated, sourceVersion} = openProjectData(readV1('demo-scene'));
  assert.equal(migrated, true);
  assert.equal(sourceVersion, 1);
  assert.equal(document.schemaVersion, SCHEMA_VERSION);
  assert.equal(document.scenes.length, 1);
  const scene = document.scenes[0];
  assert.equal(scene.projectId, document.id);
  assert.equal(document.activeSceneId, scene.id);
  assert.equal(scene.shots.length, 1);
  const shot = scene.shots[0];
  assert.equal(shot.sceneId, scene.id);
  assert.equal(scene.activeShotId, shot.id);
  assert.equal(shot.duration, 12);
  assert.equal(shot.fps, DEFAULT_FPS);
  assert.equal(shot.aspectRatio, '16:9');
  // Identitas aktor/set milik scene; track gerak dan kamera milik shot.
  assert.deepEqual(scene.actors.map(a => a.id), ['a1', 'a2', 'a3']);
  // v3: `setObjects` berisi ruangan LALU prop hasil migrasi dekorasi (F4-07).
  assert.deepEqual(scene.setObjects.filter(o => o.type === 'room').map(r => r.id), ['r1', 'r2', 'r3']);
  assert.ok(scene.setObjects.filter(o => o.type === 'prop').length > 0, 'dekorasi contoh menjadi prop ber-ID');
  // v3: dua track per aktor (position + rotation) + satu track pose kamera.
  assert.equal(shot.tracks.length, 3 * 2 + 1);
  assert.deepEqual(shot.tracks.map(t => t.property), ['position', 'rotation', 'position', 'rotation', 'position', 'rotation', 'pose']);
  assert.equal(shot.camera.id, 'camera');
  assert.equal(shot.cameraId, 'camera');
});

test('sampling awal/tengah/akhir setara sebelum dan sesudah migrasi', () => {
  for (const name of Object.keys(validFixtures)) {
    const source = validateProject(readV1(name));
    const before = baselineOf(source);
    const {document} = openProjectData(readV1(name));
    const after = baselineOf(readSceneView(document));
    assert.deepEqual(after, before, `pose berubah setelah migrasi: ${name}`);
    assert.deepEqual(after, JSON.parse(readFileSync(join(dir, 'baseline', `${name}.json`), 'utf8')), `beda dengan golden: ${name}`);
  }
});

test('migrasi mempertahankan nama, focal, target, kamera null, pintu dan flag lock/hide', () => {
  const {document} = openProjectData(readV1('locked-hidden'));
  const scene = document.scenes[0], shot = scene.shots[0];
  assert.equal(document.title, 'Status objek terkunci dan tersembunyi');
  assert.equal(scene.actors[0].locked, true);
  assert.equal(scene.actors[1].visible, false);
  assert.equal(scene.actors[2].locked, true);
  assert.equal(scene.actors[2].visible, false);
  assert.equal(scene.setObjects[0].locked, false);
  assert.equal(scene.setObjects[1].visible, false);
  assert.equal(shot.camera.locked, true);
  assert.equal(shot.camera.visible, false);
  assert.equal(shot.camera.focal, 35);
  assert.equal(shot.camera.targetId, 'a1');

  const doors = openProjectData(readV1('doors')).document.scenes[0].setObjects;
  assert.deepEqual(doors[0].doors, [
    {wall: 'back', offset: -1, width: 1.2, height: 2.1},
    {wall: 'left', offset: 1.5, width: 1.6, height: 2.4},
  ]);
  assert.equal(doors[2].doors.length, 1);

  const noCamera = openProjectData(readV1('camera-null')).document.scenes[0].shots[0];
  assert.equal(noCamera.camera, null);
  assert.equal(noCamera.cameraId, null);
  assert.equal(noCamera.tracks.length, 3 * 2);
});

test('roundtrip serialize dokumen v2 tidak mengubah isi maupun pose', () => {
  for (const name of Object.keys(validFixtures)) {
    const {document} = openProjectData(readV1(name));
    const roundtrip = validateDocument(JSON.parse(JSON.stringify(document)));
    assert.deepEqual(roundtrip, document, `roundtrip berbeda: ${name}`);
    assert.deepEqual(baselineOf(readSceneView(roundtrip)), baselineOf(readSceneView(document)), name);
    // Membuka ulang dokumen v2 tidak memicu migrasi dan mempertahankan seluruh ID.
    const reopened = openProjectData(JSON.parse(JSON.stringify(document)));
    assert.equal(reopened.migrated, false);
    assert.equal(reopened.document.id, document.id);
    assert.deepEqual(reopened.document, document);
  }
});

test('migrasi gagal tidak menyentuh sumber dan tidak menghasilkan dokumen', () => {
  for (const name of Object.keys(invalidFixtures)) {
    const source = readV1(name);
    const before = clone(source);
    assert.throws(() => openProjectData(source), `seharusnya ditolak: ${name}`);
    assert.deepEqual(source, before, `sumber berubah: ${name}`);
  }
});

test('dokumen aktif bertahan ketika membuka data rusak (rollback)', () => {
  const store = new DocumentStore(openProjectData(readV1('demo-scene')).document);
  const before = clone(store.doc);
  for (const name of Object.keys(invalidFixtures)) {
    assert.throws(() => store.load(openProjectData(readV1(name)).document));
  }
  assert.deepEqual(store.doc, before);
  assert.deepEqual(store.view, readSceneView(before));
});

test('schema lebih baru ditolak dengan pesan khusus dan sumber utuh', () => {
  const {document} = openProjectData(readV1('demo-scene'));
  const future = {...clone(document), schemaVersion: SCHEMA_VERSION + 1};
  const before = clone(future);
  assert.throws(() => openProjectData(future), SchemaTooNewError);
  assert.throws(() => validateDocument(clone(future)), SchemaTooNewError);
  assert.deepEqual(future, before);
  try {openProjectData(future);} catch (error) {
    assert.equal(error.version, SCHEMA_VERSION + 1);
    assert.match(error.message, /lebih baru/);
  }
});

test('migrateV1ToV2 tidak memutasi input dan memakai generator ID yang diberikan', () => {
  const source = readV1('walk-path');
  const before = clone(source);
  let n = 0;
  const document = migrateV1ToV2(source, {id: () => `id-${++n}`, now: () => '2026-01-01T00:00:00.000Z'});
  assert.deepEqual(source, before);
  assert.equal(document.schemaVersion, V2_SCHEMA_VERSION);
  assert.equal(document.id, 'id-1');
  assert.equal(document.scenes[0].id, 'id-2');
  assert.equal(document.scenes[0].shots[0].id, 'id-3');
  assert.equal(document.createdAt, '2026-01-01T00:00:00.000Z');
  // `migrateV1ToV2` menghasilkan v2; validator sekarang menuntut v3, jadi rantai
  // migrasi diselesaikan lebih dahulu — persis yang dilakukan `openProjectData`.
  validateDocument(migrateV2ToV3(document, {id: () => `prop-${++n}`}));
});

// -------------------------------------------------------------- v2 → v3 (Fase 4b)
test('migrateV2ToV3 memecah track pose aktor menjadi position dan rotation', () => {
  const v2 = migrateV1ToV2(readV1('demo-scene'));
  const before = clone(v2);
  const v3 = migrateV2ToV3(v2);
  assert.deepEqual(v2, before, 'copy-first: dokumen v2 sumber tidak boleh dimutasi');
  assert.equal(v3.schemaVersion, SCHEMA_VERSION);
  const shot = v3.scenes[0].shots[0];
  for (const actor of v3.scenes[0].actors) {
    const pose = before.scenes[0].shots[0].tracks.find(t => t.objectId === actor.id);
    const position = shot.tracks.find(t => t.objectId === actor.id && t.property === 'position');
    const rotation = shot.tracks.find(t => t.objectId === actor.id && t.property === 'rotation');
    assert.deepEqual(position.keys, pose.keys.map(k => ({t: k.t, x: k.x, z: k.z})));
    assert.deepEqual(rotation.keys, pose.keys.map(k => ({t: k.t, r: k.r})));
    assert.equal(position.interpolation, 'linear');
    assert.equal(rotation.interpolation, 'linear');
  }
  // Track kamera tetap `pose`, apa adanya.
  const camera = shot.tracks.find(t => t.objectId === 'camera');
  assert.equal(camera.property, 'pose');
  assert.deepEqual(camera.keys, before.scenes[0].shots[0].tracks.find(t => t.objectId === 'camera').keys);
});

test('sampling identik dalam toleransi 1e-9 sebelum dan sesudah pemecahan track', () => {
  for (const name of Object.keys(validFixtures)) {
    const v2 = migrateV1ToV2(readV1(name));
    const v3 = migrateV2ToV3(clone(v2));
    const shotV2 = v2.scenes[0].shots[0], shotV3 = v3.scenes[0].shots[0];
    for (const actor of v2.scenes[0].actors) {
      const pose = shotV2.tracks.find(t => t.objectId === actor.id);
      const position = shotV3.tracks.find(t => t.objectId === actor.id && t.property === 'position');
      const rotation = shotV3.tracks.find(t => t.objectId === actor.id && t.property === 'rotation');
      // 200 titik sampel per track, bukan hanya awal/tengah/akhir.
      for (let i = 0; i <= 200; i += 1) {
        const t = shotV2.duration * i / 200;
        const expected = sample(pose.keys, t);
        const actual = sampleActor({position, rotation}, t);
        for (const field of ['x', 'z', 'r']) {
          assert.ok(Math.abs(actual[field] - expected[field]) <= 1e-9,
            `${name}/${actor.id}/${field} t=${t}: ${actual[field]} != ${expected[field]}`);
        }
      }
    }
  }
});

test('dekorasi contoh menjadi prop ber-ID dengan pose dunia yang sama', () => {
  const v2 = migrateV1ToV2(readV1('demo-scene'));
  const rooms = v2.scenes[0].setObjects;
  const v3 = migrateV2ToV3(clone(v2), {id: (() => {let n = 0; return () => `prop-${++n}`;})()});
  const props = v3.scenes[0].setObjects.filter(o => o.type === 'prop');
  assert.ok(props.length >= 15);
  assert.equal(new Set(props.map(p => p.id)).size, props.length, 'ID prop harus unik');
  // Renderer lama menggambar dekorasi di dalam grup ruangan pada (room.x, 0, room.z);
  // koordinat dunia prop karena itu harus pusat ruangan + offset lokal yang sama.
  const sofa = props.find(p => p.name === 'Sofa foyer');
  assert.equal(sofa.x, rooms[0].x - rooms[0].w * 0.22);
  assert.equal(sofa.z, rooms[0].z - rooms[0].d * 0.25);
  assert.equal(sofa.y, 0.4);
  const bench = props.find(p => p.name === 'Bangku panjang');
  assert.equal(bench.x, rooms[2].x);
  assert.equal(bench.w, rooms[2].w * 0.42);
});

test('dokumen v2 tersimpan dibuka tanpa ditolak dan tanpa memutasi sumbernya', () => {
  const v2 = migrateV1ToV2(readV1('walk-path'));
  const stored = clone(v2);
  const opened = openProjectData(stored);
  assert.deepEqual(stored, clone(v2), 'copy-first: baris tersimpan tidak boleh berubah');
  assert.equal(opened.sourceVersion, 2);
  assert.equal(opened.migrated, true);
  assert.equal(opened.document.schemaVersion, SCHEMA_VERSION);
  // Gerak lama tetap sama persis ketika dibaca kembali sebagai scene view.
  const view = readSceneView(opened.document);
  for (const track of v2.scenes[0].shots[0].tracks) {
    const actor = view.actors.find(a => a.id === track.objectId);
    if (actor) assert.deepEqual(actor.keys, track.keys);
  }
});

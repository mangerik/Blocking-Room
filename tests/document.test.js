import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {DocumentStore, emptyDocument, readSceneView, writeSceneView} from '../src/document.js';
import {EditorSession, describeSkipped, partitionByLock} from '../src/commands.js';
import {openProjectData} from '../src/migrate.js';
import {validateDocument} from '../src/schema.js';
import {BACKUP_KEY, STORAGE_KEY, loadDocument, saveDocument} from '../src/storage.js';
import {sampleScene, trimTrackToDuration} from '../src/timeline-engine.js';

const dir = new URL('./fixtures/', import.meta.url).pathname;
const readV1 = name => JSON.parse(readFileSync(join(dir, 'v1', `${name}.json`), 'utf8'));
const clone = value => JSON.parse(JSON.stringify(value));
const demoDocument = () => openProjectData(readV1('demo-scene')).document;

/** Dokumen dua scene: scene kedua adalah salinan dengan ID baru. */
function twoScenes() {
  const doc = demoDocument();
  const source = doc.scenes[0];
  const second = clone(source);
  second.id = 'scene-2';
  second.order = 1;
  second.name = 'Scene 02';
  second.shots[0].id = 'shot-2';
  second.shots[0].sceneId = 'scene-2';
  second.activeShotId = 'shot-2';
  doc.scenes.push(second);
  return validateDocument(doc);
}

test('scene view adalah salinan: memutasinya belum mengubah dokumen', () => {
  const doc = demoDocument();
  const view = readSceneView(doc);
  view.actors[0].keys[0].x = 999;
  view.title = 'Judul lain';
  assert.equal(doc.scenes[0].shots[0].tracks[0].keys[0].x, -5);
  assert.equal(doc.title, 'Pertemuan di galeri');
});

test('mengedit scene aktif tidak pernah memutasi scene lain', () => {
  const doc = twoScenes();
  const store = new DocumentStore(doc);
  store.activate('scene-2', 'shot-2');
  const untouched = clone(store.doc.scenes[0]);
  store.view.actors[0].keys[0].x = 42;
  store.view.actors[0].name = 'Diubah di scene 2';
  store.view.rooms[0].locked = false;
  store.view.duration = 8;
  store.flush();
  assert.deepEqual(store.doc.scenes[0], untouched);
  assert.equal(store.doc.scenes[1].shots[0].tracks[0].keys[0].x, 42);
  assert.equal(store.doc.scenes[1].actors[0].name, 'Diubah di scene 2');
  assert.equal(store.doc.scenes[1].shots[0].duration, 8);
  assert.equal(store.doc.scenes[0].shots[0].duration, 12);
});

test('berpindah scene menyimpan perubahan scene sebelumnya', () => {
  const store = new DocumentStore(twoScenes());
  store.view.actors[0].name = 'Alex scene 1';
  store.activate('scene-2', 'shot-2');
  assert.equal(store.doc.scenes[0].actors[0].name, 'Alex scene 1');
  assert.equal(store.view.actors[0].name, 'Alex');
  store.activate('scene-2');
  assert.equal(store.sceneId, 'scene-2');
});

test('read/write scene view stabil: flush tanpa perubahan menghasilkan dokumen identik', () => {
  const doc = demoDocument();
  const before = clone(doc);
  writeSceneView(doc, doc.activeSceneId, doc.scenes[0].activeShotId, readSceneView(doc));
  assert.deepEqual(doc, before);
  // field yang tidak diwakili view dipertahankan
  assert.equal(doc.scenes[0].shots[0].fps, before.scenes[0].shots[0].fps);
  assert.equal(doc.scenes[0].name, 'Scene 01');
});

test('perubahan tanpa isi baru tidak membuat langkah undo tambahan', () => {
  const session = new EditorSession(new DocumentStore(demoDocument()));
  assert.equal(session.canUndo, false);
  session.commit();
  session.commit();
  assert.equal(session.canUndo, false);
  session.view.actors[0].name = 'Alex baru';
  session.commit();
  assert.equal(session.canUndo, true);
  session.commit();
  session.undo();
  assert.equal(session.view.actors[0].name, 'Alex');
  assert.equal(session.canUndo, false);
});

test('satu transaksi gestur menjadi satu langkah undo', () => {
  const session = new EditorSession(new DocumentStore(demoDocument()));
  session.begin();
  for (let i = 1; i <= 20; i++) {
    session.view.actors[0].keys[0].x = i;
    session.commit();
  }
  session.end();
  assert.equal(session.view.actors[0].keys[0].x, 20);
  session.undo();
  assert.equal(session.view.actors[0].keys[0].x, -5);
  assert.equal(session.canUndo, false);
});

test('undo memulihkan scene aktif yang tersimpan dalam dokumen', () => {
  const store = new DocumentStore(twoScenes());
  const session = new EditorSession(store);
  store.activate('scene-2', 'shot-2');
  session.view.actors[0].name = 'Diedit di scene 2';
  session.commit();
  store.activate(store.doc.scenes[0].id);
  session.view.actors[0].name = 'Diedit di scene 1';
  session.commit();
  session.undo();
  // Undo kembali ke langkah saat scene 2 aktif — scene aktif ikut dipulihkan.
  assert.equal(store.sceneId, 'scene-2');
  assert.equal(store.view.actors[0].name, 'Diedit di scene 2');
  assert.equal(store.doc.scenes[0].actors[0].name, 'Alex');
});

test('scope undo terpisah per proyek', () => {
  const session = new EditorSession(new DocumentStore(demoDocument()));
  session.view.actors[0].name = 'Proyek A diedit';
  session.commit();
  assert.equal(session.canUndo, true);
  const other = demoDocument(); // proyek berbeda: ID baru
  session.openDocument(other);
  assert.equal(session.canUndo, false, 'undo proyek lain tidak boleh terjangkau');
  session.undo();
  assert.equal(session.view.actors[0].name, 'Alex');
});

test('membuka ulang proyek yang sama tetap dapat di-undo', () => {
  const store = new DocumentStore(demoDocument());
  const session = new EditorSession(store);
  session.view.actors[0].name = 'Sebelum impor';
  session.commit();
  const imported = clone(store.doc);
  imported.title = 'Hasil impor';
  session.openDocument(imported);
  assert.equal(session.view.title, 'Hasil impor');
  session.undo();
  assert.equal(session.view.title, 'Pertemuan di galeri');
  assert.equal(session.view.actors[0].name, 'Sebelum impor');
});

test('command yang tidak valid dibatalkan dan dokumen kembali ke keadaan valid terakhir', () => {
  const store = new DocumentStore(demoDocument());
  const session = new EditorSession(store);
  const before = clone(store.doc);
  assert.throws(() => session.run(view => {view.actors[0].height = 99;}));
  assert.deepEqual(store.doc, before);
  assert.equal(store.view.actors[0].height, 1.78);
  session.run(view => {view.actors[0].height = 1.9;});
  assert.equal(store.doc.scenes[0].actors[0].height, 1.9);
});

test('operasi massal melewati objek terkunci dan melaporkannya', () => {
  const store = new DocumentStore(openProjectData(readV1('locked-hidden')).document);
  const session = new EditorSession(store);
  const {applied, skipped} = session.runBulk(store.view.actors, actor => {actor.name = `${actor.name} ✓`;});
  assert.deepEqual(applied, []);
  assert.deepEqual(skipped.map(s => s.reason), ['terkunci', 'tersembunyi', 'terkunci']);
  assert.match(describeSkipped(skipped), /Alex \(terkunci\)/);
  assert.equal(store.doc.scenes[0].actors[0].name, 'Alex');

  const open = new DocumentStore(demoDocument());
  const session2 = new EditorSession(open);
  const result = session2.runBulk(open.view.actors, actor => {actor.height = 1.8;});
  assert.equal(result.applied.length, 3);
  assert.equal(result.skipped.length, 0);
  assert.ok(open.doc.scenes[0].actors.every(a => a.height === 1.8));

  const mixed = partitionByLock([{id: 'a', name: 'A', locked: true}, {id: 'b', name: 'B', visible: false}], {skipHidden: false});
  assert.deepEqual(mixed.editable.map(i => i.id), ['b']);
  assert.deepEqual(mixed.skipped.map(i => i.id), ['a']);
});

test('preview dan ekspor memakai fungsi sampling yang sama', () => {
  const view = readSceneView(demoDocument());
  const first = sampleScene(view, 6);
  assert.deepEqual(sampleScene(view, 6), first);
  assert.equal(first.camera.following, 'a1');
  // Kamera mengikuti aktor: titik pandang mengikuti pose aktor pada waktu yang sama.
  const alex = first.actors.find(a => a.id === 'a1');
  assert.equal(first.camera.target.x, alex.pose.x);
  assert.equal(first.camera.target.z, alex.pose.z);
  // Di luar rentang durasi waktu dijepit, bukan diekstrapolasi.
  assert.deepEqual(sampleScene(view, 99).actors[0].pose, sampleScene(view, view.duration).actors[0].pose);
});

test('memendekkan durasi mempertahankan pose pada titik potong', () => {
  const view = readSceneView(demoDocument());
  const keys = view.actors[0].keys;
  const poseAt7 = sampleScene(view, 7).actors[0].pose;
  const trimmed = trimTrackToDuration(keys, 7);
  assert.ok(trimmed.every(k => k.t <= 7));
  assert.equal(trimmed.at(-1).t, 7);
  assert.equal(trimmed.at(-1).x, poseAt7.x);
  assert.equal(trimmed.at(-1).r, poseAt7.r);
});

test('dokumen kosong valid dan memiliki satu scene serta satu shot', () => {
  const doc = validateDocument(emptyDocument({title: 'Baru'}));
  assert.equal(doc.scenes.length, 1);
  assert.equal(doc.scenes[0].shots.length, 1);
  assert.equal(doc.scenes[0].actors.length, 0);
  assert.equal(readSceneView(doc).camera, null);
});

// --- Penyimpanan lokal (Fase 1: masih localStorage, IndexedDB pada Fase 2) ---
const fakeStorage = () => {
  const map = new Map();
  return {
    map,
    getItem: k => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: k => map.delete(k),
  };
};

test('storage memigrasikan v1 lama saat dibaca dan menyimpan cadangan sumber', () => {
  const storage = fakeStorage();
  const raw = JSON.stringify(readV1('demo-scene'));
  storage.setItem(STORAGE_KEY, raw);
  const result = loadDocument(storage);
  assert.equal(result.migrated, true);
  assert.equal(result.error, null);
  assert.equal(result.document.schemaVersion, 2);
  assert.equal(storage.getItem(BACKUP_KEY), raw, 'sumber v1 harus dicadangkan sebelum ditimpa');
  assert.equal(storage.getItem(STORAGE_KEY), raw, 'membaca tidak boleh menimpa sumber');
  saveDocument(result.document, storage);
  const reloaded = loadDocument(storage);
  assert.equal(reloaded.migrated, false);
  assert.equal(reloaded.document.id, result.document.id);
  assert.notEqual(reloaded.document.updatedAt, undefined);
});

test('storage rusak tidak ditimpa dan dilaporkan sebagai error', () => {
  const storage = fakeStorage();
  storage.setItem(STORAGE_KEY, '{bukan json');
  const result = loadDocument(storage);
  assert.equal(result.document, null);
  assert.ok(result.error instanceof Error);
  assert.equal(result.backedUp, true);
  assert.equal(storage.getItem(BACKUP_KEY), '{bukan json');
  assert.equal(storage.getItem(STORAGE_KEY), '{bukan json');
  assert.deepEqual(loadDocument(fakeStorage()), {document: null, migrated: false, error: null, backedUp: false});
});

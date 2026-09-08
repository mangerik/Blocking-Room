// Unit test Fase 3: rute, operasi scene, trash/metadata repository, dan paket proyek.
// IndexedDB dipalsukan oleh tests/helpers/fake-indexeddb.mjs (tanpa dependency baru).
import test from 'node:test';
import assert from 'node:assert/strict';
import {FakeIndexedDB, FakeKeyRange} from './helpers/fake-indexeddb.mjs';
import {ProjectRepository, TRASH_RETENTION_DAYS} from '../src/repository.js';
import {parseRoute, projectRoute} from '../src/routing.js';
import {
  DocumentStore, addScene, cloneProjectDocument, duplicateScene, emptyDocument,
  moveScene, nextSceneName, removeScene, renameScene,
} from '../src/document.js';
import {validateDocument} from '../src/schema.js';
import {buildPackage, isPackage, readPackage, packageFileName} from '../src/package.js';
import {uniqueTitle} from '../src/dashboard-support.js';
import {initialProject} from '../src/model.js';
import {openProjectData} from '../src/migrate.js';

const demoDocument = () => openProjectData(initialProject()).document;
const freshRepository = async () => {
  const repository = new ProjectRepository({factory: new FakeIndexedDB(), keyRange: FakeKeyRange});
  await repository.open();
  return repository;
};

// ---------------------------------------------------------------- rute

test('rute hash memisahkan dashboard, trash dan editor', () => {
  assert.deepEqual(parseRoute('#/'), {name: 'dashboard', view: 'projects'});
  assert.deepEqual(parseRoute('#/trash'), {name: 'dashboard', view: 'trash'});
  assert.deepEqual(parseRoute('#/project/abc-123'), {name: 'editor', projectId: 'abc-123'});
  // URL polos membuka editor proyek terakhir (keputusan F3-01).
  assert.deepEqual(parseRoute(''), {name: 'editor', projectId: null});
  assert.deepEqual(parseRoute('#/entah'), {name: 'editor', projectId: null});
  assert.equal(parseRoute(projectRoute('id dengan spasi')).projectId, 'id dengan spasi');
});

// ---------------------------------------------------------------- operasi scene (F3-04)

test('scene baru punya set, aktor dan track sendiri', () => {
  const doc = demoDocument();
  const scene = addScene(doc);
  validateDocument(doc);
  assert.equal(doc.scenes.length, 2);
  assert.equal(scene.actors.length, 0);
  assert.equal(scene.setObjects.length, 0);
  assert.equal(scene.shots.length, 1);
  assert.equal(scene.shots[0].camera, null);
  assert.equal(scene.order, 1);
  // Mengedit scene baru lewat DocumentStore tidak menyentuh scene pertama.
  const store = new DocumentStore(doc);
  const before = JSON.stringify(doc.scenes[0]);
  store.activate(scene.id);
  store.view.rooms.push({id: 'ruang-baru', name: 'Ruang', x: 0, z: 0, w: 4, d: 4, h: 3, color: '#c5c8b3', doors: [], locked: true, visible: true});
  store.flush();
  assert.equal(JSON.stringify(doc.scenes[0]), before);
  assert.equal(doc.scenes[1].setObjects.length, 1);
});

test('duplicate scene memetakan ulang ID tanpa memutus hubungan', () => {
  const doc = demoDocument();
  const source = doc.scenes[0];
  const copy = duplicateScene(doc, source.id);
  validateDocument(doc);
  const sourceIds = new Set([source.id, ...source.actors.map(a => a.id), ...source.setObjects.map(o => o.id),
    ...source.shots.flatMap(s => [s.id, s.camera?.id].filter(Boolean))]);
  const copyIds = [copy.id, ...copy.actors.map(a => a.id), ...copy.setObjects.map(o => o.id),
    ...copy.shots.flatMap(s => [s.id, s.camera?.id].filter(Boolean))];
  assert.ok(copyIds.every(id => !sourceIds.has(id)), 'tidak ada ID yang dipakai bersama');
  const shot = copy.shots[0];
  assert.ok(copy.actors.some(a => a.id === shot.camera.targetId), 'kamera mengikuti aktor salinan');
  for (const track of shot.tracks) {
    assert.ok([...copy.actors.map(a => a.id), shot.camera.id].includes(track.objectId), 'track menunjuk objek salinan');
  }
  assert.deepEqual(shot.tracks.map(t => t.keys), source.shots[0].tracks.map(t => t.keys), 'keyframe identik');
  assert.equal(copy.name, `${source.name} (salinan)`);
  assert.equal(copy.thumbnailRef, null, 'salinan tidak mewarisi thumbnail scene asal');
  assert.deepEqual(doc.scenes.map(s => s.order), [0, 1]);
});

test('scene terakhir tidak boleh dihapus dan urutan selalu dinomori ulang', () => {
  const doc = demoDocument();
  assert.throws(() => removeScene(doc, doc.scenes[0].id), /minimal satu scene/);
  const second = addScene(doc);
  const third = addScene(doc);
  assert.deepEqual(doc.scenes.map(s => s.order), [0, 1, 2]);
  moveScene(doc, third.id, -1);
  assert.deepEqual(doc.scenes.map(s => s.id), [doc.scenes[0].id, third.id, second.id]);
  assert.deepEqual(doc.scenes.map(s => s.order), [0, 1, 2]);
  assert.equal(moveScene(doc, doc.scenes[0].id, -1), null, 'batas atas tidak memindahkan apa pun');
  const next = removeScene(doc, third.id);
  validateDocument(doc);
  assert.equal(doc.scenes.length, 2);
  assert.equal(next.id, second.id, 'scene tetangga menjadi aktif');
  assert.deepEqual(doc.scenes.map(s => s.order), [0, 1]);
});

test('nama scene tidak boleh kosong dan nama duplikat diberi sufiks', () => {
  const doc = demoDocument();
  assert.throws(() => renameScene(doc, doc.scenes[0].id, '   '), /tidak boleh kosong/);
  renameScene(doc, doc.scenes[0].id, '  Foyer  ');
  assert.equal(doc.scenes[0].name, 'Foyer');
  const copy = duplicateScene(doc, doc.scenes[0].id);
  const again = duplicateScene(doc, doc.scenes[0].id);
  assert.notEqual(copy.name, again.name);
  assert.equal(nextSceneName(doc, 'Foyer'), 'Foyer (2)');
});

test('DocumentStore.reload memakai dokumen apa adanya setelah scene dihapus', () => {
  const doc = demoDocument();
  const second = addScene(doc);
  const store = new DocumentStore(doc);
  store.activate(second.id);
  removeScene(store.doc, second.id);
  // `activate` akan gagal menulis view ke scene yang sudah tidak ada; `reload` tidak.
  assert.throws(() => store.activate(second.id));
  const view = store.reload(store.doc.scenes[0].id);
  assert.equal(view.actors.length, 3);
  assert.equal(store.sceneId, store.doc.scenes[0].id);
});

// ---------------------------------------------------------------- metadata & trash (F3-01/F3-03)

test('metadata dashboard cukup untuk kartu tanpa membaca dokumen', async () => {
  const repository = await freshRepository();
  const doc = demoDocument();
  addScene(doc);
  await repository.saveDocument(doc, {revisionToken: 1});
  const [meta] = await repository.listProjects();
  assert.equal(meta.title, doc.title);
  assert.equal(meta.sceneCount, 2);
  assert.equal(meta.thumbnailRef, null);
  assert.equal(meta.lastOpenedAt, null);
  assert.ok(meta.updatedAt);
  assert.equal(meta.scenes, undefined, 'metadata tidak membawa isi scene');
});

test('lastOpenedAt bertahan melewati penyimpanan berikutnya', async () => {
  const repository = await freshRepository();
  const doc = demoDocument();
  await repository.saveDocument(doc, {revisionToken: 1});
  await repository.touchProject(doc.id, '2026-01-01T00:00:00.000Z');
  await repository.saveDocument(doc, {revisionToken: 2});
  const meta = await repository.getProject(doc.id);
  assert.equal(meta.lastOpenedAt, '2026-01-01T00:00:00.000Z');
});

test('rename memperbarui metadata dan dokumen dalam satu transaksi', async () => {
  const repository = await freshRepository();
  const doc = demoDocument();
  await repository.saveDocument(doc, {revisionToken: 1});
  await repository.renameProject(doc.id, 'Judul baru');
  assert.equal((await repository.getProject(doc.id)).title, 'Judul baru');
  assert.equal((await repository.getDocument(doc.id)).title, 'Judul baru');
});

test('delete menandai deletedAt, restore mengembalikan isi, hapus permanen membuang semuanya', async () => {
  const repository = await freshRepository();
  const doc = demoDocument();
  await repository.saveDocument(doc, {revision: true, revisionToken: 1});
  await repository.deleteProject(doc.id);
  assert.equal((await repository.listProjects()).length, 0, 'item trash tidak muncul di daftar biasa');
  const [trashed] = await repository.listProjects({includeDeleted: true});
  assert.ok(trashed.deletedAt);
  assert.ok(await repository.getDocument(doc.id), 'dokumen tetap ada selama di trash');
  assert.equal((await repository.listRevisions(doc.id)).length, 1, 'revisi tetap ada');

  await repository.restoreProject(doc.id);
  assert.equal((await repository.listProjects()).length, 1);
  assert.equal((await repository.getProject(doc.id)).deletedAt, null);

  await repository.deleteProject(doc.id, {permanent: true});
  assert.equal(await repository.getDocument(doc.id), null);
  assert.equal(await repository.getProject(doc.id), undefined);
  assert.equal((await repository.listRevisions(doc.id)).length, 0);
});

test('pembersihan trash hanya membuang item yang melewati 30 hari', async () => {
  const repository = await freshRepository();
  const old = demoDocument();
  const recent = cloneProjectDocument(old, {title: 'Baru dihapus'});
  await repository.saveDocument(old, {revisionToken: 1});
  await repository.saveDocument(recent, {revisionToken: 2});
  const day = 86400000;
  const now = Date.parse('2026-06-01T00:00:00.000Z');
  await repository.deleteProject(old.id);
  await repository.deleteProject(recent.id);
  // Stempel dipalsukan langsung pada metadata agar tidak bergantung pada jam nyata.
  await repository.transaction('projects', 'readwrite', async stores => {
    const oldMeta = await new Promise(r => {const q = stores.projects.get(old.id); q.onsuccess = () => r(q.result);});
    oldMeta.deletedAt = new Date(now - (TRASH_RETENTION_DAYS + 1) * day).toISOString();
    stores.projects.put(oldMeta);
    const recentMeta = await new Promise(r => {const q = stores.projects.get(recent.id); q.onsuccess = () => r(q.result);});
    recentMeta.deletedAt = new Date(now - 3 * day).toISOString();
    stores.projects.put(recentMeta);
  });
  const purged = await repository.purgeExpiredTrash({now});
  assert.deepEqual(purged, [old.id]);
  assert.equal(await repository.getDocument(old.id), null);
  assert.ok(await repository.getDocument(recent.id), 'item yang belum 30 hari tetap dapat dipulihkan');
});

test('thumbnail ditulis ke store assets tanpa menyentuh dokumen', async () => {
  const repository = await freshRepository();
  const doc = demoDocument();
  await repository.saveDocument(doc, {revisionToken: 1});
  const before = await repository.getDocument(doc.id);
  await repository.putThumbnail(doc.id, {id: `thumb-${doc.scenes[0].id}`, sceneId: doc.scenes[0].id, dataUrl: 'data:image/jpeg;base64,AAAA', byteSize: 4});
  assert.deepEqual(await repository.getDocument(doc.id), before, 'dokumen tidak berubah karena thumbnail');
  assert.equal((await repository.getProject(doc.id)).thumbnailRef, `thumb-${doc.scenes[0].id}`);
  assert.equal((await repository.listAssets(doc.id)).length, 1);
  await repository.deleteAsset(`thumb-${doc.scenes[0].id}`);
  assert.equal(await repository.getAsset(`thumb-${doc.scenes[0].id}`), null, 'aset hilang menjadi placeholder di dashboard');
});

// ---------------------------------------------------------------- paket (F3-07/F3-08)

test('paket berisi manifest, checksum dan bagian terpisah; roundtrip setara', async () => {
  const doc = demoDocument();
  addScene(doc);
  const pack = await buildPackage(doc, []);
  assert.ok(isPackage(pack));
  assert.equal(pack.manifest.format, 'blockingroom.package');
  assert.equal(pack.manifest.schemaVersion, 2);
  assert.equal(pack.manifest.counts.scenes, 2);
  assert.equal(pack.manifest.counts.assets, 0, 'paket tanpa aset tetap valid');
  for (const part of ['project', 'scenes', 'assets']) assert.match(pack.manifest.checksums[part], /^[0-9a-f]{64}$/);
  const roundtrip = await readPackage(JSON.parse(JSON.stringify(pack)));
  assert.deepEqual(roundtrip.document, doc, 'roundtrip menghasilkan dokumen identik');
  assert.equal(packageFileName('Adegan/1: uji'), 'Adegan1 uji.blockingroom.json');
});

test('paket membawa aset dan tetap lolos pemeriksaan integritas', async () => {
  const doc = demoDocument();
  const asset = {id: `thumb-${doc.scenes[0].id}`, sceneId: doc.scenes[0].id, kind: 'thumbnail', mimeType: 'image/jpeg', byteSize: 4, dataUrl: 'data:image/jpeg;base64,AAAA'};
  const pack = await buildPackage(doc, [asset]);
  const read = await readPackage(pack);
  assert.equal(read.assets.length, 1);
  assert.equal(read.assets[0].dataUrl, asset.dataUrl);
});

test('paket rusak, terlalu besar atau bukan paket ditolak sebelum mengganti apa pun', async () => {
  const doc = demoDocument();
  const pack = await buildPackage(doc, []);

  const tampered = JSON.parse(JSON.stringify(pack));
  tampered.scenes[0].name = 'Diubah tanpa izin';
  await assert.rejects(() => readPackage(tampered), /checksum tidak cocok/);

  const countMismatch = JSON.parse(JSON.stringify(pack));
  countMismatch.manifest.counts.scenes = 9;
  await assert.rejects(() => readPackage(countMismatch), /Jumlah scene/);

  const missingChecksum = JSON.parse(JSON.stringify(pack));
  delete missingChecksum.manifest.checksums.assets;
  await assert.rejects(() => readPackage(missingChecksum), /checksum/);

  await assert.rejects(() => readPackage(pack, {maxBytes: 10}), /melebihi batas/);
  await assert.rejects(() => readPackage({version: 1, title: 'v1'}), /bukan paket/);

  const future = JSON.parse(JSON.stringify(pack));
  future.manifest.packageVersion = 99;
  await assert.rejects(() => readPackage(future), /perbarui aplikasi/);
});

test('paket dengan dokumen tidak valid ditolak oleh validator schema', async () => {
  const doc = demoDocument();
  const pack = await buildPackage(doc, []);
  pack.scenes[0].shots[0].duration = 999;
  pack.manifest.checksums.scenes = (await buildPackage({...doc, scenes: pack.scenes}, [])).manifest.checksums.scenes;
  await assert.rejects(() => readPackage(pack), /Durasi shot tidak valid/);
});

// ---------------------------------------------------------------- konflik nama (F3-08)

test('judul yang bentrok diberi sufiks angka, bukan ditolak', () => {
  assert.equal(uniqueTitle('Proyek', []), 'Proyek');
  assert.equal(uniqueTitle('Proyek', ['Proyek']), 'Proyek 2');
  assert.equal(uniqueTitle('Proyek', ['Proyek', 'Proyek 2']), 'Proyek 3');
});

test('impor dokumen dengan ID bentrok menjadi proyek baru yang setara', () => {
  const original = demoDocument();
  const imported = cloneProjectDocument(original, {title: uniqueTitle(`${original.title} (impor)`, [original.title])});
  validateDocument(imported);
  assert.notEqual(imported.id, original.id);
  assert.equal(imported.scenes.length, original.scenes.length);
  assert.equal(imported.scenes[0].actors.length, original.scenes[0].actors.length);
  assert.notEqual(imported.scenes[0].id, original.scenes[0].id);
  assert.equal(imported.title, `${original.title} (impor)`);
});

test('proyek kosong dari template tetap dokumen v2 yang valid', () => {
  const doc = emptyDocument({title: 'Kosong'});
  validateDocument(doc);
  assert.equal(doc.scenes.length, 1);
  assert.equal(doc.scenes[0].actors.length, 0);
  assert.equal(doc.scenes[0].shots[0].camera, null);
});

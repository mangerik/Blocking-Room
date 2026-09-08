// Unit test Fase 2: repository, autosave, session state, migrasi dan kunci antartab.
// IndexedDB dipalsukan oleh `tests/helpers/fake-indexeddb.mjs` (tanpa dependency baru).
// Perilaku IndexedDB sungguhan diuji terpisah di `tests/repository-browser.mjs`.
import test from 'node:test';
import assert from 'node:assert/strict';
import {FakeIndexedDB, FakeKeyRange, FakeStorage} from './helpers/fake-indexeddb.mjs';
import {MIN_REVISIONS, ProjectRepository} from '../src/repository.js';
import {AutosaveController} from '../src/autosave.js';
import {SessionTracker, restoreSession} from '../src/session-state.js';
import {ProjectLock} from '../src/tab-lock.js';
import {bootstrap} from '../src/bootstrap.js';
import {emptyDocument, cloneProjectDocument} from '../src/document.js';
import {ACTIVE_PROJECT_KEY, BACKUP_KEY, MIGRATED_KEY, PENDING_KEY, STORAGE_KEY, writePendingDocument} from '../src/storage.js';
import {initialProject} from '../src/model.js';
import {V2_SCHEMA_VERSION, migrateV1ToV2, openProjectData} from '../src/migrate.js';
import {SCHEMA_VERSION} from '../src/schema.js';
import {DocumentStore} from '../src/document.js';

const newRepo = (options = {}) => new ProjectRepository({
  factory: new FakeIndexedDB(), keyRange: FakeKeyRange, ...options,
});

const docWith = (title, keys = [{t: 0, x: 0, z: 0, r: 0}]) => {
  const doc = emptyDocument({title});
  const scene = doc.scenes[0], shot = scene.shots[0];
  scene.actors.push({id: 'a1', type: 'actor', name: 'Alex', color: '#b7745a', height: 1.75, locked: false, visible: true, assetRef: null});
  // v3: dua track independen per aktor (F4-05).
  shot.tracks.push({objectId: 'a1', property: 'position', interpolation: 'linear', keys: keys.map(k => ({t: k.t, x: k.x, z: k.z}))});
  shot.tracks.push({objectId: 'a1', property: 'rotation', interpolation: 'linear', keys: keys.map(k => ({t: k.t, r: k.r}))});
  return doc;
};

/** Dokumen v2 apa adanya — bentuk yang sudah tersimpan di IndexedDB pengguna. */
const storedV2Document = () => migrateV1ToV2(initialProject());

test('repository menyimpan dokumen dan metadata dalam satu transaksi', async () => {
  const repo = await newRepo().open();
  const doc = docWith('Adegan koridor');
  const result = await repo.saveDocument(doc, {revision: true, revisionToken: 1});
  assert.equal(result.skipped, false);

  const stored = await repo.getDocument(doc.id);
  assert.equal(stored.title, 'Adegan koridor');
  assert.equal(stored.updatedAt, result.updatedAt, 'updatedAt distempel saat menyimpan');

  const [meta] = await repo.listProjects();
  assert.equal(meta.id, doc.id);
  assert.equal(meta.sceneCount, 1);
  assert.equal(meta.title, 'Adegan koridor');
  assert.equal(meta.deletedAt, null);
});

test('dua proyek berjudul sama tetap terisolasi', async () => {
  const repo = await newRepo().open();
  const a = docWith('Judul sama');
  const b = cloneProjectDocument(docWith('Judul sama'));
  await repo.saveDocument(a, {revisionToken: 1});
  await repo.saveDocument(b, {revisionToken: 1});
  assert.notEqual(a.id, b.id);

  const edited = JSON.parse(JSON.stringify(a));
  edited.scenes[0].shots[0].duration = 30;
  await repo.saveDocument(edited, {revisionToken: 2});

  assert.equal((await repo.getDocument(a.id)).scenes[0].shots[0].duration, 30);
  assert.equal((await repo.getDocument(b.id)).scenes[0].shots[0].duration, 12, 'proyek B tidak boleh ikut berubah');
  assert.equal((await repo.listProjects()).length, 2);
});

test('revision token lama tidak menimpa save yang lebih baru', async () => {
  const repo = await newRepo().open();
  const doc = docWith('Token');
  await repo.saveDocument(doc, {revisionToken: 5});
  const stale = JSON.parse(JSON.stringify(doc));
  stale.title = 'Respons lama';
  const result = await repo.saveDocument(stale, {revisionToken: 3});
  assert.equal(result.skipped, true);
  assert.equal((await repo.getDocument(doc.id)).title, 'Token');
});

test('revisi dipangkas tetapi selalu menyisakan minimal 10 snapshot', async () => {
  const repo = await newRepo({revisionLimit: 12}).open();
  const doc = docWith('Riwayat');
  for (let i = 1; i <= 25; i += 1) {
    doc.title = `Riwayat ${i}`;
    await repo.saveDocument(doc, {revision: true, revisionToken: i});
  }
  const list = await repo.listRevisions(doc.id);
  assert.equal(list.length, 12);
  assert.ok(list.length >= MIN_REVISIONS);
  assert.equal(list[0].title, 'Riwayat 25', 'terbaru lebih dahulu');
  assert.ok(list[0].createdAt >= list[1].createdAt);
  const restored = await repo.getRevision(list[3].id);
  assert.equal(restored.snapshot.title, 'Riwayat 22');
  assert.equal((await repo.latestRevision(doc.id)).snapshot.title, 'Riwayat 25');
});

test('transaksi yang gagal tidak meninggalkan penulisan sebagian', async () => {
  const repo = await newRepo().open();
  await assert.rejects(repo.transaction(['projects', 'documents'], 'readwrite', stores => {
    stores.projects.put({id: 'p1', title: 'setengah jadi'});
    throw new Error('kegagalan buatan');
  }), /kegagalan buatan/);
  assert.equal(await repo.getProject('p1'), undefined);
  assert.equal((await repo.listProjects()).length, 0);
});

test('session state disimpan per proyek dan dipulihkan dengan fallback aman', async () => {
  const repo = await newRepo().open();
  const doc = docWith('Sesi');
  await repo.saveDocument(doc, {revisionToken: 1});
  const tracker = new SessionTracker({repository: repo, throttle: 0});
  tracker.record({projectId: doc.id, sceneId: doc.scenes[0].id, shotId: doc.scenes[0].shots[0].id,
    selectedId: 'a1', playhead: 3.5, observerPose: {x: 1, y: 2, z: 3, targetX: 0, targetY: 0, targetZ: 0}, activeTool: 'move'});
  await tracker.flush();

  const state = await repo.getSession(doc.id);
  const good = restoreSession(doc, state);
  assert.equal(good.selectedId, 'a1');
  assert.equal(good.playhead, 3.5);
  assert.equal(good.activeTool, 'move');
  assert.equal(good.recovered, false);

  const gone = restoreSession(doc, {...state, sceneId: 'tidak-ada', shotId: 'tidak-ada', selectedId: 'sudah-dihapus', playhead: 999});
  assert.equal(gone.sceneId, doc.scenes[0].id, 'scene hilang → jatuh ke scene aktif dokumen');
  assert.equal(gone.selectedId, null, 'seleksi hilang tidak boleh menggagalkan pemulihan');
  assert.equal(gone.playhead, doc.scenes[0].shots[0].duration, 'playhead dijepit ke durasi');
  assert.equal(gone.recovered, true);
  assert.equal(restoreSession(doc, null).sceneId, doc.scenes[0].id);
  assert.equal(restoreSession(doc, {observerPose: {x: 'x'}}).observerPose, null);
});

test('perpindahan scene/shot/seleksi menembus throttle session state', async () => {
  const writes = [];
  let clock = 100000;
  const repo = {putSession: state => {writes.push({...state}); return Promise.resolve();}};
  const tracker = new SessionTracker({repository: repo, throttle: 1000, now: () => clock});
  const base = {projectId: 'p1', sceneId: 's1', shotId: 'h1', selectedId: 'a1', observerPose: null, activeTool: 'orbit'};

  tracker.record({...base, playhead: 0});
  assert.equal(writes.length, 1, 'catatan pertama ditulis langsung');

  // Playhead dan pose observer tetap dilindungi throttle: keduanya berubah tiap frame.
  clock = 100010; tracker.record({...base, playhead: 0.2});
  clock = 100020; tracker.record({...base, playhead: 0.4});
  assert.equal(writes.length, 1, 'playhead tidak boleh membanjiri IndexedDB');

  // Pindah shot lalu reload dalam <1 detik harus memulihkan shot yang benar.
  clock = 100030; tracker.record({...base, shotId: 'h2', playhead: 0.4});
  assert.equal(writes.length, 2, 'perpindahan shot ditulis seketika');
  assert.equal(writes[1].shotId, 'h2');

  clock = 100040; tracker.record({...base, shotId: 'h2', selectedId: 'a2', playhead: 0.4});
  assert.equal(writes.length, 3, 'perubahan seleksi ditulis seketika');
  assert.equal(writes[2].selectedId, 'a2');

  clock = 100050; tracker.record({...base, sceneId: 's2', shotId: 'h2', selectedId: 'a2', playhead: 0.4});
  assert.equal(writes.length, 4, 'perpindahan scene ditulis seketika');
  assert.equal(writes[3].sceneId, 's2');

  // Timer throttle yang masih menggantung tidak boleh menulis state basi sesudahnya.
  clock = 100060; tracker.record({...base, sceneId: 's2', shotId: 'h2', selectedId: 'a2', playhead: 1.2});
  await tracker.flush();
  assert.equal(writes.length, 5);
  assert.equal(writes[4].playhead, 1.2);
  assert.equal(writes[4].sceneId, 's2');
});

test('autosave menggabungkan banyak jadwal menjadi satu transaksi', async () => {
  const writes = [];
  const repo = {saveDocument: (doc, options) => {writes.push({title: doc.title, ...options}); return Promise.resolve({revisionId: options.revision ? 'r' : null, skipped: false});}};
  const statuses = [];
  const autosave = new AutosaveController({repository: repo, delay: 5, onStatus: s => statuses.push(s)});
  const doc = docWith('Satu');
  autosave.schedule(doc);
  doc.title = 'Dua';
  autosave.schedule(doc);
  doc.title = 'Tiga';
  autosave.schedule(doc);
  await autosave.flush();
  await new Promise(r => setTimeout(r, 20));
  // Leading + coalesce: perubahan pertama ditulis seketika, dua sisanya digabung.
  assert.equal(writes.length, 2, 'tiga gestur berturut-turut menjadi paling banyak dua penulisan');
  assert.equal(writes[0].title, 'Satu');
  assert.equal(writes.at(-1).title, 'Tiga', 'keadaan terakhir yang menang');
  assert.ok(writes.at(-1).revisionToken > writes[0].revisionToken, 'token naik, tidak pernah mundur');
  assert.equal(statuses.at(-1), 'saved');
  assert.ok(statuses.includes('saving'));
});

test('autosave melaporkan gagal dan mempertahankan dokumen di memori', async () => {
  const repo = {saveDocument: () => Promise.reject(new Error('kegagalan buatan'))};
  const events = [];
  const autosave = new AutosaveController({repository: repo, delay: 1, onStatus: (s, d) => events.push([s, d?.error?.message])});
  const doc = docWith('Gagal');
  autosave.schedule(doc);
  await autosave.flush();
  assert.equal(autosave.status, 'error');
  assert.equal(events.at(-1)[0], 'error');
  assert.equal(doc.title, 'Gagal', 'dokumen di memori tidak boleh disentuh oleh kegagalan simpan');
});

test('autosave tetap menulis proyek lama saat proyek diganti sebelum save selesai', async () => {
  const repo = await newRepo().open();
  const autosave = new AutosaveController({repository: repo, delay: 1});
  const a = docWith('Proyek A');
  const b = docWith('Proyek B');
  await repo.saveDocument(a, {revisionToken: 1});
  await repo.saveDocument(b, {revisionToken: 1});
  autosave.schedule(a);        // dijadwalkan untuk A
  a.title = 'Diubah setelah dijadwalkan';
  autosave.schedule(b);        // pengguna berpindah ke B sebelum timer jalan
  await autosave.flush();
  assert.equal((await repo.getDocument(a.id)).title, 'Proyek A', 'dokumen A tidak boleh berubah karena save B');
  assert.equal((await repo.getDocument(b.id)).title, 'Proyek B');
});

test('sesi baru setelah reload tetap boleh menimpa dokumen sesi sebelumnya', async () => {
  // Regresi: token yang mulai dari nol setiap reload membuat setiap penyimpanan
  // sesudah reload dianggap "respons lama" dan diam-diam dilewati.
  const repo = await newRepo().open();
  const doc = docWith('Sebelum reload');
  const first = new AutosaveController({repository: repo, delay: 1});
  first.schedule(doc);
  await first.flush();

  const afterReload = new AutosaveController({repository: repo, delay: 1});
  const edited = JSON.parse(JSON.stringify(doc));
  edited.title = 'Sesudah reload';
  afterReload.schedule(edited);
  await afterReload.flush();
  assert.equal(afterReload.status, 'saved');
  assert.equal((await repo.getDocument(doc.id)).title, 'Sesudah reload');
});

test('penyimpanan darurat saat tab ditutup mengirim seluruh permintaan seketika', async () => {
  const repo = await newRepo().open();
  const doc = docWith('Sebelum ditutup');
  await repo.saveDocument(doc, {revisionToken: 1});
  const autosave = new AutosaveController({repository: repo, delay: 10000});
  doc.title = 'Belum sempat tersimpan';
  autosave.schedule(doc);
  assert.equal(autosave.flushOnUnload(), true);
  await new Promise(r => setTimeout(r, 30));
  assert.equal((await repo.getDocument(doc.id)).title, 'Belum sempat tersimpan');
});

test('migrasi localStorage berjalan sekali dan tidak membuat proyek duplikat', async () => {
  const factory = new FakeIndexedDB();
  const storage = new FakeStorage();
  const raw = JSON.stringify(initialProject());
  storage.setItem(STORAGE_KEY, raw);
  const fallbackDocument = () => openProjectData(initialProject()).document;
  const lockFactory = projectId => new ProjectLock({projectId, storage, locks: null});

  const first = await bootstrap({repository: new ProjectRepository({factory, keyRange: FakeKeyRange}), storage, fallbackDocument, lockFactory});
  assert.equal(first.migrated, true);
  assert.equal(first.readOnly, false);
  assert.equal(storage.getItem(BACKUP_KEY), raw, 'sumber dicadangkan sebelum apa pun ditimpa');
  assert.equal(storage.getItem(STORAGE_KEY), raw, 'sumber lama tidak ditimpa (copy-first)');
  assert.equal(storage.getItem(MIGRATED_KEY), first.document.id, 'penanda migrasi ditulis setelah commit');
  assert.equal(storage.getItem(ACTIVE_PROJECT_KEY), first.document.id);
  first.lock.release();

  const second = await bootstrap({repository: new ProjectRepository({factory, keyRange: FakeKeyRange}), storage, fallbackDocument, lockFactory});
  assert.equal(second.migrated, false, 'migrasi kedua tidak boleh berjalan lagi');
  assert.equal(second.document.id, first.document.id);
  const repo = await new ProjectRepository({factory, keyRange: FakeKeyRange}).open();
  assert.equal((await repo.listProjects()).length, 1, 'tidak ada proyek duplikat');
  second.lock.release();
});

test('penanda migrasi tidak ditulis bila transaksi gagal', async () => {
  const storage = new FakeStorage();
  storage.setItem(STORAGE_KEY, JSON.stringify(initialProject()));
  const repository = new ProjectRepository({factory: new FakeIndexedDB(), keyRange: FakeKeyRange});
  await repository.open();
  repository.saveDocument = () => Promise.reject(new Error('kuota penuh'));
  const result = await bootstrap({repository, storage, fallbackDocument: () => openProjectData(initialProject()).document,
    lockFactory: projectId => new ProjectLock({projectId, storage, locks: null})});
  assert.equal(storage.getItem(MIGRATED_KEY), null, 'penanda hanya ditulis setelah commit sukses');
  assert.equal(result.error.message, 'kuota penuh');
});

// F4b: dokumen v2 yang SUDAH tersimpan di IndexedDB harus tetap dapat dibuka setelah
// `SCHEMA_VERSION` naik. Ini titik yang paling mudah terlewat — `bootstrap()` dahulu
// menyerahkan hasil `getDocument()` langsung ke `DocumentStore`, sehingga validator v3
// akan menolaknya dan pengguna kehilangan akses ke karyanya.
test('dokumen v2 tersimpan di IndexedDB dibuka lewat bootstrap dan disimpan ulang sebagai v3', async () => {
  const factory = new FakeIndexedDB();
  const storage = new FakeStorage();
  const repo = await new ProjectRepository({factory, keyRange: FakeKeyRange}).open();
  const legacy = storedV2Document();
  assert.equal(legacy.schemaVersion, V2_SCHEMA_VERSION);
  await repo.saveDocument(legacy, {revisionToken: 1});
  storage.setItem(ACTIVE_PROJECT_KEY, legacy.id);
  storage.setItem(MIGRATED_KEY, legacy.id); // migrasi localStorage sudah pernah berjalan

  const boot = await bootstrap({repository: new ProjectRepository({factory, keyRange: FakeKeyRange}), storage,
    fallbackDocument: () => openProjectData(initialProject()).document,
    lockFactory: id => new ProjectLock({projectId: id, storage, locks: null})});

  assert.equal(boot.error, null, 'dokumen v2 tersimpan tidak boleh ditolak');
  assert.equal(boot.unavailable, false);
  assert.equal(boot.createdNew, false, 'proyek lama dipakai, bukan diganti proyek demo baru');
  assert.equal(boot.document.id, legacy.id, 'ID proyek dipertahankan');
  assert.equal(boot.document.schemaVersion, SCHEMA_VERSION);
  assert.equal(boot.migrated, true);
  // Dokumen hasil upgrade harus tersimpan ulang supaya migrasi tidak berjalan berulang.
  assert.equal((await repo.getDocument(legacy.id)).schemaVersion, SCHEMA_VERSION);
  assert.equal((await repo.listProjects()).length, 1, 'upgrade tidak membuat proyek duplikat');
  // Dokumen hasil upgrade langsung dapat dipakai editor.
  const store = new DocumentStore(boot.document);
  assert.equal(store.view.actors.length, initialProject().actors.length);
  assert.deepEqual(store.view.actors[0].keys, initialProject().actors[0].keys);
  boot.lock.release();
});

test('titipan sinkron dari tab yang ditutup dipulihkan saat bootstrap', async () => {
  const factory = new FakeIndexedDB();
  const storage = new FakeStorage();
  const repo = await new ProjectRepository({factory, keyRange: FakeKeyRange}).open();
  const doc = openProjectData(initialProject()).document;
  await repo.saveDocument(doc, {revisionToken: 1});
  storage.setItem(ACTIVE_PROJECT_KEY, doc.id);

  const unsaved = JSON.parse(JSON.stringify(await repo.getDocument(doc.id)));
  unsaved.title = 'Belum sempat commit';
  unsaved.updatedAt = new Date(Date.now() + 1000).toISOString();
  writePendingDocument(unsaved, storage);

  const boot = await bootstrap({repository: new ProjectRepository({factory, keyRange: FakeKeyRange}), storage,
    fallbackDocument: () => openProjectData(initialProject()).document,
    lockFactory: id => new ProjectLock({projectId: id, storage, locks: null})});
  assert.equal(boot.recoveredPending, true);
  assert.equal(boot.document.title, 'Belum sempat commit');
  assert.equal(storage.getItem(PENDING_KEY), null, 'titipan dibuang setelah ditulis ke repository');
  assert.equal((await repo.getDocument(doc.id)).title, 'Belum sempat commit');
  assert.equal((await repo.listProjects()).length, 1, 'titipan tidak membuat proyek baru');
  boot.lock.release();
});

test('titipan milik proyek lain atau yang sudah usang diabaikan', async () => {
  const factory = new FakeIndexedDB();
  const storage = new FakeStorage();
  const repo = await new ProjectRepository({factory, keyRange: FakeKeyRange}).open();
  const doc = openProjectData(initialProject()).document;
  await repo.saveDocument(doc, {revisionToken: 1});
  storage.setItem(ACTIVE_PROJECT_KEY, doc.id);

  const foreign = cloneProjectDocument(doc, {title: 'Proyek lain'});
  foreign.updatedAt = new Date(Date.now() + 5000).toISOString();
  writePendingDocument(foreign, storage);
  const boot = await bootstrap({repository: new ProjectRepository({factory, keyRange: FakeKeyRange}), storage,
    fallbackDocument: () => openProjectData(initialProject()).document,
    lockFactory: id => new ProjectLock({projectId: id, storage, locks: null})});
  assert.equal(boot.recoveredPending, false);
  assert.equal(boot.document.id, doc.id);
  assert.equal((await repo.listProjects()).length, 1);
  boot.lock.release();
});

test('hanya satu tab yang menjadi writer; ambil alih butuh heartbeat kedaluwarsa', async () => {
  const storage = new FakeStorage();
  let clock = 1000;
  const options = {projectId: 'p1', storage, locks: null, now: () => clock, staleMs: 6000};
  const first = new ProjectLock({...options, tabId: 'tab-1'});
  const second = new ProjectLock({...options, tabId: 'tab-2'});
  assert.equal(await first.acquire(), true);
  assert.equal(await second.acquire(), false, 'tab kedua tidak boleh menjadi writer');
  assert.equal((await second.takeOver()).ok, false, 'writer hidup tidak dapat direbut');

  clock += 10000; // heartbeat writer pertama kedaluwarsa (tab crash)
  const result = await second.takeOver();
  assert.equal(result.ok, true);
  assert.equal(second.isWriter, true);
  first.release();
  second.release();
});

test('salinan proyek memetakan ulang seluruh ID tanpa memutus hubungan', async () => {
  const source = openProjectData(initialProject()).document;
  const copy = cloneProjectDocument(source, {title: 'Salinan'});
  assert.notEqual(copy.id, source.id);
  assert.equal(copy.title, 'Salinan');
  assert.equal(copy.scenes[0].projectId, copy.id);
  assert.equal(copy.scenes[0].shots[0].sceneId, copy.scenes[0].id);
  assert.equal(copy.activeSceneId, copy.scenes[0].id);
  const shot = copy.scenes[0].shots[0];
  assert.equal(shot.camera.id, shot.cameraId);
  assert.ok(copy.scenes[0].actors.some(a => a.id === shot.camera.targetId), 'target kamera tetap menunjuk aktor yang sama');
  for (const track of shot.tracks) {
    assert.ok([...copy.scenes[0].actors.map(a => a.id), shot.camera.id].includes(track.objectId));
  }
  const sourceIds = new Set([source.id, ...source.scenes.map(s => s.id), ...source.scenes[0].actors.map(a => a.id)]);
  const copyIds = [copy.id, ...copy.scenes.map(s => s.id), ...copy.scenes[0].actors.map(a => a.id)];
  assert.ok(copyIds.every(id => !sourceIds.has(id)), 'tidak boleh ada ID yang dipakai bersama');
});

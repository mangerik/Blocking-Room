// ProjectRepository — penyimpanan lokal berbasis IndexedDB (Fase 2).
//
// Satu-satunya modul yang berbicara dengan IndexedDB. Semua penulisan dokumen
// terjadi dalam SATU transaksi yang mencakup `documents`, `projects` dan
// `revisions`, sehingga metadata dashboard tidak pernah menunjuk isi yang gagal
// ditulis. Status "tersimpan" hanya boleh ditampilkan setelah `tx.oncomplete`.
//
// Object store:
//   projects   {id, title, createdAt, updatedAt, lastOpenedAt, sceneCount, thumbnailRef, deletedAt, revisionToken}
//   documents  dokumen v2 penuh (keyPath `id`)
//   revisions  {id, projectId, parentId, createdAt, schemaVersion, title, byteSize, snapshot}
//   assets     {id, projectId, sceneId, kind, contentHash, mimeType, byteSize, dataUrl}
//   session    SessionState (keyPath `projectId`)
//
// Semua API mengembalikan Promise. Tidak ada dependency baru: wrapper Promise
// ditulis tangan di `req()`.
import {SCHEMA_VERSION} from './schema.js';

export const DB_NAME = 'blocking-room';
export const DB_VERSION = 1;
/** Minimal snapshot recovery per proyek yang dijanjikan PRD PR-04. */
export const MIN_REVISIONS = 10;
/** Batas simpan: selalu ≥ MIN_REVISIONS, kelebihan tertua dipangkas saat save. */
export const REVISION_LIMIT = 20;
/** Retensi trash (F3-03). Pembersihan dijalankan saat dashboard dibuka. */
export const TRASH_RETENTION_DAYS = 30;

const OPEN_TIMEOUT_MS = 10000;

/** IndexedDB tidak tersedia (private mode, storage diblokir, atau browser lama). */
export class StorageUnavailableError extends Error {
  constructor(cause) {
    super('Penyimpanan browser (IndexedDB) tidak tersedia. Perubahan tetap ada di memori — unduh cadangan agar tidak hilang.');
    this.name = 'StorageUnavailableError';
    this.cause = cause;
  }
}

/** Kuota penyimpanan habis. Data di memori tidak boleh dibuang. */
export class StorageQuotaError extends Error {
  constructor(cause) {
    super('Penyimpanan browser penuh. Unduh cadangan proyek, lalu kosongkan ruang sebelum menyimpan lagi.');
    this.name = 'StorageQuotaError';
    this.cause = cause;
  }
}

const isQuotaError = error =>
  !!error && (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_FILE_NO_DEVICE_SPACE' || error.code === 22);

/** Membungkus IDBRequest menjadi Promise. */
const req = request => new Promise((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error ?? new Error('Permintaan IndexedDB gagal.'));
});

const clone = value => (typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value)));
const countScenes = doc => (Array.isArray(doc?.scenes) ? doc.scenes.length : 0);

export class ProjectRepository {
  /**
   * @param {{factory?:IDBFactory, keyRange?:typeof IDBKeyRange, name?:string,
   *          revisionLimit?:number, now?:()=>string, newId?:()=>string}} options
   */
  constructor({
    factory = globalThis.indexedDB,
    keyRange = globalThis.IDBKeyRange,
    name = DB_NAME,
    revisionLimit = REVISION_LIMIT,
    now = () => new Date().toISOString(),
    newId = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `id-${Math.random().toString(36).slice(2)}-${Date.now()}`),
  } = {}) {
    this.factory = factory;
    this.keyRange = keyRange;
    this.name = name;
    this.revisionLimit = Math.max(revisionLimit, MIN_REVISIONS);
    this.now = now;
    this.newId = newId;
    this.db = null;
    this.lastRevisionStamp = '';
    /** Metadata proyek terakhir yang diketahui; dipakai jalur simpan darurat saat tab ditutup. */
    this.metaCache = new Map();
  }

  /** Membuka database. Melempar StorageUnavailableError bila IndexedDB tidak bisa dipakai. */
  async open() {
    if (this.db) return this;
    if (!this.factory) throw new StorageUnavailableError(new Error('indexedDB tidak ada pada global scope.'));
    let request;
    try {
      request = this.factory.open(this.name, DB_VERSION);
    } catch (error) {
      throw new StorageUnavailableError(error);
    }
    this.db = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new StorageUnavailableError(new Error('Membuka IndexedDB melebihi batas waktu.'))), OPEN_TIMEOUT_MS);
      const settle = fn => (value) => {clearTimeout(timer); fn(value);};
      request.onupgradeneeded = event => upgrade(event.target.result);
      request.onsuccess = settle(() => resolve(request.result));
      request.onerror = settle(() => reject(new StorageUnavailableError(request.error)));
      request.onblocked = settle(() => reject(new StorageUnavailableError(new Error('IndexedDB diblokir oleh tab lain.'))));
    }).catch(error => {
      throw error instanceof StorageUnavailableError ? error : new StorageUnavailableError(error);
    });
    return this;
  }

  close() {
    this.db?.close?.();
    this.db = null;
  }

  /** Menjalankan sekumpulan operasi dalam satu transaksi; resolve setelah commit. */
  transaction(storeNames, mode, body) {
    if (!this.db) return Promise.reject(new StorageUnavailableError(new Error('Repository belum dibuka.')));
    return new Promise((resolve, reject) => {
      let tx;
      try {
        tx = this.db.transaction(storeNames, mode);
      } catch (error) {
        reject(isQuotaError(error) ? new StorageQuotaError(error) : error);
        return;
      }
      let failure = null;
      const stores = Object.fromEntries((Array.isArray(storeNames) ? storeNames : [storeNames]).map(n => [n, tx.objectStore(n)]));
      // Hasil baru diserahkan setelah `oncomplete`: status "tersimpan" tidak boleh
      // mendahului commit. Urutan microtask body tidak memengaruhi kebenaran ini.
      const running = Promise.resolve().then(() => body(stores, tx)).catch(error => {
        failure = wrap(error);
        try {tx.abort();} catch {/* transaksi mungkin sudah selesai */}
        throw failure;
      });
      running.catch(() => {/* ditangani lewat reject di bawah */});
      tx.oncomplete = () => running.then(resolve, reject);
      tx.onerror = () => reject(wrap(tx.error ?? failure));
      tx.onabort = () => reject(wrap(failure ?? tx.error ?? new Error('Transaksi IndexedDB dibatalkan.')));
    });
  }

  // ---------- proyek ----------

  /** Metadata semua proyek; `deletedAt` diisi untuk item di trash (Fase 3). */
  async listProjects({includeDeleted = false} = {}) {
    const rows = await this.transaction('projects', 'readonly', s => req(s.projects.getAll()));
    const list = includeDeleted ? rows : rows.filter(p => !p.deletedAt);
    return list.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  }

  getProject(id) {
    return this.transaction('projects', 'readonly', s => req(s.projects.get(id)));
  }

  async getDocument(id) {
    const doc = await this.transaction('documents', 'readonly', s => req(s.documents.get(id)));
    return doc ?? null;
  }

  /**
   * Menyimpan dokumen secara atomik.
   * @param {object} doc dokumen v2 tervalidasi
   * @param {{revision?:boolean, revisionToken?:number, thumbnailRef?:string|null}} options
   * @returns {Promise<{updatedAt:string, revisionToken:number, revisionId:string|null, skipped:boolean}>}
   *
   * `revisionToken` monoton naik per sesi. Bila token yang tersimpan sudah lebih
   * besar (respons lama datang belakangan), penulisan dilewati — bukan menimpa.
   */
  saveDocument(doc, {revision = false, revisionToken = 0, thumbnailRef} = {}) {
    const payload = clone(doc);
    return this.transaction(['projects', 'documents', 'revisions'], 'readwrite', async stores => {
      const existing = await req(stores.projects.get(payload.id));
      if (existing && Number(existing.revisionToken ?? 0) > revisionToken) {
        return {updatedAt: existing.updatedAt, revisionToken: existing.revisionToken, revisionId: null, skipped: true};
      }
      const updatedAt = this.now();
      // `updatedAt` distempel saat menyimpan, bukan saat mengedit (lihat DATA-MODEL §2).
      const stored = {...payload, updatedAt};
      const meta = {
        id: stored.id,
        title: stored.title,
        createdAt: existing?.createdAt ?? stored.createdAt ?? updatedAt,
        updatedAt,
        sceneCount: countScenes(stored),
        thumbnailRef: thumbnailRef !== undefined ? thumbnailRef : (existing?.thumbnailRef ?? stored.thumbnailRef ?? null),
        deletedAt: existing?.deletedAt ?? null,
        lastOpenedAt: existing?.lastOpenedAt ?? null,
        revisionToken,
      };
      this.metaCache.set(stored.id, meta);
      await req(stores.documents.put(stored));
      await req(stores.projects.put(meta));

      let revisionId = null;
      if (revision) {
        revisionId = this.newId();
        await req(stores.revisions.put({
          id: revisionId,
          projectId: stored.id,
          parentId: existing?.lastRevisionId ?? null,
          createdAt: this.uniqueStamp(updatedAt),
          schemaVersion: stored.schemaVersion ?? SCHEMA_VERSION,
          title: stored.title,
          snapshot: stored,
        }));
        await this.prune(stores.revisions, stored.id);
      }
      return {updatedAt, revisionToken, revisionId, skipped: false};
    });
  }

  /**
   * Penulisan darurat saat tab ditutup (`pagehide`). Semua permintaan dikirim dalam
   * task yang sama — tanpa membaca dahulu — supaya transaksi tetap terkirim walaupun
   * halaman langsung dibongkar. Tidak membuat revisi dan tidak memeriksa token:
   * dokumen yang dibawa adalah keadaan terakhir di tab ini.
   */
  saveDocumentImmediate(doc, {revisionToken = 0} = {}) {
    const stored = {...clone(doc), updatedAt: this.now()};
    const cached = this.metaCache.get(stored.id);
    return this.transaction(['projects', 'documents'], 'readwrite', stores => {
      stores.documents.put(stored);
      stores.projects.put({
        id: stored.id,
        title: stored.title,
        createdAt: cached?.createdAt ?? stored.createdAt ?? stored.updatedAt,
        updatedAt: stored.updatedAt,
        sceneCount: countScenes(stored),
        thumbnailRef: cached?.thumbnailRef ?? stored.thumbnailRef ?? null,
        deletedAt: cached?.deletedAt ?? null,
        lastOpenedAt: cached?.lastOpenedAt ?? null,
        revisionToken: Math.max(revisionToken, Number(cached?.revisionToken ?? 0)),
      });
      return {updatedAt: stored.updatedAt, revisionToken, revisionId: null, skipped: false};
    });
  }

  /** Stempel revisi yang selalu naik, agar urutan index projectId+createdAt deterministik. */
  uniqueStamp(stamp) {
    let value = stamp;
    if (value <= this.lastRevisionStamp) {
      value = new Date(new Date(this.lastRevisionStamp).getTime() + 1).toISOString();
    }
    this.lastRevisionStamp = value;
    return value;
  }

  /** Menghapus revisi tertua di atas batas. Sisa selalu ≥ MIN_REVISIONS. */
  async prune(revisions, projectId) {
    const keys = await req(revisions.index('projectId_createdAt').getAllKeys(this.projectRange(projectId)));
    const excess = keys.length - this.revisionLimit;
    for (let i = 0; i < excess; i += 1) await req(revisions.delete(keys[i]));
    return Math.max(excess, 0);
  }

  projectRange(projectId) {
    return this.keyRange.bound([projectId, ''], [projectId, '￿']);
  }

  /** Trash (Fase 3) memakai `deletedAt`; `permanent` menghapus seluruh jejak proyek. */
  deleteProject(id, {permanent = false} = {}) {
    return this.transaction(['projects', 'documents', 'revisions', 'session'], 'readwrite', async stores => {
      if (!permanent) {
        const meta = await req(stores.projects.get(id));
        if (!meta) return false;
        await req(stores.projects.put({...meta, deletedAt: this.now()}));
        return true;
      }
      await req(stores.projects.delete(id));
      await req(stores.documents.delete(id));
      await req(stores.session.delete(id));
      const keys = await req(stores.revisions.index('projectId_createdAt').getAllKeys(this.projectRange(id)));
      for (const key of keys) await req(stores.revisions.delete(key));
      return true;
    });
  }

  /**
   * Mengembalikan proyek dari trash (F3-03). `deletedAt` dikosongkan; isi dokumen
   * dan revisi tidak pernah disentuh oleh delete non-permanen, jadi restore utuh.
   */
  restoreProject(id) {
    return this.transaction('projects', 'readwrite', async stores => {
      const meta = await req(stores.projects.get(id));
      if (!meta) return false;
      await req(stores.projects.put({...meta, deletedAt: null}));
      this.metaCache.set(id, {...meta, deletedAt: null});
      return true;
    });
  }

  /**
   * Membersihkan item trash yang sudah melewati `days` hari (F3-03).
   * Dijalankan saat dashboard dibuka — aplikasi lokal tidak punya proses latar.
   * @returns {Promise<string[]>} id proyek yang dihapus permanen
   */
  async purgeExpiredTrash({days = TRASH_RETENTION_DAYS, now = Date.now()} = {}) {
    const limit = now - days * 24 * 60 * 60 * 1000;
    const rows = await this.listProjects({includeDeleted: true});
    const expired = rows.filter(p => p.deletedAt && Date.parse(p.deletedAt) <= limit);
    for (const project of expired) await this.deleteProject(project.id, {permanent: true});
    return expired.map(p => p.id);
  }

  /** Menandai proyek terakhir dibuka (urutan "terakhir dibuka" di dashboard). */
  touchProject(id, stamp = this.now()) {
    return this.transaction('projects', 'readwrite', async stores => {
      const meta = await req(stores.projects.get(id));
      if (!meta) return null;
      const next = {...meta, lastOpenedAt: stamp};
      await req(stores.projects.put(next));
      this.metaCache.set(id, next);
      return next;
    });
  }

  /**
   * Mengganti judul proyek dari dashboard: metadata dan dokumen diperbarui dalam
   * SATU transaksi supaya kartu dashboard tidak pernah menampilkan judul yang tidak
   * ada di dokumen. Token dinaikkan agar autosave tab lain tidak menimpanya diam-diam.
   */
  renameProject(id, title) {
    return this.transaction(['projects', 'documents'], 'readwrite', async stores => {
      const meta = await req(stores.projects.get(id));
      const doc = await req(stores.documents.get(id));
      if (!meta || !doc) return null;
      const updatedAt = this.now();
      const revisionToken = Math.max(Number(meta.revisionToken ?? 0) + 1, Date.now());
      const nextMeta = {...meta, title, updatedAt, revisionToken};
      await req(stores.documents.put({...doc, title, updatedAt}));
      await req(stores.projects.put(nextMeta));
      this.metaCache.set(id, nextMeta);
      return nextMeta;
    });
  }

  /**
   * Menyimpan thumbnail (F3-06) di store `assets` dan menunjuknya dari metadata
   * proyek. Sengaja TIDAK menyentuh store `documents`: kegagalan thumbnail tidak
   * boleh menggagalkan penyimpanan dokumen, dan gambar tidak membuat langkah undo.
   */
  putThumbnail(projectId, asset, {setProjectThumbnail = true} = {}) {
    return this.transaction(['assets', 'projects'], 'readwrite', async stores => {
      const record = {
        id: asset.id, projectId, sceneId: asset.sceneId ?? null, kind: 'thumbnail',
        contentHash: asset.contentHash ?? null, mimeType: asset.mimeType ?? 'image/jpeg',
        byteSize: asset.byteSize ?? (asset.dataUrl?.length ?? 0), dataUrl: asset.dataUrl,
        createdAt: this.now(),
      };
      await req(stores.assets.put(record));
      if (setProjectThumbnail) {
        const meta = await req(stores.projects.get(projectId));
        if (meta && meta.thumbnailRef !== asset.id) {
          const next = {...meta, thumbnailRef: asset.id};
          await req(stores.projects.put(next));
          this.metaCache.set(projectId, next);
        }
      }
      return record.id;
    });
  }

  deleteAsset(id) {
    return this.transaction('assets', 'readwrite', s => req(s.assets.delete(id)));
  }

  // ---------- revisi ----------

  /** Daftar revisi terbaru lebih dahulu; `snapshot` tidak disertakan. */
  async listRevisions(projectId) {
    const rows = await this.transaction('revisions', 'readonly', s =>
      req(s.revisions.index('projectId_createdAt').getAll(this.projectRange(projectId))));
    return rows
      .map(({snapshot, ...meta}) => ({...meta, byteSize: JSON.stringify(snapshot ?? null).length}))
      .reverse();
  }

  async getRevision(revisionId) {
    const row = await this.transaction('revisions', 'readonly', s => req(s.revisions.get(revisionId)));
    return row ?? null;
  }

  /** Revisi terbaru sebuah proyek, untuk opsi "buka versi tersimpan terakhir". */
  async latestRevision(projectId) {
    const list = await this.listRevisions(projectId);
    if (!list.length) return null;
    return this.getRevision(list[0].id);
  }

  // ---------- session state ----------

  putSession(state) {
    return this.transaction('session', 'readwrite', s => req(s.session.put(clone(state))));
  }

  async getSession(projectId) {
    const row = await this.transaction('session', 'readonly', s => req(s.session.get(projectId)));
    return row ?? null;
  }

  // ---------- aset ----------

  putAsset(asset) {
    return this.transaction('assets', 'readwrite', s => req(s.assets.put(clone(asset))));
  }

  async getAsset(id) {
    const row = await this.transaction('assets', 'readonly', s => req(s.assets.get(id)));
    return row ?? null;
  }

  listAssets(projectId) {
    return this.transaction('assets', 'readonly', async s => {
      const rows = await req(s.assets.getAll());
      return rows.filter(a => a.projectId === projectId);
    });
  }
}

function wrap(error) {
  if (!error) return new Error('Transaksi IndexedDB gagal.');
  if (error instanceof StorageQuotaError || error instanceof StorageUnavailableError) return error;
  return isQuotaError(error) ? new StorageQuotaError(error) : error;
}

/** Skema database. Versi berikutnya menambah store baru, tidak mengubah yang lama. */
export function upgrade(db) {
  if (!db.objectStoreNames.contains('projects')) db.createObjectStore('projects', {keyPath: 'id'});
  if (!db.objectStoreNames.contains('documents')) db.createObjectStore('documents', {keyPath: 'id'});
  if (!db.objectStoreNames.contains('revisions')) {
    const revisions = db.createObjectStore('revisions', {keyPath: 'id'});
    revisions.createIndex('projectId_createdAt', ['projectId', 'createdAt']);
    revisions.createIndex('projectId', 'projectId');
  }
  if (!db.objectStoreNames.contains('assets')) {
    const assets = db.createObjectStore('assets', {keyPath: 'id'});
    assets.createIndex('projectId', 'projectId');
  }
  if (!db.objectStoreNames.contains('session')) db.createObjectStore('session', {keyPath: 'projectId'});
}

/**
 * Meminta penyimpanan persisten. Bukan pengganti cadangan: browser boleh menolak,
 * dan izin ini tidak melindungi dari kuota penuh maupun profil yang dihapus.
 */
export async function requestPersistentStorage() {
  try {
    if (!navigator?.storage?.persist) return false;
    if (await navigator.storage.persisted?.()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

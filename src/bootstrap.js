// Urutan buka editor (Fase 2).
//
//   1. Buka repository IndexedDB. Gagal → mode darurat: dokumen dibaca dari kunci
//      lama, tetap ada di memori, penyimpanan otomatis mati, cadangan ditawarkan.
//   2. Migrasi localStorage → repository (F2-02). Copy-first: sumber TIDAK dihapus
//      dan TIDAK ditimpa; salinan mentah disimpan ke `blocking-room.backup`; penanda
//      `blocking-room.migrated` ditulis hanya setelah transaksi commit, sehingga
//      migrasi ulang tidak pernah membuat proyek duplikat.
//   3. Tentukan proyek aktif (`blocking-room.activeProject` → repository → proyek
//      terbaru → proyek demo baru).
//   4. Ambil titipan `blocking-room.pending` bila tab sebelumnya ditutup sebelum
//      transaksi terakhir sempat commit, lalu tulis ke repository.
//   5. Ambil kunci writer (F2-07) dan baca SessionState (F2-06).
import {ProjectRepository, StorageUnavailableError} from './repository.js';
import {ProjectLock} from './tab-lock.js';
import {openProjectData} from './migrate.js';
import {SchemaTooNewError} from './schema.js';
import {
  ACTIVE_PROJECT_KEY, activeProjectId, backupLegacyRaw, clearPendingDocument, migrationMarker,
  readLegacyRaw, readPendingDocument, setActiveProjectId, setMigrationMarker,
} from './storage.js';

export {ACTIVE_PROJECT_KEY};

/**
 * @param {{repository?:ProjectRepository, storage?:Storage,
 *          fallbackDocument:()=>object, lockFactory?:(id:string)=>ProjectLock}} options
 * @returns {Promise<{repository:ProjectRepository|null, document:object, lock:ProjectLock|null,
 *   sessionState:object|null, migrated:boolean, error:Error|null, unavailable:boolean,
 *   readOnly:boolean, createdNew:boolean}>}
 */
export async function bootstrap({
  repository = new ProjectRepository(),
  storage = globalThis.localStorage,
  fallbackDocument,
  lockFactory = (projectId, onChange) => new ProjectLock({projectId, storage, onChange}),
  onLockChange = () => {},
} = {}) {
  const result = {
    repository: null, document: null, lock: null, sessionState: null,
    migrated: false, error: null, unavailable: false, readOnly: false, createdNew: false, recoveredPending: false,
  };

  try {
    await repository.open();
    result.repository = repository;
  } catch (error) {
    result.unavailable = true;
    result.error = error instanceof StorageUnavailableError ? error : new StorageUnavailableError(error);
  }

  // --- migrasi sumber lama (berjalan juga saat repository mati, agar data tetap terlihat)
  const raw = readLegacyRaw(storage);
  const marker = migrationMarker(storage);
  let migratedDocument = null;
  if (raw && !marker) {
    try {
      const opened = openProjectData(JSON.parse(raw));
      backupLegacyRaw(raw, storage);
      migratedDocument = opened.document;
      result.migrated = opened.migrated;
      if (result.repository) {
        await result.repository.saveDocument(migratedDocument, {revision: true, revisionToken: 1});
        // Penanda ditulis setelah commit sukses — bukan sebelumnya.
        setMigrationMarker(migratedDocument.id, storage);
        setActiveProjectId(migratedDocument.id, storage);
      }
    } catch (error) {
      // SchemaTooNewError: dokumen tidak dibuka dan sumber tidak disentuh sama sekali.
      if (!(error instanceof SchemaTooNewError)) backupLegacyRaw(raw, storage);
      result.error = error;
      migratedDocument = null;
      if (error instanceof SchemaTooNewError) {
        result.document = fallbackDocument();
        result.readOnly = true;
        return finish(result, repository, storage, lockFactory, onLockChange, {skipLock: true});
      }
    }
  }

  if (!result.repository) {
    // Mode darurat tanpa IndexedDB: pakai dokumen migrasi bila ada, jika tidak proyek demo.
    result.document = migratedDocument ?? fallbackDocument();
    return finish(result, repository, storage, lockFactory, onLockChange, {skipLock: true});
  }

  // --- proyek aktif
  let doc = null;
  try {
    if (migratedDocument) {
      doc = migratedDocument;
    } else {
      const wanted = activeProjectId(storage) ?? marker;
      if (wanted) doc = await result.repository.getDocument(wanted);
      if (!doc) {
        const [newest] = await result.repository.listProjects();
        if (newest) doc = await result.repository.getDocument(newest.id);
      }
      if (!doc) {
        doc = fallbackDocument();
        await result.repository.saveDocument(doc, {revision: true, revisionToken: 1});
        result.createdNew = true;
      }
    }
  } catch (error) {
    // Repository terbuka tetapi tidak dapat dipakai (kuota, korupsi). Editor tetap
    // dibuka di memori; penyimpanan dimatikan dan cadangan ditawarkan (F2-08).
    result.error = result.error ?? error;
    result.repository = null;
    result.unavailable = true;
    result.document = migratedDocument ?? fallbackDocument();
    return finish(result, repository, storage, lockFactory, onLockChange, {skipLock: true});
  }
  doc = await adoptPending(result, doc, storage);
  setActiveProjectId(doc.id, storage);
  result.document = doc;
  result.sessionState = await result.repository.getSession(doc.id).catch(() => null);
  return finish(result, repository, storage, lockFactory, onLockChange, {});
}

/**
 * Mengambil titipan sinkron dari tab yang ditutup sebelum transaksi terakhir commit.
 * Titipan hanya dipakai bila milik proyek yang sama dan lebih baru daripada dokumen
 * tersimpan; hasilnya divalidasi dan ditulis ke repository sebelum penanda dibuang.
 */
async function adoptPending(result, doc, storage) {
  const pending = readPendingDocument(storage);
  if (!pending || pending.projectId !== doc.id) return doc;
  try {
    if (!(String(pending.savedAt) > String(doc.updatedAt))) {clearPendingDocument(storage); return doc;}
    const recovered = openProjectData(pending.doc).document;
    await result.repository.saveDocument(recovered, {revisionToken: Date.now()});
    clearPendingDocument(storage);
    result.recoveredPending = true;
    return recovered;
  } catch {
    // Titipan rusak tidak boleh menghalangi editor terbuka; dokumen tersimpan tetap dipakai.
    clearPendingDocument(storage);
    return doc;
  }
}

async function finish(result, repository, storage, lockFactory, onLockChange, {skipLock}) {
  if (skipLock || !result.document) return result;
  const lock = lockFactory(result.document.id, onLockChange);
  result.lock = lock;
  const writer = await lock.acquire();
  if (!writer) result.readOnly = true;
  return result;
}

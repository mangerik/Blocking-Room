// Satu-satunya modul yang menyentuh localStorage.
//
// Sejak Fase 2 penyimpanan dokumen pindah ke IndexedDB (`src/repository.js`).
// localStorage hanya menyimpan hal-hal kecil yang harus dibaca secara sinkron
// sebelum IndexedDB terbuka, serta sumber lama yang belum dimigrasikan:
//
//   blocking-room               dokumen lama (v1/v2) — sumber migrasi, tidak ditimpa
//   blocking-room.backup        salinan mentah sumber sebelum migrasi (copy-first)
//   blocking-room.migrated      penanda migrasi = id proyek hasil migrasi
//   blocking-room.activeProject id proyek yang dibuka editor
//   blocking-room.writer.<id>   heartbeat writer (src/tab-lock.js)
import {openProjectData} from './migrate.js';
import {nowStamp} from './schema.js';

export const STORAGE_KEY = 'blocking-room';
export const BACKUP_KEY = `${STORAGE_KEY}.backup`;
export const MIGRATED_KEY = `${STORAGE_KEY}.migrated`;
export const ACTIVE_PROJECT_KEY = `${STORAGE_KEY}.activeProject`;
export const PENDING_KEY = `${STORAGE_KEY}.pending`;
/** Dokumen lebih besar dari ini tidak dititipkan ke localStorage saat tab ditutup. */
export const PENDING_LIMIT_BYTES = 1_500_000;

const read = (key, storage) => {
  try {return storage.getItem(key);} catch {return null;}
};
const write = (key, value, storage) => {
  try {storage.setItem(key, value); return true;} catch {return false;}
};

/** Isi mentah kunci lama, atau null. */
export const readLegacyRaw = (storage = localStorage) => read(STORAGE_KEY, storage);

/** Menyimpan salinan mentah sumber sebelum apa pun ditimpa (copy-first). */
export const backupLegacyRaw = (raw, storage = localStorage) => write(BACKUP_KEY, raw, storage);

/** Penanda migrasi: id proyek hasil migrasi, ditulis hanya setelah transaksi commit. */
export const migrationMarker = (storage = localStorage) => read(MIGRATED_KEY, storage);
export const setMigrationMarker = (projectId, storage = localStorage) => write(MIGRATED_KEY, projectId, storage);

/** Proyek yang dibuka editor. Dashboard Fase 3 akan menggantikan ini dengan rute. */
export const activeProjectId = (storage = localStorage) => read(ACTIVE_PROJECT_KEY, storage);
export const setActiveProjectId = (projectId, storage = localStorage) => write(ACTIVE_PROJECT_KEY, projectId, storage);

/**
 * Titipan sinkron saat tab ditutup.
 *
 * Browser tidak menjamin transaksi IndexedDB yang baru dimulai pada `pagehide`
 * sempat commit sebelum halaman dibongkar (diuji: Chrome membuangnya). localStorage
 * bersifat sinkron, jadi keadaan terakhir dititipkan ke sini dan diambil kembali
 * oleh bootstrap pada pemuatan berikutnya.
 */
export function writePendingDocument(doc, storage = localStorage) {
  try {
    const payload = JSON.stringify({projectId: doc.id, savedAt: new Date().toISOString(), doc});
    if (payload.length > PENDING_LIMIT_BYTES) return false;
    storage.setItem(PENDING_KEY, payload);
    return true;
  } catch {return false;}
}

export function readPendingDocument(storage = localStorage) {
  const raw = read(PENDING_KEY, storage);
  if (!raw) return null;
  try {return JSON.parse(raw);} catch {return null;}
}

export function clearPendingDocument(storage = localStorage) {
  try {storage.removeItem(PENDING_KEY); return true;} catch {return false;}
}

/**
 * Membaca dokumen dari kunci lama (v1 atau v2).
 * Dipakai jalur migrasi Fase 2 dan sebagai jaring pengaman ketika IndexedDB tidak
 * tersedia sama sekali.
 * @returns {{document:object|null, migrated:boolean, error:Error|null, backedUp:boolean}}
 */
export function loadDocument(storage = localStorage) {
  let raw = null;
  try {raw = storage.getItem(STORAGE_KEY);} catch (error) {return {document: null, migrated: false, error, backedUp: false};}
  if (!raw) return {document: null, migrated: false, error: null, backedUp: false};
  try {
    const {document, migrated} = openProjectData(JSON.parse(raw));
    // Simpan salinan sumber sebelum dokumen hasil migrasi dipakai.
    if (migrated) backupLegacyRaw(raw, storage);
    return {document, migrated, error: null, backedUp: migrated};
  } catch (error) {
    // Data tidak terbaca: jangan pernah menimpanya diam-diam.
    return {document: null, migrated: false, error, backedUp: backupLegacyRaw(raw, storage)};
  }
}

/**
 * Menulis dokumen ke kunci lama. Sejak Fase 2 ini **bukan** jalur penyimpanan editor
 * (repository IndexedDB yang memegang data); fungsi dipertahankan untuk kompatibilitas
 * pembacaan/pengujian jalur lama.
 */
export function saveDocument(doc, storage = localStorage) {
  storage.setItem(STORAGE_KEY, JSON.stringify({...doc, updatedAt: nowStamp()}));
}

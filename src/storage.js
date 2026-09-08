// Penyimpanan lokal sementara (Fase 1). Repository IndexedDB adalah Fase 2.
// Kunci localStorage tetap `blocking-room`, tetapi isinya sekarang dokumen schema v2.
// Dokumen v1 lama yang masih tersimpan dimigrasikan saat dibaca — copy-first: salinan
// mentah disimpan ke kunci backup sebelum apa pun ditimpa.
import {openProjectData} from './migrate.js';
import {nowStamp} from './schema.js';

export const STORAGE_KEY = 'blocking-room';
export const BACKUP_KEY = `${STORAGE_KEY}.backup`;

/**
 * Membaca dokumen tersimpan.
 * @returns {{document:object|null, migrated:boolean, error:Error|null, backedUp:boolean}}
 */
export function loadDocument(storage = localStorage) {
  let raw = null;
  try {raw = storage.getItem(STORAGE_KEY);} catch (error) {return {document: null, migrated: false, error, backedUp: false};}
  if (!raw) return {document: null, migrated: false, error: null, backedUp: false};
  try {
    const {document, migrated} = openProjectData(JSON.parse(raw));
    // Simpan salinan sumber sebelum dokumen hasil migrasi menimpanya.
    if (migrated) backup(raw, storage);
    return {document, migrated, error: null, backedUp: migrated};
  } catch (error) {
    // Data tidak terbaca: jangan pernah menimpanya diam-diam.
    return {document: null, migrated: false, error, backedUp: backup(raw, storage)};
  }
}

function backup(raw, storage) {
  try {storage.setItem(BACKUP_KEY, raw); return true;} catch {return false;}
}

/** Menulis dokumen; stempel `updatedAt` diberikan di sini, bukan saat mengedit. */
export function saveDocument(doc, storage = localStorage) {
  storage.setItem(STORAGE_KEY, JSON.stringify({...doc, updatedAt: nowStamp()}));
}

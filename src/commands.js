// Satu jalur untuk semua perubahan kreatif: mutasi scene view → validasi → commit
// history → simpan. Navigasi observer, seleksi, playhead dan tool bukan command dan
// tidak pernah masuk ke history.
//
// Scope undo adalah per proyek: setiap `doc.id` memiliki stack sendiri, sehingga
// membuka proyek lain tidak dapat meng-undo perubahan proyek sebelumnya. Undo juga
// memulihkan scene/shot aktif karena keduanya tersimpan di dalam dokumen.
import {ProjectHistory} from './history.js';
import {validateDocument} from './schema.js';

/**
 * Tab baca-saja (F2-07). Dilempar dari lapisan command, bukan dari UI, sehingga
 * jalur edit apa pun — tombol, keyboard, drag, rekaman, impor — ikut terblokir.
 */
export class ReadOnlyError extends Error {
  constructor() {
    super('Tab ini baca-saja: proyek sedang dibuka di tab lain.');
    this.name = 'ReadOnlyError';
  }
}

/**
 * Memilah item untuk operasi massal. Item terkunci atau tersembunyi tidak pernah
 * dimutasi diam-diam; pemanggil wajib melaporkan daftar `skipped` kepada pengguna.
 */
export function partitionByLock(items, {skipHidden = true} = {}) {
  const editable = [], skipped = [];
  for (const item of items ?? []) {
    if (!item) continue;
    if (item.locked) skipped.push({id: item.id, name: item.name, reason: 'terkunci'});
    else if (skipHidden && item.visible === false) skipped.push({id: item.id, name: item.name, reason: 'tersembunyi'});
    else editable.push(item);
  }
  return {editable, skipped};
}

/** Ringkasan daftar item yang dilewati untuk ditampilkan sebagai pesan. */
export const describeSkipped = skipped =>
  skipped.map(s => `${s.name} (${s.reason})`).join(', ');

export class EditorSession {
  /**
   * @param {import('./document.js').DocumentStore} store pemilik dokumen aktif
   * @param {{limit?:number}} options
   */
  constructor(store, {limit = 100} = {}) {
    this.store = store;
    this.limit = limit;
    this.histories = new Map();
    /** Bila true, tidak ada perubahan kreatif yang boleh masuk history maupun storage. */
    this.readOnly = false;
    this.useHistoryFor(store.doc);
  }
  useHistoryFor(doc) {
    let history = this.histories.get(doc.id);
    if (!history) {
      history = new ProjectHistory(doc, this.limit);
      this.histories.set(doc.id, history);
    }
    this.history = history;
    return history;
  }
  get view() {return this.store.view;}
  get canUndo() {return this.history.canUndo;}
  get canRedo() {return this.history.canRedo;}
  get grouping() {return this.history.grouping;}

  /** Menolak setiap perubahan kreatif saat tab baca-saja. */
  assertWritable() {if (this.readOnly) throw new ReadOnlyError();}

  /** Mulai transaksi gestur (drag, tahan tombol, rekaman): satu langkah undo. */
  begin() {this.assertWritable(); this.history.begin();}
  /** Akhiri transaksi gestur dan simpan satu langkah. */
  end() {this.assertWritable(); this.history.end(this.validatedSnapshot());}

  /** Snapshot dokumen aktif yang sudah divalidasi; dipakai history dan penyimpanan. */
  validatedSnapshot() {
    const snapshot = this.store.snapshot();
    validateDocument(snapshot);
    return snapshot;
  }

  /** Keadaan valid terakhir, untuk memulihkan dokumen bila sebuah command gagal. */
  lastValidDocument() {return JSON.parse(this.history.entries[this.history.index]);}

  /** Menyimpan keadaan sekarang sebagai satu langkah history (no-op saat grouping). */
  commit() {this.assertWritable(); this.history.commit(this.validatedSnapshot());}

  /**
   * Menjalankan satu perubahan kreatif pada scene view aktif.
   * Bila `mutate` melempar atau hasilnya tidak lolos validasi, dokumen dikembalikan
   * ke keadaan valid terakhir dan error diteruskan ke pemanggil.
   */
  run(mutate) {
    this.assertWritable();
    const rollback = this.lastValidDocument();
    try {
      mutate(this.store.view);
      this.commit();
    } catch (error) {
      this.history.grouping = false;
      this.store.load(rollback);
      throw error;
    }
    return this.store.view;
  }

  /**
   * Operasi massal dengan pengecekan lock. Mengembalikan daftar item yang dilewati
   * agar UI dapat menampilkannya; tidak ada objek terkunci yang berubah.
   */
  runBulk(items, mutate, options) {
    const {editable, skipped} = partitionByLock(items, options);
    if (editable.length) this.run(view => {for (const item of editable) mutate(item, view);});
    return {applied: editable.map(i => i.id), skipped};
  }

  /**
   * Mengganti dokumen aktif (open/import). Proyek yang sama meneruskan history,
   * sehingga impor tetap dapat di-undo. Proyek berbeda memakai stack undo sendiri.
   */
  openDocument(doc) {
    this.assertWritable();
    const sameProject = doc.id === this.store.doc.id;
    this.history.grouping = false;
    this.store.load(doc);
    if (sameProject) this.commit();
    else {
      this.useHistoryFor(this.store.doc);
      this.commit();
    }
    return this.store.view;
  }

  /** Undo/redo memulihkan dokumen sekaligus scene/shot aktif di dalamnya. */
  undo() {this.assertWritable(); return this.restore('undo');}
  redo() {this.assertWritable(); return this.restore('redo');}
  restore(direction) {
    const doc = this.history[direction]();
    if (!doc) return null;
    return this.store.load(doc);
  }
}

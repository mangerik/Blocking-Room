// Autosave (F2-03) — penyimpanan otomatis ≤1 detik setelah gestur selesai.
//
// Tiga jaminan:
// 1. **Leading + coalesce.** Perubahan pertama setelah jeda langsung ditulis, lalu
//    perubahan berikutnya digabung menjadi satu transaksi paling lambat `delay` ms.
//    Timer tidak di-reset saat dijadwalkan ulang, sehingga jarak maksimum antara
//    perubahan pertama dan penulisan tetap `delay` (bukan debounce tak berujung).
//    Penulisan segera ini penting karena browser TIDAK menjamin transaksi IndexedDB
//    yang baru dimulai saat `pagehide` sempat commit sebelum halaman dibongkar —
//    jadi menunda seluruh penyimpanan sampai akhir gestur berarti reload cepat
//    setelah satu klik bisa kehilangan perubahan itu.
// 2. **Revision token.** Setiap jadwal menaikkan token. Repository menolak menulis
//    bila token yang tersimpan lebih besar, jadi respons lama tidak menimpa save baru.
//    Token diambil dari jam (bukan penghitung mulai nol) supaya tetap naik setelah
//    reload atau ganti tab — kalau tidak, sesi baru akan dianggap "respons lama".
// 3. **Status jujur.** `saved` hanya dilaporkan setelah transaksi IndexedDB commit.
//
// Dokumen di-clone saat dijadwalkan. Konsekuensinya, berpindah proyek saat save
// masih pending tetap menulis dokumen lama ke proyek lama — bukan ke proyek baru.
import {StorageQuotaError, StorageUnavailableError} from './repository.js';

const clone = value => (typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value)));

export const SAVE_STATUS = {idle: 'idle', saving: 'saving', saved: 'saved', error: 'error'};

export class AutosaveController {
  /**
   * @param {{repository:import('./repository.js').ProjectRepository,
   *          delay?:number, onStatus?:(status:string, detail?:object)=>void,
   *          revisionEvery?:number, revisionIntervalMs?:number, now?:()=>number}} options
   */
  constructor({repository, delay = 250, onStatus = () => {}, revisionEvery = 8, revisionIntervalMs = 30000, now = () => Date.now(), startToken} = {}) {
    this.repository = repository;
    this.delay = delay;
    this.onStatus = onStatus;
    this.revisionEvery = revisionEvery;
    this.revisionIntervalMs = revisionIntervalMs;
    this.now = now;
    this.enabled = true;
    this.token = Math.max(startToken ?? 0, now());
    this.appliedToken = 0;
    this.queued = null;
    this.timer = null;
    this.inflight = null;
    this.status = SAVE_STATUS.idle;
    this.lastError = null;
    this.lastDoc = null;
    this.lastToken = 0;
    this.lastRunAt = 0;
    this.savesSinceRevision = Number.POSITIVE_INFINITY; // save pertama selalu membuat revisi
    this.lastRevisionAt = 0;
    this.saveCount = 0;
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    if (!enabled) this.cancel();
  }

  cancel() {
    clearTimeout(this.timer);
    this.timer = null;
    this.queued = null;
  }

  /** Menjadwalkan penyimpanan dokumen. Aman dipanggil sesering apa pun. */
  schedule(doc, {revision = 'auto'} = {}) {
    if (!this.enabled || !this.repository) return null;
    this.token += 1;
    const forced = this.queued?.revision === true || revision === true;
    this.queued = {doc: clone(doc), token: this.token, revision: forced ? true : revision};
    // Disimpan terpisah supaya penyimpanan darurat saat tab ditutup tetap punya
    // keadaan terakhir walaupun `queued` sudah diambil oleh save yang sedang berjalan.
    this.lastDoc = this.queued.doc;
    this.lastToken = this.token;
    this.setStatus(SAVE_STATUS.saving);
    // Perubahan pertama setelah jeda ditulis seketika; sisanya digabung.
    if (!this.inflight && !this.timer && (this.now() - this.lastRunAt) >= this.delay) this.run();
    else if (!this.timer) this.timer = setTimeout(() => {this.timer = null; this.run();}, this.delay);
    return this.token;
  }

  /** Menulis sekarang juga dan menunggu transaksi selesai. */
  async flush() {
    clearTimeout(this.timer);
    this.timer = null;
    if (this.inflight) await this.inflight.catch(() => {});
    if (this.queued) await this.run();
    return this.status;
  }

  /**
   * Penyimpanan terakhir saat tab ditutup. Tidak dapat ditunggu (unload), jadi
   * memakai jalur `saveDocumentImmediate` yang mengirim seluruh permintaan seketika.
   */
  flushOnUnload() {
    clearTimeout(this.timer);
    this.timer = null;
    const pending = this.unconfirmed();
    this.queued = null;
    // Upaya terbaik: transaksi ini boleh saja dibuang browser saat halaman dibongkar,
    // karena itu pemanggil juga menitipkan dokumen ke localStorage (lihat storage.js).
    if (!pending || !this.repository?.saveDocumentImmediate) return false;
    try {this.repository.saveDocumentImmediate(pending.doc, {revisionToken: pending.token}).catch(() => {});} catch {return false;}
    return true;
  }

  /** Keadaan terakhir yang belum dipastikan commit, atau null bila semuanya aman. */
  unconfirmed() {
    const doc = this.queued?.doc ?? this.lastDoc;
    const token = this.queued?.token ?? this.lastToken ?? 0;
    if (!doc || this.appliedToken >= token) return null;
    return {doc, token};
  }

  wantsRevision(queued) {
    if (queued.revision === true) return true;
    if (queued.revision === false) return false;
    return this.savesSinceRevision >= this.revisionEvery || (this.now() - this.lastRevisionAt) >= this.revisionIntervalMs;
  }

  run() {
    if (this.inflight || !this.queued) return this.inflight ?? Promise.resolve();
    const queued = this.queued;
    this.queued = null;
    clearTimeout(this.timer);
    this.timer = null;
    const revision = this.wantsRevision(queued);
    this.lastRunAt = this.now();
    this.setStatus(SAVE_STATUS.saving);
    this.inflight = this.repository.saveDocument(queued.doc, {revision, revisionToken: queued.token})
      .then(result => {
        this.saveCount += 1;
        if (result.revisionId) {this.savesSinceRevision = 0; this.lastRevisionAt = this.now();}
        else this.savesSinceRevision += 1;
        // Respons lama tidak boleh menurunkan status save yang lebih baru.
        if (queued.token >= this.appliedToken) {
          this.appliedToken = queued.token;
          this.lastError = null;
          if (!this.queued) this.setStatus(SAVE_STATUS.saved, result);
        }
        return result;
      })
      .catch(error => {
        this.lastError = error;
        this.setStatus(SAVE_STATUS.error, {
          error,
          quota: error instanceof StorageQuotaError,
          unavailable: error instanceof StorageUnavailableError,
        });
        // Dokumen tetap di memori; jadwal ulang tidak dilakukan otomatis agar
        // kegagalan tidak berubah menjadi loop penulisan.
        return null;
      })
      .finally(() => {
        this.inflight = null;
        if (this.queued && !this.timer) this.timer = setTimeout(() => {this.timer = null; this.run();}, this.delay);
      });
    return this.inflight;
  }

  setStatus(status, detail) {
    this.status = status;
    this.onStatus(status, detail);
  }
}

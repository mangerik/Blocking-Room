// Satu writer per proyek (F2-07).
//
// Mekanisme utama: Web Locks API. `navigator.locks.request(name, {ifAvailable:true})`
// memberi kepastian dari browser — bila tab writer ditutup atau crash, kunci dilepas
// otomatis oleh browser, tanpa perlu timeout tebakan.
//
// Fallback (Safari lama / Web Locks tidak ada): heartbeat di localStorage +
// BroadcastChannel. Heartbeat diperbarui tiap `heartbeatMs`; tab lain menganggap
// writer mati bila heartbeat lebih tua dari `staleMs`. "Ambil alih" hanya boleh
// dilakukan bila kunci benar-benar bebas (Web Locks) atau heartbeat kedaluwarsa.
//
// Modul ini tidak menyentuh dokumen. Penegakan read-only ada di EditorSession
// (commands.js) sehingga UI bukan satu-satunya penghalang.

export const HEARTBEAT_MS = 2000;
export const STALE_MS = 6000;

const lockName = projectId => `blocking-room.writer.${projectId}`;
const heartbeatKey = projectId => `blocking-room.writer.${projectId}`;

export class ProjectLock {
  /**
   * @param {{projectId:string, storage?:Storage, locks?:LockManager,
   *          channelFactory?:(name:string)=>BroadcastChannel|null,
   *          heartbeatMs?:number, staleMs?:number, now?:()=>number,
   *          onChange?:(state:object)=>void, tabId?:string}} options
   */
  constructor({
    projectId,
    storage = globalThis.localStorage,
    locks = globalThis.navigator?.locks,
    channelFactory = name => (typeof BroadcastChannel === 'function' ? new BroadcastChannel(name) : null),
    heartbeatMs = HEARTBEAT_MS,
    staleMs = STALE_MS,
    now = () => Date.now(),
    onChange = () => {},
    tabId,
  } = {}) {
    this.projectId = projectId;
    this.storage = storage;
    this.locks = locks;
    this.heartbeatMs = heartbeatMs;
    this.staleMs = staleMs;
    this.now = now;
    this.onChange = onChange;
    this.tabId = tabId ?? (globalThis.crypto?.randomUUID ? crypto.randomUUID() : `tab-${Math.random().toString(36).slice(2)}`);
    this.isWriter = false;
    this.releaseHeld = null;
    this.timer = null;
    this.channel = null;
    try {this.channel = channelFactory(`blocking-room.lock.${projectId}`);} catch {this.channel = null;}
    this.channel?.unref?.(); // Node (unit test) tidak boleh ditahan hidup oleh channel
    if (this.channel) {
      this.channel.onmessage = event => {
        const data = event?.data;
        if (!data || data.tabId === this.tabId) return;
        if (data.type === 'release') this.onChange({isWriter: this.isWriter, writerGone: true});
        if (data.type === 'claim' && !this.isWriter) this.onChange({isWriter: false, writerGone: false});
      };
    }
  }

  /** Mencoba menjadi writer. Mengembalikan true bila tab ini boleh menulis. */
  async acquire() {
    if (this.isWriter) return true;
    const granted = this.locks ? await this.acquireWebLock() : this.acquireHeartbeat();
    if (granted) {
      this.isWriter = true;
      this.writeHeartbeat();
      this.timer = setInterval(() => this.writeHeartbeat(), this.heartbeatMs);
      this.timer?.unref?.(); // Node (unit test) tidak boleh ditahan hidup oleh heartbeat
      this.post('claim');
    }
    return granted;
  }

  acquireWebLock() {
    return new Promise(resolve => {
      let settled = false;
      const settle = value => {if (!settled) {settled = true; resolve(value);}};
      try {
        this.locks.request(lockName(this.projectId), {ifAvailable: true}, lock => {
          if (!lock) {settle(false); return undefined;}
          settle(true);
          // Kunci ditahan selama promise ini belum selesai — dilepas browser bila tab mati.
          return new Promise(release => {this.releaseHeld = release;});
        }).catch(() => settle(false));
      } catch {
        settle(this.acquireHeartbeat());
      }
    });
  }

  /** Klaim berbasis heartbeat: hanya boleh bila tidak ada writer hidup. */
  acquireHeartbeat() {
    const current = this.readHeartbeat();
    if (current && current.tabId !== this.tabId && !this.isStale(current)) return false;
    this.writeHeartbeat();
    // Baca ulang: bila dua tab menulis bersamaan, hanya yang terakhir yang menang.
    const confirmed = this.readHeartbeat();
    return !!confirmed && confirmed.tabId === this.tabId;
  }

  isStale(entry) {
    return !entry || (this.now() - Number(entry.at ?? 0)) > this.staleMs;
  }

  readHeartbeat() {
    try {
      const raw = this.storage?.getItem(heartbeatKey(this.projectId));
      return raw ? JSON.parse(raw) : null;
    } catch {return null;}
  }

  writeHeartbeat() {
    try {this.storage?.setItem(heartbeatKey(this.projectId), JSON.stringify({tabId: this.tabId, at: this.now()}));} catch {/* kuota penuh: heartbeat bukan data pengguna */}
  }

  /** Status writer lain: ada atau tidak, dan apakah sudah kedaluwarsa. */
  writerStatus() {
    const entry = this.readHeartbeat();
    if (!entry || entry.tabId === this.tabId) return {present: false, stale: true, at: entry?.at ?? 0};
    return {present: true, stale: this.isStale(entry), at: entry.at};
  }

  /**
   * Mengambil alih kepemilikan. Berhasil hanya bila kunci benar-benar bebas
   * (writer lama menutup tab atau crash). Writer yang masih hidup tidak dapat direbut.
   * @returns {Promise<{ok:boolean, reason?:string}>}
   */
  async takeOver() {
    if (this.isWriter) return {ok: true};
    if (!this.locks && this.writerStatus().present && !this.writerStatus().stale) {
      return {ok: false, reason: 'Tab lain masih aktif menulis proyek ini. Tutup tab tersebut, atau pilih “Buka salinan”.'};
    }
    const granted = await this.acquire();
    return granted ? {ok: true} : {ok: false, reason: 'Tab lain masih memegang kunci tulis proyek ini. Tutup tab tersebut, atau pilih “Buka salinan”.'};
  }

  post(type) {
    try {this.channel?.postMessage({type, projectId: this.projectId, tabId: this.tabId});} catch {/* channel tertutup */}
  }

  /** Melepas kepemilikan (tab ditutup / berpindah proyek). */
  release() {
    clearInterval(this.timer);
    this.timer = null;
    if (this.isWriter) {
      const entry = this.readHeartbeat();
      if (entry?.tabId === this.tabId) {
        try {this.storage?.removeItem(heartbeatKey(this.projectId));} catch {/* diabaikan */}
      }
      this.post('release');
    }
    this.isWriter = false;
    this.releaseHeld?.();
    this.releaseHeld = null;
  }

  dispose() {
    this.release();
    try {this.channel?.close();} catch {/* diabaikan */}
    this.channel = null;
  }
}

/**
 * Status writer sebuah proyek dari luar editor (dipakai dashboard, F3-09).
 * Membaca heartbeat localStorage saja: dashboard tidak boleh mengambil kunci apa pun.
 * @returns {{present:boolean, stale:boolean, at:number}}
 */
export function projectWriterStatus(projectId, {storage = globalThis.localStorage, now = () => Date.now(), staleMs = STALE_MS} = {}) {
  let entry = null;
  try {
    const raw = storage?.getItem(heartbeatKey(projectId));
    entry = raw ? JSON.parse(raw) : null;
  } catch {entry = null;}
  if (!entry) return {present: false, stale: true, at: 0};
  const at = Number(entry.at ?? 0);
  return {present: true, stale: (now() - at) > staleMs, at};
}

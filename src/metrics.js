// Metrik lokal (F6-06, PRD §11).
//
// Tiga aturan yang menentukan bentuk modul ini:
//
// 1. **Tidak ada isi karya di dalam metrik.** Nama proyek, nama karakter, catatan
//    sutradara, posisi dan seluruh isi scene TIDAK boleh masuk. Itu dijamin secara
//    struktural, bukan dengan disiplin pemanggil: setiap event punya skema properti
//    tetap, properti di luar skema dibuang, properti angka dipaksa menjadi angka,
//    dan properti teks hanya boleh bernilai dari daftar tertutup (nilai asing
//    menjadi `other`). Tidak ada jalur yang dapat menuliskan teks bebas.
// 2. **Lokal saja.** Tidak ada pengiriman ke mana pun. Preferensi "telemetry
//    eksternal" hanya disimpan sebagai penanda supaya keputusan pengguna tercatat
//    saat pilot; tidak ada kode jaringan di sini dan tidak boleh ditambahkan tanpa
//    keputusan privasi tersendiri (PRD §9 Privasi).
// 3. **Tidak pernah mengganggu editor.** Semua penulisan dibungkus try/catch; mode
//    privat, kuota penuh atau localStorage yang diblokir tidak boleh membuat satu
//    pun aksi pengguna gagal.
//
// Penyimpanan: ring buffer JSON di localStorage (`blocking-room.metrics`).
// localStorage dipilih, bukan IndexedDB, karena metrik harus dapat ditulis dari
// jalur sinkron (`pagehide`) dan tidak boleh ikut antre di belakang transaksi
// dokumen — metrik tidak pernah boleh memperlambat penyimpanan karya.

export const METRICS_KEY = 'blocking-room.metrics';
export const TELEMETRY_OPT_IN_KEY = 'blocking-room.telemetryOptIn';
/** Jumlah event yang disimpan; event terlama dibuang lebih dahulu. */
export const RING_LIMIT = 300;

/** Nilai teks yang diizinkan per properti. Nilai lain menjadi `other`. */
export const ENUMS = {
  storage: ['local', 'memory'],
  error_code: ['quota', 'unavailable', 'validation', 'readonly', 'unsupported', 'aborted', 'unknown'],
  command_type: [
    'move', 'rotate', 'property', 'add_actor', 'add_room', 'add_camera', 'delete', 'rename',
    'lock', 'unlock', 'hide', 'show', 'keyframe', 'duration', 'door', 'record', 'import',
    'scene_add', 'scene_duplicate', 'scene_move', 'scene_remove', 'scene_rename', 'scene_switch',
  ],
  source: ['pointer', 'keyboard', 'inspector', 'list', 'timeline', 'dashboard', 'menu', 'file'],
  direction: ['undo', 'redo'],
  action: ['restore', 'open_last', 'dismiss', 'pending'],
  codec: ['vp9', 'vp8', 'h264', 'av1', 'unknown'],
  resolution: ['480p', '720p', '1080p', 'unknown'],
  template: ['blank', 'demo', 'import', 'duplicate'],
};

/**
 * Skema event: nama properti → tipe.
 * `number` dibulatkan dan dibatasi; `enum:<nama>` memakai daftar di atas.
 * Properti apa pun di luar daftar ini dibuang tanpa suara.
 */
export const EVENT_SCHEMA = {
  project_created: {storage: 'enum:storage', template: 'enum:template', duration_ms: 'number', schemaVersion: 'number'},
  project_opened: {storage: 'enum:storage', duration_ms: 'number', schemaVersion: 'number', scenes: 'number', bytes: 'number'},
  autosave_completed: {revision: 'number', duration_ms: 'number'},
  autosave_failed: {revision: 'number', duration_ms: 'number', error_code: 'enum:error_code'},
  editor_command: {command_type: 'enum:command_type', source: 'enum:source', affected_count: 'number'},
  history_used: {direction: 'enum:direction', depth: 'number'},
  export_started: {codec: 'enum:codec', resolution: 'enum:resolution', fps: 'number'},
  export_completed: {codec: 'enum:codec', resolution: 'enum:resolution', fps: 'number', duration_ms: 'number'},
  export_failed: {codec: 'enum:codec', resolution: 'enum:resolution', fps: 'number', duration_ms: 'number', error_code: 'enum:error_code'},
  recovery_used: {snapshot_age: 'number', action: 'enum:action'},
};

export const EVENT_NAMES = Object.keys(EVENT_SCHEMA);

const MAX_NUMBER = 1e12;

function coerceNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.max(-MAX_NUMBER, Math.min(MAX_NUMBER, Math.round(number)));
}

function coerceEnum(value, name) {
  const allowed = ENUMS[name] ?? [];
  if (typeof value !== 'string') return 'other';
  return allowed.includes(value) ? value : 'other';
}

/**
 * Menyaring properti sebuah event menurut `EVENT_SCHEMA`.
 * Fungsi murni — dipakai langsung oleh unit test sebagai bukti bahwa teks bebas
 * tidak dapat lolos.
 */
export function sanitizeProps(event, props = {}) {
  const schema = EVENT_SCHEMA[event];
  if (!schema) return null;
  const out = {};
  for (const [key, type] of Object.entries(schema)) {
    if (!(key in (props ?? {}))) continue;
    const raw = props[key];
    if (raw === null || raw === undefined) continue;
    if (type === 'number') {
      const number = coerceNumber(raw);
      if (number !== null) out[key] = number;
    } else {
      out[key] = coerceEnum(raw, type.slice('enum:'.length));
    }
  }
  return out;
}

/** Id sesi pendek dan acak; bukan identitas pengguna dan tidak pernah dikirim. */
function makeSessionId() {
  try {
    if (typeof crypto?.randomUUID === 'function') return crypto.randomUUID().slice(0, 8);
  } catch {/* lanjut ke fallback */}
  return Math.random().toString(36).slice(2, 10);
}

export class MetricsRecorder {
  /**
   * @param {{storage?:Storage, key?:string, limit?:number, now?:()=>number,
   *          sessionId?:string, enabled?:boolean}} options
   */
  constructor({storage = globalThis.localStorage, key = METRICS_KEY, limit = RING_LIMIT, now = () => Date.now(), sessionId, enabled = true} = {}) {
    this.storage = storage;
    this.key = key;
    this.limit = limit;
    this.now = now;
    this.sessionId = sessionId ?? makeSessionId();
    this.enabled = enabled;
    this.dropped = 0;
  }

  /** Isi ring buffer, terlama lebih dahulu. Selalu mengembalikan array. */
  list() {
    try {
      const raw = this.storage?.getItem(this.key);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {return [];}
  }

  /**
   * Mencatat satu event. Event yang tidak dikenal diabaikan (dihitung di `dropped`).
   * @returns {object|null} entri yang benar-benar disimpan
   */
  record(event, props = {}) {
    if (!this.enabled) return null;
    const clean = sanitizeProps(event, props);
    if (!clean) {this.dropped += 1; return null;}
    const entry = {t: new Date(this.now()).toISOString(), s: this.sessionId, e: event, p: clean};
    try {
      const list = this.list();
      list.push(entry);
      while (list.length > this.limit) list.shift();
      this.storage?.setItem(this.key, JSON.stringify(list));
    } catch {
      // Kuota penuh atau storage diblokir: metrik hilang, editor tidak terganggu.
      this.dropped += 1;
    }
    return entry;
  }

  /** Ringkasan jumlah per jenis event, untuk panel "Lihat metrik lokal". */
  summary() {
    const counts = {};
    for (const entry of this.list()) counts[entry.e] = (counts[entry.e] ?? 0) + 1;
    return counts;
  }

  /** Isi berkas ekspor JSON. Tidak memuat apa pun selain event yang sudah disaring. */
  toExport() {
    const list = this.list();
    return {
      exportedAt: new Date(this.now()).toISOString(),
      note: 'Metrik lokal Blocking Room. Tidak memuat nama proyek maupun isi scene.',
      schema: EVENT_SCHEMA,
      count: list.length,
      events: list,
    };
  }

  clear() {
    try {this.storage?.removeItem(this.key); return true;} catch {return false;}
  }

  /**
   * Preferensi telemetry eksternal. PENTING: tidak ada pengiriman yang
   * diimplementasikan — nilai ini hanya dicatat untuk keputusan pilot.
   */
  get telemetryOptIn() {
    try {return this.storage?.getItem(TELEMETRY_OPT_IN_KEY) === 'true';} catch {return false;}
  }
  setTelemetryOptIn(value) {
    try {this.storage?.setItem(TELEMETRY_OPT_IN_KEY, value ? 'true' : 'false'); return true;} catch {return false;}
  }
}

/** Instans bersama untuk aplikasi. */
export const metrics = new MetricsRecorder();

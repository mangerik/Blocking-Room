// Pemilihan codec dan pembungkus `VideoEncoder` (F5-04).
//
// Tiga hal yang dibuktikan spike F5-01 dan dikodekan di sini
// (`docs/SPIKE-ENCODER.md` §2, §9):
//
// 1. **Codec string H.264 bergantung resolusi.** `avc1.42E01E` (Baseline L3.0)
//    ditolak di 720p30. Level dipilih dari resolusi, lalu tetap diverifikasi
//    dengan `isConfigSupported`.
// 2. **`configure()` dengan codec tak dikenal tidak melempar.** `NotSupportedError`
//    datang ASINKRON ke callback `error`. Karena itu setiap kegagalan encoder
//    disimpan di `this.failure` dan diperiksa setiap frame — try/catch saja tidak cukup.
// 3. **Jangan pernah meminta `prefer-hardware`.** Di mesin referensi seluruh codec
//    menolaknya. Konfigurasi memakai default (`no-preference`).
//
// Modul ini tidak menyentuh DOM sama sekali, sehingga dapat dipindahkan ke Worker.

/** Bitrate usulan D-04: `w × h × fps × 0,12` (720p30 ≈ 3,3 Mbps). */
export function bitrateFor(width, height, fps) {
  return Math.round(width * height * fps * 0.12);
}

/** Level VP9 mengikuti jumlah piksel (spike §2: level VP9 tidak menolak resolusi, tetapi tetap dipilih jujur). */
export function vp9CodecString(width, height) {
  return width * height > 1280 * 720 ? 'vp09.00.41.08' : 'vp09.00.31.08';
}
/** H.264 High: L4.0 sampai 1080p, L5.1 di atasnya (spike §2). */
export function h264CodecString(width, height) {
  return width * height > 1920 * 1080 ? 'avc1.640033' : 'avc1.640028';
}

/**
 * Kandidat codec deterministik. Urutan = urutan pilihan default.
 * Semuanya WebM karena muxer MP4 belum disetujui (D-04 / `docs/SPIKE-ENCODER.md` §11).
 */
export const DETERMINISTIC_CODECS = [
  {
    id: 'vp9', family: 'vp9', container: 'webm', extension: 'webm',
    label: 'VP9 · WebM', note: 'Default. Terbukti 300 frame / 10,000 s pada spike.',
    codecString: (w, h) => vp9CodecString(w, h),
  },
  {
    id: 'vp8', family: 'vp8', container: 'webm', extension: 'webm',
    label: 'VP8 · WebM', note: 'Kompatibilitas pemutar lebih luas, ukuran berkas lebih besar.',
    codecString: () => 'vp8',
  },
  {
    id: 'av1', family: 'av1', container: 'webm', extension: 'webm',
    label: 'AV1 · WebM', note: 'Dukungan NLE masih terbatas.',
    codecString: () => 'av01.0.04M.08',
  },
  {
    id: 'h264', family: 'h264', container: 'webm', extension: 'webm',
    label: 'H.264 · WebM', note: 'Dukungan pemutar terbatas: H.264 di dalam WebM tidak dibaca semua pemutar. MP4 belum tersedia.',
    codecString: (w, h) => h264CodecString(w, h),
  },
];

/**
 * Format yang sengaja ditampilkan sebagai TIDAK tersedia, lengkap dengan alasannya.
 * Menjanjikan MP4 lalu gagal jauh lebih buruk daripada mengatakannya di awal.
 */
export const UNAVAILABLE_FORMATS = [
  {
    id: 'mp4-h264', label: 'MP4 · H.264 — belum tersedia',
    reason: 'Butuh muxer MP4. Keputusan D-04 belum menyetujui dependency `mp4-muxer`, '
      + 'dan menulis ISO BMFF sendiri belum masuk lingkup rilis ini.',
  },
];

export const codecById = id => DETERMINISTIC_CODECS.find(c => c.id === id) ?? null;

/** Konfigurasi `VideoEncoder` untuk satu kandidat codec. */
export function encoderConfig({codecString, width, height, fps, bitrate}) {
  return {
    codec: codecString,
    width,
    height,
    framerate: fps,
    bitrate: bitrate ?? bitrateFor(width, height, fps),
    bitrateMode: 'variable',
    latencyMode: 'quality',
    // `hardwareAcceleration` sengaja TIDAK diisi — lihat catatan modul di atas.
  };
}

export class UnsupportedCodecError extends Error {
  constructor(message, {codec} = {}) {
    super(message);
    this.name = 'UnsupportedCodecError';
    this.codec = codec ?? null;
  }
}
export class ExportCancelled extends Error {
  constructor(message = 'Ekspor dibatalkan.') {
    super(message);
    this.name = 'ExportCancelled';
  }
}

/**
 * Menanyakan kepada browser codec deterministik mana yang benar-benar dapat dipakai
 * pada ukuran dan fps ini. Ini daftar yang TERPISAH dari daftar MediaRecorder:
 * spike §5 membuktikan keduanya tidak dapat saling menyimpulkan.
 *
 * @returns {Promise<Array<{id,label,note,codecString,supported,reason}>>}
 */
export async function probeDeterministicCodecs({width, height, fps, scope = globalThis, candidates = DETERMINISTIC_CODECS} = {}) {
  const Encoder = scope?.VideoEncoder;
  if (typeof Encoder !== 'function') return [];
  const out = [];
  for (const candidate of candidates) {
    const codecString = candidate.codecString(width, height);
    const row = {...candidate, codecString, supported: false, reason: null};
    try {
      const result = await Encoder.isConfigSupported(encoderConfig({codecString, width, height, fps}));
      row.supported = !!result?.supported;
      if (!row.supported) row.reason = 'Ditolak browser pada resolusi/fps ini.';
    } catch (error) {
      row.reason = error?.message ?? 'Gagal diperiksa.';
    }
    out.push(row);
  }
  return out;
}

/** Kandidat pertama yang didukung (dipakai bila pengguna memilih "otomatis"). */
export async function pickDeterministicCodec(options) {
  const list = await probeDeterministicCodecs(options);
  return list.find(row => row.supported) ?? null;
}

/**
 * Pembungkus `VideoEncoder` dengan backpressure dan penanganan error asinkron.
 *
 * Kontrak pemakaian yang wajib diikuti (spike §9): buat `VideoFrame` → `encode()`
 * → `frame.close()` segera, lalu `await drain()` ketika antrean penuh.
 */
export class ChunkEncoder {
  /**
   * @param {{config:object, onChunk:(chunk,meta)=>void, scope?:object,
   *          queueLimit?:number, dequeueTimeoutMs?:number}} options
   */
  static async create({config, onChunk, scope = globalThis, queueLimit = 8, dequeueTimeoutMs = 30000}) {
    const Encoder = scope?.VideoEncoder;
    if (typeof Encoder !== 'function') {
      throw new UnsupportedCodecError('Browser ini tidak memiliki WebCodecs (VideoEncoder).');
    }
    // `configure()` MELEMPAR SINKRON untuk dimensi tidak valid; dicegat lebih awal
    // supaya pesannya dapat dibaca pengguna.
    if (!(config.width > 0) || !(config.height > 0) || config.width % 2 || config.height % 2) {
      throw new UnsupportedCodecError('Lebar dan tinggi video harus bilangan genap yang lebih besar dari nol.');
    }
    let support = null;
    try {
      support = await Encoder.isConfigSupported(config);
    } catch (error) {
      throw new UnsupportedCodecError(`Codec ${config.codec} tidak dapat diperiksa: ${error?.message ?? error}`, {codec: config.codec});
    }
    if (!support?.supported) {
      throw new UnsupportedCodecError(
        `Codec ${config.codec} tidak didukung browser ini pada ${config.width}×${config.height} ${config.framerate} fps.`,
        {codec: config.codec});
    }
    const instance = new ChunkEncoder({config, onChunk, queueLimit, dequeueTimeoutMs});
    instance.encoder = new Encoder({
      output: (chunk, meta) => {
        try {onChunk(chunk, meta);} catch (error) {instance.fail(error);}
      },
      // NotSupportedError untuk codec tak dikenal sampai di sini, bukan lewat throw.
      error: error => instance.fail(error),
    });
    instance.encoder.configure(config);
    return instance;
  }

  constructor({config, onChunk, queueLimit = 8, dequeueTimeoutMs = 30000}) {
    this.config = config;
    this.onChunk = onChunk;
    this.queueLimit = queueLimit;
    this.dequeueTimeoutMs = dequeueTimeoutMs;
    this.encoder = null;
    /** @type {Error|null} kegagalan asinkron pertama */
    this.failure = null;
    this.encodedFrames = 0;
  }

  fail(error) {
    this.failure ??= error instanceof Error ? error : new Error(String(error?.message ?? error));
  }
  /** Melempar bila encoder sudah gagal secara asinkron. Dipanggil setiap frame. */
  assertHealthy() {
    if (this.failure) throw this.failure;
  }
  get state() {return this.encoder?.state ?? 'closed';}
  get queueSize() {return this.encoder?.encodeQueueSize ?? 0;}

  encode(frame, options) {
    this.assertHealthy();
    if (this.state !== 'configured') throw new Error('Encoder sudah ditutup sebelum ekspor selesai.');
    this.encoder.encode(frame, options);
    this.encodedFrames += 1;
  }

  /** Menunggu antrean encoder turun di bawah batas (spike §8: puncak memori). */
  async drain() {
    this.assertHealthy();
    if (this.queueSize <= this.queueLimit) return;
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.encoder.removeEventListener('dequeue', handler);
        reject(new Error('Encoder tidak merespons (timeout antrean).'));
      }, this.dequeueTimeoutMs);
      const handler = () => {
        if (this.failure || this.queueSize <= this.queueLimit) {
          clearTimeout(timer);
          this.encoder.removeEventListener('dequeue', handler);
          resolve();
        }
      };
      this.encoder.addEventListener('dequeue', handler);
    });
    this.assertHealthy();
  }

  async flush() {
    this.assertHealthy();
    if (this.state === 'configured') await this.encoder.flush();
    this.assertHealthy();
  }

  /** Idempoten; wajib dipanggil pada selesai/cancel/error. */
  close() {
    try {
      if (this.encoder && this.encoder.state !== 'closed') this.encoder.close();
    } catch {/* encoder sudah ditutup runtime */}
    this.encoder = null;
  }
}

// Muxer WebM minimal — hasil port dari prototipe spike F5-01
// (`tests/spike/encoder-probe.html`) menjadi modul produksi yang dapat diuji unit.
//
// Kenapa ditulis sendiri dan bukan memakai dependency: `docs/SPIKE-ENCODER.md` §4
// mengukur prototipe ini menghasilkan file 300 frame / 10,000000 detik yang lolos
// `ffprobe` dengan overhead container 0,11% dan nol dependency. Keputusan D-04
// belum menyetujui `mp4-muxer`, jadi container yang didukung hanya WebM.
//
// Batas modul (agar kelak dapat dipindah ke Worker): TIDAK ADA sentuhan DOM di
// sini. Semua fungsi di bawah `Blob` adalah fungsi murni byte → mudah diuji.
//
// Struktur yang ditulis:
//   EBML header
//   Segment
//     Info    (TimestampScale 1 ms, MuxingApp/WritingApp, Duration)
//     Tracks  (satu track video: CodecID, CodecPrivate bila ada, PixelWidth/Height,
//              DefaultDuration)
//     Cluster … (cluster baru pada setiap keyframe; isi SimpleBlock)
//     Cues    (satu CuePoint per cluster → file dapat di-seek)
//
// Keterbatasan yang disengaja (dicatat di docs/SPIKE-ENCODER.md §13): video saja,
// satu track, tanpa audio, tanpa SeekHead, tanpa B-frame/timestamp negatif.

/** Bilangan bulat tak bertanda big-endian dengan panjang byte minimal. */
export function uintBytes(value) {
  const bytes = [];
  let v = Math.max(0, Math.floor(value));
  do {
    bytes.unshift(v & 0xff);
    v = Math.floor(v / 256);
  } while (v > 0);
  return Uint8Array.from(bytes);
}

/** ID elemen EBML ditulis apa adanya (marker panjang sudah termasuk dalam nilai id). */
export function elementIdBytes(id) {
  return uintBytes(id);
}

/**
 * Data size EBML, panjang 1..8 byte.
 * Nilai "semua bit satu" dipakai sebagai penanda ukuran tidak diketahui, jadi
 * batas per panjang adalah `2^(7·len) − 1` (eksklusif).
 */
export function sizeBytes(size) {
  for (let len = 1; len <= 8; len += 1) {
    const max = Math.pow(2, 7 * len) - 1;
    if (size < max) {
      const bytes = new Uint8Array(len);
      let v = size;
      for (let i = len - 1; i >= 0; i -= 1) {
        bytes[i] = v & 0xff;
        v = Math.floor(v / 256);
      }
      bytes[0] |= 1 << (8 - len);
      return bytes;
    }
  }
  throw new RangeError('Ukuran elemen EBML terlalu besar.');
}

export function concatBytes(parts) {
  let total = 0;
  for (const part of parts) total += part.length;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

export function element(id, payload) {
  return concatBytes([elementIdBytes(id), sizeBytes(payload.length), payload]);
}
export function uintElement(id, value) {
  return element(id, uintBytes(value));
}
export function stringElement(id, value) {
  return element(id, new TextEncoder().encode(value));
}
export function floatElement(id, value) {
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setFloat64(0, value);
  return element(id, bytes);
}

/** CodecID Matroska untuk codec string WebCodecs. */
export function webmCodecId(codec) {
  const id = String(codec ?? '');
  if (id.startsWith('vp09') || id === 'vp9') return 'V_VP9';
  if (id === 'vp8' || id.startsWith('vp08')) return 'V_VP8';
  if (id.startsWith('av01')) return 'V_AV1';
  // H.264 di dalam WebM/Matroska: sah menurut spesifikasi Matroska, tetapi banyak
  // pemutar WebM murni menolaknya. Dialog ekspor menandainya sebagai terbatas.
  if (id.startsWith('avc1') || id.startsWith('avc3')) return 'V_MPEG4/ISO/AVC';
  return null;
}

/** Codec yang benar-benar dapat dibungkus muxer ini. */
export const SUPPORTED_MUXER_CODECS = ['vp9', 'vp8', 'av1', 'h264'];

/** Batas jarak timestamp dalam satu cluster; SimpleBlock memakai int16 (ms). */
const MAX_CLUSTER_SPAN_MS = 30000;

/**
 * Muxer WebM untuk satu track video.
 *
 * Pemakaian:
 *   const muxer = new WebMMuxer({width, height, codec, fps});
 *   muxer.addChunk(chunk, metadata);   // chunk EncodedVideoChunk atau objek biasa
 *   const blob = muxer.finalize();
 */
export class WebMMuxer {
  /**
   * @param {{width:number, height:number, codec:string, fps:number,
   *          writingApp?:string}} options
   */
  constructor({width, height, codec, fps, writingApp = 'blocking-room'} = {}) {
    const codecId = webmCodecId(codec);
    if (!codecId) throw new Error(`Codec tidak dapat dibungkus WebM: ${codec}`);
    if (!(width > 0) || !(height > 0)) throw new RangeError('Dimensi video tidak valid.');
    if (!(fps > 0)) throw new RangeError('fps tidak valid.');
    this.width = Math.round(width);
    this.height = Math.round(height);
    this.codec = codec;
    this.codecId = codecId;
    this.fps = fps;
    this.writingApp = writingApp;
    /** @type {{timestamp:number, type:string, data:Uint8Array}[]} */
    this.chunks = [];
    /** CodecPrivate (`avcC`/`av1C`) dari `metadata.decoderConfig.description`. */
    this.codecPrivate = null;
    this.finalized = false;
  }

  get chunkCount() {return this.chunks.length;}
  /** Total byte data terenkode (tanpa overhead container). */
  get payloadBytes() {return this.chunks.reduce((sum, c) => sum + c.data.length, 0);}

  /**
   * Menambahkan satu chunk hasil `VideoEncoder`.
   * @param {EncodedVideoChunk|{timestamp:number,type:string,data:ArrayBufferView}} chunk
   * @param {{decoderConfig?:{description?:ArrayBuffer|ArrayBufferView}}} [metadata]
   */
  addChunk(chunk, metadata) {
    if (this.finalized) throw new Error('Muxer sudah difinalisasi.');
    const description = metadata?.decoderConfig?.description;
    if (description && !this.codecPrivate) {
      this.codecPrivate = description instanceof Uint8Array
        ? new Uint8Array(description)
        : new Uint8Array(ArrayBuffer.isView(description) ? description.buffer.slice(description.byteOffset, description.byteOffset + description.byteLength) : description);
    }
    let data;
    if (typeof chunk.copyTo === 'function') {
      data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
    } else if (ArrayBuffer.isView(chunk.data)) {
      data = new Uint8Array(chunk.data.buffer.slice(chunk.data.byteOffset, chunk.data.byteOffset + chunk.data.byteLength));
    } else {
      data = new Uint8Array(chunk.data ?? 0);
    }
    this.chunks.push({timestamp: chunk.timestamp, type: chunk.type, data});
    return this.chunks.length;
  }

  /** Membuang seluruh buffer (cancel/error) supaya memori segera dilepas. */
  discard() {
    this.chunks = [];
    this.codecPrivate = null;
    this.finalized = true;
  }

  /** Header EBML — sama untuk setiap berkas. */
  static ebmlHeader() {
    return element(0x1A45DFA3, concatBytes([
      uintElement(0x4286, 1),  // EBMLVersion
      uintElement(0x42F7, 1),  // EBMLReadVersion
      uintElement(0x42F2, 4),  // EBMLMaxIDLength
      uintElement(0x42F3, 8),  // EBMLMaxSizeLength
      stringElement(0x4282, 'webm'),
      uintElement(0x4287, 2),  // DocTypeVersion
      uintElement(0x4285, 2),  // DocTypeReadVersion
    ]));
  }

  /** Durasi container dalam milidetik: timestamp terakhir + satu durasi frame. */
  durationMs() {
    if (!this.chunks.length) return 0;
    return (this.chunks.at(-1).timestamp / 1000) + (1000 / this.fps);
  }

  buildInfo() {
    return element(0x1549A966, concatBytes([
      uintElement(0x2AD7B1, 1000000),           // TimestampScale = 1 ms
      stringElement(0x4D80, 'blocking-room'),   // MuxingApp
      stringElement(0x5741, this.writingApp),   // WritingApp
      floatElement(0x4489, this.durationMs()),  // Duration (ms)
    ]));
  }

  buildTracks() {
    const entry = [
      uintElement(0xD7, 1),      // TrackNumber
      uintElement(0x73C5, 1),    // TrackUID
      uintElement(0x83, 1),      // TrackType = video
      stringElement(0x86, this.codecId),
    ];
    if (this.codecPrivate) entry.push(element(0x63A2, this.codecPrivate)); // CodecPrivate
    entry.push(uintElement(0x23E383, Math.round(1e9 / this.fps)));         // DefaultDuration (ns)
    entry.push(element(0xE0, concatBytes([
      uintElement(0xB0, this.width),
      uintElement(0xBA, this.height),
    ])));
    return element(0x1654AE6B, element(0xAE, concatBytes(entry)));
  }

  /** Membagi chunk menjadi cluster; cluster baru dimulai pada setiap keyframe. */
  buildClusters() {
    const clusters = [];
    const startTimes = [];
    let current = null;
    let clusterTimeMs = 0;
    const flush = () => {
      if (!current) return;
      clusters.push(element(0x1F43B675, concatBytes([uintElement(0xE7, clusterTimeMs), ...current])));
    };
    for (const chunk of this.chunks) {
      const timeMs = Math.round(chunk.timestamp / 1000);
      const newCluster = !current
        || (chunk.type === 'key' && timeMs - clusterTimeMs > 0)
        || timeMs - clusterTimeMs > MAX_CLUSTER_SPAN_MS;
      if (newCluster) {
        flush();
        current = [];
        clusterTimeMs = timeMs;
        startTimes.push(timeMs);
      }
      const header = new Uint8Array(4);
      header[0] = 0x81; // TrackNumber 1 sebagai vint
      new DataView(header.buffer).setInt16(1, timeMs - clusterTimeMs);
      header[3] = chunk.type === 'key' ? 0x80 : 0x00;
      current.push(element(0xA3, concatBytes([header, chunk.data])));
    }
    flush();
    return {clusters, startTimes};
  }

  /**
   * Menyusun seluruh byte berkas.
   * Dipisahkan dari `finalize()` supaya uji unit dapat memeriksa struktur EBML
   * tanpa memerlukan `Blob` (tidak ada di Node lama) — dan supaya tidak ada dua
   * jalur penulisan yang bisa berbeda diam-diam.
   * @returns {Uint8Array}
   */
  finalizeBytes() {
    if (!this.chunks.length) throw new Error('Tidak ada frame yang dapat ditulis.');
    const info = this.buildInfo();
    const tracks = this.buildTracks();
    const {clusters, startTimes} = this.buildClusters();
    // Cues menunjuk offset cluster relatif terhadap awal DATA Segment.
    const cuePoints = [];
    let offset = info.length + tracks.length;
    for (let i = 0; i < clusters.length; i += 1) {
      cuePoints.push(element(0xBB, concatBytes([
        uintElement(0xB3, startTimes[i]),                                              // CueTime
        element(0xB7, concatBytes([uintElement(0xF7, 1), uintElement(0xF1, offset)])), // CueTrack + CueClusterPosition
      ])));
      offset += clusters[i].length;
    }
    const segment = element(0x18538067, concatBytes([info, tracks, ...clusters, element(0x1C53BB6B, concatBytes(cuePoints))]));
    return concatBytes([WebMMuxer.ebmlHeader(), segment]);
  }

  /**
   * Menutup berkas dan mengembalikan Blob WebM siap unduh.
   * @returns {Blob}
   */
  finalize() {
    const bytes = this.finalizeBytes();
    this.finalized = true;
    return new Blob([bytes], {type: 'video/webm'});
  }
}

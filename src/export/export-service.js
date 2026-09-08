// Orkestrasi job ekspor deterministik (F5-02/F5-03/F5-04).
//
// Aturan yang menentukan bentuk modul ini:
//
// 1. **Tanpa `requestAnimationFrame` dan tanpa pacing wall-clock.** Loop frame
//    adalah `for f = start..end` dengan `t = f / fps`. Ekspor tetap berjalan
//    ketika tab tidak terlihat (rAF berhenti di tab tersembunyi).
// 2. **Timestamp tidak pernah berasal dari jam.** `timestamp = f × 1e6 / fps` µs.
//    10 detik × 30 fps = 300 frame dan durasi container 10,000 detik.
// 3. **Sumber render adalah snapshot immutable.** Job menerima `renderFrame`
//    yang sudah terikat pada salinan dokumen; mengedit scene setelah job dimulai
//    tidak mengubah hasilnya (F5-03).
// 4. **Tidak menyentuh DOM.** `VideoFrame` dibuat dari apa pun yang diberikan
//    `renderFrame` (canvas), tetapi modul ini tidak pernah membaca/menulis DOM,
//    sehingga batas modul tetap siap dipindahkan ke Worker.

import {aspectSize} from '../timeline-engine.js';
import {ChunkEncoder, ExportCancelled, bitrateFor, codecById, encoderConfig} from './encoder.js';
import {WebMMuxer} from './webm-muxer.js';

/**
 * Preset resolusi (D-04). Angka dasar dipakai bersama `aspectSize` supaya crop
 * hasil ekspor identik dengan aspect ratio shot: 16:9 → 1280×720, 9:16 → 720×1280.
 */
export const RESOLUTION_PRESETS = {
  '720p': {id: '720p', label: '1280 × 720 (HD)', baseHeight: 720, maxWidth: 1280, maxHeight: 1280},
  '1080p': {id: '1080p', label: '1920 × 1080 (Full HD)', baseHeight: 1080, maxWidth: 1920, maxHeight: 1920},
};
export const DEFAULT_RESOLUTION = '720p';
/** fps yang boleh dipilih (D-04: hanya integer; TimestampScale milidetik). */
export const FPS_CHOICES = [24, 25, 30];

/** Ukuran buffer ekspor untuk sebuah aspect ratio + preset resolusi. */
export function exportSize(aspectRatio, preset = DEFAULT_RESOLUTION) {
  const conf = RESOLUTION_PRESETS[preset] ?? RESOLUTION_PRESETS[DEFAULT_RESOLUTION];
  return aspectSize(aspectRatio, {baseHeight: conf.baseHeight, maxWidth: conf.maxWidth, maxHeight: conf.maxHeight});
}

/**
 * Sanitasi satu ruas nama berkas.
 * Nama proyek/scene/shot adalah teks bebas dari pengguna; ia tidak boleh
 * menghasilkan path traversal, karakter terlarang Windows, maupun nama kosong.
 */
export function sanitizeSegment(text, fallback = 'tanpa-nama') {
  const cleaned = String(text ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  return cleaned || fallback;
}

/**
 * Nama berkas EX-01: `<proyek>_<scene>_<shot>.<ext>`.
 * Jalur real-time menambahkan `_realtime` supaya berkas yang TIDAK frame-akurat
 * tidak pernah tertukar dengan hasil deterministik (F5-05).
 */
export function buildFileName({project, scene, shot, extension = 'webm', realtime = false, suffix = ''}) {
  const parts = [sanitizeSegment(project, 'proyek'), sanitizeSegment(scene, 'scene'), sanitizeSegment(shot, 'shot')];
  const tail = `${suffix ? `_${sanitizeSegment(suffix, 'bagian')}` : ''}${realtime ? '_realtime' : ''}`;
  return `${parts.join('_')}${tail}.${extension}`;
}

/**
 * Menyelesaikan rentang frame yang akan dirender.
 *
 * `range` boleh:
 *   - tidak ada / `{mode:'all'}`     → seluruh shot
 *   - `{mode:'frames', start, end}`  → nomor frame, keduanya INKLUSIF
 *   - `{mode:'seconds', start, end}` → detik; `end` eksklusif (0–10 s @30 = 300 frame)
 *
 * Rentang di luar durasi di-clamp dan dilaporkan lewat `notice`; rentang kosong
 * ditolak dengan pesan yang jelas, bukan menghasilkan berkas nol frame.
 */
export function resolveRange({duration, fps, range} = {}) {
  if (!(duration > 0)) throw new RangeError('Durasi shot harus lebih besar dari nol.');
  if (!(fps > 0)) throw new RangeError('fps harus lebih besar dari nol.');
  const totalFrames = Math.round(duration * fps);
  if (totalFrames < 1) throw new RangeError('Shot ini lebih pendek dari satu frame.');
  const lastFrame = totalFrames - 1;
  const mode = range?.mode ?? 'all';
  let start = 0;
  let end = lastFrame;
  if (mode === 'frames') {
    start = Math.round(Number(range.start ?? 0));
    end = Math.round(Number(range.end ?? lastFrame));
  } else if (mode === 'seconds') {
    start = Math.round(Number(range.start ?? 0) * fps);
    end = Math.round(Number(range.end ?? duration) * fps) - 1;
  }
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    throw new RangeError('Rentang ekspor bukan angka yang sah.');
  }
  const notices = [];
  if (start < 0) {notices.push('Awal rentang dinaikkan ke frame 0.'); start = 0;}
  if (end > lastFrame) {
    notices.push(`Akhir rentang dipotong ke frame ${lastFrame} (batas durasi shot).`);
    end = lastFrame;
  }
  if (start > lastFrame) {
    throw new RangeError(`Awal rentang (frame ${start}) melewati akhir shot (frame ${lastFrame}).`);
  }
  const frameCount = end - start + 1;
  if (frameCount < 1) {
    throw new RangeError('Rentang ekspor kosong: frame akhir berada sebelum frame awal.');
  }
  return {
    startFrame: start, endFrame: end, frameCount, totalFrames, lastFrame,
    clamped: notices.length > 0, notice: notices.join(' ') || null,
    startTime: start / fps, endTime: (end + 1) / fps,
  };
}

/**
 * Memberi kesempatan kepada event loop di antara frame.
 *
 * Tanpa ini, loop ekspor hanya melepas microtask: tab membeku selama seluruh job,
 * tombol "Batalkan" tidak dapat diklik dan progress tidak pernah tergambar.
 * `setTimeout` TIDAK dipakai karena Chrome membatasinya menjadi 1 kali per detik
 * pada tab yang tersembunyi — itu akan mematahkan janji "ekspor jalan walau tab
 * tidak terlihat". `MessageChannel` tidak terkena pembatasan itu.
 */
export function createYielder(scope = globalThis) {
  if (typeof scope.MessageChannel !== 'function') {
    return () => new Promise(resolve => scope.setTimeout(resolve, 0));
  }
  const channel = new scope.MessageChannel();
  let pending = null;
  channel.port1.onmessage = () => {
    const resolve = pending;
    pending = null;
    resolve?.();
  };
  return () => new Promise(resolve => {
    pending = resolve;
    channel.port2.postMessage(0);
  });
}

/** Perkiraan buffer chunk (byte) untuk peringatan sebelum job dimulai (spike §8). */
export function estimateBufferBytes({width, height, fps, frameCount}) {
  return Math.round(bitrateFor(width, height, fps) / 8 * (frameCount / fps));
}

/** Format ukuran berkas untuk UI Bahasa Indonesia. */
export function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Satu job ekspor deterministik.
 *
 * @param {{
 *   id?:string,
 *   naming:{project:string, scene:string, shot:string},
 *   settings:{width:number, height:number, fps:number, codecId:string,
 *             bitrate?:number, range?:object, duration:number},
 *   renderFrame:(time:number, index:number)=>any,
 *   onProgress?:(info:object)=>void,
 *   scope?:object
 * }} options
 */
export class ExportJob {
  constructor({id, naming, settings, renderFrame, onProgress, scope = globalThis}) {
    this.id = id ?? `job-${Math.random().toString(36).slice(2, 10)}`;
    this.naming = naming;
    this.settings = settings;
    this.renderFrame = renderFrame;
    this.onProgress = onProgress ?? (() => {});
    this.scope = scope;
    this.status = 'idle';
    this.cancelled = false;
    this.encodedFrames = 0;
    this.frameCount = 0;
    this.error = null;
    this.result = null;
    this.encoder = null;
    this.muxer = null;
  }

  cancel() {
    this.cancelled = true;
    // Encoder ditutup di `finally` milik `run()`; menutupnya di sini akan membuat
    // `encode()` yang sedang berjalan melempar InvalidStateError yang membingungkan.
  }

  get codec() {return codecById(this.settings.codecId);}

  fileName() {
    return buildFileName({
      project: this.naming.project, scene: this.naming.scene, shot: this.naming.shot,
      extension: this.codec?.extension ?? 'webm',
      suffix: this.settings.range && this.settings.range.mode && this.settings.range.mode !== 'all' ? 'rentang' : '',
    });
  }

  /**
   * Menjalankan job sampai Blob siap.
   * "Ekspor selesai" hanya boleh diumumkan setelah promise ini resolve.
   * @returns {Promise<{blob:Blob, frameCount:number, fileName:string, ...}>}
   */
  async run() {
    const {width, height, fps, duration} = this.settings;
    const codec = this.codec;
    if (!codec) throw new Error(`Codec ekspor tidak dikenal: ${this.settings.codecId}`);
    const range = resolveRange({duration, fps, range: this.settings.range});
    this.frameCount = range.frameCount;
    this.range = range;
    this.status = 'running';
    const codecString = codec.codecString(width, height);
    const config = encoderConfig({codecString, width, height, fps, bitrate: this.settings.bitrate});
    const muxer = new WebMMuxer({width, height, codec: codecString, fps});
    this.muxer = muxer;
    const startedAt = (this.scope.performance ?? Date).now();
    const yieldToEvents = createYielder(this.scope);
    let encoder = null;
    try {
      encoder = await ChunkEncoder.create({
        config,
        onChunk: (chunk, meta) => muxer.addChunk(chunk, meta),
        scope: this.scope,
      });
      this.encoder = encoder;
      const usPerFrame = 1e6 / fps;
      for (let f = range.startFrame; f <= range.endFrame; f += 1) {
        if (this.cancelled) throw new ExportCancelled();
        encoder.assertHealthy();
        const index = f - range.startFrame;
        const time = f / fps;                       // detik, eksak; bukan akumulasi
        const source = await this.renderFrame(time, index, f);
        const frame = new this.scope.VideoFrame(source, {
          timestamp: Math.round(index * usPerFrame),
          duration: Math.round(usPerFrame),
        });
        try {
          encoder.encode(frame, {keyFrame: index % Math.round(fps) === 0});
        } finally {
          frame.close();                            // WAJIB (spike §8)
        }
        this.encodedFrames = index + 1;
        await encoder.drain();
        // Melepas event loop setiap frame: progress tergambar, tombol Batalkan
        // dapat ditekan, dan ekspor tetap berjalan di tab yang tersembunyi.
        await yieldToEvents();
        this.onProgress({
          jobId: this.id, frame: this.encodedFrames, total: range.frameCount,
          percent: Math.round(this.encodedFrames / range.frameCount * 100),
        });
      }
      if (this.cancelled) throw new ExportCancelled();
      await encoder.flush();
      encoder.close();
      this.encoder = null;
      if (muxer.chunkCount !== range.frameCount) {
        throw new Error(`Jumlah frame tidak sesuai: ${muxer.chunkCount} chunk untuk ${range.frameCount} frame.`);
      }
      const blob = muxer.finalize();
      this.status = 'done';
      this.result = {
        blob,
        fileName: this.fileName(),
        frameCount: range.frameCount,
        width, height, fps,
        codecId: codec.id,
        codecString,
        durationSeconds: range.frameCount / fps,
        byteSize: blob.size,
        elapsedMs: Math.round((this.scope.performance ?? Date).now() - startedAt),
        range,
      };
      return this.result;
    } catch (error) {
      this.status = error instanceof ExportCancelled || this.cancelled ? 'cancelled' : 'failed';
      this.error = error;
      muxer.discard();
      throw error;
    } finally {
      // Selalu: tidak ada encoder yang tertinggal terbuka pada selesai/cancel/error.
      encoder?.close();
      this.encoder = null;
      if (this.status !== 'done') this.muxer = null;
    }
  }
}

/**
 * Antrean job berurutan (F5-06 / EX-03).
 * Satu encoder aktif pada satu waktu: menjalankan dua encoder paralel di satu tab
 * hanya menambah tekanan memori tanpa mempercepat apa pun.
 */
export class ExportQueue {
  constructor({onJobProgress, onJobDone, onJobFailed} = {}) {
    this.jobs = [];
    this.current = null;
    this.cancelled = false;
    this.onJobProgress = onJobProgress ?? (() => {});
    this.onJobDone = onJobDone ?? (() => {});
    this.onJobFailed = onJobFailed ?? (() => {});
  }

  add(job) {
    this.jobs.push(job);
    return job;
  }

  cancelAll() {
    this.cancelled = true;
    this.current?.cancel();
    for (const job of this.jobs) job.cancel();
  }

  /**
   * Menjalankan seluruh job berurutan.
   * Job yang gagal tidak menghentikan antrean; hasilnya dilaporkan per job.
   */
  async run() {
    const results = [];
    for (let i = 0; i < this.jobs.length; i += 1) {
      if (this.cancelled) break;
      const job = this.jobs[i];
      this.current = job;
      job.onProgress = info => this.onJobProgress({...info, jobIndex: i, jobTotal: this.jobs.length, job});
      try {
        const result = await job.run();
        results.push({job, result, status: 'done'});
        this.onJobDone({job, result, jobIndex: i, jobTotal: this.jobs.length});
      } catch (error) {
        results.push({job, error, status: job.status});
        this.onJobFailed({job, error, jobIndex: i, jobTotal: this.jobs.length});
        if (job.status === 'cancelled') break;
      }
    }
    this.current = null;
    return results;
  }
}

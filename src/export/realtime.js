// Fallback perekaman real-time (F5-05).
//
// Jalur ini mempertahankan mekanisme lama: `canvas.captureStream()` +
// `MediaRecorder` (`src/export-service.js`). Ia dipakai otomatis ketika
// `VideoEncoder` tidak ada, dan dapat dipilih manual.
//
// **Fallback ini TIDAK memenuhi gate deterministik R2.** MediaRecorder merekam
// terhadap wall-clock: jumlah frame mengikuti beban render dan throttling tab,
// sehingga 10 detik × 30 fps tidak dijamin menghasilkan 300 frame. Karena itu:
//   - label di dialog berbunyi "Real-time (tidak frame-akurat)";
//   - nama berkas selalu berakhiran `_realtime`;
//   - metrik mencatat codec seadanya, bukan sebagai bukti EX-02.

import {ExportService, MIME_CANDIDATES} from '../export-service.js';
import {buildFileName} from './export-service.js';

/** Daftar mime yang benar-benar didukung MediaRecorder di browser ini. */
export function realtimeMimeTypes(scope = globalThis) {
  const Recorder = scope?.MediaRecorder;
  if (typeof Recorder === 'undefined') return [];
  return MIME_CANDIDATES.filter(type => {
    try {return !!Recorder.isTypeSupported?.(type);} catch {return false;}
  });
}

export const realtimeExtension = mime => (String(mime).includes('mp4') ? 'mp4' : 'webm');

/**
 * Job perekaman real-time atas sebuah `ShotFrameSource`.
 *
 * Berbeda dari jalur deterministik, loop di sini MEMANG mengikuti jam: sumber
 * frame digambar ulang mengikuti `requestAnimationFrame` sampai durasi tercapai,
 * lalu recorder dihentikan.
 */
export class RealtimeExportJob {
  constructor({source, mimeType, fps, duration, naming, onProgress, scope = globalThis}) {
    this.source = source;
    this.mimeType = mimeType;
    this.fps = fps;
    this.duration = duration;
    this.naming = naming;
    this.onProgress = onProgress ?? (() => {});
    this.scope = scope;
    this.cancelled = false;
    this.status = 'idle';
    this.service = new ExportService({canvas: source.povCanvas, fps});
    this.realtime = true;
  }

  cancel() {
    this.cancelled = true;
    this.service.cancel();
  }

  fileName() {
    return buildFileName({
      project: this.naming.project, scene: this.naming.scene, shot: this.naming.shot,
      extension: realtimeExtension(this.mimeType), realtime: true,
    });
  }

  async run() {
    if (!this.service.supported) throw new Error('Browser ini tidak mendukung perekaman canvas (MediaRecorder).');
    this.status = 'running';
    const finished = new Promise((resolve, reject) => {
      this.service.start({
        mimeType: this.mimeType,
        onStop: result => resolve(result),
        onError: () => reject(new Error('MediaRecorder gagal merekam.')),
      });
    });
    const startedAt = this.scope.performance.now();
    await new Promise(resolve => {
      const step = () => {
        if (this.cancelled) {resolve(); return;}
        const elapsed = (this.scope.performance.now() - startedAt) / 1000;
        const time = Math.min(this.duration, elapsed);
        this.source.render(time, Math.round(time * this.fps));
        this.onProgress({frame: Math.round(time * this.fps), total: Math.round(this.duration * this.fps),
          percent: Math.round(time / this.duration * 100)});
        if (elapsed >= this.duration) {resolve(); return;}
        this.scope.requestAnimationFrame(step);
      };
      this.scope.requestAnimationFrame(step);
    });
    this.service.stop();
    const result = await finished;
    this.service.dispose();
    if (this.cancelled || result.cancelled || !result.blob) {
      this.status = this.cancelled ? 'cancelled' : 'failed';
      throw new Error(this.cancelled ? 'Ekspor dibatalkan.' : 'Perekaman real-time tidak menghasilkan berkas.');
    }
    this.status = 'done';
    return {
      blob: result.blob,
      fileName: this.fileName(),
      // Jumlah frame TIDAK diketahui pada jalur ini — itu inti keterbatasannya.
      frameCount: null,
      realtime: true,
      width: this.source.width,
      height: this.source.height,
      fps: this.fps,
      byteSize: result.blob.size,
      durationSeconds: this.duration,
    };
  }
}

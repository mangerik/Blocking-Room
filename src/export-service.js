// ExportService: batas rekaman video.
// Layanan ini hanya mengurus capability check, MediaRecorder dan resource stream.
// Sampling pose tetap milik TimelineEngine; ekspor merekam canvas POV yang digambar
// dari fungsi sampling yang sama dengan preview, sehingga hasil dan preview setara.
//
// Catatan keterbatasan (PRD EX-02): MediaRecorder merekam real-time, jumlah frame
// mengikuti perangkat. Render deterministik adalah pekerjaan Fase 5.
export const MIME_CANDIDATES = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/mp4', 'video/webm'];

export class ExportService {
  constructor({canvas, fps = 30, bitrate = 6_000_000} = {}) {
    this.canvas = canvas;
    this.fps = fps;
    this.bitrate = bitrate;
    this.recorder = null;
    this.stream = null;
    this.chunks = [];
    this.cancelled = false;
  }

  /** Apakah browser mendukung perekaman canvas sama sekali. */
  get supported() {
    return typeof MediaRecorder !== 'undefined' && typeof this.canvas?.captureStream === 'function';
  }
  /** Mime type pertama yang benar-benar didukung, atau null. */
  pickMimeType() {
    if (typeof MediaRecorder === 'undefined') return null;
    return MIME_CANDIDATES.find(type => MediaRecorder.isTypeSupported(type)) ?? null;
  }
  get recording() {return this.recorder?.state === 'recording';}

  /**
   * Mulai merekam. `onStop` dipanggil sekali dengan `{blob, extension, cancelled}`.
   * Melempar bila stream/recorder tidak dapat dibuat; pemanggil menampilkan pesannya.
   */
  start({mimeType, onStop, onError}) {
    this.chunks = [];
    this.cancelled = false;
    this.stream = this.canvas.captureStream(this.fps);
    this.recorder = new MediaRecorder(this.stream, {mimeType, videoBitsPerSecond: this.bitrate});
    this.recorder.ondataavailable = event => {if (event.data.size) this.chunks.push(event.data);};
    this.recorder.onerror = () => {this.cancelled = true; onError?.();};
    this.recorder.onstop = () => onStop?.(this.result());
    this.recorder.start(250);
  }

  /** Menghentikan rekaman; hasil dikirim melalui `onStop`. */
  stop() {if (this.recording) this.recorder.stop();}
  /** Membatalkan: hasil ditandai cancelled dan tidak diunduh. */
  cancel() {this.cancelled = true; this.stop();}

  result() {
    const type = this.recorder?.mimeType ?? '';
    const blob = this.chunks.length ? new Blob(this.chunks, {type}) : null;
    return {blob, extension: type.includes('mp4') ? 'mp4' : 'webm', cancelled: this.cancelled};
  }

  /** Melepas track stream; wajib dipanggil pada selesai/cancel/error. */
  dispose() {
    this.stream?.getTracks().forEach(track => track.stop());
    this.stream = null;
    this.chunks = [];
    this.recorder = null;
  }
}

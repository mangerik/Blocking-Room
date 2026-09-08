// Sumber frame ekspor: renderer POV terpisah yang bekerja pada SNAPSHOT (F5-03).
//
// Kenapa renderer sendiri dan bukan renderer editor:
//
// 1. **Immutability.** Renderer ini dibangun dari salinan scene view hasil
//    `readSceneView(snapshotDoc, …)`. Pengguna boleh terus mengedit selama job
//    berjalan; scene yang sedang dirender adalah objek lain sama sekali.
// 2. **Ukuran bebas.** Buffer ekspor 1920×1080 tidak boleh mengubah ukuran
//    preview kamera yang sedang dilihat pengguna.
// 3. **Pembersihan tuntas.** `dispose()` melepas seluruh geometri/material/
//    program dan membuang kedua canvas; tidak ada sisa konteks WebGL setelah job
//    selesai, dibatalkan maupun gagal.
//
// Kesetaraan dengan preview dijaga karena render tetap memakai `SceneRenderer`
// dan `sampleScene` yang sama persis dengan preview (F1-05).

import {SceneRenderer} from '../scene-renderer.js';
import {drawBurnIn, drawSafeArea} from './burn-in.js';

/** Membuat elemen penampung yang berada di luar layar tetapi tetap ter-layout. */
function offscreenHost(doc) {
  const host = doc.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.dataset.exportHost = 'true';
  host.style.cssText = 'position:fixed;left:-20000px;top:0;width:320px;height:180px;pointer-events:none;opacity:0';
  const viewport = doc.createElement('div');
  viewport.style.cssText = 'width:320px;height:180px';
  const labels = doc.createElement('div');
  const pov = doc.createElement('div');
  host.append(viewport, labels, pov);
  doc.body.appendChild(host);
  return {host, viewport, labels, pov};
}

/**
 * Renderer frame untuk satu shot.
 *
 * @param {{view:object, aspectRatio:string, width:number, height:number,
 *          shotName?:string, sceneName?:string, fps:number, burnIn?:boolean,
 *          burnInFields?:object, includeEditorOverlay?:boolean,
 *          documentRef?:Document}} options
 */
export class ShotFrameSource {
  constructor({view, aspectRatio, width, height, shotName = '', sceneName = '', fps = 24,
    burnIn = false, burnInFields = {}, includeEditorOverlay = false, documentRef = globalThis.document}) {
    this.view = view;
    this.width = width;
    this.height = height;
    this.fps = fps;
    this.shotName = shotName;
    this.sceneName = sceneName;
    this.burnIn = burnIn;
    this.burnInFields = burnInFields;
    this.includeEditorOverlay = includeEditorOverlay;
    this.documentRef = documentRef;
    this.disposed = false;

    const {host, viewport, labels, pov} = offscreenHost(documentRef);
    this.host = host;
    this.renderer = new SceneRenderer({viewport, labelLayer: labels, povContainer: pov});
    this.renderer.paths = includeEditorOverlay;
    this.renderer.selected = null;
    this.renderer.setExportSize(aspectRatio, width, height);
    this.renderer.build(view, 0);
    // Kanvas komposit hanya dibuat bila memang ada yang digambar di atas frame;
    // tanpa burn-in, `VideoFrame` dibuat langsung dari kanvas WebGL (lebih murah).
    this.composite = null;
    if (burnIn || includeEditorOverlay) {
      this.composite = documentRef.createElement('canvas');
      this.composite.width = width;
      this.composite.height = height;
      this.compositeCtx = this.composite.getContext('2d', {alpha: false, willReadFrequently: false});
    }
  }

  get povCanvas() {return this.renderer.povCanvas;}

  /** Statistik memori GPU renderer ini — dipakai uji kebocoran (F5-03). */
  memoryInfo() {
    const info = this.renderer.povRenderer.info;
    return {geometries: info.memory.geometries, textures: info.memory.textures, programs: info.programs?.length ?? 0};
  }

  /**
   * Merender satu frame dan mengembalikan sumber untuk `VideoFrame`.
   * @param {number} time detik pada shot
   * @param {number} frame nomor frame absolut (untuk timecode burn-in)
   */
  render(time, frame = Math.round(time * this.fps)) {
    if (this.disposed) throw new Error('Sumber frame ekspor sudah dilepas.');
    const sampled = this.renderer.update(this.view, time);
    this.renderer.renderPOV(this.view, this.renderer.povRenderer, {keepOverlays: this.includeEditorOverlay});
    if (!this.composite) return this.povCanvas;
    const ctx = this.compositeCtx;
    ctx.drawImage(this.povCanvas, 0, 0, this.width, this.height);
    if (this.includeEditorOverlay) drawSafeArea(ctx, {width: this.width, height: this.height});
    if (this.burnIn) {
      drawBurnIn(ctx, {
        width: this.width, height: this.height,
        shotName: this.shotName, sceneName: this.sceneName,
        frame, fps: this.fps, focal: sampled?.camera?.focal ?? null,
        fields: this.burnInFields,
      });
    }
    return this.composite;
  }

  /** PNG satu frame (storyboard, F5-06). */
  async toPng(time, frame) {
    this.render(time, frame);
    const canvas = this.composite ?? this.povCanvas;
    return new Promise((resolve, reject) => {
      canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('Gagal membuat PNG storyboard.'))), 'image/png');
    });
  }

  /** Wajib dipanggil pada selesai/cancel/error. Aman dipanggil berkali-kali. */
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    try {this.renderer.dispose();} catch {/* konteks mungkin sudah hilang */}
    if (this.composite) {
      this.composite.width = 0;
      this.composite.height = 0;
      this.composite = null;
      this.compositeCtx = null;
    }
    this.host?.remove();
    this.host = null;
    this.view = null;
  }
}

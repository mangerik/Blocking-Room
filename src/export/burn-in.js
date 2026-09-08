// Burn-in opsional untuk referensi produksi (F5-06 / EX-03).
//
// Aturan EX-03: overlay editor (gizmo, jalur, label, safe area) TIDAK ikut render
// kecuali dipilih eksplisit. Burn-in di bawah ini juga opsional dan hanya digambar
// bila pengguna mencentangnya di dialog ekspor.
//
// Burn-in digambar pada canvas 2D di atas hasil render POV, bukan ke dalam scene
// 3D: teksnya harus tetap tajam pada resolusi ekspor dan tidak boleh mengganggu
// kesetaraan pose antara preview dan hasil.

import {formatTimecode} from '../timeline-view.js';

/** Timecode `MM:SS:FF` untuk nomor frame absolut pada shot. */
export function frameTimecode(frame, fps) {
  return formatTimecode(frame / fps, fps);
}

/**
 * Menggambar burn-in pada konteks 2D berukuran `width × height`.
 * @param {CanvasRenderingContext2D} ctx
 * @param {{width:number,height:number,shotName?:string,sceneName?:string,
 *          frame:number,fps:number,focal?:number,fields?:object}} options
 */
export function drawBurnIn(ctx, {width, height, shotName = '', sceneName = '', frame = 0, fps = 24, focal = null, fields = {}} = {}) {
  const show = {shot: true, timecode: true, lens: true, ...fields};
  const scale = Math.max(1, height / 720);
  const pad = Math.round(18 * scale);
  const fontSize = Math.round(20 * scale);
  ctx.save();
  ctx.textBaseline = 'alphabetic';
  ctx.font = `600 ${fontSize}px "DM Sans", system-ui, sans-serif`;
  const left = [];
  if (show.shot && (shotName || sceneName)) left.push([sceneName, shotName].filter(Boolean).join(' · '));
  if (show.lens && Number.isFinite(focal)) left.push(`${Math.round(focal)} mm`);
  const right = show.timecode ? frameTimecode(frame, fps) : '';
  const rowHeight = Math.round(fontSize * 1.6);
  const barHeight = rowHeight + pad;
  // Pita gelap semi transparan supaya teks terbaca di atas frame terang maupun gelap.
  ctx.fillStyle = 'rgba(20, 24, 19, 0.55)';
  ctx.fillRect(0, height - barHeight, width, barHeight);
  ctx.fillStyle = '#faf9f1';
  const baseline = height - barHeight + rowHeight - Math.round(fontSize * 0.35);
  if (left.length) ctx.fillText(left.join('   '), pad, baseline);
  if (right) {
    const metrics = ctx.measureText(right);
    ctx.fillText(right, width - pad - metrics.width, baseline);
  }
  ctx.restore();
}

/**
 * Menggambar penanda safe area (title safe 90% / action safe 93%).
 * Hanya dipanggil bila pengguna memilih "sertakan overlay editor".
 */
export function drawSafeArea(ctx, {width, height}) {
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.45)';
  ctx.lineWidth = Math.max(1, Math.round(height / 720));
  for (const inset of [0.035, 0.1]) {
    ctx.strokeRect(width * inset, height * inset, width * (1 - inset * 2), height * (1 - inset * 2));
  }
  ctx.restore();
}

// Lapisan tampilan timeline (F4-03) dan operasi keyframe massal (F4-04).
//
// Modul ini MURNI: tidak menyentuh DOM, dokumen, maupun history. Semua fungsi
// menerima daftar objek ber-`keys` (bentuk scene view) dan mengembalikan laporan
// yang harus ditampilkan ke pengguna — daftar item yang dilewati karena terkunci
// dan daftar keyframe yang diganti karena tabrakan waktu tidak pernah disembunyikan.
//
// Waktu keyframe TETAP disimpan dalam detik (docs/DATA-MODEL.md §5). Frame hanya
// satuan tampilan dan input: `frame = round(t × fps)`, `t = frame / fps`.
// Mengubah `fps` shot karena itu tidak menggeser satu pun keyframe.

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 64;

export const frameOf = (t, fps) => Math.round(t * fps);
export const timeOfFrame = (frame, fps) => frame / fps;
export const lastFrame = (duration, fps) => Math.round(duration * fps);
export const clampTime = (t, duration) => Math.max(0, Math.min(duration, Number.isFinite(t) ? t : 0));

/**
 * Toleransi "keyframe yang sama": setengah frame, tidak pernah lebih dari 0,05 detik.
 *
 * Nilai lama (`KEY_TOLERANCE` 0,05 detik pada grid 0,1 detik) terlalu besar untuk
 * grid frame: pada 24 fps jarak antarframe hanya 0,0417 detik, sehingga dua frame
 * bertetangga akan dianggap keyframe yang sama dan snapping ke frame menjadi mustahil.
 */
export const keyTolerance = fps => Math.min(0.05, 0.5 / Math.max(1, fps));

/** Menjepit ke durasi lalu — bila snapping aktif — mengunci ke grid frame shot. */
export function snapTime(t, {fps, duration, snap = true}) {
  const clamped = clampTime(t, duration);
  if (!snap) return Math.round(clamped * 1e4) / 1e4;
  return clampTime(frameOf(clamped, fps) / fps, duration);
}

/** Indeks keyframe pada waktu tertentu memakai toleransi setengah frame, atau −1. */
export const indexAtTime = (keys, t, fps) => keys.findIndex(k => Math.abs(k.t - t) < keyTolerance(fps));

/** Timecode `MM:SS:FF` (frame di dalam detik), satuan yang dipakai storyboard. */
export function formatTimecode(t, fps) {
  const rate = Math.max(1, Math.round(fps));
  const total = Math.max(0, frameOf(t, fps));
  const seconds = Math.floor(total / rate);
  return [Math.floor(seconds / 60), seconds % 60, total % rate]
    .map(n => String(n).padStart(2, '0')).join(':');
}

/**
 * Jendela tampilan timeline: zoom (1 = seluruh durasi terlihat) dan pan.
 * Playhead dan keyframe di luar jendela tetap ada di dokumen; hanya tampilannya
 * yang dipotong, jadi zoom/pan tidak pernah menjadi perubahan kreatif.
 */
export class TimelineWindow {
  constructor(duration = 12) {this.duration = duration; this.zoom = MIN_ZOOM; this.start = 0;}
  get span() {return this.duration / this.zoom;}
  get end() {return this.start + this.span;}
  setDuration(duration) {this.duration = Math.max(0.001, duration); this.clamp();}
  /** Zoom dengan titik jangkar (waktu di bawah kursor tetap di tempatnya). */
  setZoom(zoom, anchor) {
    const previousSpan = this.span;
    const at = Number.isFinite(anchor) ? anchor : this.start + previousSpan / 2;
    const fraction = previousSpan > 0 ? (at - this.start) / previousSpan : 0.5;
    this.zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));
    this.start = at - fraction * this.span;
    this.clamp();
    return this.zoom;
  }
  panBy(delta) {this.start += delta; this.clamp(); return this.start;}
  clamp() {
    this.start = Math.max(0, Math.min(Math.max(0, this.duration - this.span), this.start));
    if (this.zoom <= MIN_ZOOM) this.start = 0;
  }
  fractionOf(t) {return this.span > 0 ? (t - this.start) / this.span : 0;}
  timeAt(fraction) {return this.start + fraction * this.span;}
  contains(t) {return t >= this.start - 1e-9 && t <= this.end + 1e-9;}
}

const TICK_STEPS = [1, 2, 5, 10, 15, 20, 24, 25, 30, 50, 60, 100, 120, 150, 200, 300, 600, 1200, 3000];

/** Tick ruler dalam satuan frame, dijaga agar labelnya tidak bertumpuk. */
export function rulerTicks(win, fps, targetCount = 8) {
  const spanFrames = Math.max(1, win.span * fps);
  const raw = spanFrames / Math.max(1, targetCount);
  const step = TICK_STEPS.find(s => s >= raw) ?? Math.ceil(raw / 600) * 600;
  const first = Math.ceil((win.start * fps - 1e-6) / step) * step;
  const limit = win.end * fps + 1e-6;
  const ticks = [];
  for (let frame = first; frame <= limit; frame += step) {
    const t = frame / fps;
    ticks.push({frame, t, fraction: win.fractionOf(t)});
  }
  return ticks;
}

// ---------------------------------------------------------------------------
// Operasi keyframe massal (F4-04). Semuanya mengembalikan laporan; pemanggil
// membungkusnya dalam SATU langkah undo dan menampilkan `skipped` + `replaced`.
// ---------------------------------------------------------------------------

const keyAt = (object, t, fps) => object.keys.find(k => Math.abs(k.t - t) < keyTolerance(fps)) ?? null;

/** Alasan sebuah objek tidak boleh diedit; `null` berarti boleh. */
function lockReason(object) {
  if (object.locked) return 'terkunci';
  if (object.visible === false) return 'tersembunyi';
  return null;
}

/** Mengelompokkan seleksi `[{id,t}]` menjadi objek → keyframe yang benar-benar ada. */
function groupSelection(objects, selection, fps) {
  const byId = new Map(objects.map(o => [o.id, o]));
  const groups = [];
  const seen = new Map();
  for (const item of selection ?? []) {
    const object = byId.get(item.id);
    if (!object) continue;
    const key = keyAt(object, item.t, fps);
    if (!key) continue;
    if (!seen.has(object.id)) {seen.set(object.id, {object, keys: []}); groups.push(seen.get(object.id));}
    const group = seen.get(object.id);
    if (!group.keys.includes(key)) group.keys.push(key);
  }
  return groups;
}

/**
 * Menggeser keyframe terpilih sebesar `delta` detik.
 * Seluruh seleksi bergerak sebagai satu blok: bila salah satu ujung menabrak 0 atau
 * durasi, `delta` dipangkas supaya bentuk gerakan tidak berubah. Keyframe lain yang
 * berada pada waktu tujuan DIGANTI dan dilaporkan lewat `replaced`.
 */
export function moveKeys(objects, selection, delta, {fps, duration, snap = true}) {
  const groups = groupSelection(objects, selection, fps);
  const tolerance = keyTolerance(fps);
  const skipped = [], replaced = [], moved = [], nextSelection = [];
  for (const {object, keys: picked} of groups) {
    const reason = lockReason(object);
    if (reason) {skipped.push({id: object.id, name: object.name, reason}); continue;}
    const times = picked.map(k => k.t);
    let shift = delta;
    const minT = Math.min(...times), maxT = Math.max(...times);
    if (minT + shift < 0) shift = -minT;
    if (maxT + shift > duration) shift = duration - maxT;
    const rest = object.keys.filter(k => !picked.includes(k));
    const landed = [];
    for (const key of picked) {
      const t = snapTime(key.t + shift, {fps, duration, snap});
      // Dua keyframe terpilih dapat mendarat di frame yang sama karena pembulatan;
      // yang kedua digabung, bukan menghasilkan waktu ganda yang ditolak validator.
      if (landed.some(k => Math.abs(k.t - t) < tolerance)) continue;
      landed.push({...key, t});
    }
    const kept = [];
    for (const key of rest) {
      const hit = landed.find(k => Math.abs(k.t - key.t) < tolerance);
      if (hit) {replaced.push({id: object.id, name: object.name, t: key.t, frame: frameOf(key.t, fps)}); continue;}
      kept.push(key);
    }
    const out = [...kept, ...landed].sort((a, b) => a.t - b.t);
    if (!out.length) continue;
    object.keys = out;
    moved.push({id: object.id, name: object.name, delta: shift, count: landed.length});
    for (const key of landed) nextSelection.push({id: object.id, t: key.t});
  }
  return {moved, replaced, skipped, selection: nextSelection};
}

/**
 * Menyalin keyframe terpilih. Offset dihitung relatif terhadap keyframe paling awal
 * sehingga menempel di playhead mempertahankan jarak antar keyframe.
 */
export function copyKeys(objects, selection, {fps, cameraId = null} = {}) {
  const groups = groupSelection(objects, selection, fps);
  const items = [];
  let origin = Infinity;
  for (const {object, keys} of groups) {
    for (const key of keys) {
      items.push({id: object.id, kind: object.id === cameraId ? 'camera' : 'actor', key: {...key}});
      origin = Math.min(origin, key.t);
    }
  }
  if (!items.length) return null;
  return {origin, count: items.length, items: items.map(item => ({...item, offset: item.key.t - origin}))};
}

/**
 * Menempel isi clipboard pada `at` (playhead).
 * Keyframe kamera dipetakan ke kamera shot tujuan, sehingga menempel ke shot lain
 * tetap mengenai kamera yang benar. Keyframe pada waktu yang sama DIGANTI dan
 * dilaporkan; objek terkunci/tersembunyi dilewati dengan alasan.
 */
export function pasteKeys(objects, clipboard, at, {fps, duration, snap = true, cameraId = null} = {}) {
  if (!clipboard?.items?.length) return {applied: [], replaced: [], skipped: []};
  const byId = new Map(objects.map(o => [o.id, o]));
  const applied = [], replaced = [], skipped = [];
  for (const item of clipboard.items) {
    const targetId = item.kind === 'camera' ? cameraId : item.id;
    const object = targetId ? byId.get(targetId) : null;
    if (!object) {skipped.push({id: item.id, name: item.kind === 'camera' ? 'Kamera' : item.id, reason: 'tidak ada di shot ini'}); continue;}
    const reason = lockReason(object);
    if (reason) {skipped.push({id: object.id, name: object.name, reason}); continue;}
    const t = snapTime(at + item.offset, {fps, duration, snap});
    const index = indexAtTime(object.keys, t, fps);
    const key = {...item.key, t};
    if (index >= 0) {
      replaced.push({id: object.id, name: object.name, t: object.keys[index].t, frame: frameOf(t, fps)});
      object.keys[index] = key;
    } else object.keys.push(key);
    object.keys.sort((a, b) => a.t - b.t);
    applied.push({id: object.id, t});
  }
  return {applied, replaced, skipped};
}

/**
 * Menghapus keyframe terpilih. Setiap track wajib menyisakan minimal satu keyframe
 * (invariant validator), jadi bila seluruh keyframe sebuah objek terpilih, keyframe
 * paling awal dipertahankan dan dilaporkan lewat `kept`.
 */
export function deleteKeys(objects, selection, {fps}) {
  const groups = groupSelection(objects, selection, fps);
  const removed = [], skipped = [], kept = [];
  for (const {object, keys: picked} of groups) {
    const reason = lockReason(object);
    if (reason) {skipped.push({id: object.id, name: object.name, reason}); continue;}
    let doomed = picked;
    if (doomed.length >= object.keys.length) {
      const survivor = [...object.keys].sort((a, b) => a.t - b.t)[0];
      doomed = doomed.filter(k => k !== survivor);
      kept.push({id: object.id, name: object.name, t: survivor.t});
    }
    if (!doomed.length) continue;
    object.keys = object.keys.filter(k => !doomed.includes(k));
    removed.push({id: object.id, name: object.name, count: doomed.length});
  }
  return {removed, skipped, kept};
}

/** Ringkasan daftar keyframe yang akan diganti, untuk toast/konfirmasi yang terlihat. */
export const describeReplaced = replaced =>
  replaced.map(r => `${r.name} pada frame ${r.frame}`).join(', ');

// TimelineEngine: satu-satunya sumber pose untuk waktu tertentu.
// Preview observer, preview kamera dan ekspor video memakai `sampleScene` yang sama,
// sehingga tidak mungkin ada perbedaan pose antara yang dilihat dan yang direkam.
//
// Waktu keyframe disimpan dalam detik (lihat docs/DATA-MODEL.md §Strategi waktu).
import {sample} from './model.js';
import {gait} from './spatial.js';

/** Toleransi pencocokan waktu keyframe (detik) — sama dengan grid putKey 0,1 detik. */
export const KEY_TOLERANCE = 0.05;

export const clampTime = (time, duration) => Math.max(0, Math.min(duration, time));

/** Indeks keyframe pada waktu tertentu, atau -1. */
export const keyIndexAt = (keys, time, tolerance = 0.06) =>
  keys.findIndex(k => Math.abs(k.t - time) < tolerance);

export function formatTime(t, decimal = true) {
  const minutes = String(Math.floor(t / 60)).padStart(2, '0');
  const seconds = String(Math.floor(t % 60)).padStart(2, '0');
  return `${minutes}:${seconds}${decimal ? '.' + Math.floor(t % 1 * 10) : ''}`;
}

/** Pose kamera lengkap dengan titik pandang yang sudah diselesaikan (target aktor atau manual). */
export function sampleCamera(view, time) {
  if (!view.camera) return null;
  const pose = sample(view.camera.keys, time);
  let target = {x: pose.tx, y: pose.ty, z: pose.tz};
  const follow = view.camera.target ? view.actors.find(a => a.id === view.camera.target) : null;
  if (follow) {
    const actorPose = sample(follow.keys, time);
    target = {x: actorPose.x, y: follow.height * 0.72, z: actorPose.z};
  }
  // F4-06: focal length boleh di-key pada track kamera. Bila keyframe membawa
  // `focal`, nilai hasil interpolasi itulah yang dipakai preview DAN ekspor —
  // keduanya memanggil `sampleScene` yang sama, jadi tidak mungkin berbeda.
  const focal = Number.isFinite(pose.focal) ? pose.focal : view.camera.focal;
  return {pose, target, focal, following: follow?.id ?? null};
}

/** Rasio lebar/tinggi untuk setiap aspect ratio shot (F4-06). */
export const ASPECT_VALUES = {'16:9': 16 / 9, '9:16': 9 / 16, '2.39:1': 2.39, '4:3': 4 / 3, '1:1': 1};
export const aspectValue = ratio => ASPECT_VALUES[ratio] ?? ASPECT_VALUES['16:9'];

/**
 * Ukuran buffer render untuk sebuah aspect ratio, dibulatkan ke kelipatan 2
 * (syarat encoder video; lihat docs/SPIKE-ENCODER.md §11).
 */
export function aspectSize(ratio, {maxWidth = 1280, maxHeight = 1280, baseHeight = 720} = {}) {
  const value = aspectValue(ratio);
  const even = n => Math.max(2, Math.round(n / 2) * 2);
  const height = value >= 1 ? Math.min(baseHeight, maxWidth / value) : Math.min(maxHeight, baseHeight / value);
  return {width: even(height * value), height: even(height)};
}

/**
 * Sampling seluruh scene pada satu waktu.
 * @returns {{time:number, actors:Array, camera:object|null}}
 */
export function sampleScene(view, time) {
  const t = clampTime(time, view.duration);
  return {
    time: t,
    actors: view.actors.map(actor => ({
      id: actor.id,
      pose: sample(actor.keys, t),
      gait: gait(actor.keys, t),
      visible: actor.visible !== false,
      locked: !!actor.locked,
    })),
    camera: sampleCamera(view, t),
  };
}

/**
 * Memotong track agar berakhir tepat pada durasi baru tanpa menggeser gerakan
 * sebelum titik potong: pose pada durasi baru dipertahankan sebagai keyframe akhir.
 */
export function trimTrackToDuration(keys, duration) {
  const end = sample(keys, duration);
  const trimmed = keys.filter(k => k.t <= duration);
  const index = keyIndexAt(trimmed, duration, KEY_TOLERANCE);
  const key = {...end, t: Math.round(duration * 10) / 10};
  if (index >= 0) trimmed[index] = key; else trimmed.push(key);
  trimmed.sort((a, b) => a.t - b.t);
  return trimmed;
}

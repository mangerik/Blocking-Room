// Pose baseline Fase 0: hasil sampling awal/tengah/akhir shot dari fixture v1.
// Dipakai sebagai golden file agar refactor dan migrasi schema v2 terbukti tidak
// menggeser gerakan. Bukti data, bukan screenshot.
import {sample} from '../../src/model.js';
import {gait, wallCrossings, wallPanels} from '../../src/spatial.js';

const round = n => {
  if (typeof n !== 'number' || !Number.isFinite(n)) return n;
  const v = Math.round(n * 1e6) / 1e6;
  return Object.is(v, -0) ? 0 : v; // -0 hilang saat JSON roundtrip
};
const roundPose = pose => Object.fromEntries(Object.entries(pose).map(([k, v]) => [k, round(v)]));

/** Tiga penanda waktu wajib: awal, tengah dan akhir shot. */
export const marks = duration => [0, round(duration / 2), duration];

/**
 * Ringkasan pose yang dapat dibandingkan antar versi schema.
 * Input berbentuk scene view v1 (`{title,duration,actors,rooms,camera}`) sehingga
 * dokumen v2 hasil migrasi dapat diukur dengan fungsi yang sama.
 */
export function baselineOf(project) {
  const times = marks(project.duration);
  const actors = project.actors.map(a => ({
    id: a.id, name: a.name, height: round(a.height), color: a.color,
    locked: !!a.locked, visible: a.visible !== false,
    keyCount: a.keys.length,
    poses: times.map(t => ({t, ...roundPose(sample(a.keys, t))})),
    gait: times.map(t => ({t, angle: round(gait(a.keys, t).angle), speed: round(gait(a.keys, t).speed)})),
    crossings: wallCrossings(a, project.rooms).map(c => ({roomId: c.roomId, wall: c.wall, t: round(c.t)})),
  }));
  const rooms = project.rooms.map(r => ({
    id: r.id, name: r.name, locked: !!r.locked, visible: r.visible !== false,
    box: [r.x, r.z, r.w, r.d, r.h].map(round),
    doors: (r.doors ?? []).map(d => ({wall: d.wall, offset: round(d.offset), width: round(d.width), height: round(d.height)})),
    panels: Object.fromEntries(['back', 'left'].map(w => [w, wallPanels(r, w).map(p => [round(p.center), round(p.y), round(p.width), round(p.height)])])),
  }));
  const camera = project.camera ? {
    id: project.camera.id, name: project.camera.name, focal: project.camera.focal,
    target: project.camera.target ?? '',
    locked: !!project.camera.locked, visible: project.camera.visible !== false,
    keyCount: project.camera.keys.length,
    poses: times.map(t => ({t, ...roundPose(sample(project.camera.keys, t))})),
  } : null;
  return {title: project.title, duration: project.duration, times, actors, rooms, camera};
}

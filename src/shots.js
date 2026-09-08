// Operasi shot (F4-01/F4-02).
//
// Kepemilikan (docs/DATA-MODEL.md §2): identitas aktor dan set milik SCENE,
// sedangkan kamera dan track gerak milik SHOT. Semua fungsi di sini memutasi
// `scene` di tempat dan mengembalikan shot yang seharusnya menjadi aktif;
// pemanggil (main.js) yang memvalidasi dan membungkusnya menjadi satu langkah undo.
//
// Tidak ada fungsi di sini yang menyentuh `scene.actors` atau `scene.setObjects`:
// membuat, menduplikasi atau menghapus shot tidak boleh mengubah satu pun identitas
// aktor maupun set — itulah isi jaminan "alternatif shot terisolasi".
import {newId} from './schema.js';
import {DEFAULT_ASPECT_RATIO, DEFAULT_FPS} from './migrate.js';

const clone = value => JSON.parse(JSON.stringify(value));
const renumber = shots => shots.forEach((shot, index) => {shot.order = index;});

export const findShotById = (scene, shotId) => scene?.shots.find(s => s.id === shotId) ?? null;

/** Nama shot berikutnya yang belum dipakai ("Shot 03", lalu "Shot 03 (2)"). */
export function nextShotName(scene, base) {
  const taken = new Set(scene.shots.map(s => s.name));
  const preferred = base ?? `Shot ${String(scene.shots.length + 1).padStart(2, '0')}`;
  if (!taken.has(preferred)) return preferred;
  for (let i = 2; i < 1000; i += 1) {
    const candidate = `${preferred} (${i})`.slice(0, 100);
    if (!taken.has(candidate)) return candidate;
  }
  return preferred;
}

const seedKey = (shot, objectId, fallback, property = 'pose') => {
  const key = shot?.tracks.find(t => t.objectId === objectId && t.property === property)?.keys?.[0];
  return key ? {...clone(key), t: 0} : {...fallback, t: 0};
};

/**
 * Shot baru pada scene yang sama.
 * Track setiap aktor scene dibuat dengan SATU keyframe pada t=0 memakai pose awal
 * shot sumber, sehingga alternatif shot dimulai dari staging yang sama tanpa
 * ikut membawa gerakannya. Kamera disalin (ID baru) bila shot sumber punya kamera.
 */
export function addShot(scene, {id = newId, name, from, duration, fps, aspectRatio, withCamera = true} = {}) {
  const source = (from ? findShotById(scene, from) : null) ?? findShotById(scene, scene.activeShotId) ?? scene.shots[0] ?? null;
  const shot = {
    id: id(), sceneId: scene.id, name: nextShotName(scene, name), order: scene.shots.length,
    duration: duration ?? source?.duration ?? 12,
    fps: fps ?? source?.fps ?? DEFAULT_FPS,
    aspectRatio: aspectRatio ?? source?.aspectRatio ?? DEFAULT_ASPECT_RATIO,
    notes: '', cameraId: null, camera: null, tracks: [],
  };
  // v3 (F4-05): dua track independen per aktor. Urutan position lalu rotation sama
  // dengan `document.js#writeSceneView`, sehingga dokumen tidak berubah bentuk saat
  // shot baru disimpan.
  for (const actor of scene.actors) {
    shot.tracks.push({
      objectId: actor.id, property: 'position', interpolation: 'linear',
      keys: [seedKey(source, actor.id, {x: 0, z: 0}, 'position')],
    });
    shot.tracks.push({
      objectId: actor.id, property: 'rotation', interpolation: 'linear',
      keys: [seedKey(source, actor.id, {r: 0}, 'rotation')],
    });
  }
  if (withCamera && source?.camera) {
    const cameraId = id();
    shot.camera = {
      id: cameraId, type: 'camera', name: source.camera.name, focal: source.camera.focal,
      targetId: source.camera.targetId ?? '', locked: false, visible: source.camera.visible !== false,
    };
    shot.cameraId = cameraId;
    shot.tracks.push({
      objectId: cameraId, property: 'pose', interpolation: 'linear',
      keys: [seedKey(source, source.camera.id, {x: 0, y: 2, z: 6, tx: 0, ty: 1.2, tz: 0})],
    });
  }
  scene.shots.push(shot);
  renumber(scene.shots);
  return shot;
}

/**
 * Duplikasi shot: seluruh track DAN kamera disalin dengan ID kamera baru.
 * ID aktor sengaja TIDAK dipetakan ulang — aktor milik scene, jadi shot salinan
 * menggerakkan aktor yang sama. Hanya kamera (milik shot) yang mendapat ID baru.
 */
export function duplicateShot(scene, shotId, {id = newId, name} = {}) {
  const source = findShotById(scene, shotId);
  if (!source) throw new Error('Shot tidak ditemukan.');
  const copy = clone(source);
  const cameraId = copy.camera ? id() : null;
  const shot = {
    ...copy,
    id: id(),
    sceneId: scene.id,
    name: nextShotName(scene, name ?? `${source.name} (salinan)`.slice(0, 100)),
    order: scene.shots.length,
    cameraId,
    camera: copy.camera ? {...copy.camera, id: cameraId} : null,
    tracks: copy.tracks.map(track => ({
      ...track,
      objectId: copy.camera && track.objectId === copy.camera.id ? cameraId : track.objectId,
    })),
  };
  scene.shots.splice(scene.shots.indexOf(source) + 1, 0, shot);
  renumber(scene.shots);
  return shot;
}

/**
 * Menghapus shot. Shot terakhir TIDAK boleh dihapus: scene tanpa shot tidak valid,
 * dan mengganti isinya dengan shot kosong secara diam-diam adalah kehilangan data.
 */
export function removeShot(scene, shotId) {
  if (scene.shots.length <= 1) throw new Error('Scene memerlukan minimal satu shot. Tambahkan shot lain sebelum menghapus yang ini.');
  const index = scene.shots.findIndex(s => s.id === shotId);
  if (index < 0) throw new Error('Shot tidak ditemukan.');
  scene.shots.splice(index, 1);
  renumber(scene.shots);
  const next = scene.shots[Math.min(index, scene.shots.length - 1)];
  scene.activeShotId = next.id;
  return next;
}

/** Memindahkan shot satu langkah (`delta` −1/+1) dan menomori ulang `order`. */
export function moveShot(scene, shotId, delta) {
  const index = scene.shots.findIndex(s => s.id === shotId);
  const target = index + delta;
  if (index < 0 || target < 0 || target >= scene.shots.length) return null;
  const [shot] = scene.shots.splice(index, 1);
  scene.shots.splice(target, 0, shot);
  renumber(scene.shots);
  return shot;
}

/** Mengganti nama shot; nama kosong ditolak agar validator tidak pernah gagal. */
export function renameShot(scene, shotId, name) {
  const shot = findShotById(scene, shotId);
  if (!shot) throw new Error('Shot tidak ditemukan.');
  const trimmed = String(name ?? '').trim().slice(0, 100);
  if (!trimmed) throw new Error('Nama shot tidak boleh kosong.');
  shot.name = trimmed;
  return shot;
}

/**
 * Metadata shot yang tidak diwakili scene view (fps, aspect ratio, catatan).
 * `fps` sengaja tidak menggeser satu pun waktu keyframe — lihat DATA-MODEL §5 aturan 3.
 */
export function setShotSettings(scene, shotId, {fps, aspectRatio, notes} = {}) {
  const shot = findShotById(scene, shotId);
  if (!shot) throw new Error('Shot tidak ditemukan.');
  if (fps !== undefined) shot.fps = fps;
  if (aspectRatio !== undefined) shot.aspectRatio = aspectRatio;
  if (notes !== undefined) shot.notes = String(notes).slice(0, 2000);
  return shot;
}

/** Ringkasan satu shot untuk daftar dan perbandingan alternatif. */
export function summarizeShot(shot) {
  const keys = shot.tracks.reduce((total, track) => total + track.keys.length, 0);
  const cameraTrack = shot.camera ? shot.tracks.find(t => t.objectId === shot.camera.id) : null;
  return {
    id: shot.id, name: shot.name, order: shot.order,
    duration: shot.duration, fps: shot.fps, aspectRatio: shot.aspectRatio,
    notes: shot.notes ?? '',
    camera: shot.camera ? shot.camera.name : null,
    focal: shot.camera ? shot.camera.focal : null,
    target: shot.camera ? (shot.camera.targetId || '') : '',
    keyCount: keys,
    cameraKeys: cameraTrack ? cameraTrack.keys.length : 0,
    actorKeys: keys - (cameraTrack ? cameraTrack.keys.length : 0),
    frames: Math.round(shot.duration * shot.fps),
  };
}

/**
 * Perbandingan dua alternatif shot (F4-01).
 * Hanya menyoroti yang benar-benar berbeda; `differences` kosong berarti kedua
 * alternatif setara pada dimensi yang dibandingkan.
 */
export function compareShots(scene, aId, bId) {
  const a = findShotById(scene, aId), b = findShotById(scene, bId);
  if (!a || !b) throw new Error('Shot pembanding tidak ditemukan.');
  const left = summarizeShot(a), right = summarizeShot(b);
  const targetName = id => scene.actors.find(actor => actor.id === id)?.name ?? 'Titik manual';
  const rows = [
    ['Lensa', left.focal === null ? 'tanpa kamera' : `${left.focal} mm`, right.focal === null ? 'tanpa kamera' : `${right.focal} mm`],
    ['Arah pandang', left.camera ? targetName(left.target) : '—', right.camera ? targetName(right.target) : '—'],
    ['Durasi', `${left.duration} dtk`, `${right.duration} dtk`],
    ['fps', `${left.fps}`, `${right.fps}`],
    ['Aspect ratio', left.aspectRatio, right.aspectRatio],
    ['Total keyframe', `${left.keyCount}`, `${right.keyCount}`],
    ['Keyframe kamera', `${left.cameraKeys}`, `${right.cameraKeys}`],
    ['Keyframe karakter', `${left.actorKeys}`, `${right.actorKeys}`],
  ].map(([label, av, bv]) => ({label, a: av, b: bv, same: av === bv}));
  return {a: left, b: right, rows, differences: rows.filter(row => !row.same)};
}

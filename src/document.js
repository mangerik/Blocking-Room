// Document state (schema v2) terpisah dari UI state.
// Modul ini hanya mengurus dokumen dan selector scene/shot aktif; seleksi, playhead,
// tool dan pose observer adalah UI state milik main.js dan tidak pernah masuk ke sini.
//
// Editor bekerja pada "scene view": proyeksi v1-shaped (title/duration/actors/rooms/camera)
// dari satu pasang scene+shot aktif. Menulis kembali view hanya menyentuh scene dan shot
// aktif tersebut, sehingga scene lain tidak mungkin ikut termutasi.
import {SCHEMA_VERSION, newId, nowStamp, validateDocument} from './schema.js';
import {DEFAULT_ASPECT_RATIO, DEFAULT_FPS} from './migrate.js';

const clone = value => JSON.parse(JSON.stringify(value));

export const findScene = (doc, sceneId) => doc.scenes.find(s => s.id === sceneId) ?? null;
export const findShot = (scene, shotId) => scene?.shots.find(s => s.id === shotId) ?? null;
export const activeScene = doc => findScene(doc, doc.activeSceneId) ?? doc.scenes[0] ?? null;
export const activeShot = doc => {
  const scene = activeScene(doc);
  return scene ? (findShot(scene, scene.activeShotId) ?? scene.shots[0] ?? null) : null;
};
const trackOf = (shot, objectId) => shot.tracks.find(t => t.objectId === objectId) ?? null;

/** Dokumen v2 kosong dengan satu scene dan satu shot default. */
export function emptyDocument({title = 'Scene tanpa judul', duration = 12, id = newId, now = nowStamp} = {}) {
  const projectId = id(), sceneId = id(), shotId = id(), stamp = now();
  return {
    schemaVersion: SCHEMA_VERSION, id: projectId, title, createdAt: stamp, updatedAt: stamp,
    activeSceneId: sceneId, thumbnailRef: null, assets: [],
    scenes: [{
      id: sceneId, projectId, name: 'Scene 01', order: 0, notes: '', activeShotId: shotId,
      actors: [], setObjects: [],
      shots: [{id: shotId, sceneId, name: 'Shot 01', order: 0, duration, fps: DEFAULT_FPS,
        aspectRatio: DEFAULT_ASPECT_RATIO, notes: '', cameraId: null, camera: null, tracks: []}],
    }],
  };
}

/**
 * Membaca scene+shot menjadi scene view yang dipakai editor.
 * Hasilnya salinan penuh: memutasinya tidak mengubah dokumen sampai `writeSceneView`.
 */
export function readSceneView(doc, sceneId = doc.activeSceneId, shotId) {
  const scene = findScene(doc, sceneId) ?? doc.scenes[0];
  const shot = findShot(scene, shotId ?? scene.activeShotId) ?? scene.shots[0];
  const keysOf = objectId => clone(trackOf(shot, objectId)?.keys ?? []);
  return {
    title: doc.title,
    duration: shot.duration,
    actors: scene.actors.map(a => ({
      id: a.id, name: a.name, color: a.color, height: a.height,
      locked: a.locked, visible: a.visible, keys: keysOf(a.id),
    })),
    rooms: scene.setObjects.map(r => ({
      id: r.id, name: r.name, x: r.x, z: r.z, w: r.w, d: r.d, h: r.h, color: r.color,
      doors: clone(r.doors ?? []), locked: r.locked, visible: r.visible,
    })),
    camera: shot.camera ? {
      id: shot.camera.id, name: shot.camera.name, focal: shot.camera.focal,
      target: shot.camera.targetId, locked: shot.camera.locked, visible: shot.camera.visible,
      keys: keysOf(shot.camera.id),
    } : null,
  };
}

/**
 * Menulis scene view kembali ke dokumen. Hanya scene dan shot yang disebutkan yang
 * berubah; field milik scene/shot yang tidak diwakili view (nama scene, notes, fps,
 * aspect ratio, assetRef) dipertahankan.
 */
export function writeSceneView(doc, sceneId, shotId, view) {
  const scene = findScene(doc, sceneId);
  if (!scene) throw new Error('Scene aktif tidak ditemukan dalam dokumen.');
  const shot = findShot(scene, shotId);
  if (!shot) throw new Error('Shot aktif tidak ditemukan dalam scene.');

  const previousActors = new Map(scene.actors.map(a => [a.id, a]));
  const previousRooms = new Map(scene.setObjects.map(r => [r.id, r]));
  const tracks = [];

  doc.title = view.title;
  shot.duration = view.duration;
  scene.actors = view.actors.map(a => {
    tracks.push({objectId: a.id, property: 'pose', interpolation: 'linear', keys: clone(a.keys)});
    return {
      id: a.id, type: 'actor', name: a.name, color: a.color, height: a.height,
      locked: !!a.locked, visible: a.visible !== false,
      assetRef: previousActors.get(a.id)?.assetRef ?? null,
    };
  });
  scene.setObjects = view.rooms.map(r => ({
    id: r.id, type: 'room', name: r.name, color: r.color,
    x: r.x, z: r.z, w: r.w, d: r.d, h: r.h, doors: clone(r.doors ?? []),
    locked: !!r.locked, visible: r.visible !== false,
    assetRef: previousRooms.get(r.id)?.assetRef ?? null,
  }));
  if (view.camera) {
    shot.camera = {
      id: view.camera.id, type: 'camera', name: view.camera.name, focal: view.camera.focal,
      targetId: view.camera.target ?? '', locked: !!view.camera.locked, visible: view.camera.visible !== false,
    };
    shot.cameraId = shot.camera.id;
    tracks.push({objectId: view.camera.id, property: 'pose', interpolation: 'linear', keys: clone(view.camera.keys)});
  } else {
    shot.camera = null;
    shot.cameraId = null;
  }
  shot.tracks = tracks;
  // `updatedAt` sengaja tidak disentuh di sini: stempel waktu diberikan saat dokumen
  // benar-benar disimpan (src/storage.js) supaya snapshot history tidak berubah hanya
  // karena waktu, dan operasi tanpa perubahan tetap tidak membuat langkah undo baru.
  return doc;
}

/**
 * Pemilik dokumen aktif. Menyimpan dokumen v2, ID scene/shot aktif dan scene view
 * yang sedang diedit. Tidak menyimpan state UI apa pun.
 */
export class DocumentStore {
  constructor(doc, {now = nowStamp} = {}) {
    this.now = now;
    this.load(doc);
  }
  /** Mengganti dokumen aktif (open/import/undo) dan menyegarkan scene view. */
  load(doc) {
    this.doc = validateDocument(doc);
    const scene = activeScene(this.doc);
    const shot = activeShot(this.doc);
    this.doc.activeSceneId = scene.id;
    scene.activeShotId = shot.id;
    this.sceneId = scene.id;
    this.shotId = shot.id;
    this.view = readSceneView(this.doc, this.sceneId, this.shotId);
    return this.view;
  }
  get projectId() {return this.doc.id;}
  get scene() {return findScene(this.doc, this.sceneId);}
  get shot() {return findShot(this.scene, this.shotId);}
  /** Menulis scene view aktif ke dokumen; scene lain tidak tersentuh. */
  flush() {
    writeSceneView(this.doc, this.sceneId, this.shotId, this.view);
    return this.doc;
  }
  /** Salinan dokumen setelah view aktif ditulis — dipakai history dan penyimpanan. */
  snapshot() {
    this.flush();
    return clone(this.doc);
  }
  /** Berpindah scene/shot: view aktif ditulis dahulu agar tidak ada perubahan yang hilang. */
  activate(sceneId, shotId) {
    this.flush();
    const scene = findScene(this.doc, sceneId);
    if (!scene) throw new Error('Scene tidak ditemukan.');
    const shot = findShot(scene, shotId ?? scene.activeShotId) ?? scene.shots[0];
    this.doc.activeSceneId = scene.id;
    scene.activeShotId = shot.id;
    this.sceneId = scene.id;
    this.shotId = shot.id;
    this.view = readSceneView(this.doc, this.sceneId, this.shotId);
    return this.view;
  }
}

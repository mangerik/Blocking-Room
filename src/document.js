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
  // F4-02: identitas aktor milik SCENE, track milik SHOT. Menambah atau menghapus
  // aktor pada shot aktif karena itu harus ikut menyesuaikan shot lain, kalau tidak
  // dokumen langsung tidak valid (validator menuntut tepat satu track pose per aktor
  // di SETIAP shot dan menolak track yang menunjuk aktor yang sudah tidak ada).
  syncShotTracks(scene, {seedFrom: shot});
  // `updatedAt` sengaja tidak disentuh di sini: stempel waktu diberikan saat dokumen
  // benar-benar disimpan (src/storage.js) supaya snapshot history tidak berubah hanya
  // karena waktu, dan operasi tanpa perubahan tetap tidak membuat langkah undo baru.
  return doc;
}

const ACTOR_SEED = {x: 0, z: 0, r: 0};
const CAMERA_SEED = {x: 0, y: 2, z: 6, tx: 0, ty: 1.2, tz: 0};

/**
 * Menyelaraskan track SELURUH shot dalam satu scene dengan daftar aktor scene (F4-02).
 *
 * - Aktor baru mendapat track default (satu keyframe pada t=0) di setiap shot; pose
 *   awalnya disalin dari `seedFrom` bila tersedia supaya aktor tidak tiba-tiba
 *   muncul di titik nol pada alternatif shot lain.
 * - Aktor yang dihapus kehilangan track-nya di setiap shot.
 * - Kamera shot lain yang mengikuti aktor terhapus kembali ke titik pandang manual
 *   (`targetId: ''`). Menolak penghapusan saat kamera terkunci adalah keputusan UI
 *   (main.js `deleteItem`), bukan tugas fungsi ini.
 *
 * Urutan track dijaga sama dengan `writeSceneView` (aktor sesuai urutan scene, lalu
 * kamera) sehingga menyimpan dua kali menghasilkan dokumen yang identik byte-per-byte.
 */
export function syncShotTracks(scene, {seedFrom = null} = {}) {
  for (const shot of scene.shots) {
    const byId = new Map(shot.tracks.map(track => [track.objectId, track]));
    const tracks = [];
    for (const actor of scene.actors) {
      const existing = byId.get(actor.id);
      if (existing) {tracks.push(existing); continue;}
      const seed = seedFrom?.tracks.find(t => t.objectId === actor.id)?.keys?.[0];
      const key = seed ? {...clone(seed), t: 0} : {...ACTOR_SEED, t: 0};
      tracks.push({objectId: actor.id, property: 'pose', interpolation: 'linear', keys: [key]});
    }
    if (shot.camera) {
      if (shot.camera.targetId && !scene.actors.some(a => a.id === shot.camera.targetId)) shot.camera.targetId = '';
      const existing = byId.get(shot.camera.id);
      tracks.push(existing ?? {
        objectId: shot.camera.id, property: 'pose', interpolation: 'linear',
        keys: [{...CAMERA_SEED, t: 0}],
      });
    }
    shot.tracks = tracks;
  }
  return scene;
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
    if (!findScene(this.doc, sceneId)) throw new Error('Scene tidak ditemukan.');
    return this.reload(sceneId, shotId);
  }
  /**
   * Membaca ulang view dari dokumen TANPA menulis view lama kembali.
   * Dipakai setelah operasi scene (hapus/duplikasi/urutkan) ketika scene yang
   * sedang dipegang view mungkin sudah tidak ada lagi di dokumen.
   */
  reload(sceneId = this.doc.activeSceneId, shotId) {
    const scene = findScene(this.doc, sceneId) ?? this.doc.scenes[0];
    const shot = findShot(scene, shotId ?? scene.activeShotId) ?? scene.shots[0];
    this.doc.activeSceneId = scene.id;
    scene.activeShotId = shot.id;
    this.sceneId = scene.id;
    this.shotId = shot.id;
    this.view = readSceneView(this.doc, this.sceneId, this.shotId);
    return this.view;
  }
}

/**
 * Salinan proyek dengan seluruh ID internal dipetakan ulang (dipakai "Buka salinan"
 * pada tab read-only; Fase 3 memakainya kembali untuk duplicate di dashboard).
 * Hubungan antar-ID dipertahankan: track tetap menunjuk objeknya, kamera tetap
 * menunjuk target yang sama, scene/shot aktif tetap menunjuk entitas yang sama.
 */
export function cloneProjectDocument(doc, {id = newId, now = nowStamp, title} = {}) {
  const map = new Map();
  const remap = value => {
    if (typeof value !== 'string' || value === '') return value;
    if (!map.has(value)) map.set(value, id());
    return map.get(value);
  };
  const source = clone(doc);
  const stamp = now();
  const projectId = remap(source.id);
  return {
    schemaVersion: source.schemaVersion,
    id: projectId,
    title: title ?? source.title,
    createdAt: stamp,
    updatedAt: stamp,
    activeSceneId: remap(source.activeSceneId),
    thumbnailRef: null,
    assets: (source.assets ?? []).map(a => ({...a, id: remap(a.id), projectId})),
    scenes: source.scenes.map(scene => ({
      ...scene,
      id: remap(scene.id),
      projectId,
      // Thumbnail milik proyek asal; salinan memakai placeholder sampai render pertama.
      thumbnailRef: null,
      activeShotId: remap(scene.activeShotId),
      actors: scene.actors.map(a => ({...a, id: remap(a.id)})),
      setObjects: scene.setObjects.map(o => ({...o, id: remap(o.id)})),
      shots: scene.shots.map(shot => ({
        ...shot,
        id: remap(shot.id),
        sceneId: remap(scene.id),
        cameraId: shot.cameraId ? remap(shot.cameraId) : null,
        camera: shot.camera ? {...shot.camera, id: remap(shot.camera.id), targetId: remap(shot.camera.targetId)} : null,
        tracks: shot.tracks.map(t => ({...t, objectId: remap(t.objectId)})),
      })),
    })),
  };
}


// ---------------------------------------------------------------------------
// Operasi scene (F3-04). Semuanya memutasi dokumen di tempat dan mengembalikan
// scene yang harus menjadi aktif; pemanggil bertanggung jawab memvalidasi dan
// menyimpan lewat EditorSession, sehingga setiap operasi tetap satu langkah undo.
// ---------------------------------------------------------------------------

/** Menomori ulang `order` sesuai urutan array supaya validator selalu puas. */
const renumber = scenes => scenes.forEach((scene, index) => {scene.order = index;});

/** Nama scene berikutnya yang belum dipakai ("Scene 03", lalu "Scene 03 (2)"). */
export function nextSceneName(doc, base) {
  const taken = new Set(doc.scenes.map(s => s.name));
  const preferred = base ?? `Scene ${String(doc.scenes.length + 1).padStart(2, '0')}`;
  if (!taken.has(preferred)) return preferred;
  for (let i = 2; i < 1000; i += 1) {
    const candidate = `${preferred} (${i})`.slice(0, 100);
    if (!taken.has(candidate)) return candidate;
  }
  return preferred;
}

/** Scene kosong baru dengan satu shot default. */
export function addScene(doc, {name, duration = 12, id = newId} = {}) {
  const sceneId = id(), shotId = id();
  const scene = {
    id: sceneId, projectId: doc.id, name: nextSceneName(doc, name), order: doc.scenes.length,
    notes: '', thumbnailRef: null, activeShotId: shotId, actors: [], setObjects: [],
    shots: [{id: shotId, sceneId, name: 'Shot 01', order: 0, duration, fps: DEFAULT_FPS,
      aspectRatio: DEFAULT_ASPECT_RATIO, notes: '', cameraId: null, camera: null, tracks: []}],
  };
  doc.scenes.push(scene);
  renumber(doc.scenes);
  return scene;
}

/**
 * Duplikasi scene dengan seluruh ID internal dipetakan ulang (aktor, set, shot,
 * kamera dan track) sambil menjaga hubungan: track tetap menunjuk objeknya dan
 * kamera tetap mengikuti karakter yang sama — versi salinannya.
 */
export function duplicateScene(doc, sceneId, {id = newId, name} = {}) {
  const source = findScene(doc, sceneId);
  if (!source) throw new Error('Scene tidak ditemukan.');
  const map = new Map();
  const remap = value => {
    if (typeof value !== 'string' || value === '') return value;
    if (!map.has(value)) map.set(value, id());
    return map.get(value);
  };
  const copy = clone(source);
  const newSceneId = remap(copy.id);
  const scene = {
    ...copy,
    id: newSceneId,
    projectId: doc.id,
    name: nextSceneName(doc, name ?? `${source.name} (salinan)`.slice(0, 100)),
    order: doc.scenes.length,
    thumbnailRef: null,
    activeShotId: remap(copy.activeShotId),
    actors: copy.actors.map(a => ({...a, id: remap(a.id)})),
    setObjects: copy.setObjects.map(o => ({...o, id: remap(o.id)})),
    shots: copy.shots.map(shot => ({
      ...shot,
      id: remap(shot.id),
      sceneId: newSceneId,
      cameraId: shot.cameraId ? remap(shot.cameraId) : null,
      camera: shot.camera ? {...shot.camera, id: remap(shot.camera.id), targetId: remap(shot.camera.targetId)} : null,
      tracks: shot.tracks.map(t => ({...t, objectId: remap(t.objectId)})),
    })),
  };
  doc.scenes.splice(doc.scenes.indexOf(source) + 1, 0, scene);
  renumber(doc.scenes);
  return scene;
}

/**
 * Menghapus scene. Scene terakhir TIDAK boleh dihapus: proyek tanpa scene tidak
 * valid, dan mengganti isi proyek dengan scene kosong secara diam-diam adalah
 * kehilangan data yang tidak diminta. Pemanggil menampilkan pesannya.
 */
export function removeScene(doc, sceneId) {
  if (doc.scenes.length <= 1) throw new Error('Proyek memerlukan minimal satu scene. Tambahkan scene lain sebelum menghapus yang ini.');
  const index = doc.scenes.findIndex(s => s.id === sceneId);
  if (index < 0) throw new Error('Scene tidak ditemukan.');
  doc.scenes.splice(index, 1);
  renumber(doc.scenes);
  return doc.scenes[Math.min(index, doc.scenes.length - 1)];
}

/** Memindahkan scene satu langkah (`delta` −1/+1) dan menomori ulang `order`. */
export function moveScene(doc, sceneId, delta) {
  const index = doc.scenes.findIndex(s => s.id === sceneId);
  const target = index + delta;
  if (index < 0 || target < 0 || target >= doc.scenes.length) return null;
  const [scene] = doc.scenes.splice(index, 1);
  doc.scenes.splice(target, 0, scene);
  renumber(doc.scenes);
  return scene;
}

/** Mengganti nama scene; nama kosong ditolak agar validator tidak pernah gagal. */
export function renameScene(doc, sceneId, name) {
  const scene = findScene(doc, sceneId);
  if (!scene) throw new Error('Scene tidak ditemukan.');
  const trimmed = String(name ?? '').trim().slice(0, 100);
  if (!trimmed) throw new Error('Nama scene tidak boleh kosong.');
  scene.name = trimmed;
  return scene;
}

// Validator schema v3 (Project → Scene → Shot). Kontrak lengkap: docs/DATA-MODEL.md.
// Validator ini murni: melempar Error dengan pesan Bahasa Indonesia dan tidak pernah
// menulis ke penyimpanan. Normalisasi hanya mengisi default yang aman.
import {validDoors} from './spatial.js';

export const SCHEMA_VERSION = 3;

export const LIMITS = {
  scenes: 200,
  shots: 100,
  actors: 50,
  // v3: props dan dinding modular berbagi array `setObjects` dengan ruangan (F4-07/F4-08),
  // jadi batas lama 30 (yang hanya menghitung ruangan) tidak lagi cukup.
  setObjects: 80,
  keys: 2400,
  doors: 2,
  name: 100,
  notes: 2000,
  duration: [1, 120],
  fps: [1, 120],
  height: [0.5, 3],
  focal: [14, 120],
  roomSpan: [1, 40],
  roomHeight: [1, 10],
  coordinate: [-1000, 1000],
  roomOrigin: [-100, 100],
  // v3 — prop dan dinding modular.
  // Posisi prop/dinding memakai rentang yang sama dengan keyframe (bukan `roomOrigin`),
  // supaya prop hasil migrasi di tepi ruangan terjauh tidak pernah ditolak validator.
  propOrigin: [-1000, 1000],
  propSpan: [0.05, 40],
  elevation: [0, 10],
  angle: [-360, 360],
  wallLength: [0.2, 40],
  wallHeight: [0.2, 10],
  wallThickness: [0.02, 2],
  // F6-03: diselaraskan dengan target PRD §9 ("proyek metadata ≤5 MB dibuka p95 ≤2 detik").
  // Nilai ini deklaratif — `validateDocument` tidak menolak dokumen besar, karena
  // menolak dokumen yang sudah tersimpan berarti mengunci pengguna dari karyanya.
  // Dipakai sebagai ambang peringatan dan sebagai definisi "proyek besar" saat mengukur.
  documentBytes: 5_000_000,
};

export const ASPECT_RATIOS = ['16:9', '9:16', '2.39:1', '4:3', '1:1'];
// v3 (F4-05/TL-02): interpolasi per track. `linear` tetap default dan tetap
// menghasilkan angka yang persis sama dengan v2.
export const INTERPOLATIONS = ['linear', 'hold', 'ease'];
/** Properti track yang dikenal. Aktor memakai position+rotation, kamera memakai pose. */
export const TRACK_PROPERTIES = ['pose', 'position', 'rotation'];
export const ACTOR_KEY_FIELDS = ['x', 'z', 'r'];
export const POSITION_KEY_FIELDS = ['x', 'z'];
export const ROTATION_KEY_FIELDS = ['r'];
export const CAMERA_KEY_FIELDS = ['x', 'y', 'z', 'tx', 'ty', 'tz'];
/** Bentuk prop yang dikenal (F4-07/SC-01). */
export const PROP_SHAPES = ['box', 'table', 'chair', 'decor'];
/** Tipe objek yang boleh berada di `scene.setObjects`. */
export const SET_OBJECT_TYPES = ['room', 'prop', 'wall'];

/** Dokumen ditulis oleh aplikasi yang lebih baru: jangan dibuka, jangan ditimpa. */
export class SchemaTooNewError extends Error {
  constructor(version) {
    super(`Proyek memakai schema versi ${version}, lebih baru daripada aplikasi ini (${SCHEMA_VERSION}). Perbarui aplikasi sebelum membuka proyek; data sumber tidak diubah.`);
    this.name = 'SchemaTooNewError';
    this.version = version;
  }
}

const fail = message => {throw new Error(message);};
const isNumber = (n, [min, max]) => typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max;
const isInteger = (n, [min, max]) => Number.isInteger(n) && n >= min && n <= max;
const isName = s => typeof s === 'string' && s.length > 0 && s.length <= LIMITS.name;
const isNotes = s => typeof s === 'string' && s.length <= LIMITS.notes;
const isColor = s => typeof s === 'string' && /^#[0-9a-f]{6}$/i.test(s);
const isId = s => typeof s === 'string' && s.length > 0 && s.length <= 64 && /^[\w.:-]+$/.test(s);
const isTimestamp = s => typeof s === 'string' && !Number.isNaN(Date.parse(s));
const isFlag = v => typeof v === 'boolean';

export const newId = () => (globalThis.crypto?.randomUUID
  ? globalThis.crypto.randomUUID()
  : `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);

export const nowStamp = () => new Date().toISOString();

/** Mengisi default opsional tanpa menyentuh nilai yang sudah ada. */
export function normalizeDocument(doc) {
  doc.thumbnailRef ??= null;
  doc.assets ??= [];
  for (const scene of doc.scenes ?? []) {
    scene.notes ??= '';
    scene.actors ??= [];
    scene.setObjects ??= [];
    scene.shots ??= [];
    scene.activeShotId ??= scene.shots[0]?.id ?? null;
    for (const object of [...scene.actors, ...scene.setObjects]) {
      // Dokumen v2 hanya mengenal ruangan pada `setObjects`; tipe yang hilang berarti ruangan.
      if (scene.setObjects.includes(object)) object.type ??= 'room';
      object.locked ??= object.type === 'room';
      object.visible ??= true;
      object.assetRef ??= null;
      if (object.type === 'room') object.doors ??= [];
      if (object.type === 'prop') {
        object.shape ??= 'box';
        object.y ??= 0;
        object.r ??= 0;
      }
      if (object.type === 'wall') {
        object.r ??= 0;
        object.thickness ??= 0.12;
      }
    }
    for (const shot of scene.shots) {
      shot.notes ??= '';
      shot.tracks ??= [];
      shot.camera ??= null;
      if (shot.cameraId === undefined) shot.cameraId = shot.camera ? shot.camera.id : null;
      shot.fps ??= 24;
      shot.aspectRatio ??= '16:9';
      if (shot.camera) {
        shot.camera.locked ??= false;
        shot.camera.visible ??= true;
        shot.camera.targetId ??= '';
      }
      for (const track of shot.tracks) {
        track.property ??= 'pose';
        track.interpolation ??= 'linear';
      }
    }
  }
  return doc;
}

function validateKeys(keys, fields, duration, label) {
  if (!Array.isArray(keys) || keys.length === 0 || keys.length > LIMITS.keys) fail(`Jumlah keyframe ${label} tidak valid.`);
  for (const key of keys) {
    if (!isNumber(key.t, [0, duration])) fail(`Waktu keyframe ${label} di luar durasi shot.`);
    for (const field of fields) if (!isNumber(key[field], LIMITS.coordinate)) fail(`Nilai keyframe ${label} tidak valid.`);
    // F4-06: focal length dapat di-key pada track kamera. Field ini OPSIONAL supaya
    // dokumen lama tetap valid tanpa migrasi; bila ada, rentangnya sama dengan lensa.
    if (key.focal !== undefined && !isNumber(key.focal, LIMITS.focal)) fail(`Focal length keyframe ${label} tidak valid.`);
  }
  keys.sort((a, b) => a.t - b.t);
  if (new Set(keys.map(k => k.t)).size !== keys.length) fail(`Waktu keyframe ${label} harus unik.`);
}

function validateFlags(object, label) {
  for (const flag of ['locked', 'visible']) if (!isFlag(object[flag])) fail(`Status lock/hide ${label} tidak valid.`);
}

function validateActor(actor, seen) {
  if (!isId(actor.id) || seen.has(actor.id)) fail('ID karakter harus unik dalam scene.');
  seen.add(actor.id);
  if (actor.type !== 'actor') fail('Tipe objek karakter tidak valid.');
  if (!isName(actor.name)) fail('Nama karakter tidak valid.');
  if (!isColor(actor.color)) fail('Warna karakter tidak valid.');
  if (!isNumber(actor.height, LIMITS.height)) fail('Tinggi karakter tidak valid.');
  validateFlags(actor, 'karakter');
}

function validateRoom(room, seen) {
  if (!isId(room.id) || seen.has(room.id)) fail('ID lokasi harus unik dalam scene.');
  seen.add(room.id);
  if (room.type !== 'room') fail('Tipe objek lokasi tidak valid.');
  if (!isName(room.name)) fail('Nama lokasi tidak valid.');
  if (!isColor(room.color)) fail('Warna lokasi tidak valid.');
  for (const axis of ['x', 'z']) if (!isNumber(room[axis], LIMITS.roomOrigin)) fail('Posisi lokasi tidak valid.');
  for (const span of ['w', 'd']) if (!isNumber(room[span], LIMITS.roomSpan)) fail('Ukuran lokasi tidak valid.');
  if (!isNumber(room.h, LIMITS.roomHeight)) fail('Tinggi dinding tidak valid.');
  validateFlags(room, 'lokasi');
  if (!Array.isArray(room.doors) || room.doors.length > LIMITS.doors) fail('Jumlah pintu tidak valid.');
  if (!validDoors(room)) fail('Ukuran atau posisi pintu tidak valid.');
}

/** Prop ber-ID (F4-07/SC-01): box, meja, kursi dan dekorasi. */
function validateProp(prop, seen) {
  if (!isId(prop.id) || seen.has(prop.id)) fail('ID prop harus unik dalam scene.');
  seen.add(prop.id);
  if (!PROP_SHAPES.includes(prop.shape)) fail('Bentuk prop belum didukung.');
  if (!isName(prop.name)) fail('Nama prop tidak valid.');
  if (!isColor(prop.color)) fail('Warna prop tidak valid.');
  for (const axis of ['x', 'z']) if (!isNumber(prop[axis], LIMITS.propOrigin)) fail('Posisi prop tidak valid.');
  if (!isNumber(prop.y, LIMITS.elevation)) fail('Ketinggian prop tidak valid.');
  if (!isNumber(prop.r, LIMITS.angle)) fail('Rotasi prop tidak valid.');
  for (const span of ['w', 'd', 'h']) if (!isNumber(prop[span], LIMITS.propSpan)) fail('Ukuran prop tidak valid.');
  validateFlags(prop, 'prop');
}

/** Segmen dinding modular (F4-08/SC-01). Terpisah dari `room.doors`. */
function validateWall(wall, seen) {
  if (!isId(wall.id) || seen.has(wall.id)) fail('ID dinding harus unik dalam scene.');
  seen.add(wall.id);
  if (!isName(wall.name)) fail('Nama dinding tidak valid.');
  if (!isColor(wall.color)) fail('Warna dinding tidak valid.');
  for (const axis of ['x', 'z']) if (!isNumber(wall[axis], LIMITS.propOrigin)) fail('Posisi dinding tidak valid.');
  if (!isNumber(wall.r, LIMITS.angle)) fail('Rotasi dinding tidak valid.');
  if (!isNumber(wall.length, LIMITS.wallLength)) fail('Panjang dinding tidak valid.');
  if (!isNumber(wall.height, LIMITS.wallHeight)) fail('Tinggi dinding modular tidak valid.');
  if (!isNumber(wall.thickness, LIMITS.wallThickness)) fail('Ketebalan dinding tidak valid.');
  validateFlags(wall, 'dinding');
}

/** Memilah satu entri `setObjects` ke validator tipenya. */
function validateSetObject(object, seen) {
  if (!object || typeof object !== 'object') fail('Objek set tidak valid.');
  if (!SET_OBJECT_TYPES.includes(object.type)) fail('Tipe objek set tidak valid.');
  if (object.type === 'room') validateRoom(object, seen);
  else if (object.type === 'prop') validateProp(object, seen);
  else validateWall(object, seen);
}

/** Field keyframe yang wajib ada untuk sebuah properti track. */
const keyFieldsFor = property =>
  (property === 'position' ? POSITION_KEY_FIELDS : property === 'rotation' ? ROTATION_KEY_FIELDS : CAMERA_KEY_FIELDS);

function validateShot(shot, scene, seenShots) {
  if (!isId(shot.id) || seenShots.has(shot.id)) fail('ID shot harus unik dalam scene.');
  seenShots.add(shot.id);
  if (shot.sceneId !== scene.id) fail('Shot merujuk scene lain. Referensi lintas scene ditolak.');
  if (!isName(shot.name)) fail('Nama shot tidak valid.');
  if (!isInteger(shot.order, [0, LIMITS.shots])) fail('Urutan shot tidak valid.');
  if (!isNumber(shot.duration, LIMITS.duration)) fail('Durasi shot tidak valid.');
  if (!isNumber(shot.fps, LIMITS.fps)) fail('Nilai fps shot tidak valid.');
  if (!ASPECT_RATIOS.includes(shot.aspectRatio)) fail('Aspect ratio shot tidak didukung.');
  if (!isNotes(shot.notes)) fail('Catatan shot terlalu panjang.');

  const actorIds = new Set(scene.actors.map(a => a.id));
  const camera = shot.camera;
  if (camera !== null) {
    if (!camera || typeof camera !== 'object') fail('Data kamera tidak valid.');
    if (!isId(camera.id)) fail('ID kamera tidak valid.');
    if (camera.type !== 'camera') fail('Tipe objek kamera tidak valid.');
    if (actorIds.has(camera.id)) fail('ID kamera bentrok dengan karakter.');
    if (!isName(camera.name)) fail('Nama kamera tidak valid.');
    if (!isNumber(camera.focal, LIMITS.focal)) fail('Focal length kamera tidak valid.');
    validateFlags(camera, 'kamera');
    if (camera.targetId !== '' && !actorIds.has(camera.targetId)) fail('Kamera mengikuti karakter yang tidak ada di scene ini.');
    if (shot.cameraId !== camera.id) fail('cameraId shot tidak cocok dengan kamera yang dimiliki shot.');
  } else if (shot.cameraId !== null) fail('cameraId harus null ketika shot tidak memiliki kamera.');

  if (!Array.isArray(shot.tracks)) fail('Track shot tidak valid.');
  // v3 (F4-05): satu objek dapat memiliki BEBERAPA track, satu per properti.
  // Aktor wajib punya `position` dan `rotation`; kamera tetap satu track `pose`.
  const seenTracks = new Set();
  for (const track of shot.tracks) {
    if (!isId(track.objectId)) fail('Track merujuk objek tanpa ID.');
    if (!TRACK_PROPERTIES.includes(track.property)) fail('Properti track belum didukung.');
    const signature = `${track.objectId}#${track.property}`;
    if (seenTracks.has(signature)) fail('Satu objek hanya boleh memiliki satu track per properti pada satu shot.');
    seenTracks.add(signature);
    if (!INTERPOLATIONS.includes(track.interpolation)) fail('Jenis interpolasi track belum didukung.');
    const isCameraTrack = !!camera && track.objectId === camera.id;
    if (!isCameraTrack && !actorIds.has(track.objectId)) fail('Track merujuk objek di luar scene ini. Referensi lintas scene ditolak.');
    if (isCameraTrack && track.property !== 'pose') fail('Track kamera hanya mengenal properti pose.');
    if (!isCameraTrack && track.property === 'pose') fail('Track karakter v3 memakai properti position dan rotation, bukan pose.');
    validateKeys(track.keys, keyFieldsFor(track.property), shot.duration, isCameraTrack ? 'kamera' : 'karakter');
  }
  for (const actor of scene.actors) {
    for (const property of ['position', 'rotation']) {
      if (!seenTracks.has(`${actor.id}#${property}`)) fail(`Karakter ${actor.name} tidak memiliki track ${property} pada shot ${shot.name}.`);
    }
  }
  if (camera && !seenTracks.has(`${camera.id}#pose`)) fail('Kamera tidak memiliki track pose.');
}

function validateScene(scene, doc, seenScenes) {
  if (!isId(scene.id) || seenScenes.has(scene.id)) fail('ID scene harus unik dalam proyek.');
  seenScenes.add(scene.id);
  if (scene.projectId !== doc.id) fail('Scene merujuk proyek lain. Referensi lintas proyek ditolak.');
  if (!isName(scene.name)) fail('Nama scene tidak valid.');
  if (!isInteger(scene.order, [0, LIMITS.scenes])) fail('Urutan scene tidak valid.');
  if (!isNotes(scene.notes)) fail('Director’s note terlalu panjang.');
  if (!Array.isArray(scene.actors) || scene.actors.length > LIMITS.actors) fail('Jumlah karakter melewati batas.');
  if (!Array.isArray(scene.setObjects) || scene.setObjects.length > LIMITS.setObjects) fail('Jumlah objek set melewati batas.');
  if (!Array.isArray(scene.shots) || scene.shots.length === 0 || scene.shots.length > LIMITS.shots) fail('Scene memerlukan minimal satu shot.');

  const seenObjects = new Set();
  for (const actor of scene.actors) validateActor(actor, seenObjects);
  for (const object of scene.setObjects) validateSetObject(object, seenObjects);
  const seenShots = new Set();
  for (const shot of scene.shots) validateShot(shot, scene, seenShots);
  if (!seenShots.has(scene.activeShotId)) fail('activeShotId scene menunjuk shot yang tidak ada.');
}

/**
 * Memvalidasi dokumen v2 di tempat dan mengembalikannya setelah normalisasi.
 * Melempar `SchemaTooNewError` bila dokumen berasal dari aplikasi yang lebih baru.
 */
export function validateDocument(doc) {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) fail('Format proyek tidak valid.');
  if (typeof doc.schemaVersion !== 'number' || !Number.isInteger(doc.schemaVersion) || doc.schemaVersion < 1) fail('Versi schema proyek tidak dikenal.');
  if (doc.schemaVersion > SCHEMA_VERSION) throw new SchemaTooNewError(doc.schemaVersion);
  if (doc.schemaVersion !== SCHEMA_VERSION) fail(`Dokumen memakai schema v${doc.schemaVersion}; migrasikan lebih dahulu.`);
  if (!isId(doc.id)) fail('ID proyek tidak valid.');
  if (!isName(doc.title)) fail('Judul proyek tidak valid.');
  if (!isTimestamp(doc.createdAt) || !isTimestamp(doc.updatedAt)) fail('Timestamp proyek tidak valid.');
  if (doc.thumbnailRef !== null && typeof doc.thumbnailRef !== 'string') fail('Referensi thumbnail tidak valid.');
  if (!Array.isArray(doc.assets)) fail('Daftar aset tidak valid.');
  if (!Array.isArray(doc.scenes) || doc.scenes.length === 0 || doc.scenes.length > LIMITS.scenes) fail('Proyek memerlukan minimal satu scene.');

  normalizeDocument(doc);
  const seenScenes = new Set();
  for (const scene of doc.scenes) validateScene(scene, doc, seenScenes);
  if (!seenScenes.has(doc.activeSceneId)) fail('activeSceneId proyek menunjuk scene yang tidak ada.');
  return doc;
}

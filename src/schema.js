// Validator schema v2 (Project → Scene → Shot). Kontrak lengkap: docs/DATA-MODEL.md.
// Validator ini murni: melempar Error dengan pesan Bahasa Indonesia dan tidak pernah
// menulis ke penyimpanan. Normalisasi hanya mengisi default yang aman.
import {validDoors} from './spatial.js';

export const SCHEMA_VERSION = 2;

export const LIMITS = {
  scenes: 200,
  shots: 100,
  actors: 50,
  setObjects: 30,
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
  // F6-03: diselaraskan dengan target PRD §9 ("proyek metadata ≤5 MB dibuka p95 ≤2 detik").
  // Nilai ini deklaratif — `validateDocument` tidak menolak dokumen besar, karena
  // menolak dokumen yang sudah tersimpan berarti mengunci pengguna dari karyanya.
  // Dipakai sebagai ambang peringatan dan sebagai definisi "proyek besar" saat mengukur.
  documentBytes: 5_000_000,
};

export const ASPECT_RATIOS = ['16:9', '9:16', '2.39:1', '4:3', '1:1'];
export const INTERPOLATIONS = ['linear'];
export const ACTOR_KEY_FIELDS = ['x', 'z', 'r'];
export const CAMERA_KEY_FIELDS = ['x', 'y', 'z', 'tx', 'ty', 'tz'];

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
      object.locked ??= object.type === 'room';
      object.visible ??= true;
      object.assetRef ??= null;
      if (object.type === 'room') object.doors ??= [];
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
  const seenTracks = new Set();
  for (const track of shot.tracks) {
    if (!isId(track.objectId)) fail('Track merujuk objek tanpa ID.');
    if (seenTracks.has(track.objectId)) fail('Satu objek hanya boleh memiliki satu track pose per shot.');
    seenTracks.add(track.objectId);
    if (track.property !== 'pose') fail('Properti track belum didukung.');
    if (!INTERPOLATIONS.includes(track.interpolation)) fail('Jenis interpolasi track belum didukung.');
    const isCameraTrack = !!camera && track.objectId === camera.id;
    if (!isCameraTrack && !actorIds.has(track.objectId)) fail('Track merujuk objek di luar scene ini. Referensi lintas scene ditolak.');
    validateKeys(track.keys, isCameraTrack ? CAMERA_KEY_FIELDS : ACTOR_KEY_FIELDS, shot.duration, isCameraTrack ? 'kamera' : 'karakter');
  }
  for (const actor of scene.actors) if (!seenTracks.has(actor.id)) fail(`Karakter ${actor.name} tidak memiliki track pose pada shot ${shot.name}.`);
  if (camera && !seenTracks.has(camera.id)) fail('Kamera tidak memiliki track pose.');
}

function validateScene(scene, doc, seenScenes) {
  if (!isId(scene.id) || seenScenes.has(scene.id)) fail('ID scene harus unik dalam proyek.');
  seenScenes.add(scene.id);
  if (scene.projectId !== doc.id) fail('Scene merujuk proyek lain. Referensi lintas proyek ditolak.');
  if (!isName(scene.name)) fail('Nama scene tidak valid.');
  if (!isInteger(scene.order, [0, LIMITS.scenes])) fail('Urutan scene tidak valid.');
  if (!isNotes(scene.notes)) fail('Director’s note terlalu panjang.');
  if (!Array.isArray(scene.actors) || scene.actors.length > LIMITS.actors) fail('Jumlah karakter melewati batas.');
  if (!Array.isArray(scene.setObjects) || scene.setObjects.length > LIMITS.setObjects) fail('Jumlah lokasi melewati batas.');
  if (!Array.isArray(scene.shots) || scene.shots.length === 0 || scene.shots.length > LIMITS.shots) fail('Scene memerlukan minimal satu shot.');

  const seenObjects = new Set();
  for (const actor of scene.actors) validateActor(actor, seenObjects);
  for (const room of scene.setObjects) validateRoom(room, seenObjects);
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

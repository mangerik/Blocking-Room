// Migrasi JSON v1 → dokumen schema v2 dengan aturan copy-first.
// Sumber tidak pernah dimutasi: input di-clone dahulu, hasil divalidasi, dan bila
// validasi gagal pemanggil tetap memegang dokumen lama. Lihat docs/DATA-MODEL.md.
import {SCHEMA_VERSION, SchemaTooNewError, newId, nowStamp, validateDocument} from './schema.js';

/** fps default shot hasil migrasi. Keyframe tetap disimpan dalam detik. */
export const DEFAULT_FPS = 24;
export const DEFAULT_ASPECT_RATIO = '16:9';
/** Toleransi kesetaraan waktu keyframe (detik) yang dipakai putKey dan uji migrasi. */
export const TIME_TOLERANCE = 0.05;

const clone = value => JSON.parse(JSON.stringify(value));

/** Menentukan versi schema dokumen mentah tanpa memvalidasinya. */
export function detectVersion(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  if (Number.isInteger(input.schemaVersion)) return input.schemaVersion;
  if (input.version === 1) return 1;
  return null;
}

/**
 * Membangun dokumen v2 dari proyek v1 tanpa mengubah input.
 * Satu proyek → satu scene → satu shot default. Semua keyframe, focal length,
 * target kamera, kamera null, pintu, flag lock/hide dan nama dipertahankan apa adanya.
 */
export function migrateV1ToV2(v1, {id = newId, now = nowStamp} = {}) {
  const source = clone(v1);
  const projectId = id();
  const sceneId = id();
  const shotId = id();
  const stamp = now();

  const actors = [];
  const tracks = [];
  for (const actor of source.actors ?? []) {
    actors.push({
      id: actor.id, type: 'actor', name: actor.name, color: actor.color, height: actor.height,
      locked: actor.locked ?? false, visible: actor.visible !== false, assetRef: null,
    });
    tracks.push({objectId: actor.id, property: 'pose', interpolation: 'linear', keys: clone(actor.keys)});
  }

  const setObjects = (source.rooms ?? []).map(room => ({
    id: room.id, type: 'room', name: room.name, color: room.color,
    x: room.x, z: room.z, w: room.w, d: room.d, h: room.h,
    doors: clone(room.doors ?? []),
    locked: room.locked ?? true, visible: room.visible !== false, assetRef: null,
  }));

  let camera = null;
  if (source.camera) {
    camera = {
      id: source.camera.id, type: 'camera', name: source.camera.name, focal: source.camera.focal,
      targetId: source.camera.target ?? '',
      locked: source.camera.locked ?? false, visible: source.camera.visible !== false,
    };
    tracks.push({objectId: camera.id, property: 'pose', interpolation: 'linear', keys: clone(source.camera.keys)});
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    id: projectId,
    title: source.title,
    createdAt: stamp,
    updatedAt: stamp,
    activeSceneId: sceneId,
    thumbnailRef: null,
    assets: [],
    scenes: [{
      id: sceneId, projectId, name: 'Scene 01', order: 0, notes: '',
      activeShotId: shotId,
      actors, setObjects,
      shots: [{
        id: shotId, sceneId, name: 'Shot 01', order: 0,
        duration: source.duration, fps: DEFAULT_FPS, aspectRatio: DEFAULT_ASPECT_RATIO,
        notes: '', cameraId: camera ? camera.id : null, camera, tracks,
      }],
    }],
  };
}

/**
 * Membuka data proyek apa pun (v1 atau v2) menjadi dokumen v2 tervalidasi.
 * Copy-first: input tidak pernah dimutasi. Bila hasil tidak lolos validasi,
 * fungsi melempar error sehingga dokumen aktif pemanggil tetap utuh.
 * Mengembalikan `backup` berisi salinan sumber untuk diunduh sebelum menimpa apa pun.
 */
export function openProjectData(input, options = {}) {
  const version = detectVersion(input);
  if (version === null) throw new Error('Format proyek tidak dikenal.');
  if (version > SCHEMA_VERSION) throw new SchemaTooNewError(version);
  const backup = clone(input);
  const document = version === 1 ? migrateV1ToV2(backup, options) : clone(backup);
  validateDocument(document);
  return {document, backup, migrated: version === 1, sourceVersion: version};
}

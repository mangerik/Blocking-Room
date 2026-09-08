// Migrasi JSON v1 → v2 → dokumen schema v3 dengan aturan copy-first.
// Sumber tidak pernah dimutasi: input di-clone dahulu, hasil divalidasi, dan bila
// validasi gagal pemanggil tetap memegang dokumen lama. Lihat docs/DATA-MODEL.md.
import {SCHEMA_VERSION, SchemaTooNewError, newId, nowStamp, validateDocument} from './schema.js';
import {combineTracks} from './timeline-engine.js';

/** Versi antara: `migrateV1ToV2` sengaja tetap menghasilkan v2 apa adanya. */
export const V2_SCHEMA_VERSION = 2;

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
    schemaVersion: V2_SCHEMA_VERSION,
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

// ---------------------------------------------------------------------------
// v2 → v3 (F4-05 TL-02, F4-07 dan F4-08 SC-01)
// ---------------------------------------------------------------------------

/**
 * Dekorasi contoh v2 digambar oleh renderer berdasarkan INDEKS ruangan
 * (`scene-renderer.js#build`, blok `if (i === 0/1/2)`), jadi ia bukan data dan
 * tidak punya ID. Fungsi ini menghasilkan prop ber-ID dengan **pose dunia yang
 * persis sama**: renderer lama menaruh dekorasi di dalam grup ruangan pada
 * `(room.x, 0, room.z)`, sehingga koordinat dunia = pusat ruangan + offset lokal.
 *
 * Setelah migrasi, blok indeks itu dihapus dari renderer; prop menjadi entitas
 * biasa yang dapat dipindah, dikunci, disembunyikan, diduplikasi dan dihapus.
 */
export function legacyDecorProps(room, index, nextId) {
  const out = [];
  const add = (shape, name, w, h, d, x, y, z, color) => out.push({
    id: nextId(), type: 'prop', shape, name, color,
    x: room.x + x, y, z: room.z + z, r: 0,
    w, d, h,
    locked: false, visible: room.visible !== false, assetRef: null,
  });
  if (index === 0) {
    add('box', 'Sofa foyer', 1.8, .7, .65, -room.w * .22, .4, -room.d * .25, '#82958b');
    add('box', 'Alas sofa', 1.9, .1, .75, -room.w * .22, .8, -room.d * .25, '#dce1d4');
  }
  if (index === 1) {
    add('box', 'Meja konsol', room.w * .32, .6, .85, .5, .37, -room.d * .12, '#b9ab8e');
    add('box', 'Daun meja konsol', room.w * .34, .1, .96, .5, .72, -room.d * .12, '#e6dcc4');
    for (const x of [-room.w * .32, room.w * .32]) {
      add('box', 'Podium', .65, 1, .65, x, .58, -room.d * .30, '#e7dfcb');
      add('decor', 'Patung', .76, .76, .76, x, 1.45, -room.d * .30, '#8a927d');
    }
    for (const x of [-room.w * .27, 0, room.w * .27]) {
      const doorway = room.doors?.find(d => d.wall === 'back');
      if (doorway && Math.abs(x - doorway.offset) < doorway.width / 2 + .75) continue;
      add('box', 'Bingkai', 1.5, 1.35, .08, x, 1.75, -room.d / 2 + .08, '#ece5d6');
      add('box', 'Kanvas', 1.25, 1.1, .09, x, 1.75, -room.d / 2 + .14, x === 0 ? '#a08767' : '#788c80');
    }
  }
  if (index === 2) add('box', 'Bangku panjang', room.w * .42, .8, .7, 0, .45, -room.d * .2, '#96a18b');
  return out;
}

/**
 * Membangun dokumen v3 dari dokumen v2 tanpa mengubah input.
 *
 * Tiga perubahan bentuk, satu migrasi (lihat docs/DATA-MODEL.md §8):
 *
 * 1. **F4-05.** Setiap track `pose` aktor dipecah menjadi track `position`
 *    (`{t,x,z}`) dan `rotation` (`{t,r}`) dengan waktu yang PERSIS sama dan
 *    interpolasi `linear`. Karena `sampleTrack('linear')` mengerjakan aritmetika
 *    yang sama dengan `model.js#sample`, hasil sampling tidak bergeser satu angka
 *    pun — dibuktikan terhadap golden Fase 0 di `tests/migrate.test.js`.
 *    Track kamera tetap `pose`.
 * 2. **F4-07.** Dekorasi contoh berbasis indeks ruangan menjadi prop ber-ID.
 * 3. **F4-08.** Tidak ada dinding modular yang dibuat: dokumen lama tidak
 *    memilikinya, dan menambahkan geometri yang tidak pernah ada berarti mengubah
 *    hasil render proyek pengguna.
 */
export function migrateV2ToV3(v2, {id = newId} = {}) {
  const source = clone(v2);
  const doc = {...source, schemaVersion: SCHEMA_VERSION};
  doc.scenes = (source.scenes ?? []).map(scene => {
    // Urutan v3: seluruh ruangan dahulu, lalu prop, lalu dinding modular — urutan
    // yang sama dengan yang ditulis `document.js#writeSceneView`, sehingga menyimpan
    // dokumen hasil migrasi tidak mengubah urutannya lagi.
    const setObjects = [], props = [], walls = [];
    let roomIndex = 0;
    for (const object of scene.setObjects ?? []) {
      const type = object.type ?? 'room';
      if (type === 'prop') {props.push({...object, type}); continue;}
      if (type === 'wall') {walls.push({...object, type}); continue;}
      setObjects.push({...object, type});
      props.push(...legacyDecorProps(object, roomIndex, id));
      roomIndex += 1;
    }
    setObjects.push(...props, ...walls);
    const actorIds = new Set((scene.actors ?? []).map(a => a.id));
    return {
      ...scene,
      setObjects,
      shots: (scene.shots ?? []).map(shot => ({
        ...shot,
        tracks: (shot.tracks ?? []).flatMap(track => {
          if (!actorIds.has(track.objectId) || track.property !== 'pose') return [{...track, keys: clone(track.keys)}];
          const interpolation = track.interpolation ?? 'linear';
          return [
            {objectId: track.objectId, property: 'position', interpolation, keys: track.keys.map(k => ({t: k.t, x: k.x, z: k.z}))},
            {objectId: track.objectId, property: 'rotation', interpolation, keys: track.keys.map(k => ({t: k.t, r: k.r}))},
          ];
        }),
      })),
    };
  });
  return doc;
}

/**
 * Membuka data proyek apa pun (v1, v2 atau v3) menjadi dokumen v3 tervalidasi.
 * Copy-first: input tidak pernah dimutasi. Bila hasil tidak lolos validasi,
 * fungsi melempar error sehingga dokumen aktif pemanggil tetap utuh.
 * Mengembalikan `backup` berisi salinan sumber untuk diunduh sebelum menimpa apa pun.
 */
export function openProjectData(input, options = {}) {
  const version = detectVersion(input);
  if (version === null) throw new Error('Format proyek tidak dikenal.');
  if (version > SCHEMA_VERSION) throw new SchemaTooNewError(version);
  const backup = clone(input);
  let document = clone(backup);
  if (version === 1) document = migrateV1ToV2(document, options);
  if (version <= 2) document = migrateV2ToV3(document, options);
  validateDocument(document);
  return {document, backup, migrated: version < SCHEMA_VERSION, sourceVersion: version};
}

/**
 * Ekspor balik v3 → v2 (`docs/ROLLOUT.md` §6).
 *
 * Kebalikan `migrateV2ToV3`, dan syarat rilis yang ditulis prosedur rollback: build R1
 * hanya mengenal `schemaVersion: 2`, sedangkan `exportAsV1` hanya memuat SATU scene dan
 * SATU shot. Fungsi ini mempertahankan seluruh scene, shot, kamera dan keyframe.
 *
 * Yang hilang saat menurunkan versi (dikatakan, bukan disembunyikan):
 * prop, dinding modular, dan interpolasi selain `linear` — track digabung kembali
 * menjadi satu track `pose` per aktor pada gabungan waktu kedua track, sehingga gerak
 * yang dilihat build lama sama dengan yang dilihat build ini pada interpolasi linear.
 * Dokumen v3 sumber TIDAK diubah dan TIDAK dihapus.
 *
 * @param {object} doc dokumen v3
 * @returns {{data:object, dropped:string[]}}
 */
export function exportAsV2(doc) {
  const source = clone(doc);
  const dropped = [];
  let props = 0, walls = 0, curved = 0;
  const scenes = source.scenes.map(scene => ({
    ...scene,
    setObjects: scene.setObjects.filter(object => {
      const type = object.type ?? 'room';
      if (type === 'prop') props += 1;
      if (type === 'wall') walls += 1;
      return type === 'room';
    }),
    shots: scene.shots.map(shot => {
      const tracks = [];
      for (const actor of scene.actors) {
        const position = shot.tracks.find(t => t.objectId === actor.id && t.property === 'position');
        const rotation = shot.tracks.find(t => t.objectId === actor.id && t.property === 'rotation');
        if (!position || !rotation) continue;
        if (position.interpolation !== 'linear' || rotation.interpolation !== 'linear') curved += 1;
        tracks.push({objectId: actor.id, property: 'pose', interpolation: 'linear', keys: combineTracks(position, rotation)});
      }
      const camera = shot.camera ? shot.tracks.find(t => t.objectId === shot.camera.id && t.property === 'pose') : null;
      if (camera) {
        if (camera.interpolation !== 'linear') curved += 1;
        tracks.push({...camera, interpolation: 'linear'});
      }
      return {...shot, tracks};
    }),
  }));
  if (props) dropped.push(`${props} prop`);
  if (walls) dropped.push(`${walls} segmen dinding modular`);
  if (curved) dropped.push(`${curved} track dengan interpolasi non-linear (diturunkan menjadi linear)`);
  return {data: {...source, schemaVersion: V2_SCHEMA_VERSION, scenes}, dropped};
}

/**
 * Ekspor balik v2 → v1 (F6-07, PRD §14 poin 6).
 *
 * Dipakai untuk rollback aplikasi: build lama hanya mengenal JSON v1, sedangkan
 * data pengguna sudah berbentuk dokumen v2. Fungsi ini menghasilkan satu berkas v1
 * dari SATU scene dan SATU shot — itu memang seluruh kapasitas format v1.
 *
 * Yang hilang saat menurunkan versi (harus dikatakan, bukan disembunyikan):
 * scene lain, shot lain, `fps`, `aspectRatio`, catatan scene/shot, `assetRef`,
 * `thumbnailRef` dan metadata proyek. Dokumen v2 sumber TIDAK diubah dan tidak
 * dihapus; berkas v1 adalah salinan tambahan.
 *
 * @param {object} doc dokumen v2
 * @param {{sceneId?:string, shotId?:string}} pick scene/shot yang diekspor
 * @returns {{data:object, dropped:string[]}} data v1 dan daftar hal yang tidak terbawa
 */
export function exportAsV1(doc, {sceneId = doc.activeSceneId, shotId} = {}) {
  const scene = doc.scenes.find(s => s.id === sceneId) ?? doc.scenes[0];
  if (!scene) throw new Error('Dokumen tidak memiliki scene.');
  const shot = scene.shots.find(s => s.id === (shotId ?? scene.activeShotId)) ?? scene.shots[0];
  if (!shot) throw new Error('Scene tidak memiliki shot.');

  const trackOf = (objectId, property) => shot.tracks.find(t => t.objectId === objectId && t.property === property) ?? null;
  const keysOf = objectId => clone(trackOf(objectId, 'pose')?.keys ?? []);
  // v3 → v1: dua track independen digabung kembali menjadi keyframe `{t,x,z,r}`.
  // Waktu gabungan adalah union kedua track, jadi tidak ada keyframe yang hilang
  // walaupun posisi dan orientasi di-key pada frame yang berbeda.
  const actors = scene.actors.map(actor => ({
    id: actor.id, name: actor.name, color: actor.color, height: actor.height,
    keys: combineTracks(trackOf(actor.id, 'position') ?? {keys: [], interpolation: 'linear'},
      trackOf(actor.id, 'rotation') ?? {keys: [], interpolation: 'linear'}),
    locked: actor.locked ?? false, visible: actor.visible !== false,
  }));
  const rooms = scene.setObjects.filter(o => (o.type ?? 'room') === 'room').map(room => ({
    id: room.id, name: room.name, x: room.x, z: room.z, w: room.w, d: room.d, h: room.h,
    color: room.color, locked: room.locked ?? true, visible: room.visible !== false,
    doors: clone(room.doors ?? []),
  }));
  const camera = shot.camera
    ? {
      id: shot.camera.id, name: shot.camera.name, focal: shot.camera.focal,
      target: shot.camera.targetId ?? '', keys: keysOf(shot.camera.id),
      locked: shot.camera.locked ?? false, visible: shot.camera.visible !== false,
    }
    : null;

  const dropped = [];
  if (doc.scenes.length > 1) dropped.push(`${doc.scenes.length - 1} scene lain`);
  if (scene.shots.length > 1) dropped.push(`${scene.shots.length - 1} shot lain`);
  if (scene.notes) dropped.push('catatan scene');
  if (shot.notes) dropped.push('catatan shot');
  if (shot.fps !== DEFAULT_FPS) dropped.push(`fps ${shot.fps}`);
  if (shot.aspectRatio !== DEFAULT_ASPECT_RATIO) dropped.push(`aspect ratio ${shot.aspectRatio}`);
  if (doc.thumbnailRef || scene.thumbnailRef) dropped.push('thumbnail');
  if ((doc.assets ?? []).length) dropped.push('aset');
  // v3: format v1 tidak mengenal prop maupun dinding modular, dan tidak mengenal
  // interpolasi selain linear. Keduanya disebutkan, bukan dibuang diam-diam.
  const props = scene.setObjects.filter(o => o.type === 'prop').length;
  const walls = scene.setObjects.filter(o => o.type === 'wall').length;
  if (props) dropped.push(`${props} prop`);
  if (walls) dropped.push(`${walls} segmen dinding modular`);
  const curved = shot.tracks.filter(t => t.interpolation && t.interpolation !== 'linear').length;
  if (curved) dropped.push(`${curved} track dengan interpolasi non-linear (digabung sebagai linear)`);

  return {
    data: {version: 1, title: doc.title, duration: shot.duration, actors, rooms, camera},
    dropped,
  };
}

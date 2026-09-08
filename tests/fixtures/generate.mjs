// Regenerates the frozen Fase 0 baseline: `node tests/fixtures/generate.mjs`.
// Fixture JSON v1 dan pose baseline dipakai untuk membuktikan migrasi schema v2
// tidak mengubah hasil sampling. Jangan mengedit file hasil secara manual.
import {writeFileSync, mkdirSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {initialProject, validateProject} from '../../src/model.js';
import {baselineOf} from './baseline.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const v1Dir = join(here, 'v1');
const baselineDir = join(here, 'baseline');
mkdirSync(v1Dir, {recursive: true});
mkdirSync(baselineDir, {recursive: true});

const demo = () => structuredClone(initialProject());
const write = (dir, name, data) => writeFileSync(join(dir, `${name}.json`), JSON.stringify(data, null, 2) + '\n');

/** Fixture valid — semua harus lolos validateProject dan punya baseline pose. */
export const validFixtures = {
  // Scene demo apa adanya: tiga aktor, tiga ruangan, satu pintu, kamera mengikuti aktor.
  'demo-scene': () => demo(),

  // Kamera dihapus (null). Ekspor tidak tersedia, tetapi dokumen tetap valid.
  'camera-null': () => {
    const p = demo();
    p.camera = null;
    p.title = 'Galeri tanpa kamera';
    return p;
  },

  // Tanpa aktor dan tanpa ruangan: batas bawah dokumen yang masih valid.
  'empty-scene': () => ({
    version: 1, title: 'Scene kosong', duration: 6,
    actors: [], rooms: [], camera: null,
  }),

  // Kombinasi lock/hide pada setiap jenis objek, termasuk ruangan yang dibuka kuncinya.
  'locked-hidden': () => {
    const p = demo();
    p.title = 'Status objek terkunci dan tersembunyi';
    p.actors[0].locked = true;
    p.actors[1].visible = false;
    p.actors[2].locked = true;
    p.actors[2].visible = false;
    p.rooms[0].locked = false;
    p.rooms[1].visible = false;
    p.camera.locked = true;
    p.camera.visible = false;
    return p;
  },

  // Dua pintu pada satu ruangan (belakang + kiri) dan satu pintu di ruangan lain.
  'doors': () => {
    const p = demo();
    p.title = 'Bukaan dinding';
    p.rooms[0].doors = [
      {wall: 'back', offset: -1, width: 1.2, height: 2.1},
      {wall: 'left', offset: 1.5, width: 1.6, height: 2.4},
    ];
    p.rooms[2].doors = [{wall: 'left', offset: 0, width: 1, height: 2}];
    return p;
  },

  // Jalur berjalan menembus pintu: dipakai untuk baseline langkah kaki dan wallCrossings.
  'walk-path': () => ({
    version: 1, title: 'Jalur berjalan', duration: 10,
    actors: [
      {id: 'walker', name: 'Pejalan', color: '#c16e51', height: 1.78, locked: false, visible: true,
        keys: [{t: 0, x: -6, z: 0, r: 90}, {t: 4, x: -2, z: 0, r: 90}, {t: 10, x: 6, z: 0, r: 90}]},
      {id: 'idle', name: 'Diam', color: '#477f77', height: 1.6, locked: false, visible: true,
        keys: [{t: 0, x: 2, z: -3, r: 350}, {t: 10, x: 2, z: -3, r: 10}]},
    ],
    rooms: [{id: 'hall', name: 'Koridor', x: 0, z: 0, w: 8, d: 6, h: 3, color: '#b5c2c0', locked: true, visible: true,
      doors: [{wall: 'left', offset: 0, width: 1.6, height: 2.4}]}],
    camera: {id: 'camera', name: 'Kamera A', focal: 35, target: '', locked: false, visible: true,
      keys: [{t: 0, x: -8, y: 2, z: 8, tx: -6, ty: 1.2, tz: 0}, {t: 10, x: 8, y: 2, z: 8, tx: 6, ty: 1.2, tz: 0}]},
  }),
};

/** Fixture invalid — harus ditolak validator dan tidak boleh menimpa dokumen aktif. */
export const invalidFixtures = {
  // Versi schema tidak dikenal.
  'invalid-version': () => ({...demo(), version: 99}),
  // Keyframe berisi nilai non-numerik.
  'invalid-keyframe': () => {const p = demo(); p.actors[0].keys[1].x = null; return p;},
  // Dua objek berbagi ID.
  'invalid-duplicate-id': () => {const p = demo(); p.rooms[0].id = p.actors[0].id; return p;},
  // Pintu lebih lebar daripada dindingnya.
  'invalid-door': () => {const p = demo(); p.rooms[0].doors = [{wall: 'left', offset: 20, width: 1, height: 2}]; return p;},
  // Kamera mengikuti aktor yang tidak ada.
  'invalid-camera-target': () => {const p = demo(); p.camera.target = 'tidak-ada'; return p;},
  // Keyframe melewati durasi scene.
  'invalid-key-out-of-range': () => {const p = demo(); p.actors[0].keys.push({t: 99, x: 0, z: 0, r: 0}); return p;},
  // Flag lock bukan boolean.
  'invalid-lock-flag': () => {const p = demo(); p.actors[0].locked = 'ya'; return p;},
  // Bukan objek proyek sama sekali.
  'invalid-not-a-project': () => ([1, 2, 3]),
};

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const [name, make] of Object.entries(validFixtures)) {
    const project = make();
    validateProject(structuredClone(project)); // gagal cepat bila fixture rusak
    write(v1Dir, name, project);
    write(baselineDir, name, baselineOf(project));
  }
  for (const [name, make] of Object.entries(invalidFixtures)) write(v1Dir, name, make());
  console.log(`Fixture v1: ${Object.keys(validFixtures).length} valid, ${Object.keys(invalidFixtures).length} invalid. Baseline pose ditulis.`);
}

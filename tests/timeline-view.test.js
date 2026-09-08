// Unit Fase 4 (F4-03/F4-04): konversi frame, snapping, zoom/pan dan operasi
// keyframe massal. Semua fungsi murni, jadi yang diuji adalah aturannya —
// perilaku di awal/akhir durasi, tabrakan waktu, dan penghormatan pada lock.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_ZOOM, MIN_ZOOM, TimelineWindow, copyKeys, deleteKeys, describeReplaced, formatTimecode,
  frameOf, indexAtTime, keyTolerance, lastFrame, moveKeys, pasteKeys, rulerTicks, snapTime, timeOfFrame,
} from '../src/timeline-view.js';
import {aspectSize, aspectValue, sampleCamera} from '../src/timeline-engine.js';

const clone = value => JSON.parse(JSON.stringify(value));
const actors = () => ([
  {id: 'a1', name: 'Alex', locked: false, visible: true, keys: [{t: 0, x: 0, z: 0, r: 0}, {t: 2, x: 4, z: 0, r: 0}, {t: 6, x: 8, z: 0, r: 90}]},
  {id: 'a2', name: 'Maya', locked: false, visible: true, keys: [{t: 0, x: 1, z: 1, r: 0}, {t: 3, x: 2, z: 2, r: 0}]},
]);

// --------------------------------------------------------------- frame & snap

test('frame adalah satuan tampilan; waktu tetap disimpan dalam detik', () => {
  assert.equal(frameOf(1, 24), 24);
  assert.equal(frameOf(0.5, 30), 15);
  assert.equal(timeOfFrame(72, 24), 3);
  assert.equal(lastFrame(12, 24), 288);
  // Mengubah fps tidak mengubah waktu; hanya nomor framenya yang berubah.
  assert.equal(frameOf(3, 24), 72);
  assert.equal(frameOf(3, 30), 90);
});

test('toleransi keyframe adalah setengah frame, tidak pernah lebih dari 0,05 detik', () => {
  assert.ok(Math.abs(keyTolerance(24) - 0.5 / 24) < 1e-12);
  assert.equal(keyTolerance(4), 0.05, 'fps rendah tetap memakai grid lama 0,05 detik');
  // Dua frame bertetangga pada 24 fps HARUS dianggap keyframe berbeda.
  const keys = [{t: 10 / 24}, {t: 11 / 24}];
  assert.equal(indexAtTime(keys, 11 / 24, 24), 1);
});

test('snapping menjepit ke durasi dan mengunci ke grid frame; dapat dimatikan', () => {
  assert.equal(snapTime(0.4, {fps: 24, duration: 12}), 10 / 24);
  assert.equal(snapTime(3, {fps: 24, duration: 12}), 3);
  assert.equal(snapTime(-5, {fps: 24, duration: 12}), 0, 'sebelum awal dijepit ke 0');
  assert.equal(snapTime(99, {fps: 24, duration: 12}), 12, 'setelah akhir dijepit ke durasi');
  assert.equal(snapTime(0.44, {fps: 24, duration: 12, snap: false}), 0.44);
});

test('timecode memakai menit:detik:frame', () => {
  assert.equal(formatTimecode(0, 24), '00:00:00');
  assert.equal(formatTimecode(1.5, 24), '00:01:12');
  assert.equal(formatTimecode(61, 25), '01:01:00');
});

// --------------------------------------------------------------- zoom & pan

test('jendela timeline: zoom berjangkar dan tidak pernah keluar dari durasi', () => {
  const win = new TimelineWindow(12);
  assert.equal(win.span, 12);
  win.setZoom(4, 6);
  assert.equal(win.span, 3);
  assert.ok(win.contains(6));
  assert.ok(win.start >= 0 && win.end <= 12 + 1e-9);
  win.panBy(-99);
  assert.equal(win.start, 0);
  win.panBy(99);
  assert.ok(Math.abs(win.end - 12) < 1e-9);
  win.setZoom(MIN_ZOOM);
  assert.equal(win.start, 0);
  assert.equal(win.span, 12);
  win.setZoom(1e6);
  assert.equal(win.zoom, MAX_ZOOM);
});

test('tick ruler berada di dalam jendela dan berjarak sama', () => {
  const win = new TimelineWindow(12);
  const ticks = rulerTicks(win, 24);
  assert.ok(ticks.length >= 4 && ticks.length <= 20);
  for (const tick of ticks) assert.ok(tick.fraction >= -1e-9 && tick.fraction <= 1 + 1e-9);
  const steps = ticks.slice(1).map((t, i) => t.frame - ticks[i].frame);
  assert.equal(new Set(steps).size, 1);
  win.setZoom(16, 6);
  const zoomed = rulerTicks(win, 24);
  assert.ok(zoomed[1].frame - zoomed[0].frame < steps[0], 'zoom memperhalus tick');
});

// --------------------------------------------------------------- geser keyframe

test('geser keyframe: satu blok, snapping ke frame, dijepit di awal dan akhir', () => {
  const objects = actors();
  const result = moveKeys(objects, [{id: 'a1', t: 2}], 1, {fps: 24, duration: 6});
  assert.deepEqual(objects[0].keys.map(k => k.t), [0, 3, 6]);
  assert.deepEqual(result.selection, [{id: 'a1', t: 3}]);

  const blockObjects = actors();
  // Seluruh seleksi bergerak sebagai blok: ujung yang menabrak durasi memangkas delta.
  moveKeys(blockObjects, [{id: 'a1', t: 2}, {id: 'a1', t: 6}], 5, {fps: 24, duration: 6});
  assert.deepEqual(blockObjects[0].keys.map(k => k.t), [0, 2, 6], 'delta dipangkas menjadi 0');

  const startObjects = actors();
  // Delta −5 dipangkas menjadi −2 (ujung kiri seleksi menabrak 0), jadi jarak 4 detik
  // antar keyframe terpilih tetap utuh; keyframe lama pada t=0 tertimpa dan dilaporkan.
  const clamped = moveKeys(startObjects, [{id: 'a1', t: 2}, {id: 'a1', t: 6}], -5, {fps: 24, duration: 6});
  assert.deepEqual(startObjects[0].keys.map(k => k.t), [0, 4], 'bentuk gerakan dipertahankan');
  assert.deepEqual(clamped.selection, [{id: 'a1', t: 0}, {id: 'a1', t: 4}]);
  assert.equal(clamped.replaced.length, 1);
});

test('geser ke waktu yang sudah terisi mengganti keyframe lama dan melaporkannya', () => {
  const objects = actors();
  const result = moveKeys(objects, [{id: 'a1', t: 0}], 2, {fps: 24, duration: 6});
  assert.deepEqual(objects[0].keys.map(k => k.t), [2, 6]);
  assert.equal(result.replaced.length, 1);
  assert.equal(result.replaced[0].frame, 48);
  assert.equal(describeReplaced(result.replaced), 'Alex pada frame 48');
  assert.equal(objects[0].keys[0].x, 0, 'nilai keyframe yang digeser yang bertahan');
});

test('objek terkunci atau tersembunyi tidak pernah digeser diam-diam', () => {
  const objects = actors();
  objects[0].locked = true;
  objects[1].visible = false;
  const before = clone(objects);
  const result = moveKeys(objects, [{id: 'a1', t: 2}, {id: 'a2', t: 3}], 1, {fps: 24, duration: 6});
  assert.deepEqual(objects, before);
  assert.deepEqual(result.moved, []);
  assert.deepEqual(result.skipped.map(s => `${s.name}:${s.reason}`), ['Alex:terkunci', 'Maya:tersembunyi']);
});

test('waktu keyframe tetap unik walau snapping menggabungkan dua seleksi', () => {
  const objects = [{id: 'a1', name: 'Alex', locked: false, visible: true,
    keys: [{t: 0, x: 0, z: 0, r: 0}, {t: 1 / 24, x: 1, z: 0, r: 0}, {t: 5, x: 2, z: 0, r: 0}]}];
  // fps 2 memaksa kedua keyframe pertama mendarat di frame yang sama.
  moveKeys(objects, [{id: 'a1', t: 0}, {id: 'a1', t: 1 / 24}], 1, {fps: 2, duration: 6});
  const times = objects[0].keys.map(k => k.t);
  assert.equal(new Set(times).size, times.length, 'tidak boleh ada waktu ganda');
});

// --------------------------------------------------------------- salin/tempel

test('salin-tempel mempertahankan jarak antar keyframe dan menempel di playhead', () => {
  const objects = actors();
  const clip = copyKeys(objects, [{id: 'a1', t: 0}, {id: 'a1', t: 2}], {fps: 24});
  assert.equal(clip.count, 2);
  assert.deepEqual(clip.items.map(i => i.offset), [0, 2]);
  const target = actors();
  const result = pasteKeys(target, clip, 3, {fps: 24, duration: 6});
  assert.equal(result.applied.length, 2);
  assert.deepEqual(target[0].keys.map(k => k.t), [0, 2, 3, 5, 6]);
});

test('tempel yang bertabrakan mengganti keyframe lama dan menyebutkannya', () => {
  const objects = actors();
  const clip = copyKeys(objects, [{id: 'a1', t: 0}], {fps: 24});
  const result = pasteKeys(objects, clip, 2, {fps: 24, duration: 6});
  assert.equal(result.replaced.length, 1);
  assert.equal(result.replaced[0].frame, 48);
  assert.deepEqual(objects[0].keys.map(k => k.t), [0, 2, 6]);
  assert.equal(objects[0].keys[1].x, 0, 'isi keyframe yang ditempel yang menang');
});

test('keyframe kamera menempel ke kamera shot tujuan, bukan ke ID kamera lama', () => {
  const source = [{id: 'cam-a', name: 'Kamera A', locked: false, visible: true,
    keys: [{t: 0, x: 0, y: 2, z: 6, tx: 0, ty: 1, tz: 0}]}];
  const clip = copyKeys(source, [{id: 'cam-a', t: 0}], {fps: 24, cameraId: 'cam-a'});
  assert.equal(clip.items[0].kind, 'camera');
  const target = [{id: 'cam-b', name: 'Kamera B', locked: false, visible: true,
    keys: [{t: 0, x: 9, y: 9, z: 9, tx: 0, ty: 0, tz: 0}]}];
  const result = pasteKeys(target, clip, 2, {fps: 24, duration: 6, cameraId: 'cam-b'});
  assert.deepEqual(result.applied, [{id: 'cam-b', t: 2}]);
  assert.equal(target[0].keys.length, 2);
});

test('tempel ke objek yang tidak ada di shot tujuan dilewati dengan alasan', () => {
  const clip = copyKeys(actors(), [{id: 'a1', t: 0}], {fps: 24});
  const target = [actors()[1]];
  const result = pasteKeys(target, clip, 1, {fps: 24, duration: 6});
  assert.deepEqual(result.applied, []);
  assert.equal(result.skipped[0].reason, 'tidak ada di shot ini');
});

// --------------------------------------------------------------- hapus

test('hapus keyframe massal menyisakan minimal satu keyframe per track', () => {
  const objects = actors();
  const result = deleteKeys(objects, [{id: 'a1', t: 0}, {id: 'a1', t: 2}, {id: 'a1', t: 6}], {fps: 24});
  assert.equal(objects[0].keys.length, 1);
  assert.equal(objects[0].keys[0].t, 0);
  assert.equal(result.kept.length, 1);
  assert.equal(result.removed[0].count, 2);
});

test('hapus keyframe menghormati lock dan melaporkan yang dilewati', () => {
  const objects = actors();
  objects[1].locked = true;
  const before = clone(objects[1]);
  const result = deleteKeys(objects, [{id: 'a1', t: 2}, {id: 'a2', t: 3}], {fps: 24});
  assert.deepEqual(objects[0].keys.map(k => k.t), [0, 6]);
  assert.deepEqual(objects[1], before);
  assert.deepEqual(result.skipped.map(s => s.reason), ['terkunci']);
});

// --------------------------------------------------------------- kamera/aspect

test('aspect ratio menghasilkan ukuran genap dan tidak melewati batas', () => {
  assert.deepEqual(aspectSize('16:9'), {width: 1280, height: 720});
  assert.deepEqual(aspectSize('9:16'), {width: 720, height: 1280});
  assert.deepEqual(aspectSize('2.39:1'), {width: 1280, height: 536});
  assert.deepEqual(aspectSize('1:1'), {width: 720, height: 720});
  assert.equal(aspectValue('4:3'), 4 / 3);
  assert.equal(aspectValue('tidak dikenal'), 16 / 9);
  for (const ratio of ['16:9', '9:16', '2.39:1', '4:3', '1:1']) {
    const size = aspectSize(ratio);
    assert.equal(size.width % 2, 0);
    assert.equal(size.height % 2, 0);
  }
});

test('focal length dapat di-key: sampling memakai nilai interpolasi', () => {
  const view = {
    duration: 10, actors: [],
    camera: {id: 'cam', name: 'Kamera A', focal: 35, target: '',
      keys: [{t: 0, x: 0, y: 2, z: 6, tx: 0, ty: 1, tz: 0, focal: 24},
        {t: 10, x: 0, y: 2, z: 6, tx: 0, ty: 1, tz: 0, focal: 84}]},
  };
  assert.equal(sampleCamera(view, 0).focal, 24);
  assert.equal(sampleCamera(view, 5).focal, 54);
  assert.equal(sampleCamera(view, 10).focal, 84);
  // Tanpa keyframe focal, nilai lensa kamera yang dipakai (kompatibilitas dokumen lama).
  const plain = {duration: 10, actors: [], camera: {...view.camera, keys: view.camera.keys.map(({focal, ...rest}) => rest)}};
  assert.equal(sampleCamera(plain, 5).focal, 35);
});

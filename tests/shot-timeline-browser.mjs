// Uji Fase 4 (F4-10) di Chrome sungguhan.
//
// Yang dibuktikan di sini adalah janji yang paling mudah dilanggar diam-diam:
//   1. cue mode Edit/Play/Record beserta frame aktif;
//   2. dua alternatif shot benar-benar terisolasi (lensa, keyframe, fps, aspect);
//   3. operasi keyframe massal adalah SATU langkah undo dan menghormati lock;
//   4. rotasi tetap terpisah dari translasi setelah semua perubahan Fase 4;
//   5. shot tanpa kamera tetap dapat diedit;
//   6. langkah kaki tetap deterministik pada frame yang sama;
//   7. pintu masih menghasilkan tiga panel dinding;
//   8. menghapus aktor yang menjadi target kamera shot lain ditolak (kamera terkunci)
//      atau jatuh ke titik pandang manual dengan pemberitahuan.
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';

const browser = await chromium.launch({channel: 'chrome', headless: true});
const page = await browser.newPage({viewport: {width: 1440, height: 1000}, acceptDownloads: true});
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.goto('http://localhost:5174');
await page.waitForSelector('#viewport canvas');

const BR = (fn, arg) => page.evaluate(fn, arg);
const project = () => BR(() => window.blockingRoom.getProject());
const shots = () => BR(() => window.blockingRoom.getShots());
const timeline = () => BR(() => window.blockingRoom.getTimeline());
const cue = () => BR(() => window.blockingRoom.getModeCue());
const toast = () => page.locator('#toast').textContent();
const blur = () => page.locator('#inspector-name').click();
const keyBox = async index => {
  const box = await page.locator('.key').nth(index).boundingBox();
  return {x: box.x + box.width / 2, y: box.y + box.height / 2};
};

// ---------------------------------------------------------------- 1. cue mode
assert.deepEqual(await cue(), {mode: 'edit', text: 'EDIT · f0'}, 'awalnya mode Edit pada frame 0');
await page.locator('#play').click();
await page.waitForTimeout(250);
assert.equal((await cue()).mode, 'play', 'memutar menampilkan cue Play');
await page.locator('#play').click();
assert.equal((await cue()).mode, 'edit');
await page.locator('#rewind').click();
const demoKeys = (await project()).actors[0].keys;
await page.locator('#record').click();
const recordCue = await cue();
assert.equal(recordCue.mode, 'record', 'merekam menampilkan cue Record');
assert.match(recordCue.text, /^REKAM · f\d+$/);
await page.waitForTimeout(300);
await page.locator('#record').click();
assert.equal((await cue()).mode, 'edit');
// Satu rekaman = satu langkah undo; bila tidak ada gerakan yang tercatat, tidak ada
// langkah baru sama sekali (dan tombol undo memang tetap nonaktif).
for (let i = 0; i < 5; i += 1) {
  if (JSON.stringify((await project()).actors[0].keys) === JSON.stringify(demoKeys)) break;
  if (await page.locator('#undo').isDisabled()) break;
  await page.locator('#undo').click();
}
assert.deepEqual((await project()).actors[0].keys, demoKeys, 'rekaman dapat dibatalkan sepenuhnya');

// ------------------------------------------------- 2. frame ruler & playhead presisi
const base = await timeline();
assert.equal(base.fps, 24);
assert.equal(base.lastFrame, 288, '12 detik × 24 fps');
assert.equal(await BR(() => window.blockingRoom.setFrame(37)), 37, 'input frame memindahkan playhead tepat');
assert.equal(await page.locator('#timecode-display').textContent(), '00:01:13');
assert.equal(await BR(() => window.blockingRoom.setFrame(9999)), 288, 'frame di luar durasi dijepit ke akhir');
assert.equal(await BR(() => window.blockingRoom.setFrame(-40)), 0, 'frame negatif dijepit ke awal');
assert.match(await toast(), /dijepit ke rentang shot/);
// Snapping: dimatikan → waktu bebas; dinyalakan → kembali ke grid frame.
await page.locator('#scrub').fill('0.4');
await page.locator('#scrub').dispatchEvent('input');
assert.ok(Math.abs((await timeline()).time - 10 / 24) < 1e-9, 'scrub dikunci ke frame terdekat (0,4 s → frame 10)');
assert.equal(await BR(() => window.blockingRoom.setSnap(false)), false);
await page.locator('#scrub').fill('0.4');
await page.locator('#scrub').dispatchEvent('input');
assert.ok(Math.abs((await timeline()).time - 0.4) < 1e-9, 'snapping mati membiarkan waktu di antara frame');
assert.equal(await BR(() => window.blockingRoom.setSnap(true)), true);
// Zoom/pan hanyalah tampilan: waktu playhead tidak boleh berubah karenanya.
await BR(() => window.blockingRoom.setFrame(144));
const beforeZoom = await timeline();
assert.equal(await BR(() => window.blockingRoom.setZoom(8)), 8);
const zoomed = await timeline();
assert.equal(zoomed.time, beforeZoom.time, 'zoom tidak menggeser playhead');
assert.ok(zoomed.span < beforeZoom.span && zoomed.start > 0, 'jendela mengikuti playhead');
const visibleKeys = await page.locator('.key').count();
await BR(() => window.blockingRoom.setZoom(1));
assert.ok(await page.locator('.key').count() >= visibleKeys, 'zoom keluar menampilkan kembali seluruh keyframe');
await BR(() => window.blockingRoom.setFrame(0));

// ------------------------------------------------------- 3. dua alternatif shot
const shotA = (await shots())[0];
const shotASnapshot = JSON.stringify(shotA);
assert.equal((await shots()).length, 1, 'proyek demo dimulai dengan satu shot');
await page.locator('#add-shot').click();
const afterAdd = await shots();
assert.equal(afterAdd.length, 2);
assert.equal(await BR(() => window.blockingRoom.getActiveShotId()), afterAdd[1].id, 'shot baru menjadi aktif');
assert.notEqual(afterAdd[1].cameraId, afterAdd[0].cameraId, 'kamera milik shot: ID-nya baru');
assert.deepEqual(JSON.parse(shotASnapshot), afterAdd[0], 'menambah shot tidak menyentuh shot 01');
// Shot baru menyimpan staging awal, bukan seluruh gerakan.
for (const track of afterAdd[1].tracks) assert.equal(track.keys.length, 1);

// Ubah lensa, aspect, fps dan keyframe HANYA pada shot B.
await page.locator('[data-tab="camera"]').click();
await page.locator('[data-lens="85"]').click();
await page.locator('#shot-aspect').selectOption('2.39:1');
await page.locator('#shot-fps').selectOption('30');
assert.match(await toast(), /Waktu keyframe tidak digeser/);
await page.locator('[data-tab="actors"]').click();
await page.locator('[data-select="a1"]').click();
await BR(() => window.blockingRoom.setFrame(60));
await page.locator('#add-key').click();
const bothShots = await shots();
assert.deepEqual(JSON.parse(shotASnapshot), bothShots[0], 'lensa/aspect/fps/keyframe shot B tidak mengubah shot A');
assert.equal(bothShots[1].focal, 85);
assert.equal(bothShots[1].aspectRatio, '2.39:1');
assert.equal(bothShots[1].fps, 30);
// Aspect ratio shot dipakai preview DAN buffer ekspor (crop yang sama).
const aspect = await BR(() => window.blockingRoom.getAspect());
assert.equal(aspect.ratio, '2.39:1');
assert.deepEqual(aspect.pov, [1280, 536]);
assert.equal(aspect.safeArea, true, 'safe area overlay aktif secara default');
await page.locator('#toggle-safe').click();
assert.equal((await BR(() => window.blockingRoom.getAspect())).safeArea, false);
await page.locator('#toggle-safe').click();

// fps berubah tidak menggeser waktu keyframe, hanya penomoran framenya.
const fpsShot = (await shots())[1];
const keyTimes = fpsShot.tracks.map(t => t.keys.map(k => k.t));
await page.locator('#shot-fps').selectOption('24');
assert.deepEqual((await shots())[1].tracks.map(t => t.keys.map(k => k.t)), keyTimes,
  'mengubah fps tidak boleh menggeser satu pun keyframe');

// Perbandingan alternatif A/B.
await page.locator(`[data-shot-compare="${bothShots[0].id}"]`).click();
assert.equal(await page.locator('#shot-compare').isVisible(), true);
const compareText = await page.locator('.compare-table').textContent();
assert.match(compareText, /Lensa/);
assert.match(compareText, /85 mm/);
assert.match(compareText, /35 mm/);
assert.ok((await page.locator('.compare-table tr.differs').count()) >= 2, 'perbedaan lensa dan keyframe ditandai');
await page.locator('#compare-swap').click();
assert.equal(await BR(() => window.blockingRoom.getActiveShotId()), bothShots[0].id, 'toggle A/B membuka shot pembanding');
assert.deepEqual(JSON.parse(shotASnapshot), (await shots())[0], 'berpindah shot bukan perubahan kreatif');

// Duplicate shot menyalin track + kamera dengan ID baru.
await page.locator('#shot-duplicate').click();
const dup = await shots();
assert.equal(dup.length, 3);
const copy = dup.find(s => s.name.includes('salinan'));
assert.ok(copy);
assert.notEqual(copy.cameraId, dup[0].cameraId);
assert.deepEqual(copy.tracks.map(t => t.keys), dup[0].tracks.map(t => t.keys), 'gerakan ikut tersalin');
await page.locator('#shot-delete').click();
assert.equal((await shots()).length, 2);
await page.locator('#undo').click();
assert.equal((await shots()).length, 3, 'menghapus shot dapat dibatalkan');
await page.locator('#shot-delete').click();

// ------------------------------------------- 4. keyframe massal = satu langkah undo
await page.locator(`[data-shot-open="${(await shots())[0].id}"]`).click();
await page.locator('[data-select="a1"]').click();
const originalKeys = (await project()).actors[0].keys;
assert.deepEqual(originalKeys.map(k => k.t), [0, 5, 12]);
// F4-05 (schema v3): satu LANE per track — dua per aktor. `.key` pertama dan kedua
// berada pada lane POSISI aktor pertama, jadi drag di bawah ini menggeser posisi
// tanpa menyentuh orientasi. Itulah inti TL-02, dan diasersikan secara eksplisit.
const originalPosition = (await project()).actors[0].position.keys;
const originalRotation = (await project()).actors[0].rotation.keys;
// Klik penanda pertama, lalu Shift-klik penanda kedua: dua keyframe terpilih.
await page.locator('.key').nth(0).click();
await page.locator('.key').nth(1).click({modifiers: ['Shift']});
assert.equal((await timeline()).selection.length, 2, 'shift-klik menambah ke seleksi');
// Drag salah satu penanda menggeser SEMUA yang terpilih sebagai satu blok.
const grab = await keyBox(1);
await page.mouse.move(grab.x, grab.y);
await page.mouse.down();
await page.mouse.move(grab.x + 70, grab.y, {steps: 8});
await page.mouse.up();
const dragged = (await project()).actors[0].position.keys;
const shift = dragged[0].t - originalPosition[0].t;
assert.ok(shift > 0.2, `keyframe harus benar-benar bergeser (shift=${shift})`);
assert.ok(Math.abs((dragged[1].t - originalPosition[1].t) - shift) < 1e-9, 'seluruh seleksi bergeser sama jauh');
assert.deepEqual(dragged[2], originalPosition[2], 'keyframe yang tidak terpilih tidak ikut bergeser');
assert.ok(Math.abs(dragged[0].t * 24 - Math.round(dragged[0].t * 24)) < 1e-9, 'hasil drag jatuh tepat di frame');
assert.deepEqual((await project()).actors[0].rotation.keys, originalRotation,
  'TL-02: menggeser keyframe posisi tidak boleh menyentuh track orientasi');
assert.match(await toast(), /keyframe digeser/);
await page.locator('#undo').click();
assert.deepEqual((await project()).actors[0].keys, originalKeys, 'operasi massal = satu langkah undo');

// Salin/tempel pada playhead, termasuk aturan replace yang terlihat.
await BR(() => window.blockingRoom.selectKeys([{id: 'a1', t: 0}]));
await page.locator('#key-copy').click();
// v3: satu ID objek berarti seluruh track objek itu — posisi dan orientasi.
assert.match(await toast(), /2 keyframe disalin/);
await BR(() => window.blockingRoom.setFrame(48));
await page.locator('#key-paste').click();
assert.equal((await project()).actors[0].keys.length, 4);
await BR(() => window.blockingRoom.setFrame(120)); // 5 detik: sudah ada keyframe di sana
await page.locator('#key-paste').click();
// v3: nama lane memuat properti track ("Alex · Posisi"), bukan hanya nama objek.
assert.match(await toast(), /keyframe lama diganti: Alex · Posisi pada frame 120/);
assert.equal((await project()).actors[0].keys.length, 4, 'tabrakan mengganti, bukan menambah waktu ganda');
await page.locator('#undo').click();
await page.locator('#undo').click();
assert.deepEqual((await project()).actors[0].keys, originalKeys);

// Hapus massal + lock dipatuhi dengan daftar item yang dilewati.
await BR(() => window.blockingRoom.selectKeys([{id: 'a1', t: 5}, {id: 'a1', t: 12}]));
await page.locator('#key-delete').click();
assert.deepEqual((await project()).actors[0].keys.map(k => k.t), [0]);
assert.match(await toast(), /4 keyframe dihapus/); // 2 waktu × 2 track (posisi + orientasi)
await page.locator('#undo').click();
assert.deepEqual((await project()).actors[0].keys, originalKeys);
await page.locator('[data-lock="a2"]').click();
const lockedBefore = (await project()).actors[1].keys;
await BR(() => window.blockingRoom.selectKeys([{id: 'a2', t: 0}]));
await page.locator('#key-delete').click();
assert.match(await toast(), /dilewati: Maya · Posisi \(terkunci\)/);
assert.deepEqual((await project()).actors[1].keys, lockedBefore, 'keyframe objek terkunci tidak tersentuh');
await page.locator('[data-lock="a2"]').click();

// Track wajib menyisakan minimal satu keyframe.
await BR(() => window.blockingRoom.selectKeys([{id: 'a1', t: 0}, {id: 'a1', t: 5}, {id: 'a1', t: 12}]));
await page.locator('#key-delete').click();
assert.equal((await project()).actors[0].keys.length, 1);
assert.match(await toast(), /Satu keyframe dipertahankan/);
await page.locator('#undo').click();
assert.deepEqual((await project()).actors[0].keys, originalKeys);

// ------------------------------------------------------- 5. rotasi tetap terpisah
await BR(() => window.blockingRoom.setFrame(72)); // 3 detik
await page.locator('[data-select="a1"]').click();
await page.locator('[data-turn="15"]').click();
assert.equal((await project()).actors[0].keys.find(k => k.t === 3).r, 15);
await blur();
await page.keyboard.press('ArrowRight');
assert.equal((await project()).actors[0].keys.find(k => k.t === 3).r, 15, 'geser tidak menimpa arah hadap');
await page.keyboard.press('Meta+z');
await page.keyboard.press('Meta+z');
assert.deepEqual((await project()).actors[0].keys, originalKeys);

// ------------------------------------------------------- 6. langkah deterministik
await BR(() => window.blockingRoom.setFrame(10));
const gaitAt10 = await BR(() => window.blockingRoom.getWalk('a1'));
assert.ok(Math.abs(gaitAt10[0]) > 0.01);
assert.equal(gaitAt10[0], -gaitAt10[1]);
await BR(() => window.blockingRoom.setFrame(200));
await BR(() => window.blockingRoom.setFrame(10));
assert.deepEqual(await BR(() => window.blockingRoom.getWalk('a1')), gaitAt10, 'pose langkah deterministik pada frame yang sama');

// ------------------------------------------------------------------- 7. pintu
await page.locator('[data-tab="rooms"]').click();
await page.locator('[data-select="r1"]').click();
await page.locator('[data-lock="r1"]').click();
await page.locator('#add-door').click();
assert.equal((await project()).rooms[0].doors.length, 1);
const panels = await BR(() => window.blockingRoom.getWalls('r1'));
assert.equal(panels.filter(p => p.wall === 'back').length, 3, 'pintu tetap memotong dinding menjadi tiga panel');
await page.locator('#undo').click();
await page.locator('#undo').click();
await page.locator('[data-tab="actors"]').click();

// ------------------------------------------- 7b. snap grid opsional (SC-01, F4-08)
assert.deepEqual(await BR(() => window.blockingRoom.getGridSnap()), {on: false, step: 0.5},
  'snap grid default MATI supaya perilaku geser lama tidak berubah diam-diam');
await page.locator('[data-select="a3"]').click();
await BR(() => window.blockingRoom.setFrame(0));
await blur();
await page.keyboard.press('ArrowRight');
const freeMove = (await project()).actors[2].keys[0].x;
assert.ok(Math.abs(freeMove - 1.2) < 1e-9, 'tanpa grid, panah menggeser 0,2 m');
await page.keyboard.press('Meta+z');
assert.equal(await BR(() => window.blockingRoom.setGridSnap(true)), true);
await blur();
await page.keyboard.press('ArrowRight');
const snapped = (await project()).actors[2].keys[0].x;
assert.ok(snapped > 1, `snap grid tetap harus benar-benar memindahkan objek (${snapped})`);
assert.ok(Math.abs(snapped / 0.5 - Math.round(snapped / 0.5)) < 1e-9, `posisi harus jatuh di grid 0,5 m (${snapped})`);
await page.keyboard.press('Meta+z');
assert.equal(await BR(() => window.blockingRoom.setGridSnap(false)), false);
assert.equal((await project()).actors[2].keys[0].x, 1, 'snap grid dapat dibatalkan seperti gestur lain');

// --------------------------------------- 8. target kamera dihapus (invariant PRD §11)
// Kamera shot 01 mengikuti a1 dan dikunci; menghapus a1 harus DITOLAK dengan penjelasan,
// bukan diam-diam mengubah shot lain.
await page.locator('[data-tab="camera"]').click();
await page.locator('[data-lock="camera"]').click();
await page.locator('[data-tab="actors"]').click();
await page.locator(`[data-shot-open="${(await shots())[1].id}"]`).click();
const beforeRefused = await shots();
await page.locator('[data-select="a1"]').click();
await page.locator('#delete-object').click();
assert.match(await toast(), /Kamera terkunci pada Shot 01/);
assert.deepEqual(await shots(), beforeRefused, 'penghapusan ditolak tanpa mengubah apa pun');
// Setelah kameranya dibuka kuncinya, penghapusan berhasil dan shot lain jatuh ke titik manual.
await page.locator(`[data-shot-open="${beforeRefused[0].id}"]`).click();
await page.locator('[data-tab="camera"]').click();
await page.locator('[data-lock="camera"]').click();
assert.equal((await project()).camera.target, 'a1');
await page.locator(`[data-shot-open="${beforeRefused[1].id}"]`).click();
await page.locator('[data-tab="actors"]').click();
await page.locator('[data-select="a1"]').click();
await page.locator('#delete-object').click();
assert.match(await toast(), /kembali ke titik pandang manual|dihapus/);
const afterDelete = await shots();
for (const shot of afterDelete) {
  assert.notEqual(shot.target, 'a1', 'tidak ada kamera yang masih mengikuti aktor terhapus');
  assert.ok(!shot.tracks.some(t => t.objectId === 'a1'), `track a1 tersisa pada ${shot.name}`);
}
await page.locator('#undo').click();
assert.ok((await shots()).every(s => s.tracks.some(t => t.objectId === 'a1')), 'undo memulihkan track di semua shot');

// ------------------------------------------------------------- 9. shot tanpa kamera
await page.locator('[data-tab="camera"]').click();
await page.locator('#delete-object').click();
assert.equal((await project()).camera, null);
assert.equal(await page.locator('#export').isDisabled(), true, 'ekspor menolak shot tanpa kamera');
assert.equal(await page.locator('#no-camera').isVisible(), true);
const noCameraShots = await shots();
assert.equal(noCameraShots.find(s => s.id === noCameraShots[1].id).cameraId, null);
assert.ok(noCameraShots[0].cameraId, 'shot lain tetap punya kameranya');
// Timeline dan keyframe tetap dapat diedit tanpa kamera.
await page.locator('[data-tab="actors"]').click();
await page.locator('[data-select="a2"]').click();
await BR(() => window.blockingRoom.setFrame(48));
await page.locator('#add-key').click();
assert.ok((await project()).actors.find(a => a.id === 'a2').keys.some(k => Math.abs(k.t - 2) < 1e-9));
await page.locator('#undo').click();
await page.locator('#undo').click();
assert.ok((await project()).camera, 'kamera kembali setelah undo');

// ----------------------------------------- 10. shot aktif pulih setelah reload
await BR(() => window.blockingRoom.setFrame(10));
const poseAt10 = await BR(() => window.blockingRoom.getObjectState('a1'));
const activeBefore = await BR(() => window.blockingRoom.getActiveShotId());
await BR(() => window.blockingRoom.flushSave());
await BR(() => window.blockingRoom.flushSession());
await page.reload();
await page.waitForSelector('#viewport canvas');
assert.equal(await BR(() => window.blockingRoom.getActiveShotId()), activeBefore, 'shot aktif dipulihkan dari session state');
assert.equal((await shots()).length, 2);
await BR(() => window.blockingRoom.setFrame(10));
assert.deepEqual(await BR(() => window.blockingRoom.getObjectState('a1')), poseAt10,
  'pose pada frame yang sama identik setelah reload');

// =========================================================================
// 11. Fase 4b — F4-05 (interpolasi per track), F4-07 (props), F4-08 (dinding)
// =========================================================================
const props = () => BR(() => window.blockingRoom.getProps());
// Bagian 10 memuat ulang halaman dan dapat meninggalkan shot alternatif (yang track
// aktornya hanya satu keyframe) sebagai shot aktif. Bagian ini memerlukan gerakan
// nyata, jadi shot pertama dijadikan aktif lebih dahulu.
await BR(() => window.blockingRoom.switchShot(window.blockingRoom.getShots()[0].id));
await page.locator('[data-tab="actors"]').click();
await page.locator('[data-select="a1"]').click();
assert.ok((await project()).actors[0].position.keys.length >= 2, 'shot pertama punya gerakan');

// F4-07: dekorasi contoh lama kini prop ber-ID, dan pose dunianya sama dengan
// yang digambar renderer sebelum migrasi (pusat ruangan + offset lokal).
const migrated = await props();
assert.ok(migrated.length >= 15, `dekorasi contoh menjadi prop ber-ID (${migrated.length})`);
const sofa = migrated.find(p => p.name === 'Sofa foyer');
assert.ok(sofa, 'prop hasil migrasi punya nama');
const sofaMesh = await BR(id => window.blockingRoom.getObjectState(id), sofa.id);
assert.ok(Math.abs(sofaMesh.position[0] - sofa.x) < 1e-9 && Math.abs(sofaMesh.position[2] - sofa.z) < 1e-9,
  'posisi dunia prop di renderer sama dengan dokumen');
assert.ok(Math.abs(sofaMesh.position[0] - (-5 - 6 * 0.22)) < 1e-9, 'pose visual identik dengan dekorasi v2');

// Props memakai daftar objek, inspector, lock/hide, duplikasi dan undo yang sama.
await page.locator('[data-tab="props"]').click();
assert.equal(await page.locator('#objects .object').count(), migrated.length);
await page.locator(`[data-select="${sofa.id}"]`).click();
await page.locator('[data-prop="x"]').fill('3');
await page.locator('[data-prop="x"]').press('Tab');
assert.equal((await props()).find(p => p.id === sofa.id).x, 3);
await page.locator('#undo').click();
assert.equal((await props()).find(p => p.id === sofa.id).x, sofa.x, 'transform prop dapat dibatalkan');
await page.locator(`[data-lock="${sofa.id}"]`).click();
assert.equal(await page.locator('[data-prop="x"]').isDisabled(), true, 'prop terkunci tidak dapat diedit');
await page.locator(`[data-lock="${sofa.id}"]`).click();
await page.locator(`[data-visible="${sofa.id}"]`).click();
assert.equal((await BR(id => window.blockingRoom.getObjectState(id), sofa.id)).visible, false);
await page.locator('#undo').click();
const duplicated = await BR(id => window.blockingRoom.duplicateProp(id), sofa.id);
assert.equal((await props()).length, migrated.length + 1);
await page.locator('#undo').click();
assert.equal((await props()).length, migrated.length, 'duplikasi prop dapat dibatalkan');

// Prop baru lewat UI daftar objek, lalu dihapus dan dipulihkan.
const newProp = await BR(() => window.blockingRoom.addProp('chair'));
assert.equal((await props()).length, migrated.length + 1);
assert.equal((await props()).find(p => p.id === newProp).shape, 'chair');
await page.locator('#delete-object').click();
assert.equal((await props()).length, migrated.length);
await page.locator('#undo').click();
assert.equal((await props()).length, migrated.length + 1, 'hapus prop dapat dibatalkan');
await page.locator('#undo').click();

// F4-08: dinding modular memberi PERINGATAN tembus, bukan tabrakan fisik.
assert.equal(await BR(() => window.blockingRoom.getPathWarning()), null);
const wallId = await BR(() => window.blockingRoom.addProp('wall'));
await page.locator('[data-prop="x"]').fill('-3');
await page.locator('[data-prop="x"]').press('Tab');
await page.locator('[data-prop="z"]').fill('2');
await page.locator('[data-prop="z"]').press('Tab');
const warning = await BR(() => window.blockingRoom.getPathWarning());
assert.match(warning ?? '', /dinding modular/, `dinding modular harus memicu peringatan (${warning})`);
// Peringatan tetap peringatan: gerakan aktor tidak diubah sama sekali.
const beforeWallDelete = (await project()).actors[0].position.keys;
await page.locator(`[data-select="${wallId}"]`).click();
await page.locator('#delete-object').click();
assert.equal(await BR(() => window.blockingRoom.getPathWarning()), null);
assert.deepEqual((await project()).actors[0].position.keys, beforeWallDelete);
// Empat langkah undo: hapus dinding, ubah z, ubah x, tambah dinding.
for (let i = 0; i < 4; i += 1) await page.locator('#undo').click();
assert.equal((await props()).length, migrated.length, 'scene kembali ke keadaan semula');
assert.equal(await BR(() => window.blockingRoom.getPathWarning()), null);

// F4-05: interpolasi per track tersimpan pada dokumen dan mengubah hasil sampling.
await page.locator('[data-tab="actors"]').click();
await page.locator('[data-select="a1"]').click();
await BR(() => window.blockingRoom.setFrame(30));
const linearPose = await BR(() => window.blockingRoom.getObjectState('a1'));
assert.equal(await BR(() => window.blockingRoom.setInterpolation('a1', 'position', 'hold')), 'hold');
const heldPose = await BR(() => window.blockingRoom.getObjectState('a1'));
assert.notDeepEqual(heldPose.position, linearPose.position, 'hold mengubah posisi hasil sampling');
assert.equal(heldPose.rotation, linearPose.rotation, 'interpolasi posisi tidak menyentuh orientasi');
const activeNow = await BR(() => window.blockingRoom.getActiveShotId());
const heldTrack = (await shots()).find(sh => sh.id === activeNow).tracks
  .find(t => t.objectId === 'a1' && t.property === 'position');
assert.equal(heldTrack.interpolation, 'hold', 'interpolasi tersimpan pada track dokumen');
await BR(() => window.blockingRoom.setInterpolation('a1', 'position', 'linear'));
assert.deepEqual((await BR(() => window.blockingRoom.getObjectState('a1'))).position, linearPose.position);

// Pilihan track saat menambah keyframe: "orientasi saja" tidak boleh membuat
// keyframe posisi baru.
await BR(() => window.blockingRoom.setFrame(60));
const beforeTargeted = (await project()).actors[0];
assert.equal(await BR(() => window.blockingRoom.setKeyTarget('rotation')), 'rotation');
await page.locator('#add-key').click();
const afterTargeted = (await project()).actors[0];
assert.equal(afterTargeted.position.keys.length, beforeTargeted.position.keys.length,
  'menyimpan keyframe orientasi tidak menambah keyframe posisi');
assert.equal(afterTargeted.rotation.keys.length, beforeTargeted.rotation.keys.length + 1);
await page.locator('#undo').click();
await BR(() => window.blockingRoom.setKeyTarget('both'));

await page.screenshot({path: 'artifacts/shot-timeline.png'});
assert.deepEqual(errors, [], `tidak boleh ada error browser: ${errors.join(' | ')}`);
console.log('PASS Fase 4: cue Edit/Play/Record, frame ruler + snapping + zoom/pan + playhead presisi, dua alternatif shot terisolasi (lensa/aspect/fps/keyframe), perbandingan A/B, duplicate shot, keyframe massal satu undo + lock + aturan replace, rotasi terpisah, langkah deterministik, pintu, target kamera dihapus, shot tanpa kamera, shot aktif pulih setelah reload; Fase 4b: props ber-ID (pose visual identik, transform/lock/hide/duplikasi/hapus + undo), dinding modular + peringatan tembus, interpolasi per track dan pilihan track keyframe.');
await browser.close();

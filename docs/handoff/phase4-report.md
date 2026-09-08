# Laporan Fase 4 — 8 September 2026

Fase 4 (shot, timeline dan penataan set). Referensi: [plan.md](../../plan.md) bagian Fase 4,
[PRD](../PRD.md) SH-01/TL-01/TL-02/SC-01/CA-01 dan §8 “Semantik yang harus konsisten”,
[kontrak data](../DATA-MODEL.md).

**Ringkas:** seluruh P0 selesai (F4-01, F4-02, F4-03, F4-04, F4-10) ditambah satu P1 penuh
(F4-06 / CA-01). Tiga P1 sisanya **tidak dicentang** dan tercatat sebagai scope susulan:
F4-05 (TL-02) dan F4-07 (SC-01) belum dikerjakan, F4-08 baru sebagian (snap grid), F4-09
diselesaikan sebagai keputusan D-05 (hide tetap global), bukan sebagai implementasi.
Pekerjaan berhenti karena keputusan scope, **bukan** karena batas konteks.

## Status task

| Task | Prioritas | Status | Bukti |
|---|---|---|---|
| F4-01 shot list + perbandingan alternatif | P0 | **Selesai** | `src/shots.js`, panel “SHOT DALAM SCENE” di `src/main.js`; 13 unit `tests/shots.test.js`; bagian 3 `tests/shot-timeline-browser.mjs` |
| F4-02 ownership kamera/track vs scene | P0 | **Selesai** | `src/document.js#syncShotTracks`, `deleteItem` lintas shot di `src/main.js`; unit isolasi shot A/B + invariant target kamera; bagian 3 & 8 browser test |
| F4-03 frame ruler, snapping, zoom/pan, playhead presisi | P0 | **Selesai** | `src/timeline-view.js`; 18 unit `tests/timeline-view.test.js`; bagian 2 browser test; `docs/DATA-MODEL.md` §5 |
| F4-04 keyframe drag/multi-select/copy-paste/delete | P0 | **Selesai** | `timeline-view.js#moveKeys/copyKeys/pasteKeys/deleteKeys`; unit + bagian 4 browser test. **Marquee select tidak dikerjakan** (opsional pada task) |
| F4-05 track posisi/orientasi terpisah + hold/ease | P1 | **Belum dikerjakan** | Menuntut `schemaVersion: 3`; rencana di `docs/DATA-MODEL.md` §8 |
| F4-06 preset kamera, aspect, safe area, focal keyframe | P1 | **Selesai** | `SceneRenderer.setAspect`, `timeline-engine.js#aspectSize/sampleCamera`, inspector kamera; unit aspect + focal; bagian 3 browser test |
| F4-07 props ber-ID | P1 | **Belum dikerjakan** | Menuntut `schemaVersion: 3`; rencana di `docs/DATA-MODEL.md` §8 |
| F4-08 dinding modular + snap grid | P1 | **Sebagian** | Snap grid 0,5 m opsional selesai (bagian 7b browser test). Segmen dinding modular belum — menunggu entitas prop v3. Tidak dicentang |
| F4-09 visibility editor/render terpisah | P1 | **Tidak dikerjakan — keputusan D-05** | Hide tetap global; alasan dan syarat migrasi bila kelak dipisahkan di `docs/DATA-MODEL.md` §8 |
| F4-10 cue Edit/Play/Record + uji Fase 4 | P0 | **Selesai** | `#mode-cue` di `src/main.js`; `tests/shot-timeline-browser.mjs` terdaftar pada `npm run test:browser` |

## Perubahan file

**Modul baru**

- `src/shots.js` — operasi shot: `addShot`, `duplicateShot`, `moveShot`, `removeShot`,
  `renameShot`, `setShotSettings`, `summarizeShot`, `compareShots`. Tidak ada satu fungsi pun
  di sini yang menyentuh `scene.actors` atau `scene.setObjects`; itulah isi jaminan “alternatif
  shot terisolasi”.
- `src/timeline-view.js` — lapisan tampilan timeline dan operasi keyframe massal, murni
  (tanpa DOM/dokumen): `frameOf`, `timeOfFrame`, `lastFrame`, `snapTime`, `keyTolerance`,
  `indexAtTime`, `formatTimecode`, `TimelineWindow`, `rulerTicks`, `moveKeys`, `copyKeys`,
  `pasteKeys`, `deleteKeys`, `describeReplaced`.

**Modul yang berubah**

- `src/document.js` — `syncShotTracks(scene, {seedFrom})` baru, dipanggil dari
  `writeSceneView`. Tanpa ini, menambah/menghapus aktor pada shot aktif langsung membuat
  dokumen tidak valid begitu ada shot kedua.
- `src/commands.js` — `EditorSession.rebase()`: menyegarkan entri history teratas tanpa
  menambah langkah. Dipakai setelah pindah scene/shot.
- `src/schema.js` — validasi `key.focal` opsional (14–120 mm) pada keyframe kamera.
- `src/timeline-engine.js` — `sampleCamera` memakai `focal` hasil interpolasi bila ada;
  `ASPECT_VALUES`, `aspectValue`, `aspectSize`.
- `src/scene-renderer.js` — `aspectRatio`/`aspect` + `setAspect(ratio)`; letterbox viewport
  “Kamera / final” dan `frameRect()` (picking) memakai aspect shot, bukan 16:9 hardcode.
- `src/export-service.js` — mencatat dimensi canvas saat rekaman dimulai dan melaporkan
  `resized` bila berubah di tengah rekaman. Antarmuka `sampleScene` tidak disentuh.
- `src/metrics.js` — 13 nilai `command_type` baru (shot dan keyframe), tetap daftar tertutup.
- `src/main.js` — panel shot, perbandingan A/B, kepala timeline baru (cue mode, input frame,
  timecode, Snap, zoom, aksi keyframe, fps, aspect ratio), seleksi & drag keyframe, salin/tempel,
  hapus, snap grid, preset lensa, safe area, keyframe focal, invariant hapus aktor lintas shot,
  kait uji baru pada `window.blockingRoom`.
- `src/style.css` — blok “Fase 4” di akhir berkas (tidak mengedit baris minified lama).
- `package.json` — `tests/shot-timeline-browser.mjs` masuk `npm run test:browser`.

**Uji baru**

- `tests/shots.test.js` (14 test), `tests/timeline-view.test.js` (18 test),
  `tests/shot-timeline-browser.mjs` (browser, 10 bagian).

**Dokumentasi**

- `docs/DATA-MODEL.md` — §2 (fps/aspectRatio kini punya arti, `focal` opsional, konsekuensi
  kepemilikan track), §3 invariant baru, §5 (grid frame, toleransi setengah frame, perilaku
  playhead), **§8 baru** (rencana `schemaVersion: 3` + keputusan D-05).
- `plan.md` — centang F4-01/02/03/04/06/10, catatan eksplisit untuk F4-05/07/08/09, sepuluh
  baris log pelaksanaan, D-05 diputuskan, bagian “Langkah berikutnya” diperbarui.

## Keputusan & asumsi

1. **Grid waktu editor berpindah dari 0,1 detik ke grid frame shot.** Ini wajib, bukan pilihan
   gaya: TL-01 menuntut snapping ke frame, sedangkan toleransi lama 0,05 detik lebih besar
   daripada jarak antarframe pada 24 fps (0,0417 detik) sehingga dua frame bertetangga akan
   dianggap keyframe yang sama. Toleransi baru `min(0,05; 0,5/fps)`. `model.js#putKey` (grid
   0,1 detik) **tidak diubah** karena ia bagian dari model v1 dan masih diuji apa adanya;
   editor memakai `main.js#setKey`.
2. **Waktu keyframe tetap disimpan dalam detik.** Frame hanya satuan tampilan dan input
   (`frame = round(t × fps)`). Mengubah fps shot tidak menggeser satu pun keyframe — diuji di
   unit dan browser. Ini sesuai `docs/DATA-MODEL.md` §5 aturan 3 dan menghindari seluruh risiko
   pembulatan yang dilarang aturan 2.
3. **Fase 4 tidak menaikkan `schemaVersion`.** Semua yang dikerjakan memakai field yang sudah
   ada plus satu field keyframe kamera yang opsional dan kompatibel mundur. Sisa Fase 4
   (F4-05/F4-07/F4-08) memerlukan bentuk dokumen baru, dan menaikkan versi adalah pintu satu
   arah bagi dokumen tersimpan (build lama menolaknya). Ketiganya karena itu sebaiknya mendarat
   dalam **satu** migrasi v2 → v3, bukan tiga kenaikan berturut-turut.
4. **`EditorSession.rebase()`.** Sebelum ini, berpindah shot lalu menekan undo akan melompat
   kembali ke shot sebelumnya, karena entri history teratas masih menyimpan `activeShotId`
   lama. Navigasi bukan perubahan kreatif — jadi ia tidak boleh menambah langkah undo **dan**
   tidak boleh ikut dibatalkan. `rebase()` menyegarkan entri teratas di tempat. Perilaku lama
   “undo memulihkan scene/shot aktif” tetap berlaku untuk langkah yang memang kreatif.
5. **Penghapusan target kamera (PRD §11).** Kamera **terkunci** yang mengikuti aktor →
   penghapusan ditolak dengan menyebut nama shotnya. Kamera tidak terkunci → `targetId`
   kembali ke titik pandang manual dan shot yang terpengaruh disebutkan pada toast. Tidak ada
   perubahan diam-diam pada shot lain.
6. **Aturan replace keyframe terlihat.** Dipilih toast, bukan dialog konfirmasi: dialog
   modal di tengah drag akan memutus gestur, dan operasi ini selalu dapat dibatalkan dengan
   satu undo. Pesannya menyebutkan nama objek dan nomor frame yang diganti.
7. **Snap grid default MATI** (0,5 m). Menyalakannya secara default akan mengubah hasil geser
   proyek yang sudah ada tanpa diminta. Langkah panah ikut ukuran grid saat aktif — tanpa itu
   langkah 0,2 m selalu dibulatkan kembali ke titik semula dan objek tidak pernah bergerak.
   Grid tidak berlaku selama merekam karena rekaman adalah gerak menerus.
8. **Aspect ratio satu jalur.** `SceneRenderer.setAspect` mengubah kamera, letterbox viewport,
   `frameRect()` (picking) dan ukuran canvas POV sekaligus; ekspor merekam canvas itu, jadi
   crop preview dan crop rekaman tidak mungkin berbeda.
9. **D-05: hide tetap global.** Lihat `docs/DATA-MODEL.md` §8.
10. **Tanpa dependency baru.**

## Hasil verifikasi

- `npm test`: **144/144 lulus** (sebelumnya 112; +32 dari `shots.test.js` dan `timeline-view.test.js`).
- `npm run build`: lulus.
- `npm run test:browser`: **10/10 suite lulus** — 9 suite lama tanpa perubahan asersi, plus
  `tests/shot-timeline-browser.mjs` yang baru.
- `npm run test:perf` (bukan bagian gate, diukur ulang untuk mencari regresi Fase 4 pada
  Apple M5 / 16 GiB / Chrome 152, headed): drag p95 **11,4 ms**, keyboard p95 21,4 ms, scrub
  p95 17,6 ms, pindah scene p95 41,1 ms (target <100 ms); playback 120 fps, frame-time p95
  9,1 ms, **0 frame drop**, 0 long task; buka proyek p95 359 ms, dokumen 5 MB p95 343 ms
  (target ≤2 detik); dashboard 102 kartu 297 ms dengan **0 transaksi store `documents`**;
  20 siklus rebuild tanpa pertumbuhan geometri (264→262). Semua dalam target F6-02/F6-03.
- Artefak: `artifacts/shot-timeline.png`, `artifacts/perf-baseline.json`,
  `artifacts/a11y-report.json`.

Catatan aksesibilitas: `tests/a11y-browser.mjs` tetap lulus setelah jumlah kontrol editor naik
dari 76 menjadi **95** — 0 tanpa nama, 0 kontras gagal (desktop dan 390 px), tidak ada overflow
horizontal pada 390 px, dan target sentuh baru (aksi shot, alat timeline, fps/rasio, safe area)
diberi ambang 44 px pada blok `@media(max-width:540px)`.

## Yang belum selesai / cara melanjutkan

Semua di bawah ini **tidak dicentang** di `plan.md` dan bukan “selesai diam-diam”.

### 1. F4-05 (TL-02) — track posisi dan orientasi terpisah

- **Perlu `schemaVersion: 3`.** `track.property` menerima `'position'`/`'rotation'`,
  `track.interpolation` menerima `'hold'`/`'ease'`.
- Migrasi memecah tiap track `pose` aktor menjadi `position` (`{t,x,z}`) dan `rotation`
  (`{t,r}`) dengan waktu yang persis sama; track kamera tetap `pose`.
- **Bukti kesetaraan wajib data, bukan screenshot:** bandingkan `baselineOf()` terhadap golden
  `tests/fixtures/baseline/*.json` pada interpolasi `linear`; tolak bila selisih posisi > 1 mm
  atau sudut > 0,05°.
- Titik kode yang ikut berubah: `src/schema.js` (`INTERPOLATIONS`, `validateShot`),
  `src/migrate.js` (`migrateV2ToV3` + rantai `openProjectData`), `src/document.js`
  (`readSceneView`/`writeSceneView`/`syncShotTracks`), `src/model.js#sample`,
  `src/timeline-engine.js`, `src/scene-renderer.js`, dan seluruh UI timeline di `src/main.js`
  (satu lane per track).
- **Bentuk scene view harus diputuskan lebih dahulu.** Editor, `gait()`, `wallCrossings()`,
  golden pose dan banyak asersi uji lama bekerja pada `actor.keys` gabungan `{t,x,z,r}`.
  Memecahnya menjadi dua array mengubah kontrak itu; rencanakan perubahan asersi uji lama
  secara sadar (dan catat), jangan melonggarkannya.

### 2. F4-07 (SC-01) — props sebagai entitas ber-ID

- `setObjects` menerima `type: 'prop'` dengan `shape` (`box`/`table`/`chair`/`decor`).
- Dekorasi contoh sekarang digambar dari **indeks ruangan** di `src/scene-renderer.js#build`
  (blok `if (i === 0)`, `if (i === 1)`, `if (i === 2)`, sekitar baris 240–260). Migrasi v2→v3
  mengubahnya menjadi prop ber-ID, lalu blok indeks itu dihapus.
- `LIMITS.setObjects` perlu naik (30 → sekitar 80) karena prop berbagi array yang sama.
- UI: tab keempat “Props” pada panel kiri, inspector transform/ukuran/warna, duplicate, dan
  jalur command yang sama dengan aktor/ruangan (lock/hide/undo tidak boleh punya jalur khusus).

### 3. F4-08 (SC-01) — segmen dinding modular

- Prop `shape: 'wall'` (`{x, z, r, w, h}`), terpisah dari `room.doors` yang **tidak boleh**
  diubah. Peringatan tembus dinding tetap peringatan (`spatial.js#wallCrossings`), bukan
  collision fisik.
- Snap grid sudah ada dan tinggal dipakai ulang (`gridSnap`, `GRID_STEP`, `onGrid`,
  `nudgeStep` di `src/main.js`).

### 4. Jalur upgrade dokumen tersimpan — bagian yang paling mudah terlewat

`src/bootstrap.js` menyerahkan hasil `repository.getDocument()` langsung ke `DocumentStore`
tanpa melewati `openProjectData`, jadi begitu `SCHEMA_VERSION` naik, dokumen v2 milik pengguna
akan **ditolak validator saat editor dibuka**. Yang harus disesuaikan dalam perubahan yang
sama: `bootstrap()` (dokumen aktif dan `adoptPending`), “Buka versi tersimpan terakhir” di
`src/main.js`, serta duplicate/ekspor paket di `src/dashboard.js`. Dokumen hasil upgrade harus
disimpan ulang supaya migrasi tidak berjalan berulang. Fixture beban
`tests/fixtures/load/*.json` berisi `"schemaVersion": 2` dan harus dibuka lewat
`openProjectData`, bukan langsung `validateDocument`. Daftar lengkap ada di
`docs/DATA-MODEL.md` §8.

### 5. Lain-lain yang sengaja tidak dikerjakan

- **Marquee select keyframe** — disebut opsional pada F4-04; multi-select Shift/Ctrl-klik dan
  seleksi lewat kait uji sudah menutupi kebutuhannya.
- **Drag ruler untuk pan.** Slider `#scrub` yang transparan menutupi ruler dan menjadi cara
  menggeser playhead (sekaligus padanan keyboardnya untuk aksesibilitas). Pan memakai wheel,
  Alt-drag dan tombol tengah; ctrl/⌘+wheel untuk zoom. Bila kelak drag-ruler-untuk-pan
  diinginkan, `#scrub` harus dipindah atau di-`pointer-events` secara kondisional — jangan
  menghapusnya, karena ia satu-satunya kontrol waktu yang dapat dioperasikan pembaca layar.
- **`#scrub` selalu mencakup seluruh durasi shot**, juga saat timeline di-zoom. Jendela zoom
  hanya memotong tampilan ruler dan lane; playhead di luar jendela akan menarik jendela
  mengikutinya (`ensureVisible`).

## Risiko / catatan untuk fase berikutnya

1. **Fase 5 (ekspor) mewarisi aspect ratio per shot.** `ExportService` sekarang merekam canvas
   POV yang ukurannya mengikuti `shot.aspectRatio`; encoder deterministik F5-04 harus memakai
   ukuran yang sama (`timeline-engine.js#aspectSize`) dan membulatkan ke kelipatan 2 — sudah
   dijamin oleh fungsi itu. `result.resized` menandai bila canvas berubah ukuran di tengah
   rekaman; perlakukan itu sebagai kegagalan, bukan sebagai hal yang diabaikan.
2. **Nama berkas ekspor belum memuat proyek_scene_shot** (EX-01, F5-02). Sekarang masih
   `<judul>-previs.<ext>`. Sengaja tidak diubah pada Fase 4 supaya tidak menyentuh jalur ekspor
   sebelum F5-02 merombaknya.
3. **Label resolusi metrik** kini mengikuti tinggi canvas aspect shot; nilai di luar
   480/720/1080 menjadi `unknown` (misalnya 2.39:1 → 536). Bila Fase 5 menambahkan pilihan
   resolusi, perbarui `ENUMS.resolution` di `src/metrics.js` bersamaan.
4. **Gate R2 (F6-09) belum dapat dinyatakan lulus**: TL-02 dan SC-01 belum terpenuhi. Matriks
   bukti R2 harus mencatat keduanya sebagai terbuka, bukan mengisinya dari pekerjaan Fase 4.
5. **Perbandingan A/B masih berupa ringkasan angka**, bukan toggle preview kamera dua shot
   berdampingan. Task hanya menuntut salah satu (“ringkasan perbedaan **atau** toggle cepat
   A/B”), dan tombol “Tukar ke B” menyediakan toggle itu lewat perpindahan shot. Preview
   berdampingan akan menuntut renderer POV kedua — biayanya sekelas render viewport penuh
   (lihat catatan `povFps` di `src/scene-renderer.js`), jadi jangan menambahkannya tanpa
   pengukuran F6-02 ulang.

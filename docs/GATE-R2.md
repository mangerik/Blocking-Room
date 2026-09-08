# Gate R2 — matriks bukti (F6-09)

Tanggal: **8 September 2026**. Basis: commit `c07e0f0` + seluruh perubahan gate R2,
**belum di-commit**. Pendahulu: [`docs/GATE-R1.md`](GATE-R1.md).

Kriteria gate (plan.md F6-09 / PRD §14 poin 4):

1. Gate R1 tetap lulus.
2. Shot terisolasi.
3. Tidak ada mismatch preview/export kritis.
4. Frame-count, codec fallback dan cancellation terbukti.
5. Tidak ada bug kehilangan data, lock bypass, export mismatch atau migrasi kritis yang
   terbuka.

**Kesimpulan: gate R2 LULUS.** Tiga bug ditemukan dan seluruhnya diperbaiki (§4); tidak
ada bug dari empat kelas penghenti rilis yang masih terbuka. Dua belas catatan yang
**tidak** menghalangi gate ada di §5, dan batas kesimpulan yang wajib dibaca bersama hasil
ini ada di §6. Bagian "pilot" dari F5-08 **belum dijalankan** — itu F6-10/F6-11 dan
memerlukan peserta manusia.

---

## 1. Hasil eksekusi

| Perintah | Hasil | Catatan |
|---|---|---|
| `npm test` | **177/177 lulus** | naik dari 176; +1 test unit untuk bug R2-01 |
| `npm run build` | **lulus** (Vite 7.3.6) | `dashboard` 16,5 kB tetap tidak menarik Three.js; `three` 494,5 kB terpisah |
| `npm run preview` | **lulus** | kini dapat diulang: `tests/preview-check.mjs` memuat build produksi dan menolak setiap `pageerror`, error console **dan** respons HTTP ≥400 |
| `npm run test:browser` | **12/12 suite lulus** | daftar di §2; `tests/gate-r2-browser.mjs` baru dan sudah terdaftar |
| `tests/repository-browser.mjs` 3× berturut | **3/3 lulus** | termasuk 100 siklus edit/save/reload tiap jalan |
| `tests/export-browser.mjs` 3× berturut | **3/3 lulus** | `ffprobe` memverifikasi 300 frame / 10,000 s pada tiap jalan |
| `npm run test:perf` 3× berturut | terukur, tanpa regresi di atas target | `docs/PERF-BASELINE.md` §6 kolom **"Setelah v3"**, sebaran §6.1 |

### 1.1 Pengukuran ulang performa pasca schema v3

Risiko #1 `docs/handoff/phase4b-report.md` menuntut pengukuran ulang: schema v3
menggandakan lane timeline dan menaikkan scene demo dari 3 menjadi 18 objek set.
Hasilnya (median 3 jalan, perangkat referensi Apple M5 / 16 GiB / Chrome 152 headed):

| Metrik | Target PRD §9 | Gate R1 (v2) | **Gate R2 (v3)** | |
|---|---|---|---|---|
| p95 drag aktor | <100 ms | 11,6 ms | **12,5 ms** | tercapai |
| p95 nudge keyboard | <100 ms | 21,1 ms | **22,8 ms** | tercapai |
| p95 scrub playhead | <100 ms | 18,4 ms | **19,0 ms** | tercapai |
| p95 pindah scene | <100 ms | 44,4 ms | **45,1 ms** | tercapai |
| fps rata-rata playback 60 s | ≥30 fps | 120,0 | **120,0** | tercapai |
| frame-time p95 playback | ≤33,3 ms | 9,3 ms | **10,0 ms** | tercapai |
| dropped frames playback 60 s | dilaporkan | 1 (0,01%) | **1** (0,01%) | tercapai |
| p95 buka proyek (fixture beban) | ≤2 detik | 333 ms | **324 ms** | tercapai |
| p95 buka dokumen 5 023 714 B / 165 scene | ≤2 detik | 317 ms | **554 ms** | tercapai |
| Transaksi store `documents` saat dashboard 102 kartu | 0 | 0 | **0** | tercapai |
| `geometries` setelah 20 siklus rebuild | tanpa tren naik | 194 → 194 | **264 → 262** | tercapai |

**Tidak ada metrik yang melewati target PRD**, jadi tidak ada bottleneck terukur yang
perlu diperbaiki. Dua angka yang berubah paling jauh sengaja dijelaskan, bukan dibiarkan
sebagai "regresi kecil":

- **buka dokumen 5 MB 317 → 554 ms** — fixture 5 MB berformat schema **v2**, dan sejak
  Fase 4b setiap dokumen tersimpan dilewatkan `openProjectData`. Angka itu karena itu
  memuat `migrateV2ToV3` atas 165 scene + satu penyimpanan ulang hasil upgrade. Biayanya
  satu kali per dokumen pada pemakaian nyata, dan tetap 3,6× lebih cepat daripada target.
  Uraian lengkap: `docs/PERF-BASELINE.md` §6.2.
- **`geometries` 194 → 264, `programs` 7 → 11** — bukan kebocoran. Kriteria lulusnya
  "tidak ada tren naik setelah 20 siklus", dan 264 → 262 memenuhinya persis seperti
  194 → 194. Angka dasarnya naik karena scene demo v3 memang berisi 15 prop ber-ID +
  dinding modular. `docs/PERF-BASELINE.md` §6.3.

Gate R1 baru menjalankan 1 jalan per skenario; gate R2 menjalankan **3 jalan** seperti
yang diminta `docs/PERF-BASELINE.md` §2. Sebaran antar-jalan ≤2,4 ms untuk seluruh metrik
interaksi/playback (§6.1).

---

## 2. Suite browser

| Berkas | Cakupan | Status |
|---|---|---|
| `tests/browser-smoke.mjs` | 3D, edit aktor, keyframe, kamera, playback, simpan/impor JSON, persistensi, ekspor video, 390 px | lulus |
| `tests/editor-regression.mjs` | undo/redo bercabang, lock, hide/POV, picking aman, drag tergabung, rotasi di final view, rekaman | lulus |
| `tests/walk-doors-delete.mjs` | langkah kaki deterministik, pintu, hapus semua objek + undo, peringatan menembus dinding | lulus |
| `tests/migration-browser.mjs` | migrasi v1→v2→v3, kesetaraan pose baseline, impor invalid tidak menimpa, schema lebih baru tidak ditimpa | lulus |
| `tests/repository-browser.mjs` | autosave atomik, ≥10 revisi, session state, dua tab, isolasi proyek, kegagalan simpan, **100 siklus save/reload** | lulus 3/3 |
| `tests/dashboard-browser.mjs` | 13 bagian perjalanan dashboard | lulus |
| `tests/capability-browser.mjs` | context loss, fallback no-WebGL, metrik lokal, feature flag, ekspor v1 | lulus |
| `tests/a11y-browser.mjs` | nama aksesibel, focus, urutan tab, padanan keyboard, kontras, 390 px, target sentuh | lulus |
| `tests/shot-timeline-browser.mjs` | 11 bagian: cue mode, ruler/snapping/zoom/pan, dua alternatif shot, keyframe massal, rotasi terpisah, langkah, pintu, snap grid, target kamera dihapus, shot tanpa kamera, shot aktif pulih, props/dinding/interpolasi | lulus |
| `tests/gate-r1-browser.mjs` | perburuan lock bypass, kehilangan data, migrasi rusak, latensi simpan PR-03 | lulus |
| `tests/export-browser.mjs` | dialog, 300 frame, kesetaraan frame, hidden, snapshot immutable, codec gagal, cancel, batas rentang, batch + burn-in + storyboard + shot list, fallback real-time | lulus 3/3 |
| `tests/gate-r2-browser.mjs` | **baru** — 5 bagian: mismatch preview/ekspor (9:16, 2.39:1, 24 fps, aktor tersembunyi, prop/dinding, burn-in), lock bypass lewat operasi massal keyframe dan lewat props/dinding, isolasi shot A/B melewati undo/redo dan reload, kehilangan data saat reload di tengah ekspor, kegagalan codec lewat dialog | lulus |
| `tests/preview-check.mjs` | **baru**, di luar `test:browser` (butuh server preview) — build produksi tanpa error halaman/console/404 dan versi build terlihat | lulus |

---

## 3. Matriks acceptance criteria R2

Status: **Terpenuhi** / **Terpenuhi sebagian** / **Belum**. Setiap baris menyebut berkas
bukti; klaim tanpa bukti tidak ditulis.

### SH-01 · Shot list — **Terpenuhi**

| Acceptance criteria | Bukti |
|---|---|
| Nama/nomor shot | `src/shots.js` `addShot`/`renameShot`/`nextShotName`; `tests/shots.test.js`; panel "SHOT DALAM SCENE" di `src/main.js` |
| Kamera aktif per shot | `shot.cameraId` + `shot.camera` (`src/schema.js`); `tests/shot-timeline-browser.mjs` bagian 3 dan 9 (shot tanpa kamera) |
| Durasi, aspect ratio, catatan per shot | `setShotSettings`; `tests/shots.test.js`; `tests/gate-r2-browser.mjs` §3 (durasi + aspect shot B tidak menyentuh shot A) |
| Reorder | `moveShot` + `#shot-move-up`/`#shot-move-down` di `src/main.js`; `tests/shots.test.js` (urutan `order` dinormalisasi setelah pindah dan setelah hapus) |
| Duplikasi shot | `duplicateShot` (track + kamera dengan ID kamera baru); `tests/shots.test.js`; `tests/shot-timeline-browser.mjs` bagian 3 |
| **Perubahan satu shot tidak mengubah keyframe shot lain** | `tests/shot-timeline-browser.mjs` bagian 3; **diperkuat gate R2**: `tests/gate-r2-browser.mjs` §3 membuktikan isolasi bertahan melewati 6 undo, 6 redo, reload penuh, dan penghapusan shot B |

### TL-01 · Timeline lanjutan — **Terpenuhi**

| Acceptance criteria | Bukti |
|---|---|
| Keyframe dapat digeser | `timeline-view.js#moveKeys`; drag pointer sungguhan di `tests/shot-timeline-browser.mjs` bagian 4 |
| Multi-select | Shift/Ctrl-klik + kait `selectKeys`; `tests/timeline-view.test.js`, bagian 4 |
| Salin/tempel | `copyKeys`/`pasteKeys` (⌘/Ctrl C-V); unit + bagian 4 |
| Hapus | `deleteKeys` (Delete); unit + bagian 4 |
| Snapping pada frame | `snapTime`, `keyTolerance = min(0,05; 0,5/fps)`; `tests/timeline-view.test.js`; bagian 2 |
| Zoom/pan | `TimelineWindow`, ctrl/⌘+wheel, Alt-drag, tombol; bagian 2 |
| **Lock berlaku** | bagian 4; **diperkuat gate R2**: `tests/gate-r2-browser.mjs` §2 mencoba geser massal, tempel, hapus massal dan drag penanda pada seleksi yang memuat aktor terkunci — keempatnya tidak mengubah satu byte pun, sementara aktor bebas dalam seleksi yang **sama** tetap bergeser (bukti operasinya benar-benar berjalan) |
| Undo satu operasi massal | `runKeyEdit` + `EditorSession`; bagian 4 |
| Aturan replace terlihat | toast "keyframe lama diganti: `<nama>` pada frame N"; `describeReplaced`; bagian 4 |

### TL-02 · Track per properti — **Terpenuhi**

| Acceptance criteria | Bukti |
|---|---|
| Posisi dan orientasi dapat di-key terpisah | `TRACK_PROPERTIES` di `src/schema.js`; dua lane + pemilih track di `src/main.js`; `tests/shot-timeline-browser.mjs` bagian 4 dan 11 |
| Interpolation linear/hold/ease | `timeline-engine.js#sampleTrack`; dropdown per lane; `tests/document.test.js`, bagian 11 |
| Scrub deterministik | `sampleScene`/`sampleActor` dipakai preview **dan** ekspor; `tests/load-fixtures.test.js` (sampling t=0/30/60 deterministik); `tests/gate-r2-browser.mjs` §1 (frame hasil decode = frame preview) |
| **Migrasi key gabungan mempertahankan gerakan lama** | `migrateV2ToV3`; `tests/migrate.test.js` — golden pose Fase 0 tidak berubah dan 201 titik sampel per track identik dalam toleransi **1e-9**; `tests/migration-browser.mjs` |

### SC-01 · Props dan set — **Terpenuhi**

| Acceptance criteria | Bukti |
|---|---|
| Tambah box, kursi, meja | `PROP_SHAPES` + tab "Props"; `tests/document.test.js`, `tests/shot-timeline-browser.mjs` bagian 11 |
| Pintu | `room.doors` **tidak diubah** sejak R0; `tests/walk-doors-delete.mjs`, `tests/shot-timeline-browser.mjs` bagian 7 |
| Dinding modular | `type: 'wall'` + `spatial.js#wallEnds`/`wallCrossings`; `tests/spatial.test.js`, bagian 11 |
| **Transform/lock/hide/duplicate memakai sistem edit yang sama** | bagian 11; **diperkuat gate R2**: `tests/gate-r2-browser.mjs` §2 menguji prop **dan** dinding pada jalur yang sama dengan aktor — inspector mati sepenuhnya, keyboard ditolak, input yang diaktifkan paksa lewat DOM tidak menulis, hapus dan duplikasi dinonaktifkan. Bug R2-02 ditemukan di sini dan diperbaiki |
| Snap grid dapat dimatikan | default **mati**; `#grid-tool`; `tests/shot-timeline-browser.mjs` bagian 7b |

### CA-01 · Kamera sinematik — **Terpenuhi**

| Acceptance criteria | Bukti |
|---|---|
| Preset wide/normal/tele dengan nilai nyata | Wide 18 mm / Normal 35 mm / Tele 85 mm di inspector kamera; `tests/shot-timeline-browser.mjs` bagian 3 |
| 16:9 / 9:16 / 2.39:1 | `ASPECT_VALUES` + `SceneRenderer.setAspect`; bagian 3 |
| Safe area | overlay safe action 5% / title 10% yang dapat dimatikan; bagian 3 |
| Focal keyframe | `key.focal` opsional (14–120 mm), `sampleCamera` memakai nilai interpolasi; `tests/timeline-view.test.js` |
| Target lock dan manual aim | `camera.targetId` vs titik pandang manual; `tests/shot-timeline-browser.mjs` bagian 8 |
| **Preview menunjukkan crop ekspor** | `tests/gate-r2-browser.mjs` §1 — untuk 9:16, 2.39:1 dan 16:9: rasio canvas POV preview cocok dengan `aspectValue` (selisih <0,02) **dan** berkas ekspor hasil decode berukuran persis `exportSize()` untuk rasio itu, dengan frame yang cocok dengan render preview |

### EX-01 · Export dialog — **Terpenuhi**

| Acceptance criteria | Bukti |
|---|---|
| Pilih shot/range | `tests/export-browser.mjs` bagian 1 (mode all/frames/seconds, clamp di atas durasi, penolakan rentang kosong) |
| Resolusi, fps | preset 720p/1080p, fps 24/25/30; bagian 1 |
| **Codec yang benar-benar tersedia** | dua daftar kapabilitas terpisah (`VideoEncoder.isConfigSupported` dan `MediaRecorder.isTypeSupported`); MP4 tampil **nonaktif** berlabel "belum tersedia — butuh muxer"; bagian 1 |
| Progress | `#export-progress-row` terlihat bergerak; bagian 2 |
| Cancel | `ExportQueue.cancelAll()`; `tests/export-browser.mjs` bagian 5 — pembatalan menghentikan loop di tengah, encoder ditutup, buffer muxer dibuang, tidak ada berkas |
| Retry | `tests/gate-r2-browser.mjs` §5 — codec yang tidak ada disuntikkan sebagai opsi lalu ekspor dijalankan lewat **dialog**: pesan bernada `error` yang menjelaskan penyebab, tombol "Coba lagi" muncul, dialog dapat ditutup, **tidak ada berkas** yang terunduh, dan penampung render dilepas |
| Nama file `proyek_scene_shot` | `buildFileName`; bagian 2 (`…_Scene-01_Shot-01.webm`), `tests/export.test.js` |
| **Perubahan edit tidak memengaruhi render yang sudah dimulai** | `tests/export-browser.mjs` bagian 4 — aktor digeser lewat inspector **selama** job berjalan; frame 299 hasil decode cocok dengan referensi snapshot (0,53) dan jelas berbeda dari dokumen yang sudah diedit |

### EX-02 · Ekspor deterministik — **Terpenuhi**

| Acceptance criteria | Bukti |
|---|---|
| 10 detik × 30 fps = 300 frame | `ffprobe -count_frames`: `vp9 1280x720 nb_read_frames=300 duration=10.000000`, **3 jalan berturut**; decode ulang `<video>` di Chrome memberi `duration === 10` |
| Tes first/middle/last pose | `tests/export-browser.mjs` bagian 3: selisih 0,534 / 0,642 / 0,667 pada skala 0–255 (ambang 3). **Diperluas gate R2** ke 9:16, 2.39:1, 24 fps dan burn-in — selisih 0,374–0,587 pada 15 titik uji |
| Hidden objects | bagian 3: referensi "aktor tampil" vs "tersembunyi" berbeda 6,27 (bukti aktor memang tergambar), ekspor tersembunyi cocok dengan referensi tersembunyi 0,70. `tests/gate-r2-browser.mjs` §1 mengulanginya pada 9:16 |
| Fallback real-time diberi label jelas | `src/export/realtime.js`; label "Real-time (tidak frame-akurat)" di dialog, akhiran `_realtime` pada nama berkas, pesan "jumlah frame tidak dijamin"; `tests/export-browser.mjs` bagian 7 |

### EX-03 · Referensi produksi — **Terpenuhi**

| Acceptance criteria | Bukti |
|---|---|
| Burn-in nama shot, timecode, lensa (opsional) | `src/export/burn-in.js`; `tests/export-browser.mjs` bagian 6; `tests/gate-r2-browser.mjs` §1 membuktikan burn-in **tidak** membuat frame ekspor menyimpang dari preview yang juga memakai burn-in |
| PNG storyboard | `ShotFrameSource.toPng` (awal/tengah/akhir); bagian 6 (2 shot → 6 PNG) |
| Shot list | `src/export/shot-list.js` (JSON + CSV); bagian 6 |
| **Overlay editor tidak ikut render tanpa pilihan eksplisit** | `renderPOV(view, renderer, {keepOverlays})` — default menahan jalur gerak, grid dan safe area; checkbox "Sertakan overlay editor"; bagian 6 |

---

## 3b. Gate R1 tetap lulus — ED-01…ED-05 dan PR-01…PR-07

Kriteria 1 gate R2 menuntut gate R1 **tetap** lulus, bukan hanya pernah lulus. Seluruh
suite R1 dijalankan ulang di atas kode gate R2 dan lulus **tanpa satu asersi pun
dilonggarkan**. Ringkasan verifikasi ulang per requirement:

| Req | Acceptance criteria (PRD §8) | Bukti yang dijalankan ulang pada gate R2 | Status |
|---|---|---|---|
| ED-01 | Undo/redo, tombol + ⌘/Ctrl Z / Shift Z, cabang redo dibuang, 100 langkah, satu drag/rekaman = satu langkah, nama/objek/keyframe/lock/hide/durasi/impor dapat dibatalkan | `tests/editor-regression.mjs` (undo/redo bercabang, drag tergabung, rekaman tergabung, impor dapat di-undo/redo); `tests/shot-timeline-browser.mjs` bagian 4 (operasi massal keyframe = satu langkah); `tests/gate-r2-browser.mjs` §3 (6 undo + 6 redo berturut memulihkan shot B apa adanya) | Terpenuhi |
| ED-02 | Ruang default terkunci; semua properti, delete, keyframe, pointer/keyboard tidak mengubah objek terkunci; playback tetap jalan; buka kunci dari daftar | `tests/editor-regression.mjs`; `tests/gate-r1-browser.mjs` bagian 1–2 (keyboard, inspector, DOM paksa, hapus, ruangan, objek tersembunyi, isolasi lintas scene); **diperkuat gate R2**: `tests/gate-r2-browser.mjs` §2 menambah jalur baru R2 — operasi massal keyframe (geser/tempel/hapus), drag penanda timeline, dan objek set baru (prop + dinding modular). Bug **R2-02** ditemukan di sini dan diperbaiki | Terpenuhi |
| ED-03 | Hide menghilangkan geometri, label, jalur, picking dan **output video**; show memulihkan; hide kamera hanya menyembunyikan gizmo; status survive JSON/reload | `tests/editor-regression.mjs` (POV berubah saat aktor disembunyikan, status bertahan lewat simpan/impor/reload); `tests/export-browser.mjs` bagian 3 dan `tests/gate-r2-browser.mjs` §1 (aktor tersembunyi memang tidak ikut terekam, dibuktikan dengan dua referensi yang berbeda 6,27) | Terpenuhi |
| ED-04 | Input sudut, drag R, Q/E, hadap kamera; perpindahan tidak menimpa rotasi; perubahan menghasilkan keyframe; arah wajah terbaca di final view; interpolasi jalur terpendek | `tests/editor-regression.mjs` (rotasi di final view, arah independen dari translasi); `tests/shot-timeline-browser.mjs` bagian 5 (rotasi tetap terpisah pada track v3). Putaran >360° tetap di luar cakupan (D-06, §5 C-12) | Terpenuhi |
| ED-05 | Drag di ruang kosong tidak menggeser objek terpilih; ruangan harus dipilih eksplisit dan dibuka kuncinya; objek tersembunyi dan gizmo arah bukan target transform | `tests/editor-regression.mjs` (drag meleset tidak mengubah apa pun); `tests/walk-doors-delete.mjs`; prop dan dinding modular mengikuti aturan yang sama sejak Fase 4b (bug C-03 laporan Fase 4b) dan tetap lulus di sini | Terpenuhi |
| PR-01…PR-07 | Dashboard, isolasi proyek, autosave, recovery & trash, banyak scene, migrasi & paket, banyak tab | Matriks lengkap per acceptance criterion ada di `docs/GATE-R1.md` §2 dan **tidak diubah**. Bukti yang dijalankan ulang: `tests/dashboard-browser.mjs` (13 bagian), `tests/repository-browser.mjs` **3×** termasuk 100 siklus edit/save/reload, `tests/migration-browser.mjs` (kini v1→v2→v3), `tests/gate-r1-browser.mjs` (termasuk PR-03 terukur: p95 **260 ms** ≤ 1 detik). PR-05 "scene aktif dipulihkan setelah reload" **diperkuat** oleh perbaikan bug R2-01 | Terpenuhi |

Satu perbedaan yang wajib disebut: `tests/migration-browser.mjs` kini menguji rantai
**v1 → v2 → v3**, bukan v1 → v2 seperti pada gate R1. Perubahan itu terjadi pada Fase 4b
dan sudah tercatat di `plan.md`; tidak ada asersi yang dihapus.

---

## 4. Bug yang ditemukan dan diperbaiki pada gate ini

### R2-01 · Session state basi setelah reload cepat (kelas: kebenaran state / PR-05)

**Ditemukan oleh** kegagalan **acak** `tests/editor-regression.mjs` saat suite dijalankan
berurutan: setelah `page.reload()`, editor kadang membuka tab "Kamera" padahal seleksi
terakhir adalah karakter.

`SessionTracker.record()` men-throttle **seluruh** field pada 1 detik, sementara transaksi
IndexedDB yang dimulai pada `pagehide` tidak dijamin commit (temuan Fase 2 keputusan 5).
Akibatnya scene, shot dan seleksi yang berubah <1 detik sebelum reload **tidak pernah
tertulis**, dan editor memulihkan keadaan lama. Ini menyentuh acceptance criteria PR-05
"scene aktif dipulihkan setelah reload" secara langsung: pindah scene lalu reload cepat
mengembalikan pengguna ke scene sebelumnya.

**Perbaikan** (`src/session-state.js`): perpindahan **navigasi** (`sceneId`, `shotId`,
`selectedId`) menembus throttle dan ditulis seketika; playhead dan pose observer — dua
field berfrekuensi tinggi yang menjadi alasan throttle itu ada — tetap digabung. `write()`
juga membatalkan timer yang menggantung supaya state basi tidak menyusul setelahnya.

**Uji regresi:** unit "perpindahan scene/shot/seleksi menembus throttle session state"
(`tests/repository.test.js`) — memakai jam palsu, membuktikan playhead tetap ter-throttle
dan ketiga field navigasi tidak. `tests/dashboard-browser.mjs` bagian 2 dan
`tests/gate-r2-browser.mjs` §3 memverifikasi perilaku ujungnya di browser.

### R2-02 · Objek set terkunci masih dapat diduplikasi (kelas: lock)

**Ditemukan oleh** `tests/gate-r2-browser.mjs` §2: inspector prop terkunci menampilkan
"Objek terkunci. Buka gembok di daftar untuk mengedit." sementara `#duplicate-object`
tetap aktif.

Salinan lahir **tidak terkunci** dan hanya bergeser 0,5 m dari sumbernya, sehingga di
viewport ia terbaca seperti objek terkunci yang berpindah — persis kebingungan yang
hendak dicegah oleh lock (PRD ED-02). Hapus sudah dinonaktifkan saat terkunci; duplikasi
terlewat.

**Perbaikan** (`src/main.js`): tombol dinonaktifkan saat `o.locked`, **dan**
`duplicateSetPiece()` menolak sumber terkunci dengan pesan. Penegakan ada di lapisan
command, jadi memaksa lewat DOM atau lewat kait uji tetap ditolak.

**Uji regresi:** `tests/gate-r2-browser.mjs` §2 — untuk prop dan dinding: tombol
dinonaktifkan, jumlah objek set tidak bertambah setelah `duplicateProp()` dipanggil
langsung, dan sumbernya tidak berubah.

### R2-03 · Build produksi mengeluarkan 404 (kelas: kebersihan rilis)

**Ditemukan oleh** `tests/preview-check.mjs` yang baru: `npm run preview` menghasilkan
`Failed to load resource: 404` pada setiap pemuatan halaman. Penyebabnya `index.html`
tidak punya `<link rel="icon">` sehingga browser meminta `/favicon.ico` yang tidak ada.

Bukan cacat fungsi, tetapi verifikasi `npm run preview` pada gate R1 dinyatakan "tanpa
error halaman" — pernyataan itu benar hanya karena yang diperiksa `pageerror`, bukan
console. Selama pilot, console yang sudah berisi error membuat error lain lebih mudah
terlewat.

**Perbaikan:** favicon SVG inline (data URI, tanpa berkas tambahan dan tanpa permintaan
jaringan) di `index.html`.

**Uji regresi:** `tests/preview-check.mjs` menolak setiap respons HTTP ≥400 dan setiap
pesan console bertipe `error` pada build produksi.

### Perbaikan risiko murah yang ikut dikerjakan (bukan bug)

| # | Risiko tercatat | Sumber | Tindakan |
|---|---|---|---|
| P-01 | "Belum ada versi build yang terlihat di UI" | `docs/GATE-R1.md` C-05, `docs/ROLLOUT.md` §8 | `vite.config.js` menyuntikkan versi `package.json` + hash commit pendek (+`+lokal` bila working tree kotor) lewat `define`; `src/build-info.js` membacanya dengan fallback aman; ditampilkan di **footer dashboard** dan di panel "Panduan singkat" editor sebagai `v1.0.0 · c07e0f0`. Diuji `tests/preview-check.mjs` |
| P-02 | "Batch shot memicu beberapa unduhan berturut-turut; Chrome dapat meminta izin" | `docs/handoff/phase5-report.md` §Risiko | Unduhan **diserialkan** dengan jeda 300 ms (tidak pernah dua unduhan dalam satu tick); ringkasan dialog menyebut jumlah berkas yang akan diunduh sebelum ekspor dimulai; setiap berkas yang dihasilkan tetap tersedia sebagai tombol **"Unduh ulang"** di dialog, dengan batas retensi 24 berkas / 250 MB. Berkas yang diblokir browser karena itu tidak hilang bersama job-nya |
| P-03 | "Muxer belum menulis SeekHead/Cues" | `docs/handoff/phase5-report.md` | **Cues sudah ada** sejak F5-04 (`src/export/webm-muxer.js`, satu CuePoint per cluster) dan terbukti cukup: `ffprobe` membaca durasi tepat dan seek `<video>` mendarat dalam 0,2 s. SeekHead tetap belum ada — dicatat sebagai C-04, bukan dikerjakan (lihat §5) |
| P-04 | "`npm run test:perf` belum diukur ulang pasca v3" | `docs/handoff/phase4b-report.md` risiko 1 | Diukur ulang 3 jalan; hasil di `docs/PERF-BASELINE.md` §6 kolom "Setelah v3" (§1.1 di atas) |
| P-05 | "`npm run preview` hanya diverifikasi manual" | `docs/GATE-R1.md` §1 | `tests/preview-check.mjs` menjadikannya dapat diulang; menemukan R2-03 pada jalan pertama |

---

## 5. Catatan yang TIDAK menghalangi gate

| # | Catatan | Mengapa tidak menghalangi |
|---|---|---|
| C-01 | 17 penanda keyframe di bawah target sentuh 44 px pada 390 px (naik dari 10 pada gate R1); penanda orientasi 7×7 px, penanda posisi/pose 10×10 px | Kenaikan seluruhnya karena schema v3 memberi setiap aktor dua lane. Setiap penanda tetap tombol dengan nama aksesibel dan dapat dicapai Tab; menambah/menghapus keyframe tersedia sebagai tombol besar di inspector. Membuat penanda 44 px akan membuatnya saling menumpuk pada 390 px. Sama dengan `docs/A11Y-AUDIT.md` T-01 / gate R1 C-01, belum ada perbaikan yang tidak merusak fungsi |
| C-02 | **Edge belum diuji** meskipun PRD §9 menyebutnya | Edge adalah Chromium dengan kemampuan identik dengan Chrome yang diuji penuh; seluruh keputusan fitur lewat capability detection, bukan user agent. Tetap **wajib diuji sebelum pilot** — `docs/BROWSER-SUPPORT.md` §5 |
| C-03 | Performa belum diukur pada perangkat kelas PRD (8 GB, GPU terintegrasi) | Margin 3,6–8× terhadap target, tetapi margin bukan pengukuran. Wajib sebelum pilot — `docs/PERF-BASELINE.md` §7 |
| C-04 | Muxer WebM belum menulis SeekHead | Cues sudah cukup untuk seek akurat (dibuktikan `ffprobe` dan decode `<video>`). SeekHead mempercepat **pembukaan** berkas besar di sebagian pemutar; menulisnya menuntut penghitungan offset dua-lintasan pada berkas yang sudah terbukti benar — biaya/risiko tidak sepadan sebelum ada keluhan nyata |
| C-05 | Batch besar masih menghasilkan banyak berkas terpisah | Sudah diserialkan + dapat diunduh ulang (P-02), jadi tidak ada berkas yang hilang diam-diam. Menggabungkan per shot menjadi satu berkas menuntut penulis ZIP sendiri (tanpa dependency baru) — format biner baru tepat sebelum gate adalah risiko yang tidak perlu. Tindak lanjut §7 |
| C-06 | MP4 belum tersedia | Menunggu keputusan **D-04** (`docs/DECISIONS-NEEDED.md`). Ditampilkan nonaktif dengan alasannya, bukan dijanjikan |
| C-07 | Rename dari dashboard tidak memeriksa kunci writer | Warisan Fase 3 / gate R1 C-04. Akibat terburuk: judul lama ditulis kembali oleh tab yang memegang kunci — tidak ada kehilangan isi scene, dan kartu sudah menandai "sedang dibuka di tab lain" |
| C-08 | Revisi berlabel `export` ikut menghitung batas 20 revisi per proyek | Batas minimum 10 revisi tetap dijaga `prune`; ekspor yang sangat sering hanya memangkas revisi yang paling tua |
| C-09 | Buffer chunk ekspor masih di memori; shot sangat panjang pada 1080p dibatasi RAM | Perkiraan batas di `docs/SPIKE-ENCODER.md` §8; jalur `showSaveFilePicker` + `FileSystemWritableFileStream` adalah perbaikan susulan, bukan syarat R2 |
| C-10 | Marquee select keyframe belum ada | Disebut **opsional** pada F4-04; multi-select Shift/Ctrl-klik menutupi kebutuhannya dan diuji |
| C-11 | Prop dan dinding modular tidak dapat di-key | Di luar SC-01 (yang menuntut transform/lock/hide/duplicate, bukan animasi). Syarat teknis bila kelak diperlukan dicatat di `docs/handoff/phase4b-report.md` |
| C-12 | Putaran >360° tetap tidak didukung (D-06) | Keputusan tertulis, bukan cacat: rotasi selalu jalur terpendek. Prasyaratnya (track rotasi terpisah) sudah ada; menaikkannya mengubah arti setiap keyframe rotasi yang sudah tersimpan |

---

## 6. Batas kesimpulan gate ini

Yang **tidak** dibuktikan oleh gate ini, dan karena itu tidak boleh diklaim:

1. **Perilaku dengan pengguna nyata.** Seluruh target PRD §11 (keberhasilan tugas, waktu
   ke video pertama, kembali mengedit, export success rate) memerlukan F6-10…F6-12.
   Protokolnya siap di `docs/PILOT-PROTOCOL.md`, **belum dijalankan**. Bagian "pilot" dari
   F5-08 karena itu tetap terbuka.
2. **Performa pada perangkat kelas PRD.** Seluruh angka §1.1 dari Apple M5 / 16 GiB dengan
   layar 120 Hz.
3. **Browser selain Chrome.** Edge, Safari dan Firefox belum diuji; `docs/BROWSER-SUPPORT.md`
   memisahkan "Diuji" dari "Diperkirakan".
4. **Format ekspor selain VP9/WebM.** Kesetaraan frame, hitungan frame dan seek dibuktikan
   untuk VP9 di dalam WebM. H.264-di-WebM dan AV1 hanya diuji sebagai *kapabilitas yang
   ditawarkan*, bukan sebagai berkas yang diverifikasi ulang. MP4 tidak ada.
5. **Aksesibilitas dengan pembaca layar dan pengguna sungguhan.** Yang dibuktikan adalah
   nama aksesibel ada, fokus terlihat, kontras cukup, dan seluruh aksi punya padanan
   keyboard — itu bukan kepatuhan WCAG 2.2 AA.
6. **Kuota penyimpanan penuh pada perangkat nyata.** Jalur `StorageQuotaError` diuji lewat
   kegagalan buatan.
7. **Ekspor shot sangat panjang / 1080p berkepanjangan.** Yang diuji 10 detik pada 720p
   dan batch 2 shot. Batas RAM (C-09) belum ditabrak dalam uji.
8. **Beban keyframe ekstrem pada timeline v3.** Fixture memakai ≤27 keyframe per aktor;
   `LIMITS.keys` mengizinkan 2 400.

---

## 7. Keputusan

**Gate R2 dinyatakan LULUS:**

- kriteria 1 (gate R1 tetap lulus) — `tests/gate-r1-browser.mjs`, `tests/repository-browser.mjs`
  (100 siklus, 3× berturut) dan seluruh suite R1 lulus tanpa satu asersi pun dilonggarkan;
  matriks PR-01…PR-07 dan ED-01…ED-05 di `docs/GATE-R1.md` §2 tetap berlaku dan diverifikasi
  ulang oleh suite yang sama;
- kriteria 2 (shot terisolasi) — **terpenuhi**, dan lebih kuat daripada Fase 4: isolasi
  bertahan melewati undo/redo penuh, reload, dan penghapusan shot (`tests/gate-r2-browser.mjs` §3);
- kriteria 3 (tidak ada mismatch preview/export kritis) — **terpenuhi**: 15 titik uji pada
  5 kombinasi aspect/fps/burn-in/hidden, seluruhnya <0,6 pada skala 0–255 (ambang 3), dengan
  pengaman bahwa scene memang bergerak antar-frame;
- kriteria 4 (frame-count, codec fallback, cancellation) — **terpenuhi**: `ffprobe`
  300 frame / 10,000000 s pada 3 jalan; fallback MediaRecorder berlabel; pembatalan tidak
  menghasilkan berkas;
- kriteria 5 (tidak ada bug penghenti rilis terbuka) — **terpenuhi**: tiga bug ditemukan,
  ketiganya diperbaiki dengan uji regresi (§4).

Yang tetap **belum** dan tidak boleh dicentang: F6-10, F6-11, F6-12, seluruh Fase 7 dan
Fase 8. Alasan dan apa yang dibutuhkan untuk melanjutkannya ada di
[`docs/DECISIONS-NEEDED.md`](DECISIONS-NEEDED.md).

**Wajib diselesaikan sebelum pilot dimulai** (tidak menghalangi gate ini):

1. Uji Edge — `docs/BROWSER-SUPPORT.md` §5 (C-02).
2. Ukur ulang `npm run test:perf` pada perangkat kelas PRD 8 GB / GPU terintegrasi
   (`PERF_LABEL=<perangkat> npm run test:perf`) dan tambahkan barisnya di
   `docs/PERF-BASELINE.md` §6 (C-03).
3. Keputusan **D-04** (MP4 wajib atau tidak) supaya peserta pilot tidak menemukan opsi
   nonaktif tanpa jawaban.

### Tindak lanjut yang tidak murah (dicatat, tidak dikerjakan)

| Tindak lanjut | Perkiraan | Alasan ditunda |
|---|---|---|
| Bundel batch menjadi satu berkas per shot (penulis ZIP store-only sendiri) | 1–2 hari + uji format | Format biner baru tepat sebelum gate. Sudah dimitigasi oleh P-02 |
| SeekHead pada muxer WebM | 0,5–1 hari | Cues sudah cukup; menuntut penulisan dua-lintasan pada berkas yang terbukti benar (C-04) |
| Streaming ekspor ke disk (`showSaveFilePicker`) | 1–2 hari | Menghapus batas RAM (C-09); belum ada keluhan karena shot previs pendek |
| Encode + mux di Web Worker | 0,5–1 hari | Encode hanya ±2,9 ms/frame dan UI sudah responsif berkat `createYielder`; batas modul sudah dijaga bebas DOM sehingga pemindahan tinggal memindahkan tiga berkas |
| Marquee select keyframe (C-10) | 0,5 hari | Opsional pada F4-04 |
| Target sentuh penanda keyframe (C-01) | perlu desain ulang lane timeline | Tidak dapat diselesaikan dengan memperbesar penanda tanpa membuatnya menumpuk |
| Rename dashboard memeriksa kunci writer (C-07) | 0,5 hari | `projectWriterStatus()` sudah ada; tidak ada kehilangan isi scene |

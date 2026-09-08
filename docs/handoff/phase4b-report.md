# Laporan Fase 4b — 8 September 2026

Menutup tiga task P1 Fase 4 yang ditunda (F4-05/TL-02, F4-07 dan F4-08/SC-01) dalam **satu**
migrasi `schemaVersion: 2 → 3`. Referensi: [plan.md](../../plan.md) Fase 4,
[PRD](../PRD.md) TL-02/SC-01 dan §8, [kontrak data](../DATA-MODEL.md),
[laporan Fase 4](phase4-report.md) §"Yang belum selesai".

**Ringkas:** ketiganya selesai dan dicentang dengan bukti uji. Satu migrasi copy-first
(`migrateV2ToV3`), seluruh titik baca dokumen tersimpan dilewatkan `openProjectData`,
kesetaraan gerak dibuktikan terhadap golden Fase 0 pada toleransi 1e-9. `npm test`
**156/156**, `npm run build` lulus, `npm run test:browser` **10/10 suite**. Pekerjaan
berhenti karena selesai, **bukan** karena batas konteks.

## Status task

| Task | Status | Bukti |
|---|---|---|
| Migrasi v2 → v3 copy-first + `SchemaTooNewError` >3 | **Selesai** | `src/migrate.js#migrateV2ToV3`, `openProjectData` merantai v1→v2→v3; `tests/migrate.test.js` (4 test baru), `tests/migration-browser.mjs` |
| Semua titik baca dokumen tersimpan lewat migrator | **Selesai** | `bootstrap.js#readStored`, `main.js` (`#open-last-saved`, `#take-over`), `dashboard.js` (`duplicate`, `exportPackage`), `package.js#readPackage`, `no-webgl.js`; **test bootstrap IndexedDB** di `tests/repository.test.js` |
| F4-05 (TL-02) track posisi/orientasi + linear/hold/ease | **Selesai** | `schema.js`, `timeline-engine.js#sampleTrack/sampleActor/combineTracks`, `document.js`, UI dua lane + dropdown + pemilih track di `main.js`; unit + `tests/shot-timeline-browser.mjs` bagian 4 & 11 |
| F4-07 (SC-01) props ber-ID | **Selesai** | `type: 'prop'` di `schema.js`, `migrate.js#legacyDecorProps`, `scene-renderer.js#buildProps`, tab “Props” di `main.js`; unit + browser bagian 11 |
| F4-08 (SC-01) dinding modular | **Selesai** | `type: 'wall'`, `spatial.js#wallEnds` + `wallCrossings(actor, rooms, walls)`, `scene-renderer.js#buildWalls`; `tests/spatial.test.js` + browser bagian 11 |
| `exportAsV1` tetap menghasilkan v1 setara | **Selesai** | `migrate.js#exportAsV1` menggabungkan track lewat `combineTracks`; `tests/rollout.test.js` (roundtrip `deepEqual` + test baru untuk waktu key yang berbeda) |
| `exportAsV2` untuk rollback ke build R1 | **Selesai** (syarat `docs/ROLLOUT.md` §6) | `migrate.js#exportAsV2` + tombol “Unduh JSON v2 (build R1)”; `tests/rollout.test.js` (v3 → v2 → v3 setara, daftar `dropped`) |
| Golden pose Fase 0 tetap dibandingkan | **Selesai** | `tests/migrate.test.js` “sampling awal/tengah/akhir setara sebelum dan sesudah migrasi” tidak diubah dan tetap lulus |
| F4-09 | **Tetap tidak dicentang** | D-05 (hide global) tidak diubah |

## Perubahan file

**Schema dan migrasi**

- `src/schema.js` — `SCHEMA_VERSION = 3`. `INTERPOLATIONS` = linear/hold/ease,
  `TRACK_PROPERTIES` = pose/position/rotation, `PROP_SHAPES`, `SET_OBJECT_TYPES`.
  Validator track kini per pasangan (objek, properti): aktor wajib punya `position` **dan**
  `rotation`, kamera wajib `pose`, dan properti yang salah untuk jenis objeknya ditolak.
  `validateProp` / `validateWall` / `validateSetObject` baru. `LIMITS.setObjects` 30 → 80,
  plus `propOrigin`, `propSpan`, `elevation`, `angle`, `wallLength/Height/Thickness`.
  `normalizeDocument` mengisi `type: 'room'` untuk entri `setObjects` v2 yang tidak punya tipe.
- `src/migrate.js` — `V2_SCHEMA_VERSION`, `migrateV2ToV3`, `legacyDecorProps`, `exportAsV2`.
  `migrateV1ToV2` sengaja **tetap** menghasilkan v2 supaya rantai dapat diuji per langkah.
  `openProjectData` merantai v1 → v2 → v3 dan `migrated` kini berarti "versi sumber < 3".
  `exportAsV1` menggabungkan track kembali dan menyebut prop/dinding/interpolasi non-linear
  pada daftar `dropped`.

**Model gerak**

- `src/timeline-engine.js` — `sampleTrack(keys, t, interpolation)` (satu-satunya sampler
  interpolasi), `sampleActor`, `combineTracks`, `refreshCombined`. `sampleScene` dan
  `sampleCamera` memakainya; kamera kini menghormati `interpolation` track pose-nya.
- `src/document.js` — scene view v3: aktor membawa `position`/`rotation` + cache `keys`;
  `props` dan `walls` sebagai array terpisah dari `rooms`. `writeSceneView` menulis dua track
  per aktor dan `setObjects` dengan urutan ruangan → prop → dinding. `syncShotTracks`
  menyelaraskan dua track per aktor. `TRACK_SEED` / `emptyTrack` diekspor.
- `src/shots.js` — `addShot` membuat dua track per aktor; `seedKey` menerima properti.
- `src/spatial.js` — `wallEnds` baru; `wallCrossings(actor, rooms, walls = [])` menambahkan
  perpotongan ruas garis terhadap segmen dinding modular. Tanpa argumen `walls`, hasilnya
  identik dengan R1.

**Jalur baca dokumen tersimpan**

- `src/bootstrap.js` — `readStored()` baru; dokumen aktif dan proyek terbaru dibuka lewat
  `openProjectData`, dan hasil upgrade **disimpan ulang sekali** (`__upgraded`).
- `src/main.js` — `#open-last-saved` dan “Ambil alih” melewati migrator; tombol baru
  “Unduh JSON v2 (build R1)” di panel riwayat versi.
- `src/dashboard.js` — `duplicate()` dan `exportPackage()` melewati migrator.
- `src/package.js` — `readPackage` memakai `openProjectData`, bukan `validateDocument`.
- `src/no-webgl.js` — dokumen dibaca lewat migrator.

**Renderer dan UI**

- `src/scene-renderer.js` — blok dekorasi berbasis indeks ruangan **dihapus**; `buildProps`,
  `buildWalls`, `propMeshes`, `wallsGroup`, cincin seleksi prop, `observerFocus()`, dan
  picking yang mencakup prop/dinding.
- `src/main.js` — lane timeline per track (pembungkus getter/setter, bukan mutasi track),
  `setKey(o, pose, t, tracks)`, `poseAt`, `syncKeys`, tab “Props” dengan pemilih bentuk,
  inspector prop dan dinding, duplikasi objek set, pemilih track keyframe, dropdown
  interpolasi per lane dan di inspector, peringatan tembus dinding modular, dan kait uji baru.
- `src/style.css` — blok “Fase 4b”: penanda keyframe orientasi (lingkaran berongga vs belah
  ketupat — pembeda bukan hanya warna), lebar label lane 138 px, dropdown interpolasi lane,
  tombol pemilih track, baris tambah prop, dan tab dua baris pada 390 px.
- `src/metrics.js` — tiga `command_type` baru (`track_interpolation`, `add_prop`,
  `duplicate_prop`); daftar tetap tertutup.

**Uji**

- Baru: 4 test v3 di `tests/migrate.test.js`, 1 test bootstrap v2 di `tests/repository.test.js`,
  3 test di `tests/document.test.js` (props/walls roundtrip, penolakan bentuk tidak valid,
  interpolasi), 1 test dinding modular di `tests/spatial.test.js`, 1 test penggabungan track
  di `tests/rollout.test.js`, dan bagian 11 di `tests/shot-timeline-browser.mjs`.
- Fixture beban `tests/fixtures/load/*.json` **tidak diubah**: generatornya kini menyematkan
  `schemaVersion: 2` secara eksplisit sehingga berkas itu sekaligus menjadi fixture migrasi
  v2 berukuran produksi.

**Dokumentasi**

- `docs/DATA-MODEL.md` — judul v3; entitas prop dan dinding modular; Track ditulis ulang
  (properti, interpolasi, D-06); invariant 3/7/9b/9c/11; scene view v3 dan aturan cache
  `actor.keys`; tabel versi v1/v2/v3/>3; **tabel titik baca dokumen tersimpan**; §8 ditulis
  ulang menjadi catatan pelaksanaan + bukti kesetaraan + yang tetap di luar kontrak.
- `plan.md` — F4-05/F4-07/F4-08 dicentang, status kriteria keluar Fase 4b, lima baris log
  baru (termasuk satu baris khusus daftar asersi uji yang berubah), D-06 diperjelas,
  “Langkah berikutnya” diperbarui.
- `README.md` — bagian props/dinding modular dan track per properti, batas 80 objek set,
  keterbatasan yang diperbarui, status R2, dan referensi schema v3.
- `docs/ROLLOUT.md` — §5 langkah 4 (unduh JSON v2 lebih dahulu), tabel jaminan, dan §6
  ditutup: schema v3 sudah dilakukan dengan aturan yang ditulis di sana, termasuk
  `exportAsV2` yang ditambahkan **bersama** migrasinya.

## Keputusan & asumsi

1. **Satu migrasi untuk tiga task.** Menaikkan versi adalah pintu satu arah bagi dokumen
   tersimpan; tiga kenaikan berturut-turut memaksa pengguna melewati tiga migrasi tanpa alasan.
2. **`migrateV1ToV2` tetap menghasilkan v2.** Rantai `v1 → v2 → v3` dapat diuji per langkah,
   dan bentuk v2 tetap menjadi kontrak yang tertulis (dipakai fixture beban). Konsekuensinya
   satu asersi uji lama berubah: `validateDocument(migrateV1ToV2(...))` kini harus
   menyelesaikan rantainya lebih dahulu.
3. **`actor.keys` gabungan menjadi cache turunan, bukan sumber kebenaran.** Alternatifnya —
   menjadikan `keys` tetap dapat ditulis — berarti dua sumber kebenaran untuk gerak yang sama.
   `writeSceneView` karena itu **tidak pernah** membaca `keys`, dan asersi uji yang dahulu
   menulis ke `view.actors[0].keys[0].x` diubah menjadi `...position.keys[0].x` (dicatat di
   plan.md, bukan dilonggarkan). Cache tetap ada karena `gait`, `wallCrossings`, jalur
   viewport, golden Fase 0 dan `exportAsV1` memang bekerja pada JALUR gerak.
4. **Kesetaraan `linear` bersifat struktural.** `sampleTrack('linear')` mengerjakan aritmetika
   yang sama dengan `model.js#sample`, dan pada waktu keyframe fraksinya tepat 0 sehingga
   `a + Δ·0 === a`. Uji 201 titik sampel per track dengan toleransi 1e-9 mengunci itu.
5. **Lane timeline adalah pembungkus, bukan track yang dimutasi.** `Object.assign` ke track
   asli akan menyusupkan field tampilan (`name`, `color`, `locked`) ke scene view dan ikut
   terbawa ke `getProject()`. Pembungkus dengan getter/setter `keys`/`interpolation` menjaga
   operasi keyframe massal `timeline-view.js` tetap memutasi dokumen tanpa efek samping itu.
6. **Satu ID objek pada kait uji `selectKeys` berarti seluruh track objek itu.** Tanpa ini
   setiap pemanggilan lama berubah arti diam-diam. Konsekuensinya jumlah pada pesan menjadi
   dua kali lipat, dan angka itu diperbarui pada asersi (bukan regex-nya dilonggarkan).
7. **Prop `type: 'wall'`, bukan `shape: 'wall'`.** Rencana Fase 4 §8 menyebut prop dengan
   `shape: 'wall'`; task Fase 4b meminta objek `wall` tersendiri dengan `length`/`thickness`.
   Tipe terpisah dipilih karena field-nya memang berbeda (segmen tidak punya `w`/`d`/`y`) dan
   validator dapat menolak kombinasi yang tidak berarti.
8. **Migrasi tidak membuat satu pun dinding modular.** Dokumen lama tidak memilikinya;
   menambahkan geometri yang tidak pernah ada berarti mengubah hasil render proyek pengguna.
9. **Prop lahir tidak terkunci, tetapi picking-nya seketat ruangan.** SC-01 menuntut prop
   dapat ditransform; ED-05 menuntut picking aman. Karena itu prop `locked: false` tetapi
   hanya menjadi target transform setelah dipilih eksplisit — aturan yang sama dengan ruangan.
   Regresi nyata: sebelum aturan ini, drag karakter di dekat sofa foyer menyeret sofanya
   (tertangkap `tests/editor-regression.mjs`).
10. **Dua konsekuensi migrasi dekorasi yang disengaja:** menyembunyikan ruangan tidak lagi
    menyembunyikan bekas dekorasinya (prop kini objek mandiri; `visible` awalnya disalin dari
    ruangan asal supaya tampilan awal tetap sama), dan memindahkan pintu tidak lagi menghapus
    bingkai lukisan yang menghalanginya (pilihan itu dibekukan saat migrasi).
11. **D-06 tidak diubah.** Track rotasi terpisah adalah prasyarat putaran >360°, bukan
    pemenuhannya. Rotasi tetap jalur terpendek; dua keyframe 0°/360° tetap **bukan** padanan
    putaran penuh. Dicatat di `docs/DATA-MODEL.md` §2 Track dan tabel keputusan `plan.md`.
12. **Interpolasi berlaku per track, bukan per keyframe.** Cukup untuk TL-02
    (“interpolation linear/hold/ease”), dan menaikkannya ke per-keyframe kelak hanya
    menambah field pada Keyframe tanpa memecah apa pun lagi.
13. **Tanpa dependency baru.**

## Hasil verifikasi

- `npm test`: **156/156 lulus** (sebelumnya 144; +12 test baru, 0 test lama dihapus).
- `npm run build`: lulus.
- `npm run test:browser`: **10/10 suite lulus** (`browser-smoke`, `editor-regression`,
  `walk-doors-delete`, `migration-browser`, `repository-browser`, `dashboard-browser`,
  `capability-browser`, `a11y-browser`, `shot-timeline-browser`, `gate-r1-browser`).
- Aksesibilitas: `tests/a11y-browser.mjs` lulus dengan 116 kontrol editor (dari 95),
  0 tanpa nama, 0 kontras gagal (desktop dan 390 px), tanpa overflow horizontal pada 390 px.
  Penanda keyframe posisi vs orientasi dibedakan **bentuk**, bukan warna.
- Artefak: `artifacts/shot-timeline.png`, `artifacts/a11y-report.json`.
- `npm run test:perf` **tidak** dijalankan ulang pada Fase 4b (lihat risiko 1).

### Bug yang ditemukan dan diperbaiki selama Fase 4b

| # | Gejala | Penyebab | Perbaikan |
|---|---|---|---|
| C-01 | Keyframe aktor baru hilang setelah disimpan | `#add-object` masih membuat aktor dengan `keys` gabungan saja, sehingga `writeSceneView` menulis track default | Aktor baru lahir dengan dua track |
| C-02 | `keys.findIndex is not a function` saat merekam | Satu pemanggilan `setKey(o.keys, …)` tersisa di loop `animate` | Diubah ke `setKey(o, …, 'both')` |
| C-03 | Drag karakter menyeret prop hasil migrasi | Prop menjadi target picking sebelum dipilih | Prop dan dinding masuk daftar objek set pada `hitId` (ED-05) |
| C-04 | Undo dari tab Props melompat ke tab Karakter | `restoreHistory` hanya memeriksa aktor/ruangan/kamera saat memvalidasi seleksi | Prop dan dinding ikut diperiksa |
| C-05 | Target sentuh tab < 44 px pada 390 px | Tab keempat (“Props”) tidak muat dalam satu baris di panel 135 px | Tab dibungkus dua baris pada `@media(max-width:540px)` |

## Yang belum selesai / cara melanjutkan

Tidak ada pekerjaan Fase 4b yang tertinggal. Yang **sengaja** di luar scope dan siap
dipertimbangkan berikutnya:

1. **Track untuk objek set.** Prop dan dinding tidak dapat di-key. Bila kelak diperlukan
   (pintu berayun, meja didorong), `validateShot` harus menerima `track.objectId` yang
   menunjuk `setObjects`, dan `syncShotTracks` harus menyelaraskannya lintas shot.
2. **Interpolasi per keyframe** (bezier per segmen) — field baru pada Keyframe.
3. **Gizmo rotasi untuk objek set.** Sekarang rotasi prop/dinding lewat field `r`.
4. **Putaran >360° (D-06).** Menuntut track yaw tak dinormalisasi; jangan diakali dengan dua
   keyframe 0°/360°.
5. **Marquee select keyframe** — masih opsional dan masih belum dikerjakan (warisan F4-04).

## Risiko / catatan untuk fase berikutnya

1. **`npm run test:perf` belum diukur ulang.** Fase 4b menambah lane timeline (dua kali lipat
   jumlah baris) dan prop pada scene demo (3 → 18 objek set). Keduanya menyentuh jalur yang
   diukur F6-02/F6-03. Jalankan ulang sebelum gate R2 dan bandingkan dengan
   `docs/PERF-BASELINE.md`; perhatikan khususnya p95 drag (render timeline lebih berat) dan
   waktu buka proyek (dokumen lebih besar karena prop).
2. **Gate R2 (F6-09) kini dapat mengisi TL-02 dan SC-01.** Matriks buktinya harus menunjuk
   uji Fase 4b, bukan menyatakannya terbuka seperti pada catatan Fase 4.
3. **Rollback punya dua jalur turun, keduanya sudah ada.** “Unduh JSON v2 (build R1)”
   mempertahankan seluruh scene, shot dan keyframe (kehilangan prop, dinding modular dan
   interpolasi non-linear — disebutkan pada toast); “Unduh JSON v1 (build lama)” tetap untuk
   build R0 dan hanya membawa satu scene + satu shot. Dokumen v3 sendiri tidak dihapus.
   `docs/ROLLOUT.md` §5–§6 sudah disegarkan.
4. **Fase 5 (ekspor) mewarisi sampler baru.** Encoder deterministik F5-04 harus memanggil
   `sampleScene` yang sama; jangan menghitung ulang pose dari `actor.keys` gabungan, karena
   pada interpolasi `hold`/`ease` kunci gabungan hanya merepresentasikan titik, bukan kurva.
5. **Dokumen v3 lebih besar.** Scene demo tumbuh dari 3 menjadi 18 objek set dan dari 4
   menjadi 7 track. `LIMITS.documentBytes` tidak diubah; bila fixture beban kelak ditulis
   ulang sebagai v3, periksa ulang ambang 5 MB.

# Laporan Fase 3 — 8 September 2026

Cakupan: F3-01 s.d. F3-10 (dashboard dan workflow banyak proyek/scene).
**F3-11 (gate R1) sengaja tidak dikerjakan dan tidak dicentang** — itu Fase 6.
Tidak ada commit yang dibuat. Tidak ada dependency npm baru.

## Status task

| Task | Status | Bukti |
|---|---|---|
| F3-01 dashboard | Selesai | `src/dashboard.js`, `src/routing.js`, `src/app.js`, `src/dashboard-support.js`; `tests/dashboard-browser.mjs` bagian 1, 3, 4, 13 |
| F3-02 buat/buka/rename/duplicate | Selesai | `repository.renameProject`, `cloneProjectDocument`, template kosong/demo; `tests/dashboard.test.js` (duplicate + konflik ID), browser bagian 2, 5, 10 |
| F3-03 trash 30 hari | Selesai | `deleteProject`/`restoreProject`/`purgeExpiredTrash`; unit “pembersihan trash hanya membuang item yang melewati 30 hari”, browser bagian 9; dokumentasi `docs/DATA-MODEL.md` §2 |
| F3-04 banyak scene | Selesai | `addScene`/`duplicateScene`/`moveScene`/`removeScene`/`renameScene` + `DocumentStore.reload`; 4 unit test scene, browser bagian 2 |
| F3-05 breadcrumb & metadata editable | Selesai | Breadcrumb + tombol kembali (flush autosave/session, lepas kunci) di `src/main.js`; browser bagian 12 membuktikan kunci writer benar-benar dilepas |
| F3-06 thumbnail | Selesai | `repository.putThumbnail` + `captureThumbnail()`; unit “thumbnail ditulis ke store assets tanpa menyentuh dokumen”, browser bagian 3 |
| F3-07 paket ekspor/impor | Selesai | `src/package.js`; 4 unit test paket, browser bagian 7 |
| F3-08 impor v1 sebagai proyek baru | Selesai | `importFile()` di `src/dashboard.js`; browser bagian 8 |
| F3-09 states & aksesibilitas | Selesai | Loading/empty/error, banner kuota, penanda tab lain, placeholder aset; browser bagian 11–13 |
| F3-10 pengujian | Selesai | `npm test` 83/83, `npm run build` lulus, 6 browser test lulus (`tests/dashboard-browser.mjs` terdaftar pada `npm run test:browser`) |
| F3-11 gate R1 | **Belum (di luar cakupan)** | Dikerjakan pada Fase 6 |

## Perubahan file

**Baru**

- `src/app.js` — entry point dan router hash. Memilih dashboard atau editor, memuat `main.js`/`dashboard.js` secara dinamis (Three.js hanya diunduh saat editor dibuka).
- `src/routing.js` — `parseRoute()` / `projectRoute()` murni, dapat diuji tanpa DOM.
- `src/dashboard.js` — dashboard: daftar kartu, pencarian, dua urutan, buat dari template, buka, rename inline, duplicate, ekspor paket, hapus, tempat sampah (restore + hapus permanen berkonfirmasi), impor paket/JSON v1, pembersihan trash, empty/loading/error state.
- `src/dashboard-support.js` — helper murni: `uniqueTitle`, `stamp`, `trashRemaining`.
- `src/package.js` — format paket `.blockingroom.json`: `buildPackage`, `readPackage`, `sha256`, batas ukuran, `isPackage`, `packageFileName`.
- `tests/dashboard.test.js` — 19 unit test (rute, operasi scene, metadata/trash repository, paket, konflik nama).
- `tests/dashboard-browser.mjs` — 13 bagian uji perjalanan dashboard di Chrome.

**Diubah**

- `index.html` — entry `/src/main.js` → `/src/app.js`.
- `src/repository.js` — `lastOpenedAt` pada metadata (dan dipertahankan setiap save), `restoreProject`, `purgeExpiredTrash`, `touchProject`, `renameProject`, `putThumbnail`, `deleteAsset`, konstanta `TRASH_RETENTION_DAYS`.
- `src/bootstrap.js` — migrasi sumber lama diekstrak menjadi `migrateLegacy()`; `bootstrapDashboard()` untuk jalur dashboard (repository + migrasi, tanpa dokumen/kunci/session); **titipan milik proyek lain kini ditulis ke proyek asalnya** (lihat Keputusan No. 6).
- `src/document.js` — `DocumentStore.reload()`, operasi scene `addScene/duplicateScene/moveScene/removeScene/renameScene/nextSceneName`, `cloneProjectDocument` mengosongkan `scene.thumbnailRef`.
- `src/tab-lock.js` — `projectWriterStatus()` untuk dashboard (baca heartbeat saja, tidak pernah mengambil kunci).
- `src/main.js` — breadcrumb + tombol kembali ke dashboard, daftar scene di panel kiri dengan aksinya, director’s note editable, nama kamera dinamis, `sceneCommand()`/`switchScene()`, thumbnail berdebounce, `touchProject` saat membuka, pemulihan scene aktif dari SessionState, kait uji baru.
- `src/style.css` — gaya dashboard, daftar scene, breadcrumb; target sentuh ≥44 px; lebar panel kiri disesuaikan agar tidak ada overflow pada 390 px.
- `package.json` — `test:browser` menambahkan `tests/dashboard-browser.mjs`.
- `docs/DATA-MODEL.md` — metadata proyek, tempat sampah 30 hari + kapan pembersihan berjalan, kontrak aset thumbnail, format paket.
- `README.md` — kemampuan proyek/scene, penyimpanan IndexedDB, tabel rute, trash, struktur proyek, cakupan pengujian, diagram arsitektur.
- `plan.md` — F3-01…F3-10 dicentang + 10 baris log pelaksanaan.

**Tidak disentuh:** asersi kelima browser test lama (`browser-smoke`, `editor-regression`, `walk-doors-delete`, `migration-browser`, `repository-browser`) — semuanya lulus tanpa satu baris pun diubah.

## Keputusan & asumsi

1. **URL tanpa hash membuka editor, bukan dashboard.** `#/` adalah dashboard, `#/trash` tempat sampah, `#/project/<id>` editor; URL polos membuka proyek yang terakhir dibuka (dan pada instalasi baru `bootstrap()` tetap membuat proyek demo lalu membukanya). Alasan: (a) “melanjutkan pekerjaan” adalah jalur yang paling sering dipakai pada aplikasi lokal; (b) lima berkas uji regresi R0 memuat URL polos dan mengharapkan editor — menjadikan dashboard layar awal untuk URL polos berarti mengubah asersi di lima berkas sekaligus, persis yang diminta orkestrator untuk dihindari. Dashboard tetap satu klik dari editor dan punya empty state sungguhan (diuji).
2. **Hash adalah target navigasi, `blocking-room.activeProject` tetap sumber kebenaran.** Editor **tidak** menulis ulang hash setelah bootstrap. Kalau editor memaksakan `#/project/<id>`, uji lama yang berpindah proyek lewat `localStorage` + reload akan dibajak oleh hash yang basi. Dashboard menulis keduanya (localStorage + hash) sebelum berpindah; “Buka salinan” menyamakan hash hanya bila hash memang sedang dipakai.
3. **Perpindahan rute selalu memuat ulang halaman.** Dengan reload, kunci writer, autosave, SessionState dan bootstrap selalu mulai dari keadaan bersih; tidak ada state editor yang tertinggal di memori saat berpindah proyek. Biayanya satu reload — dapat diterima untuk aplikasi lokal, dan jauh lebih aman daripada membongkar editor secara manual.
4. **Menghapus scene terakhir ditolak dengan pesan**, bukan diganti scene kosong otomatis. Membuat scene kosong secara diam-diam berarti isi scene terakhir hilang tanpa diminta; menolak membuat penggunanya sadar dan tetap bisa menambah scene baru lalu menghapus yang lama. Tombol hapus scene dinonaktifkan saat hanya ada satu scene, dan validator tetap menjamin `scenes.length ≥ 1`.
5. **Thumbnail tidak pernah masuk dokumen.** Gambar disimpan sebagai aset `thumb-<sceneId>` lewat transaksi `assets` + `projects` yang tidak menyentuh store `documents`. Konsekuensinya: kegagalan thumbnail secara struktural tidak dapat menggagalkan penyimpanan dokumen (bukan sekadar dibungkus `try/catch`), dan merender thumbnail tidak membuat langkah undo palsu. `doc.thumbnailRef` tetap `null`.
6. **Titipan `blocking-room.pending` milik proyek lain kini dipulihkan ke proyek asalnya.** Sebelumnya titipan dibuang begitu saja bila proyek aktif berbeda, sehingga jaminan “save yang tertunda tetap masuk ke proyek asalnya” hanya bertumpu pada `saveDocumentImmediate` di `pagehide` — jalur yang laporan Fase 2 sendiri menyebut best-effort. Setelah Fase 3 menambah pekerjaan IndexedDB saat boot (thumbnail + `touchProject`), asersi itu mulai gagal 2 dari 3 kali. Perbaikannya: `adoptPending()` menulis titipan ke proyek pemiliknya bila proyek itu **masih ada** dan titipan lebih baru, lalu membuang penanda. Titipan tidak pernah membuat proyek baru (unit test lama tetap menjaganya) dan tidak pernah mendarat di proyek yang sedang dibuka. Setelah perubahan ini `repository-browser` lulus 3 dari 3.
7. **Paket berformat JSON, bukan ZIP.** ZIP menuntut library kompresi; proyek ini tidak menambah dependency. Strukturnya tetap “paket” (manifest + bagian terpisah + checksum SHA-256 per bagian lewat `crypto.subtle`), sehingga integritas tiap bagian dapat diperiksa sebelum apa pun mengganti state aktif.
8. **Impor selalu membuat proyek baru.** ID bentrok → seluruh ID internal dipetakan ulang dan judul diberi sufiks; ID bebas → ID dipertahankan sehingga roundtrip ekspor→impor menghasilkan dokumen identik (diuji unit) dan impor ke penyimpanan yang sudah berisi proyek itu menghasilkan proyek setara (diuji browser).
9. **Konfirmasi hapus permanen memakai dua klik di dalam halaman**, bukan `window.confirm`. Alasannya bukan estetika: dialog native tidak dapat diuji tanpa handler khusus dan tidak dapat diberi teks yang menjelaskan konsekuensinya di tempat.
10. **Pembersihan trash dijalankan saat dashboard dibuka.** Aplikasi lokal tidak punya proses latar. Konsekuensi yang disengaja dan dicatat: pengguna yang tidak pernah membuka dashboard tidak akan pernah kehilangan isi tempat sampahnya.
11. **Target sentuh ≥44 px mengubah tata letak panel kiri.** Tombol kunci/mata/hapus dan aksi scene menjadi 44×44 px dalam baris yang boleh membungkus, dan lebar panel kiri dinaikkan (272 px desktop, 172 px pada ≤540 px). Ini perubahan visual yang terlihat, tetapi diperlukan agar target sentuh nyata — bukan sekadar area semu lewat pseudo-element yang tidak dapat diukur oleh uji otomatis.
12. **Scene kosong membuka tab “Karakter”.** Sebelumnya `kind()` mengembalikan `'camera'` ketika tidak ada objek terpilih, sehingga scene baru langsung menawarkan “Tambah kamera”. Tindakan pertama yang masuk akal di scene baru adalah menambah karakter.

## Hasil verifikasi

Lingkungan: macOS 26.2 (Darwin 25.2.0, arm64), Node v22.21.1, Chrome (`channel:'chrome'`, headless), Vite 7, dev server `--port 5174 --strictPort`.

- `npm test` — **83/83 lulus** (sebelumnya 64). Tambahan 19 test: rute, operasi scene, metadata/trash/thumbnail repository, paket, konflik nama.
- `npm run build` — lulus. Code splitting: `dashboard` 15,8 kB (gzip 6,2 kB) tidak menarik Three.js; `main` 91,3 kB; `three` 494,5 kB.
- `node tests/browser-smoke.mjs` — PASS (asersi tidak diubah).
- `node tests/editor-regression.mjs` — PASS (asersi tidak diubah).
- `node tests/walk-doors-delete.mjs` — PASS (asersi tidak diubah).
- `node tests/migration-browser.mjs` — PASS (asersi tidak diubah).
- `node tests/repository-browser.mjs` — PASS (asersi tidak diubah; dijalankan 3× berturut setelah perbaikan titipan, konsisten lulus).
- `node tests/dashboard-browser.mjs` — PASS (baru).
- `npm run test:browser` — keenam berkas lulus berurutan.

Cakupan `tests/dashboard-browser.mjs`:

1. dashboard kosong menampilkan empty state;
2. buat A (template demo) → tambah scene (set/aktor sendiri, scene 1 tidak berubah) → isi director’s note → buka B (template kosong) → kembali ke A → scene aktif pulih → reload → scene aktif tetap pulih → pindah scene → reload → mengikuti scene terakhir;
3. thumbnail per scene tersimpan dan dipakai kartu; proyek tanpa thumbnail memakai placeholder;
4. pencarian judul dan urutan “terbaru diubah” / “terakhir dibuka”;
5. duplicate: judul bersufiks, isi setara, seluruh UUID berbeda, target kamera/track tetap konsisten, mengedit salinan tidak mengubah asal;
6. dua proyek berjudul **sama** tetap terisolasi;
7. ekspor paket (manifest + checksum + counts) → impor menjadi proyek baru yang setara; paket dengan checksum diubah **ditolak** tanpa mengubah proyek mana pun;
8. impor JSON v1 menjadi proyek baru (dimigrasikan ke schema v2) tanpa menimpa proyek lain; JSON terpotong dan proyek v1 invalid ditolak;
9. hapus → hanya `deletedAt`, dokumen tetap ada → tempat sampah → konfirmasi hapus permanen dapat dibatalkan → restore menjaga isi → hapus permanen membuang dokumen dan metadata;
10. rename inline memperbarui metadata **dan** dokumen;
11. `aria-label` dan target sentuh ≥44×44 px pada tombol kartu, tombol lock/mata/hapus, aksi scene dan tombol tambah; tidak ada overflow horizontal pada 390 px di dashboard maupun editor; fokus keyboard;
12. kembali ke dashboard melepas kunci writer sehingga tab lain langsung menjadi writer, dan kartu menandai proyek yang sedang dibuka tab lain;
13. rute `#/trash` langsung; dashboard menampilkan error state + “coba lagi” saat IndexedDB tidak tersedia.

## Yang belum selesai / batas kesimpulan

- **F3-11 (gate R1) belum dijalankan** — sengaja, itu Fase 6.
- **UI banyak shot belum ada.** Breadcrumb menampilkan shot aktif dan dokumen sudah menampung banyak shot, tetapi menambah/mengganti shot adalah F4-01.
- **Reorder scene hanya naik/turun satu langkah.** Tidak ada drag-and-drop; cukup untuk R1, dicatat sebagai kandidat perbaikan.
- **Rename dari dashboard tidak memeriksa kunci writer.** Bila proyek sedang dibuka tab lain, autosave tab itu dapat menulis kembali judul lama. Kartu sudah menandai “sedang dibuka di tab lain”, tetapi aksinya belum diblokir.
- **Storage penuh pada dashboard belum diuji di browser.** Jalur `StorageQuotaError` → banner + toast ada di kode dan diuji tidak langsung lewat unit repository, bukan lewat kuota nyata.
- **Thumbnail hanya dirender bila shot punya kamera.** Scene tanpa kamera selamanya memakai placeholder. Alternatifnya merender observer view, tetapi canvas observer tidak memakai `preserveDrawingBuffer`.
- **Thumbnail tidak ikut dalam duplicate maupun paket yang diekspor dashboard** kalau proyek belum pernah dirender di sesi ini — `listAssets` hanya membaca yang sudah ada; salinan sengaja mulai tanpa thumbnail.
- **Belum ada uji beban dashboard.** `tests/fixtures/load/projects-100.json` tersedia sejak F6-01 tetapi belum dipakai untuk mengukur waktu render 100 kartu.
- **Hanya Chrome, satu mesin.** Safari/Firefox, pembaca layar sungguhan dan perangkat sentuh nyata belum diuji.
- **`DB_VERSION` masih 1.** Store `assets` sudah ada sejak Fase 2, jadi thumbnail tidak memerlukan upgrade schema.

## Cara melanjutkan

1. **Gate R1 (F3-11 / Fase 6).** Jalankan `npm test`, `npm run build`, `npm run test:browser`, lalu daftar periksa F6-08. Baseline performa `docs/PERF-BASELINE.md` masih kosong pada kolom Hasil.
2. **Fase 4 (shot).** Dokumen dan `DocumentStore` sudah mendukung banyak shot; `readSceneView`/`writeSceneView` menerima `shotId` sehingga UI shot list dapat memakai pola yang sama dengan daftar scene (`sceneCommand` di `src/main.js` adalah contoh operasi dokumen dengan satu langkah undo).
3. **Blokir aksi dashboard pada proyek yang sedang ditulis tab lain** memakai `projectWriterStatus()` yang sudah ada.
4. **Thumbnail scene tanpa kamera** dapat memakai renderer observer bila `preserveDrawingBuffer` diaktifkan di `src/scene-renderer.js` (perhatikan biaya memori).

## Risiko / catatan untuk fase berikutnya

- **Jangan menulis ulang hash dari editor.** Lihat Keputusan No. 2: hash yang basi akan mengalahkan `blocking-room.activeProject` dan membajak uji perpindahan proyek.
- **Jangan memindahkan thumbnail ke dalam dokumen.** Itu akan membuat kegagalan gambar mampu menggagalkan penyimpanan dokumen dan menambah langkah undo palsu.
- **Operasi scene wajib lewat `sceneCommand()`**, bukan memutasi `store.doc` langsung, supaya validasi + rollback + satu langkah undo tetap terjaga. `store.activate()` melempar bila scene tujuan sudah dihapus; pakai `store.reload()` untuk kasus itu.
- **`window.blockingRoom` bertambah kait uji Fase 3** (`getScenes`, `getActiveSceneId`, `switchScene`, `captureThumbnail`, `getProjectMeta`, `goDashboard`) dan dashboard mengekspos `window.blockingRoomDashboard`. Menghapusnya berarti memperbarui `tests/dashboard-browser.mjs`.
- **`purgeExpiredTrash()` menghapus permanen.** Setiap perubahan pada `deletedAt` atau pada urutan pemanggilannya harus disertai uji; salah tanda perbandingan berarti kehilangan data pengguna.

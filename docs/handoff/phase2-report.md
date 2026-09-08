# Laporan Fase 2 — 8 September 2026

Cakupan: F2-01 s.d. F2-09 (penyimpanan lokal yang aman). Tidak ada commit yang dibuat.
Tidak ada dependency npm baru.

## Status task

| Task | Status | Bukti |
|---|---|---|
| F2-01 `ProjectRepository` IndexedDB | Selesai | `src/repository.js`; `tests/repository.test.js` (17 test, fake IndexedDB) + `tests/repository-browser.mjs` (Chrome nyata) |
| F2-02 migrasi localStorage via repository | Selesai | `src/bootstrap.js`, `src/storage.js`; unit “migrasi berjalan sekali” & “penanda tidak ditulis bila transaksi gagal”; `tests/migration-browser.mjs` |
| F2-03 autosave + coalesce + revision token | Selesai | `src/autosave.js`; unit coalesce/stale-token/token-setelah-reload; browser 100 siklus |
| F2-04 status simpan jujur + unduh cadangan | Selesai | `renderSaveStatus` + `#download-backup` di `src/main.js`; browser test bagian kegagalan buatan |
| F2-05 ≥10 snapshot recovery + UI | Selesai | store `revisions`, panel `#revision-panel`; browser test (daftar waktu, pulihkan = satu undo, buka versi tersimpan terakhir) |
| F2-06 SessionState | Selesai | `src/session-state.js`, `SceneRenderer.getObserverPose/setObserverPose`; unit fallback + browser test reload |
| F2-07 satu writer per proyek | Selesai | `src/tab-lock.js`, `ReadOnlyError` di `src/commands.js`; browser test dua page dalam satu context |
| F2-08 kuota / storage tidak tersedia / transaksi gagal | Selesai | `StorageQuotaError`, `StorageUnavailableError`, mode darurat bootstrap, titipan `blocking-room.pending`, `requestPersistentStorage()` |
| F2-09 pengujian | Selesai | `npm test` 64/64, `npm run build` lulus, 5 browser test lulus |

## Perubahan file

**Baru**

- `src/repository.js` — `ProjectRepository`: object store `projects`, `documents`, `revisions` (index `projectId_createdAt` + `projectId`), `assets`, `session`. Satu transaksi menulis documents+projects+revisions. `saveDocument` (dengan revision token), `saveDocumentImmediate` (jalur penutupan tab), `listProjects/getProject/getDocument/deleteProject`, `listRevisions/getRevision/latestRevision`, `putSession/getSession`, `putAsset/getAsset/listAssets`, `requestPersistentStorage()`.
- `src/autosave.js` — `AutosaveController`: leading + coalesce (`delay` 250 ms), revision token, status `idle/saving/saved/error`, `flush()`, `flushOnUnload()`, `unconfirmed()`.
- `src/session-state.js` — `SessionTracker` (throttle 1 detik) + `restoreSession` dengan fallback aman.
- `src/tab-lock.js` — `ProjectLock`: Web Locks `ifAvailable`, heartbeat localStorage, BroadcastChannel, `takeOver()`.
- `src/bootstrap.js` — urutan buka editor: repository → migrasi → proyek aktif → titipan pending → kunci writer + session state.
- `tests/helpers/fake-indexeddb.mjs` — fake IndexedDB in-memory (staging + commit/abort) untuk unit test Node.
- `tests/repository.test.js` — 17 test unit Fase 2.
- `tests/repository-browser.mjs` — test browser F2-09, terdaftar pada `npm run test:browser`.

**Diubah**

- `src/storage.js` — tetap satu-satunya penyentuh localStorage, tetapi bukan lagi penyimpanan utama. Menambah `MIGRATED_KEY`, `ACTIVE_PROJECT_KEY`, `PENDING_KEY` dan helper titipan sinkron.
- `src/commands.js` — `EditorSession.readOnly` + `ReadOnlyError`; `begin/end/commit/run/openDocument/undo/redo` menolak saat baca-saja.
- `src/document.js` — `cloneProjectDocument()` (remap seluruh ID) untuk “Buka salinan”; dipakai kembali oleh duplicate Fase 3.
- `src/scene-renderer.js` — `getObserverPose()` / `setObserverPose()`.
- `src/main.js` — bootstrap async (top-level await), status simpan, tombol unduh cadangan, panel riwayat versi, banner tab baca-saja (“Buka salinan” / “Ambil alih”), pencatatan session state, penyimpanan darurat saat `pagehide`.
- `src/style.css` — gaya status simpan, banner tab, dialog riwayat versi.
- `package.json` — `test:browser` menambahkan `tests/repository-browser.mjs`.
- `docs/DATA-MODEL.md` — Revision/SessionState menjadi kontrak yang sudah terimplementasi + tabel kunci localStorage.
- `docs/AUDIT.md` — temuan P0 penyimpanan ditandai selesai; daftar verifikasi diperbarui.
- `plan.md` — F2-01…F2-09 dicentang + 9 baris log pelaksanaan.
- `tests/migration-browser.mjs` — **satu asersi lama diubah** (lihat “Keputusan” No. 2).

## Keputusan & asumsi

1. **Copy-first lebih kuat daripada sebelumnya.** Migrasi tidak lagi menimpa kunci `blocking-room`; sumber v1/v2 lama dibiarkan utuh, cadangan mentah tetap ditulis ke `blocking-room.backup`, dan `blocking-room.migrated` (berisi id proyek) ditulis **hanya setelah** transaksi IndexedDB commit. Migrasi ulang karena itu tidak mungkin membuat proyek duplikat.
2. **Satu asersi browser test lama diubah dan dicatat.** `tests/migration-browser.mjs` dahulu menuntut `localStorage['blocking-room']` berisi dokumen v2 setelah migrasi. Sejak Fase 2 penyimpanan pindah ke IndexedDB, sehingga asersi diganti menjadi: sumber v1 **tidak** ditimpa, `blocking-room.migrated` = id proyek, dan dokumen v2 ada di IndexedDB. Empat asersi lain di berkas itu, serta seluruh asersi `browser-smoke`, `editor-regression` dan `walk-doors-delete`, tidak disentuh dan tetap lulus.
3. **Revision token berbasis jam, bukan penghitung dari nol.** Regresi nyata yang ditemukan saat pengujian: token yang mulai dari 0 setiap reload membuat repository menganggap seluruh penyimpanan sesi baru sebagai “respons lama” dan melewatinya diam-diam. Token kini `max(jam, token sebelumnya + 1)` sehingga monoton lintas reload dan lintas tab. Diuji di `tests/repository.test.js`.
4. **Autosave leading + coalesce, bukan debounce murni.** Perubahan pertama setelah jeda langsung ditulis; perubahan berikutnya digabung dan ditulis paling lambat 250 ms. Alasan di No. 5.
5. **Browser TIDAK menjamin transaksi IndexedDB yang dimulai saat `pagehide` sempat commit.** Diverifikasi dengan probe langsung di Chrome 152 headless: penulisan pada `pagehide` (baik sinkron maupun di microtask) hilang setelah reload. Karena itu keadaan terakhir yang belum dipastikan commit dititipkan **sinkron** ke `localStorage['blocking-room.pending']`, dan bootstrap berikutnya mengambilnya, memvalidasinya, menuliskannya ke repository, lalu membuang penanda. `saveDocumentImmediate` tetap dicoba sebagai upaya terbaik. Ini yang membuat “edit lalu langsung reload” tidak kehilangan data — bukan keberuntungan timing.
6. **Read-only ditegakkan di lapisan command.** `EditorSession` melempar `ReadOnlyError`; `persist()` di `main.js` mengembalikan dokumen ke keadaan valid terakhir. UI (tombol disabled + banner) hanya lapisan kedua. Browser test membuktikannya dengan memaksa input yang sudah di-disable dan memanggil `click()` langsung pada elemen.
7. **“Ambil alih” tidak pernah merebut writer yang hidup.** Dengan Web Locks, pengambilalihan hanya berhasil bila kunci benar-benar bebas (tab writer ditutup/crash). Pada fallback tanpa Web Locks, syaratnya heartbeat kedaluwarsa (>6 detik).
8. **Batas revisi 20, minimum 10.** PRD meminta minimal 10 snapshot per proyek; pemangkasan terjadi di dalam transaksi save yang sama sehingga tidak ada state antara.
9. **`updatedAt` tetap distempel saat menyimpan**, kini oleh repository (bukan `storage.js`). Keputusan Fase 1 tidak berubah.
10. **Proyek aktif masih lewat `blocking-room.activeProject`.** Repository sudah menyimpan banyak proyek dan `listProjects()` siap; UI daftar proyek adalah Fase 3.
11. **`navigator.storage.persist()` diminta di latar belakang**, tidak pernah ditampilkan sebagai pengganti cadangan, dan kegagalannya tidak memengaruhi status simpan.
12. **Fake IndexedDB ditulis sendiri** (`tests/helpers/fake-indexeddb.mjs`, ±200 baris) agar tidak menambah dependency. Fake ini menahan penulisan di staging dan menerapkannya saat commit, sehingga abort benar-benar membatalkan semuanya. Perilaku IndexedDB sungguhan tetap diuji di Chrome.

## Hasil verifikasi

Lingkungan: macOS 26.2 (Darwin 25.2.0, arm64), Node v22.21.1, Chrome (`channel:'chrome'`, headless), Vite 7, dev server `--port 5174 --strictPort`.

- `npm test` — **64/64 lulus** (sebelumnya 41). Tambahan 23 test: repository/autosave/session/tab-lock/migrasi/pemulihan titipan.
- `npm run build` — lulus (`index` 115.76 kB gzip 37.17 kB, `three` 494.50 kB gzip 125.32 kB).
- `node tests/browser-smoke.mjs` — PASS (asersi tidak diubah).
- `node tests/editor-regression.mjs` — PASS (asersi tidak diubah).
- `node tests/walk-doors-delete.mjs` — PASS (asersi tidak diubah).
- `node tests/migration-browser.mjs` — PASS (satu asersi diubah, lihat Keputusan No. 2).
- `node tests/repository-browser.mjs` — PASS (baru).

Cakupan `tests/repository-browser.mjs` (F2-09):

1. autosave commit + status “Tersimpan lokal” hanya setelah transaksi; metadata proyek dan dokumen selalu punya `updatedAt` yang sama (bukti transaksi atomik di IndexedDB nyata);
2. ≥10 snapshot recovery, daftar waktu revisi tampil, pemulihan = satu langkah undo, “Buka versi tersimpan terakhir”;
3. session state (playhead, seleksi, pose observer) pulih setelah reload dan tetap aman setelah objek yang terseleksi dihapus;
4. dua page dalam satu context: tab kedua baca-saja, edit paksa lewat DOM ditolak, tidak ada silent last-write-wins, ambil alih ditolak selama writer hidup dan berhasil setelah writer ditutup;
5. dua proyek berjudul **sama** tetap terisolasi (mengedit salinan tidak mengubah proyek asal);
6. pergantian proyek saat save pending: perubahan mendarat di proyek asalnya, bukan di proyek yang baru dibuka;
7. kegagalan penyimpanan buatan → status “Gagal menyimpan”, tombol cadangan muncul dan berkas terunduh, data tetap di memori; setelah penyimpanan pulih, perubahan yang sempat gagal ikut tersimpan;
8. 100 siklus edit → autosave commit → baca ulang dari IndexedDB dan bandingkan dengan memori, dengan reload penuh setiap 10 siklus. Tidak ada perbedaan data.

Untuk mengurangi kecurigaan flaky, `walk-doors-delete`, `editor-regression` dan `browser-smoke` dijalankan berulang (3×, 3×, 2×) setelah perubahan autosave — semuanya konsisten lulus.

## Yang belum selesai / batas kesimpulan

- **Trash 30 hari belum aktif.** Kolom `deletedAt` dan `deleteProject(id, {permanent})` sudah ada di repository, tetapi belum ada UI maupun pembersihan otomatis — itu F3-03.
- **Dashboard/daftar proyek belum ada.** Editor masih membuka satu “proyek aktif”. Proyek kedua hanya bisa dibuat lewat “Buka salinan”.
- **Store `assets` masih kosong.** API `putAsset/getAsset/listAssets` ada, thumbnail (F3-06) dan paket (F3-07) belum.
- **`DB_VERSION` masih 1.** Belum ada jalur upgrade schema IndexedDB yang benar-benar diuji (baru fungsi `upgrade()` idempoten).
- **Titipan `blocking-room.pending` dibatasi 1,5 MB.** Dokumen lebih besar tidak dititipkan; pada dokumen sebesar itu risiko kehilangan perubahan ≤250 ms saat reload cepat masih ada.
- **Crash keras (tab dibunuh) tidak menjalankan `pagehide`.** Pemulihannya bertumpu pada snapshot revisi terakhir, bukan pada titipan.
- **Hanya Chrome, satu mesin.** Web Locks, BroadcastChannel dan jalur fallback heartbeat belum diuji di Safari/Firefox. Fallback heartbeat diuji di unit test, bukan di browser nyata.
- **Belum ada uji beban** 20 aktor / 500 keyframe terhadap frekuensi autosave.

## Cara melanjutkan (Fase 3)

1. Dashboard (F3-01) tinggal memakai `repository.listProjects()` — metadata sudah berisi `title`, `updatedAt`, `sceneCount`, `thumbnailRef`, `deletedAt` tanpa perlu membaca dokumen.
2. Duplicate (F3-02) memakai `cloneProjectDocument()` di `src/document.js` yang sudah memetakan ulang seluruh ID dan diuji.
3. Trash (F3-03) memakai `deleteProject(id)` (soft) dan `deleteProject(id, {permanent:true})`.
4. Berpindah proyek: tulis `blocking-room.activeProject`, lepas `ProjectLock` lama (`lock.dispose()`), lalu muat ulang. Pola ini sudah dipakai tombol “Buka salinan”.
5. Thumbnail (F3-06) dapat memakai parameter `thumbnailRef` pada `saveDocument` dan store `assets`; kegagalan thumbnail tidak boleh menggagalkan penyimpanan dokumen — arsitekturnya sudah mendukung karena keduanya berbeda store.

## Risiko / catatan untuk fase berikutnya

- **Jangan mengembalikan penyimpanan ke `localStorage['blocking-room']`.** Kunci itu kini murni sumber migrasi; menimpanya akan membuat migrasi berjalan atas data yang salah.
- **Jangan menunda seluruh penyimpanan sampai akhir gestur tanpa titipan sinkron.** Bukti probe di Keputusan No. 5 menunjukkan browser membuang transaksi IndexedDB yang dimulai saat `pagehide`.
- **Perhatikan `revisionToken`.** Setiap jalur penyimpanan baru wajib memakai token yang naik; token statis atau kecil akan dilewati diam-diam oleh `saveDocument`.
- **`window.blockingRoom` kini memuat kait uji Fase 2** (`flushSave`, `breakStorage`, `restoreStorage`, dll). Kait ini dipakai `tests/repository-browser.mjs`; kalau dihapus, test tersebut harus ikut diperbarui.
- Fake IndexedDB hanya mengimplementasikan operasi yang dipakai `src/repository.js`. Menambah pemakaian cursor atau `count()` di repository berarti fake harus ikut diperluas, atau test unit terkait dipindahkan ke browser.

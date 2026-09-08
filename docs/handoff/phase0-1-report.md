# Laporan Fase 0 + Fase 1 — 8 September 2026

Cakupan: F0-08, F0-09, F0-10, lalu F1-01 sampai F1-09. Tidak ada commit yang dibuat.

## Status task

| Task | Status | Bukti |
|---|---|---|
| F0-08 fixture JSON v1 | Selesai | `tests/fixtures/v1/` — 6 fixture valid, 8 fixture invalid; generator `tests/fixtures/generate.mjs`; `tests/fixtures.test.js` |
| F0-09 baseline pose | Selesai | `tests/fixtures/baseline/*.json` (pose awal/tengah/akhir, gait, wall crossing, panel dinding); dibandingkan otomatis. Screenshot + ekspor video di `artifacts/` |
| F0-10 baseline lingkungan | Selesai | macOS 26.2 / Darwin 25.2.0 arm64, Node v22.21.1, Chrome 152.0.7977.76 headless. Sebelum refactor: unit 16/16, build lulus, 3 browser test lulus |
| F1-01 kontrak data | Selesai | `docs/DATA-MODEL.md` §1–§4 |
| F1-02 validator schema v2 | Selesai | `src/schema.js`; `tests/migrate.test.js`, `tests/document.test.js` |
| F1-03 document vs UI state | Selesai | `src/document.js`; test isolasi antar-scene |
| F1-04 command/history | Selesai | `src/commands.js`; test scope undo, transaksi gestur, bulk lock |
| F1-05 ekstraksi batas modul | Selesai | `src/scene-renderer.js`, `src/timeline-engine.js`, `src/export-service.js`, `src/storage.js` |
| F1-06 migrator v1 → v2 | Selesai | `src/migrate.js`; `tests/migrate.test.js`, `tests/migration-browser.mjs` |
| F1-07 copy-first + schema lebih baru | Selesai | `openProjectData`, `blocking-room.backup`, `SchemaTooNewError` |
| F1-08 strategi waktu keyframe | Selesai | `docs/DATA-MODEL.md` §5 |
| F1-09 uji migrasi | Selesai | 41 unit test + browser test migrasi |

## Perubahan file

**Baru**

- `src/schema.js` — validator schema v2, `LIMITS`, `SchemaTooNewError`, `normalizeDocument`, `newId`.
- `src/document.js` — `DocumentStore`, `readSceneView`/`writeSceneView`, selector `activeScene`/`activeShot`, `emptyDocument`.
- `src/commands.js` — `EditorSession` (history per proyek, transaksi gestur, `run`, `runBulk`), `partitionByLock`, `describeSkipped`.
- `src/migrate.js` — `detectVersion`, `migrateV1ToV2`, `openProjectData`, `DEFAULT_FPS`, `TIME_TOLERANCE`.
- `src/storage.js` — `loadDocument`/`saveDocument` untuk kunci `blocking-room` + `blocking-room.backup`.
- `src/scene-renderer.js` — seluruh batas Three.js (build, update, POV, viewport, label, picking, `cameraDebug`).
- `src/timeline-engine.js` — `sampleScene`, `sampleCamera`, `formatTime`, `keyIndexAt`, `trimTrackToDuration`, `clampTime`.
- `src/export-service.js` — capability check, MediaRecorder, `dispose()`.
- `docs/DATA-MODEL.md` — kontrak data + strategi waktu keyframe.
- `tests/fixtures/generate.mjs`, `tests/fixtures/baseline.mjs`, `tests/fixtures/v1/*`, `tests/fixtures/baseline/*`.
- `tests/fixtures.test.js`, `tests/migrate.test.js`, `tests/document.test.js`, `tests/migration-browser.mjs`.

**Diubah**

- `src/main.js` — kini murni UI + orkestrasi; tidak lagi mengimpor Three.js. Dokumen dipegang `DocumentStore`, semua perubahan kreatif lewat `persist()` → `EditorSession.commit()` → validasi → simpan. Template HTML tidak diubah sama sekali.
- `package.json` — `test:browser` menambahkan `tests/migration-browser.mjs`.
- `plan.md` — centang F0-08–F0-10 dan F1-01–F1-09 + 11 baris log pelaksanaan.

**Tidak disentuh:** `src/model.js`, `src/history.js`, `src/spatial.js`, `src/style.css`, `index.html`, ketiga browser test lama, dan seluruh pekerjaan F5-01 milik agent lain (`docs/SPIKE-ENCODER.md`, `tests/spike/`).

## Keputusan & asumsi

1. **Bentuk v2.** `Project → Scene → Shot`. Identitas aktor dan set milik scene; `duration`, `fps`, `aspectRatio`, kamera dan `tracks` milik shot. R1 memakai satu scene (`Scene 01`) dan satu shot (`Shot 01`) sehingga R2 tidak perlu memindahkan ownership.
2. **Scene view sebagai jembatan.** Editor tidak mengedit dokumen langsung; ia mengedit proyeksi v1-shaped `{title,duration,actors,rooms,camera}` dari scene+shot aktif, lalu `flush` menulisnya kembali. Ini yang membuat refactor besar tidak menyentuh ribuan baris UI dan sekaligus menjamin scene lain tidak mungkin termutasi.
3. **`updatedAt` distempel saat menyimpan, bukan saat mengedit.** Kalau distempel saat mengedit, setiap snapshot berbeda dan history akan penuh langkah kosong sehingga undo terasa "tidak melakukan apa-apa". Konsekuensi: `updatedAt` di memori bisa tertinggal dari yang di storage — dicatat di `docs/DATA-MODEL.md` §2.
4. **Scope undo per `doc.id`.** Membuka proyek berbeda memakai stack undo sendiri. Mengimpor berkas dari proyek yang sama (kasus tombol Simpan → Buka) tetap satu langkah undo, sehingga perilaku R0 terjaga.
5. **Ekspor menyimpan dokumen v2**, bukan v1. Impor menerima v1 dan v2. Impor v2 mempertahankan seluruh ID sehingga simpan→buka menghasilkan dokumen identik.
6. **Validasi pada setiap commit.** Bila sebuah perubahan menghasilkan dokumen tidak valid, dokumen dikembalikan ke snapshot valid terakhir dan pengguna diberi tahu — bukan dibiarkan setengah jadi.
7. **`schemaVersion` lebih baru = read-only.** Dokumen tidak dibuka, tidak ditimpa, dan penyimpanan otomatis dimatikan selama sesi itu.
8. **Tidak ada dependency baru.**

## Hasil verifikasi

Lingkungan: macOS 26.2 (Darwin 25.2.0, arm64), Node v22.21.1, Chrome 152.0.7977.76 (`channel:'chrome'`, headless), Vite 7, dev server `--port 5174 --strictPort`.

- `npm test` — **41/41 lulus** (sebelumnya 16). Tambahan: 4 test fixture, 9 test migrasi, 16 test document/commands/storage/timeline; test lama tidak diubah.
- `npm run build` — lulus (`index` 90.00 kB gzip 29.25 kB, `three` 494.50 kB gzip 125.32 kB).
- `node tests/browser-smoke.mjs` — PASS.
- `node tests/editor-regression.mjs` — PASS.
- `node tests/walk-doors-delete.mjs` — PASS.
- `node tests/migration-browser.mjs` — PASS (baru).

Ketiga browser test lama lulus **tanpa perubahan satu baris pun**, jadi bukti bahwa perilaku R0 (undo/redo, lock, hide, picking aman, yaw independen, rekaman, pintu, kamera null, ekspor) tidak berubah setelah refactor.

Baseline F0-10 dijalankan **sebelum** refactor Fase 1 (unit 16/16, build, 3 browser test) dan diulang setelahnya, sehingga kesetaraan bukan asumsi.

## Yang belum selesai / batas kesimpulan

- **Bukan** bagian Fase 1 dan memang belum ada: IndexedDB, autosave transaksional, snapshot recovery, isolasi antartab, dashboard, multi-scene/shot di UI. Struktur data sudah menampung banyak scene/shot, tetapi editor masih hanya menampilkan scene+shot pertama.
- `SessionState` (scene/shot terakhir, playhead, seleksi, pose observer) belum disimpan; itu F2-06.
- `Asset`, `Revision`, `ExportJob` baru berupa kontrak tertulis, belum ada implementasi.
- `EditorSession.run`/`runBulk` sudah dipakai untuk pemendekan durasi (daftar item terkunci yang dilewati) dan diuji, tetapi belum semua handler UI dipindahkan ke bentuk command eksplisit — jalur `persist()` sudah menyatukan validasi dan history, jadi tidak ada perubahan kreatif yang lolos.
- Ekspor masih MediaRecorder real-time. Frame count belum deterministik; itu Fase 5 (spike F5-01 sudah selesai oleh agent lain).
- Pengujian hanya pada satu mesin dan satu browser (Chrome). Safari/Firefox, uji beban 20 aktor/500 keyframe, dan aksesibilitas belum diuji.

## Cara melanjutkan (Fase 2)

1. `src/storage.js` adalah satu-satunya tempat yang menyentuh `localStorage`. Ganti isinya dengan `ProjectRepository` IndexedDB (F2-01); antarmuka `loadDocument()/saveDocument(doc)` sudah cukup sempit untuk ditukar.
2. Migrasi localStorage → repository (F2-02): `openProjectData` sudah menangani v1 dan v2, jadi yang perlu ditambahkan hanya penanda migrasi supaya tidak membuat proyek duplikat.
3. Autosave (F2-03) menggantikan `saveNow()` di `src/main.js`; titik pemanggilannya sudah tunggal (`persist()`).
4. `DocumentStore.activate(sceneId, shotId)` sudah menulis balik scene sebelumnya sebelum berpindah — dipakai Fase 3 untuk UI banyak scene tanpa perubahan struktur.

## Risiko / catatan untuk fase berikutnya

- **Urutan kunci JSON penting.** `writeSceneView` dan `migrateV1ToV2` sengaja membangun objek dengan urutan field yang sama supaya `flush` tanpa perubahan menghasilkan JSON identik dan tidak membuat langkah undo palsu. Ada test yang menjaga ini (`read/write scene view stabil`); jangan hapus.
- Validator mewajibkan setiap aktor punya track pose minimal satu keyframe. Fitur baru yang membuat aktor tanpa keyframe akan ditolak — sengaja, agar tidak ada objek yatim.
- `docs/AUDIT.md` masih menyebut jumlah tes lama (12/16) dan struktur single-key localStorage; perlu diperbarui saat Fase 2 mengganti penyimpanan.
- `artifacts/` tidak masuk git (`.gitignore`), jadi screenshot/ekspor adalah bukti lokal sekali jalan, bukan artefak permanen.

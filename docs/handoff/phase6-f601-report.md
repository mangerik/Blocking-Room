# Laporan Fase 6 — F6-01 (perangkat referensi + fixture beban) — 2026-09-08

## Status task

| Task | Status (selesai / sebagian / belum) | Bukti |
|---|---|---|
| F6-01 · Tentukan perangkat/browser referensi | Selesai | `docs/PERF-BASELINE.md` §1–§2: Apple M5 10-core / 16 GiB / macOS 26.2 (25C56) / Chrome 152.0.7977.76 / Playwright 1.63.0 `channel:'chrome'` / Node v22.21.1 / Vite 7.3.6 / Three 0.180.0. GPU terprobe `ANGLE (Apple, ANGLE Metal Renderer: Apple M5)` pada headless maupun headed. Resolusi uji 1280×720, `deviceScaleFactor` 1 |
| F6-01 · Fixture beban 20 aktor / 10 ruang / 500 keyframe | Selesai | `tests/fixtures/load/generate.mjs` → `tests/fixtures/load/load-20a-10r-500k.json` (97 088 B). Diverifikasi `tests/load-fixtures.test.js` |
| F6-01 · Fixture dashboard 100 proyek (untuk F6-03) | Selesai | `tests/fixtures/load/projects-100.json` (2 355 943 B ≈ 2,25 MB, batas 5 000 000 B) |
| F6-01 · Catat kondisi pengukuran + definisi metrik | Selesai | `docs/PERF-BASELINE.md` §2 (kondisi), §4 (definisi p95 input→viewport, frame-time, fps, dropped frames, buka proyek, dashboard, memori), §5 (cara menjalankan), §6 (tabel Baseline/Target/Hasil masih kosong) |
| F6-01 · Perbarui plan.md | Selesai | `plan.md` baris 163 dicentang `[x]`, baris log baru pada tabel "Log pelaksanaan" |
| F6-02 / F6-03 (pengukuran) | Belum — di luar scope F6-01 | Tabel §6 `docs/PERF-BASELINE.md` sengaja kosong |

## Perubahan file

- `tests/fixtures/load/generate.mjs` — **baru.** Generator deterministik tanpa dependency (PRNG mulberry32, seed tetap `20260908` / `611002`, semua nilai dibulatkan: waktu ke grid 0,1 s, koordinat ke 1 mm). Mengekspor `LOAD_SPEC`, `CORPUS_SPEC`, `actorKeyCounts()`, `buildLoadDocument()`, `buildProjectCorpus()`, `serializeLoad()`, `serializeCorpus()` supaya test bisa membandingkan file tersimpan dengan hasil generator. Menulis file hanya bila dijalankan langsung.
- `tests/fixtures/load/load-20a-10r-500k.json` — **baru.** Dokumen schema v2: 1 scene, 1 shot 60 detik/24 fps/16:9, 20 aktor, 10 ruang, 500 keyframe, kamera bertarget aktor pertama.
- `tests/fixtures/load/projects-100.json` — **baru.** Array 100 dokumen v2 ringkas (compact JSON), 1–3 scene per proyek, 1–2 shot per scene, 2–4 aktor, 12–60 keyframe per track, sebagian punya `thumbnailRef`.
- `tests/load-fixtures.test.js` — **baru.** 6 test `node --test`, ikut `npm test`.
- `docs/PERF-BASELINE.md` — **baru.** Perangkat referensi, kondisi pengukuran, deskripsi fixture, definisi metrik, cara menjalankan, tabel hasil kosong, keterbatasan.
- `plan.md` — F6-01 dicentang + satu baris log (edit surgical, tidak menyentuh baris lain).

Tidak ada perubahan pada `src/`, pada `tests/*.mjs` yang sudah ada, atau pada `docs/handoff/phase*-report.md` yang lain. Tidak ada dependency baru.

## Isi fixture beban (angka terverifikasi)

| Properti | Nilai |
|---|---|
| Aktor | 20 (`actor-01`..`actor-20`), tinggi 1,55–1,95 m |
| Ruang | 10 (`room-01`..`room-10`), 5 berpintu, 1 di antaranya berpintu ganda (back + left) |
| Keyframe total | **500** = 460 aktor (`x`,`z`,`r`) + 40 kamera (`x`,`y`,`z`,`tx`,`ty`,`tz`) |
| Keyframe per aktor | 19–27 (basis 23 ± delta berpasangan, jumlah dikunci tepat 460) |
| Durasi shot | 60 detik (untuk uji playback 60 s pada F6-02) |
| Kamera | `focal 35`, `targetId = actor-01` |
| Objek terkunci | 11 (9 ruang + 2 aktor) |
| Objek tersembunyi | 3 (1 ruang + 2 aktor) |
| Ukuran file | 97 088 B (pretty-print, supaya bisa diperiksa manual) |

## Keputusan & asumsi

- **Determinisme.** PRNG mulberry32 hanya memakai operasi integer 32-bit, jadi hasilnya sama di semua platform/versi Node. Semua nilai dibulatkan sebelum ditulis. Dibuktikan: menjalankan generator dua kali menghasilkan SHA-256 identik, dan `tests/load-fixtures.test.js` membandingkan teks file dengan hasil `buildLoadDocument()`/`buildProjectCorpus()`.
- **Timestamp tetap** (`createdAt` 2026-01-05, `updatedAt` 2026-02-18) supaya fixture tidak berubah hanya karena tanggal jalan.
- **Waktu keyframe.** Titik membentang penuh 0..durasi dengan jitter maksimum 30% jarak antar titik, sehingga waktu selalu unik dan menaik pada grid 0,1 s (`docs/DATA-MODEL.md` §5). Generator melempar error bila jarak antar keyframe < 0,4 s — pengaman agar profil beban baru tidak diam-diam menghasilkan waktu bertabrakan.
- **Format serialisasi.** `load-20a-10r-500k.json` pretty-print (fixture kecil, sering dibaca manusia); `projects-100.json` compact karena yang diuji adalah besar payload tersimpan, bukan keterbacaan.
- **Ukuran korpus dashboard.** 2,25 MB dipilih sebagai korpus realistis di bawah plafon 5 MB, bukan tepat di plafon — plafon PRD berlaku per proyek, bukan per korpus.
- **Fixture tidak mengukur performa.** `tests/load-fixtures.test.js` hanya mengunci bentuk fixture dan determinisme sampling; tidak ada assertion waktu, supaya suite tidak flaky di CI/mesin lain.
- **Angka PRD adalah target.** Ditegaskan di kepala `docs/PERF-BASELINE.md` dan di §6; kolom Baseline/Hasil dibiarkan kosong.

## Apakah `LIMITS` schema cukup?

**Cukup — `src/schema.js` tidak perlu diubah untuk F6-01.** Margin pada fixture beban:

| Batas | Dipakai fixture | `LIMITS` |
|---|---|---|
| `actors` | 20 | 50 |
| `setObjects` | 10 | 30 |
| `keys` (per track) | maks 27 | 2400 |
| `doors` | maks 2 | 2 (pas) |
| `duration` | 60 s | 1–120 |
| `roomSpan` / `roomHeight` | 6–14 m / 2,8–4 m | 1–40 / 1–10 |
| `roomOrigin` | ±36 / ±8 | ±100 |
| `coordinate` (keyframe) | ±70 | ±1000 |
| `scenes` (korpus) | maks 3 | 200 |

**Satu konflik yang perlu keputusan (tidak diubah di sini, hanya diusulkan):**
`LIMITS.documentBytes = 3_000_000` sedangkan PRD §9 menargetkan "buka proyek p95 ≤2 detik untuk proyek metadata **≤5 MB** tanpa aset". Dokumen 5 MB melewati batas internal 3 MB. Saat ini `documentBytes` **belum dipakai** oleh `validateDocument` (nilai deklaratif saja), jadi belum ada penolakan nyata — tapi definisi "proyek ≤5 MB" jadi ambigu.
**Usulan:** naikkan `LIMITS.documentBytes` menjadi `5_000_000` agar sejajar dengan PRD, atau turunkan target PRD menjadi 3 MB. Putuskan sebelum F6-03 diukur. Dicatat juga di `docs/PERF-BASELINE.md` §3 dan §7.

Catatan sekunder: `LIMITS.doors = 2` terpakai penuh oleh ruang berpintu ganda. Bukan masalah untuk R1, tapi bila kelak butuh ruang dengan >2 bukaan, batas ini yang pertama menabrak.

## Hasil verifikasi

- `npm test`: **lulus, 47/47** (41 sebelumnya + 6 test baru `tests/load-fixtures.test.js`).
- `npm run build`: **lulus** (Vite 7.3.6).
- Determinisme generator: dijalankan dua kali, SHA-256 kedua file identik
  (`load-20a-10r-500k.json` `11a6e42e…`, `projects-100.json` `9a20815f…`).
- `validateDocument`: lulus untuk fixture beban dan untuk 100 dokumen korpus (dicek di generator saat menulis dan di test).
- Probe GPU Playwright (headless dan headed): `ANGLE (Apple, ANGLE Metal Renderer: Apple M5)`, `WebGL 2.0`, `devicePixelRatio` 1, `hardwareConcurrency` 10.
- Browser test (`npm run test:browser`) **tidak dijalankan**: F6-01 tidak menyentuh `src/` maupun UI, dan agent Fase 2 sedang bekerja paralel di `src/` sehingga dev server bersama berisiko memberi hasil yang menyesatkan.
- **Tidak ada commit.**

## Yang belum selesai / cara melanjutkan

F6-01 selesai penuh. Untuk task berikutnya:

1. **F6-02** — buat harness pengukuran Playwright (mis. `tests/perf/interaction.mjs` dan `tests/perf/playback.mjs`), headed, viewport 1280×720, flag `--enable-webgl --ignore-gpu-blocklist`. Muat `tests/fixtures/load/load-20a-10r-500k.json` ke dalam repository/localStorage aplikasi lalu buka proyeknya. Ikuti definisi metrik `docs/PERF-BASELINE.md` §4.1–§4.3 (p95 = `sorted[Math.ceil(0.95*n)-1]`, minimal 200 sampel input; dropped frame = frame-time > 1,5 × budget refresh). Isi tabel §6 baris F6-02 lengkap dengan tanggal, commit SHA, mode dan perangkat.
2. **F6-03** — muat `tests/fixtures/load/projects-100.json` sebagai isi `ProjectRepository` (menunggu F2-01 dari agent paralel). Instrumentasi repository untuk membuktikan **0 scene** dibaca saat dashboard tampil. Ikuti §4.4–§4.6.
3. **Sebelum F6-03**: selesaikan keputusan `LIMITS.documentBytes` 3 MB vs target PRD 5 MB (lihat di atas). Bila dinaikkan, `src/schema.js` dan `docs/DATA-MODEL.md` perlu diselaraskan — bukan pekerjaan F6-01.
4. **Sebelum gate R1 (F6-08)**: ulangi F6-02/F6-03 pada perangkat kelas PRD (8 GB RAM, GPU terintegrasi) dan catat sebagai baris terpisah. Angka dari Apple M5 adalah batas atas optimistis.

## Risiko / catatan untuk fase berikutnya

- **Perangkat referensi jauh lebih kuat daripada kelas PRD** (M5 / 16 GiB vs "laptop 8 GB, GPU terintegrasi"). Risiko terbesar F6-02/F6-03: target terlihat terpenuhi padahal tidak terpenuhi pada perangkat sasaran. Selalu tulis perangkat pada setiap baris hasil.
- **Fixture beban hanya 1 scene / 1 shot.** Bottleneck di jalur `DocumentStore.activate()` (perpindahan shot/scene) tidak terwakili. Bila F6-02 menemukan biaya di sana, perlu fixture multi-shot tambahan.
- **Korpus dashboard tidak menguji "satu proyek metadata 5 MB".** Skenario itu butuh fixture tersendiri dan keputusan `documentBytes` lebih dahulu.
- **Ketergantungan urutan:** F6-03 baru bisa dijalankan setelah `ProjectRepository` (F2-01) dan dashboard (Fase 3) ada. Fixture sudah siap sekarang sehingga tidak menghambat.
- `src/` sedang diubah agent Fase 2 secara paralel. Test baru hanya mengimpor `validateDocument`/`LIMITS` (`src/schema.js`), `readSceneView` (`src/document.js`) dan `sampleScene` (`src/timeline-engine.js`) — bila salah satu kontrak itu berubah, `tests/load-fixtures.test.js` yang pertama gagal.

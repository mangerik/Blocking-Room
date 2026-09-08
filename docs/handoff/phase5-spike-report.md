# Laporan Fase 5 (F5-01 spike encoder) — 2026-09-08

## Status task

| Task | Status (selesai / sebagian / belum) | Bukti |
|---|---|---|
| F5-01 · spike encoder | Selesai | `docs/SPIKE-ENCODER.md`; probe `tests/spike/encoder-probe.mjs` + `tests/spike/encoder-probe.html`; `artifacts/encoder-probe.json`, `artifacts/encoder-probe-headed.json`, `artifacts/encoder-probe-webcodecs.webm`; `ffprobe` atas file hasil: vp9 1280×720 `30/1`, `nb_read_frames=300`, `duration=10.000000` |
| F5-02 … F5-08 | Belum | di luar penugasan agent ini |
| Keputusan D-04 | Usulan tercatat, belum diputuskan | `plan.md` tabel "Keputusan yang perlu dicatat" D-04 + `docs/SPIKE-ENCODER.md` §11 |

## Perubahan file

- `tests/spike/encoder-probe.html` (baru) — halaman probe statis: `VideoEncoder.isConfigSupported`
  (13 codec × 2 resolusi × 3 fps), probe `hardwareAcceleration`, `MediaRecorder.isTypeSupported`
  (14 mime), 10 run encode WebCodecs dengan timestamp eksplisit, muxer WebM minimal buatan sendiri
  (~170 baris EBML) + verifikasi playback/seek/decode, dan 5 kasus error runtime.
- `tests/spike/encoder-probe.mjs` (baru) — runner Playwright (`channel:'chrome'`, headless; `PROBE_HEADED=1`
  untuk mode berjendela). Menyajikan halaman lewat server http Node sementara karena WebCodecs butuh
  secure context (`file://` tidak cukup di Chrome). Menulis `artifacts/encoder-probe.json` dan menyimpan
  satu file WebM contoh.
- `docs/SPIKE-ENCODER.md` (baru) — hasil probe, matriks opsi MP4/WebM, evaluasi muxer sendiri vs
  `webm-muxer`/`mp4-muxer`/`mediabunny`, kebutuhan worker/server, memory budget, daftar error runtime,
  rekomendasi D-04, dan sketsa arsitektur `ExportService` untuk F5-04.
- `plan.md` — F5-01 dicentang dengan bukti, baris baru di "Log pelaksanaan", catatan usulan pada D-04.
- `docs/handoff/phase5-spike-report.md` (file ini).

Tidak ada file di `src/` maupun `tests/*.mjs` yang sudah ada yang disentuh. Tidak ada dependency npm baru.

## Keputusan & asumsi

- **Halaman probe disajikan lewat http lokal, bukan `file://`.** Chrome tidak memberi secure context ke
  `file://` sehingga `VideoEncoder` tidak terdefinisi di sana (diverifikasi saat pengembangan probe).
- **Muxer WebM ditulis sendiri di dalam spike** untuk menjawab pertanyaan "layakkah menambah dependency".
  Jawabannya: untuk WebM tidak perlu — ~170 baris cukup dan hasilnya lolos `ffprobe`. Untuk MP4, menulis
  ISO BMFF sendiri tidak dianjurkan; `mp4-muxer` (MIT, unpacked 155,9 KB, tanpa dependency runtime nyata)
  direkomendasikan **hanya bila** D-04 memutuskan MP4 wajib. **Belum di-install**, sesuai instruksi.
- **Bitrate usulan `w × h × fps × 0.12`**, `bitrateMode: 'variable'`, `latencyMode: 'quality'`, keyframe
  tiap 1 detik. Ini asumsi kualitas referensi previs, bukan angka yang diminta pemilik produk.
- **fps dibatasi integer** (24/25/30) pada R2 karena `TimestampScale` milidetik pada muxer WebM tidak cocok
  untuk 29,97/23,976.
- Angka kecepatan yang dicatat adalah **software encoder** — `prefer-hardware` ditolak untuk semua codec
  pada mesin uji, baik headless maupun headed.

## Hasil verifikasi

- `npm test`: **lulus**, 16/16 (tidak ada perubahan pada `src/`).
- `npm run build`: **lulus** (`✓ built in 705ms`).
- Browser tests (`browser-smoke`, `editor-regression`, `walk-doors-delete`): **tidak dijalankan** — agent
  ini tidak mengubah `src/` maupun UI, dan agent lain sedang merefactor `src/` secara paralel sehingga
  menjalankan dev server bisa mengganggu. Orkestrator perlu menjalankannya setelah refactor `src/` selesai.
- Probe encoder: `node tests/spike/encoder-probe.mjs` → lulus, 0 page error, artefak tertulis.
- Verifikasi independen output: `ffprobe -count_frames artifacts/encoder-probe-webcodecs.webm` →
  `codec_name=vp9`, `1280×720`, `r_frame_rate=30/1`, `nb_read_frames=300`, `duration=10.000000`.

## Temuan yang mengubah rencana implementasi

1. **`avc1.42E01E` (Baseline L3.0) GAGAL di 720p30.** Ini codec string yang paling sering disalin dari
   contoh. Pakai `avc1.640028` (High L4.0) untuk ≤1080p. Kegagalan seluruhnya soal level, bukan profil.
2. **Dukungan `MediaRecorder` ≠ dukungan `VideoEncoder`.** `MediaRecorder` menerima
   `video/mp4;codecs=avc1.42E01E` sementara `VideoEncoder` menolaknya di 720p30. Harus ada dua daftar
   kapabilitas terpisah di UI ekspor (EX-01 mensyaratkan "codec yang benar-benar tersedia").
3. **`configure()` dengan codec tak dikenal tidak melempar.** `NotSupportedError: Unsupported codec type.`
   datang **asinkron** ke callback `error`. Try/catch saja tidak cukup — `ExportService` harus membungkus
   error asinkron menjadi Promise reject.
4. **H.264 menolak dimensi ganjil** (1281×721 → `supported: false`), VP9 menerimanya. Bulatkan
   lebar/tinggi ke kelipatan 2.
5. **`isConfigSupported` optimistis** — 7680×4320 VP9 dilaporkan `supported: true`. Tetap tangani
   kegagalan pada `configure`/`encode`.
6. **Server render tidak dibutuhkan.** 300 frame 720p VP9 selesai dalam 777 ms encoder-time di software
   encoder (~12,9× realtime). Worker disarankan untuk kenyamanan UI, bukan untuk kapasitas.
7. **Loop ekspor tidak boleh memakai `requestAnimationFrame`** (berhenti saat tab tidak terlihat). Jalur
   ekspor saat ini di `src/main.js` memakai `play()` real-time + `MediaRecorder`, jadi memang tidak
   deterministik — sesuai catatan PRD dan tetap dipertahankan sebagai fallback berlabel (F5-05).

## Yang belum selesai / cara melanjutkan

F5-01 selesai; tidak berhenti karena batas konteks. Langkah konkret berikutnya:

1. **Keputusan D-04** oleh pemilik produk atas usulan di `plan.md` / `docs/SPIKE-ENCODER.md` §11.
   Satu-satunya konsekuensi teknis dari "MP4 wajib" adalah menambah dependency `mp4-muxer`.
2. **F5-04** — pindahkan prototipe muxer dari `tests/spike/encoder-probe.html` menjadi modul produksi.
   Sarannya tiga file: `src/export/webm-muxer.js` (fungsi murni byte: `vint`, `sizeField`, `el`,
   `muxWebM`; tambahkan SeekHead), `src/export/encoder.js` (pemilihan codec via `isConfigSupported`,
   backpressure `encodeQueueSize > 8`, pembungkus error asinkron), `src/export/export-service.js`
   (orkestrasi job, progress, cancel, penamaan `proyek_scene_shot`). Sketsa lengkap ada di
   `docs/SPIKE-ENCODER.md` §12, termasuk loop frame dan daftar uji yang harus menyertainya.
3. **F5-02** — dialog ekspor harus membaca daftar kapabilitas hasil `isConfigSupported`, bukan daftar
   codec statis, dan menampilkan MP4 sebagai "belum tersedia" selama `mp4-muxer` belum disetujui.
4. **F5-03** — `ExportService.run(job, revisionSnapshot)` harus menerima snapshot immutable; ini
   bergantung pada `Revision` dari Fase 2 (`F2-05`).
5. **F5-07** — jadikan `ffprobe -count_frames` (atau pembacaan `<video>.duration` + seek seperti di probe)
   bagian dari test browser, bukan hanya pemeriksaan manual.

## Risiko / catatan untuk fase berikutnya

- `artifacts/` masuk `.gitignore`, jadi bukti probe **tidak ikut commit**. Siapa pun yang perlu
  memverifikasi harus menjalankan ulang `node tests/spike/encoder-probe.mjs`. Kalau orkestrator ingin
  bukti tersimpan di repo, pindahkan JSON ringkas ke `docs/` secara eksplisit.
- Spike hanya mencakup Chrome 152 di satu Mac arm64. Safari/Firefox belum diukur; F6-05 harus
  mendokumentasikan fallback-nya.
- Muxer prototipe belum menangani audio, SeekHead, B-frame, dan timestamp negatif. Semua itu tidak
  dibutuhkan untuk previs bisu, tetapi jangan diklaim sebagai muxer WebM umum.
- `performance.memory` hanya mengukur heap JS. Memori GPU/encoder tidak terlihat; F6-03 (uji kebocoran
  20× open/close) tetap harus memantau proses, bukan hanya heap JS.
- Ada agent lain yang sedang merefactor `src/`. `docs/SPIKE-ENCODER.md` §12 mengasumsikan batas modul
  `SceneRenderer` / `TimelineEngine` / `ExportService` dari F1-05; kalau nama modul hasil refactor
  berbeda, sesuaikan sketsanya, bukan kontraknya (sampling yang sama untuk preview dan ekspor).

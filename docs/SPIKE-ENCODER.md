# Spike encoder — ekspor deterministik (F5-01)

Status: selesai (riset + bukti probe). Tanggal: 2026-09-08.
Referensi: PRD EX-01, EX-02, §11 "Rendering"; plan.md Fase 5; keputusan D-04.
Bukti mentah: `artifacts/encoder-probe.json` (headless), `artifacts/encoder-probe-headed.json` (headed),
`artifacts/encoder-probe-webcodecs.webm` (contoh output muxer sendiri).
Skrip: `tests/spike/encoder-probe.mjs` + `tests/spike/encoder-probe.html`.

> `artifacts/` masuk `.gitignore`. Jalankan ulang probe dengan `node tests/spike/encoder-probe.mjs`
> (tambahkan `PROBE_HEADED=1` untuk mode berjendela) bila file bukti tidak ada.

## 1. Lingkungan pengukuran

| Item | Nilai |
|---|---|
| Perangkat | macOS (Darwin 25.2.0), arm64, `hardwareConcurrency` 10, `deviceMemory` 16 GB |
| Browser | Google Chrome 152.0.7977.76 (channel `chrome`, dijalankan oleh Playwright) |
| Mode | headless dan headed; hasil kapabilitas identik |
| Halaman | statis, disajikan dari server http lokal (`127.0.0.1`) karena WebCodecs butuh secure context |
| Konten uji | canvas 2D sintetis (latar, lantai, bola bergerak, teks nomor frame, blok noise) |

Catatan penting: `file://` tidak dipakai. Di Chrome, `file://` bukan secure context untuk WebCodecs,
sehingga probe memakai server http kecil dari Node (dibuat dan ditutup oleh skrip probe).

## 2. Hasil probe — `VideoEncoder.isConfigSupported`

66 dari 78 kombinasi (13 codec × 2 resolusi × 3 fps) didukung. Yang gagal semuanya soal **level H.264**,
bukan soal ketersediaan codec:

| Codec string | 1280×720 (24/25/30) | 1920×1080 (24/25/30) | Catatan |
|---|---|---|---|
| `avc1.42E01E` (Baseline L3.0) | tidak | tidak | level 3.0 terlalu rendah untuk 720p30 |
| `avc1.42001F` (Baseline L3.1) | ya | tidak | level 3.1 mentok di 720p30 |
| `avc1.4D401F` (Main L3.1) | ya | tidak | sama |
| `avc1.4D4028` (Main L4.0) | ya | ya | |
| `avc1.640028` (High L4.0) | ya | ya | pilihan H.264 default |
| `avc1.640033` (High L5.1) | ya | ya | |
| `hvc1.1.6.L93.B0` (HEVC) | ya | ya | container/kompatibilitas terbatas, tidak dipakai |
| `vp8` | ya | ya | |
| `vp09.00.10.08` / `.31.08` / `.41.08` (VP9) | ya | ya | level VP9 tidak menolak resolusi di Chrome |
| `av01.0.04M.08` / `.05M.08` (AV1) | ya | ya | |

**Implikasi wajib untuk implementasi:** codec string H.264 harus dipilih dari resolusi/fps, bukan
di-hardcode. `avc1.42E01E` (nilai yang paling sering disalin dari contoh internet) **gagal di 720p30**.
Rekomendasi: pakai `avc1.640028` untuk ≤1080p, `avc1.640033` untuk >1080p, dan tetap panggil
`isConfigSupported` sebelum `configure`.

### Hardware acceleration

`hardwareAcceleration: 'prefer-hardware'` menghasilkan `supported: false` untuk **semua** codec
(H.264, VP8, VP9, AV1) baik headless maupun headed pada mesin ini di bawah automasi Playwright.
`'prefer-software'` dan `'no-preference'` didukung untuk VP8/VP9/AV1. H.264 hanya tersedia lewat
encoder software (OpenH264) — karena itu Baseline L3.0 ditolak.

Keputusan: **jangan pernah meminta `prefer-hardware`**. Pakai `no-preference` (default) supaya Chrome
memilih; kalau minta hardware secara eksplisit, ekspor akan gagal di mesin seperti ini.
Angka kecepatan di bawah karena itu adalah angka *software encoder* — batas bawah yang aman.

## 3. Hasil probe — kecepatan encode (WebCodecs, 60 frame kecuali disebut lain)

Bitrate uji = `w × h × fps × 0.12` (720p30 = 3.32 Mbps, 1080p30 = 7.46 Mbps), `latencyMode: 'quality'`,
keyframe tiap 30 frame.

| Codec | Resolusi | fps | Frame | Chunk | ms/frame | ×realtime | Byte/frame |
|---|---|---|---|---|---|---|---|
| VP9 `vp09.00.31.08` | 1280×720 | 30 | 60 | 60 | 2.78 | 11.98× | 8 020 |
| VP8 | 1280×720 | 30 | 60 | 60 | 2.59 | 12.86× | 13 486 |
| H.264 `avc1.640028` | 1280×720 | 30 | 60 | 60 | 3.00 | 11.13× | 3 742 |
| AV1 `av01.0.04M.08` | 1280×720 | 30 | 60 | 60 | 2.63 | 12.66× | 11 419 |
| VP9 `vp09.00.41.08` | 1920×1080 | 30 | 60 | 60 | 3.28 | 10.15× | 18 827 |
| H.264 `avc1.640028` | 1920×1080 | 30 | 60 | 60 | 4.12 | 8.10× | 6 259 |
| VP9 | 1280×720 | 24 | 60 | 60 | 2.96 | 14.07× | 8 020 |
| VP9 | 1280×720 | 25 | 60 | 60 | 2.67 | 15.01× | 8 020 |
| **VP9 (uji panjang)** | 1280×720 | 30 | **300** | **300** | 2.59 | 12.87× | 7 822 |

Semua run: `chunks == framesSubmitted` (tidak ada frame hilang/digandakan), timestamp monotonik,
jarak antar-timestamp tepat `round(1e6/fps)` µs. Frame terakhir run 300 frame berada di 9 966 667 µs;
9 966 667 + 33 333 = 10 000 000 µs = **tepat 10 detik**.

Angka ×realtime adalah *encode saja*, belum termasuk render Three.js per frame. Anggaran total per frame
untuk render+encode 720p30 masih longgar: encode memakan ~2,6 ms dari ~33 ms.

## 4. Muxer — bukti "tulis sendiri" layak

Probe menyertakan **muxer WebM minimal yang ditulis sendiri** (~170 baris di `encoder-probe.html`):
EBML header → Segment → Info (`TimestampScale` 1 ms, `Duration`) → Tracks (`V_VP9`/`V_VP8`/`V_AV1`,
`PixelWidth/Height`, `DefaultDuration`) → Cluster per keyframe berisi `SimpleBlock` → Cues.

| Codec | Frame | Byte chunk | Byte file | Overhead container | Waktu mux | Durasi terbaca | Seek 50% |
|---|---|---|---|---|---|---|---|
| VP9 | 300 | 2 346 708 | 2 349 237 | **2 529 B (0,11%)** | 3,2 ms | 10,000 s | ok |
| VP8 | 90 | 1 244 667 | 1 245 552 | 885 B | 1,4 ms | 3,000 s | ok |
| AV1 | 90 | 1 070 079 | 1 070 941 | 862 B | 1,0 ms | 3,000 s | ok |

Verifikasi independen dengan `ffprobe` pada `artifacts/encoder-probe-webcodecs.webm`:

```
codec_name=vp9  width=1280  height=720  r_frame_rate=30/1
nb_read_frames=300  format=matroska,webm  duration=10.000000
```

**300 frame tepat, 10,000000 detik, dapat di-seek, dapat di-decode** (probe menggambar frame hasil seek
ke canvas dan memastikan piksel tidak hitam). Ini bukti langsung untuk acceptance criteria EX-02.

### Muxer sendiri vs dependency

| Opsi | Ukuran | Lisensi | Container | Penilaian |
|---|---|---|---|---|
| Muxer WebM sendiri (prototipe di spike ini) | ~170 baris, 0 KB dependency | milik proyek | WebM (VP8/VP9/AV1) | **Terbukti jalan.** Cukup untuk R2. Tidak menangani audio, B-frame, atau MP4 |
| `webm-muxer@5.1.4` | unpacked 147,7 KB (6 file, ESM+UMD+d.ts) | MIT | WebM/Matroska | Dependency runtime hanya paket `@types/*` (tanpa kode runtime). Matang, mendukung audio, streaming target, `FileSystemWritableFileStream` |
| `mp4-muxer@5.2.2` | unpacked 155,9 KB | MIT | MP4 (H.264/HEVC/VP9/AV1) | Satu-satunya jalan praktis ke MP4 tanpa menulis ISO BMFF sendiri |
| `mediabunny@1.55.7` | unpacked 10,4 MB, 286 file | **MPL-2.0** | banyak | Terlalu berat untuk kebutuhan ini; lisensi copyleft-file perlu review |
| Menulis muxer MP4/ISO BMFF sendiri | — | — | MP4 | ftyp/moov/mvhd/trak/mdia/stbl + `avcC` dari `decoderConfig.description` (34–35 byte, sudah terbukti tersedia di probe). Jauh lebih rumit daripada WebM; tidak direkomendasikan untuk R2 |

**Rekomendasi (belum di-install, sesuai instruksi):**
1. **R2 rilis pertama: pakai muxer WebM sendiri.** Sudah terbukti menghasilkan file 300-frame yang lolos
   `ffprobe`, nol dependency, dan kodenya kecil sehingga bisa diuji unit (EBML writer murni fungsi).
2. **Tambahkan `mp4-muxer` (MIT, ~156 KB unpacked) hanya jika D-04 memutuskan MP4 wajib.** Alasan yang
   harus dicatat saat install: menulis ISO BMFF + `stbl`/`stss`/`ctts` sendiri jauh lebih berisiko
   daripada 156 KB dependency MIT tanpa kode pihak ketiga di runtime-nya.
3. Jangan pakai `mediabunny` (10,4 MB, MPL-2.0) untuk kebutuhan sesempit ini.

## 5. Hasil probe — `MediaRecorder.isTypeSupported`

Didukung di Chrome 152 mac ini:

```
video/webm                      video/mp4
video/webm;codecs=vp8           video/mp4;codecs=avc1.42E01E
video/webm;codecs=vp9           video/mp4;codecs=avc1.640028
video/webm;codecs=vp9,opus      video/mp4;codecs=avc1.42E01E,mp4a.40.2
video/webm;codecs=av01          video/mp4;codecs=av01.0.04M.08
video/webm;codecs=h264          video/mp4;codecs=hvc1.1.6.L93.B0
video/x-matroska;codecs=avc1
```

Tidak didukung: `video/mp4;codecs=vp09.00.10.08`.

Menarik: `MediaRecorder` menerima `video/mp4;codecs=avc1.42E01E` walaupun `VideoEncoder` menolak
`avc1.42E01E` di 720p30 — MediaRecorder menaikkan level sendiri. Artinya **dukungan MediaRecorder tidak
boleh dipakai untuk menyimpulkan dukungan WebCodecs**, dan sebaliknya. Dua daftar kapabilitas terpisah.

Kondisi saat ini di `src/main.js`: ekspor memakai `povRenderer.domElement.captureStream(30)` +
`MediaRecorder` dengan urutan mime `vp9 → vp8 → mp4 → webm`, `videoBitsPerSecond: 6_000_000`, dan
`recorder.start(250)` sambil memutar timeline secara real-time. Ini **tidak deterministik**: jumlah frame
bergantung pada beban render dan throttling tab. Ini tetap dipertahankan sebagai fallback (F5-05).

## 6. Alternatif offline: `captureStream(0)` + `requestFrame()`

Probe memastikan `HTMLCanvasElement.captureStream` ada dan track hasilnya punya `requestFrame()`
(`frameRate: 0` pada `getSettings()`), jadi pacing manual secara teknis mungkin.

Penilaian: **tidak dipakai sebagai jalur utama.** `MediaRecorder` tetap merekam terhadap waktu wall-clock;
`requestFrame()` mengontrol kapan frame masuk stream, tetapi timestamp media tetap ditentukan oleh
recorder, sehingga file hasilnya bisa VFR dan jumlah frame tidak dijamin. WebCodecs dengan timestamp
eksplisit memberikan jaminan yang dibutuhkan EX-02, dan sudah terbukti di §4. `requestFrame()` hanya layak
dipertimbangkan sebagai fallback tingkat dua bila WebCodecs ada tetapi muxer gagal — kasus yang tidak ada.

## 7. Kebutuhan worker / server

- `VideoEncoder`, `VideoFrame`, dan `OffscreenCanvas` **tersedia di dalam Worker** (dikonfirmasi probe:
  `{"ve":true,"vf":true,"oc":true}`).
- **Server tidak dibutuhkan.** Encode 300 frame 720p VP9 selesai dalam 777 ms encoder-time di software
  encoder. Bahkan shot 60 detik 1080p30 (1800 frame) diperkirakan ~6 detik encode. Biaya/privasi render
  server tidak sebanding; tetap local-first sesuai D-01.
- **Worker tetap disarankan, tetapi bukan untuk R2 awal.** WebGL context Three.js ada di main thread, jadi
  frame harus di-render di main thread. Yang bisa dipindah ke worker hanyalah `VideoEncoder` + muxer,
  dengan transfer `VideoFrame` (transferable). Manfaatnya: UI tidak tersendat saat encode. Ukur dulu; kalau
  encode hanya ~2,6 ms/frame, main thread masih cukup. Rekomendasi: **desain `ExportService` dengan batas
  yang bisa dipindah ke worker** (semua encode/mux di satu modul tanpa sentuhan DOM), tapi implementasi
  awal jalan di main thread.

## 8. Memory budget

Pengukuran (`performance.memory`, heap JS saja):

- Run 300 frame 720p VP9: `usedJSHeapSize` naik ~2,3 MB; limit heap 4,19 GB.
- Buffer chunk hasil encode adalah biaya nyata dan tumbuh linear.

Perkiraan buffer chunk (dari byte/frame terukur, disk & RAM):

| Format | Durasi | Buffer chunk |
|---|---|---|
| 720p30 VP9 | 10 s (300 frame) | 2,3 MB (**terukur**) |
| 720p30 VP9 | 60 s (1800 frame) | ~14 MB |
| 1080p30 VP9 | 60 s (1800 frame) | ~34 MB |
| 1080p30 H.264 | 60 s (1800 frame) | ~11 MB |

Biaya sesaat lain: satu `VideoFrame` RGBA 1280×720 ≈ 3,7 MB; 1920×1080 ≈ 8,3 MB. Dengan backpressure
`encodeQueueSize > 8` (dipakai probe; `maxEncodeQueueSize` tercatat 9), puncaknya ~33 MB (720p) atau
~75 MB (1080p).

**Aturan implementasi:**
- Selalu `frame.close()` segera setelah `encode()`. Probe membuktikan encoder menerima frame yang
  langsung ditutup karena `encode()` mengambil referensi internal.
- Terapkan backpressure: tunggu event `dequeue` bila `encodeQueueSize` melebihi ambang (8 aman).
- Batasi durasi × resolusi di dialog ekspor. Ambang usulan: tolak/peringatkan bila estimasi buffer
  > 512 MB, dan pakai `navigator.storage.estimate()` (probe: quota 4 GB) bila nanti menulis ke OPFS.
- Untuk shot panjang, jalur streaming ke `FileSystemWritableFileStream` (`showSaveFilePicker` tersedia)
  bisa menghapus batas RAM. Simpan sebagai perbaikan susulan, bukan syarat R2.

## 9. Error runtime yang harus ditangani

Diverifikasi langsung di probe:

| Kasus | Perilaku Chrome | Penanganan wajib |
|---|---|---|
| `configure()` dengan `width: 0` | **melempar sinkron** `TypeError: Invalid size…` | validasi dimensi sebelum configure |
| `configure()` dengan codec tak dikenal (`bogus.1`) | **tidak melempar**; `NotSupportedError: Unsupported codec type.` datang **asinkron** ke callback `error` | wajib pasang callback `error` dan janji yang reject; jangan andalkan try/catch saja |
| `isConfigSupported` codec tak dikenal | `supported: false` (tidak melempar) | gate utama pemilihan codec |
| `encode()` setelah `close()` | `InvalidStateError: Cannot call 'encode' on a closed codec.` | cek `encoder.state === 'configured'` setiap frame; batalkan loop saat cancel |
| `encode()` dengan `VideoFrame` yang sudah ditutup | `TypeError: Cannot encode closed input.` | urutan ketat: buat frame → encode → close |
| `new VideoFrame(canvas 0×0)` | `InvalidStateError` | jangan render sebelum kanvas punya ukuran |
| Dimensi ganjil (1281×721) untuk `avc1.640028` | `supported: false` (VP9 justru `true`) | **bulatkan lebar/tinggi ke kelipatan 2** untuk H.264; kelipatan 16 lebih aman |
| `isConfigSupported` 7680×4320 VP9 | `supported: true` | `isConfigSupported` optimistis; kegagalan nyata tetap bisa muncul saat `configure`/`encode`. Tangani kedua tahap |

Selain itu, harus ditangani di level `ExportService`:
- WebGL context loss di tengah job (`webglcontextlost` pada kanvas POV) → batalkan job dengan pesan jelas.
- Kamera dihapus / shot tanpa kamera → tolak sebelum job dimulai (sudah ada di `src/main.js`).
- Tab disembunyikan: `requestAnimationFrame` berhenti. Loop ekspor **tidak boleh** memakai rAF; pakai loop
  `await`-based sehingga ekspor jalan meski tab tidak terlihat.
- Cancel: `encoder.close()` + buang buffer chunk + revoke object URL + hentikan track `captureStream`
  (jalur fallback).
- Kuota memori habis saat merakit `Blob` → tangkap `RangeError`/`QuotaExceededError`, sarankan resolusi
  atau durasi lebih kecil.

## 10. Matriks opsi MP4 / WebM

| Jalur | Deterministik | Ketersediaan Chrome 152 mac | Dependency | Kompatibilitas pemutar | Penilaian |
|---|---|---|---|---|---|
| WebCodecs VP9 + muxer WebM sendiri | **ya** | ya | tidak ada | Chrome/Edge/Firefox, VLC, DaVinci Resolve (WebM VP9), Premiere lewat plugin | **Default R2** |
| WebCodecs VP8 + muxer sendiri | ya | ya | tidak ada | lebih luas dari VP9, kualitas/bitrate lebih buruk | fallback bila VP9 tidak didukung |
| WebCodecs AV1 + muxer sendiri | ya | ya | tidak ada | dukungan NLE masih terbatas | opsional, jangan default |
| WebCodecs H.264 + `mp4-muxer` | ya | ya (`avc1.640028`) | `mp4-muxer` MIT ~156 KB | **terbaik** (QuickTime, Premiere, Resolve, WhatsApp) | pilihan bila MP4 diputuskan wajib |
| WebCodecs H.264 + muxer MP4 sendiri | ya | ya | tidak ada | sama | risiko tinggi; tidak untuk R2 |
| `MediaRecorder` `video/mp4;codecs=avc1` | **tidak** | ya | tidak ada | terbaik | fallback real-time berlabel |
| `MediaRecorder` `video/webm;codecs=vp9` | **tidak** | ya | tidak ada | baik | fallback saat ini di `src/main.js` |
| `captureStream(0)` + `requestFrame` | tidak dijamin | ya | tidak ada | sama dengan MediaRecorder | tidak dipakai |
| Render server/worker eksternal | ya | — | infra | — | tidak dibutuhkan (lihat §7) |

## 11. Rekomendasi keputusan D-04

Usulan untuk dicatat sebagai keputusan (asumsi tertulis, boleh direvisi pemilik produk):

1. **fps target: 30 default**, pilihan 24 dan 25 tersedia. Ketiganya terbukti didukung dan menghasilkan
   jarak timestamp eksak. Simpan `fps` di `Shot` (PRD §11 sudah menyediakan field). Angka fps harus
   integer supaya `round(1e6/fps)` bebas drift; jangan tawarkan 29,97/23,976 pada R2 — TimestampScale
   milidetik pada muxer WebM tidak cocok untuk fps non-integer.
2. **Resolusi target: 1280×720 default**, opsi 1920×1080. Keduanya lolos untuk VP9/VP8/AV1/H.264 High.
   Semua dimensi dibulatkan ke kelipatan 2 (H.264 menolak dimensi ganjil).
3. **Format default: WebM/VP9 lewat WebCodecs + muxer WebM sendiri.** Terbukti: 300 frame, 10,000000 s,
   seekable, lolos `ffprobe`, tanpa dependency baru.
4. **MP4/H.264 (`avc1.640028`) disediakan bila tersedia**, tetapi hanya setelah `mp4-muxer` disetujui
   sebagai dependency. Sampai itu diputuskan, dialog ekspor menampilkan MP4 sebagai "belum tersedia",
   bukan menjanjikannya.
5. **`MediaRecorder` real-time dipertahankan sebagai fallback berlabel** ("Rekaman real-time — jumlah
   frame tidak dijamin"). Fallback ini **tidak** boleh dihitung memenuhi gate deterministik R2 (F5-05).
6. **MP4 tidak wajib untuk R2.** Bila pemilik produk menyatakan MP4 wajib, dependency `mp4-muxer` (MIT)
   disetujui pada saat yang sama; itu satu-satunya konsekuensi teknisnya.
7. **Jangan meminta `prefer-hardware`.** Bukti: seluruh codec menolak `prefer-hardware` di mesin ini.

Bitrate usulan: `width × height × fps × 0.12` (720p30 ≈ 3,3 Mbps; 1080p30 ≈ 7,5 Mbps), `bitrateMode:
'variable'`, `latencyMode: 'quality'`, keyframe tiap 1 detik (`fps` frame) supaya seek per detik enak
dipakai saat review.

## 12. Sketsa arsitektur `ExportService` (untuk F5-04)

Kontrak: **satu fungsi sampling yang sama dipakai preview dan ekspor** (F1-05) — pada refactor yang sedang
berjalan ini adalah `sampleScene`/`sampleCamera` di `src/timeline-engine.js`. Ekspor tidak membaca DOM
dan tidak memakai `requestAnimationFrame`.

```text
ExportJob { id, projectId, revisionId, shotIds[], settings, status, outputRef? }
settings { width, height, fps, codec, container, bitrate, range:{startFrame,endFrame} }
```

```text
ExportService.run(job, revisionSnapshot)
  │
  ├─ 1. resolve capability
  │     pickCodec(settings) → daftar kandidat sesuai container
  │        WebM: vp09.00.31.08 (≤720p) / vp09.00.41.08 (1080p) → vp8
  │        MP4 : avc1.640028 (≤1080p) / avc1.640033
  │     for kandidat: await VideoEncoder.isConfigSupported(cfg) → pakai yang pertama supported
  │     kalau tidak ada → tawarkan fallback MediaRecorder berlabel, atau gagal dengan pesan jelas
  │
  ├─ 2. siapkan sumber deterministik
  │     scene = SceneRenderer.fromSnapshot(revisionSnapshot)   // immutable, F5-03
  │     totalFrames = round(shot.duration * fps)               // 10 s × 30 = 300
  │
  ├─ 3. siapkan encoder + muxer
  │     muxer  = createWebMMuxer({width,height,fps,codec})     // atau Mp4Muxer bila MP4
  │     encoder = new VideoEncoder({
  │        output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
  │        error : (e) => job.fail(e)                          // NotSupportedError datang di sini
  │     })
  │     encoder.configure(cfg)
  │
  ├─ 4. loop frame (bukan rAF — berjalan walau tab tidak terlihat)
  │     for (let f = 0; f < totalFrames; f++) {
  │        const t = f / fps                                   // detik, eksak
  │        sampleScene(view, t)                                // src/timeline-engine.js, identik preview
  │        SceneRenderer.renderPOV(scene)                      // menggambar ke kanvas ekspor
  │        const frame = new VideoFrame(canvas, {
  │            timestamp: Math.round(f * 1e6 / fps),           // µs, tidak pernah wall-clock
  │            duration : Math.round(1e6 / fps)
  │        })
  │        encoder.encode(frame, { keyFrame: f % fps === 0 })  // keyframe tiap 1 detik
  │        frame.close()                                       // WAJIB
  │        if (encoder.encodeQueueSize > 8) await onceDequeue(encoder)   // backpressure
  │        if (job.cancelled) { encoder.close(); muxer.discard(); return }
  │        job.progress(f + 1, totalFrames)
  │     }
  │
  ├─ 5. finalize
  │     await encoder.flush()          // semua chunk sudah masuk muxer
  │     encoder.close()
  │     const blob = muxer.finalize()  // menulis Cues + Duration, mengembalikan Blob
  │     assert(muxer.chunkCount === totalFrames)   // gate EX-02
  │
  └─ 6. serah terima
        namaFile = `${proyek}_${scene}_${shot}.${container}`   // EX-01
        download(blob) / simpan sebagai Asset
        selalu (finally): encoder.close() bila state != 'closed',
                          revokeObjectURL, lepas snapshot, stop track fallback
```

Batas modul yang harus dijaga supaya nanti bisa dipindah ke worker:
- `src/export/webm-muxer.js` (modul muxer lokal): fungsi murni byte → tidak menyentuh DOM, mudah diuji unit
  (EBML vint/size encoder punya test sendiri).
- `src/export/encoder.js`: memilih codec, memasang backpressure, membungkus error asinkron menjadi Promise reject.
- `src/export/export-service.js`: orkestrasi job, progress, cancel, retry, penamaan file.
- Yang wajib tetap di main thread untuk sekarang: render Three.js (WebGL context) dan pembuatan
  `VideoFrame` dari kanvas.

Uji yang harus menyertai F5-04/F5-07:
1. `chunkCount === totalFrames` untuk 10 s × 30 fps (=300) dan untuk range parsial.
2. `ffprobe -count_frames` (atau pembacaan `<video>.duration` + seek) atas file hasil.
3. Pose first/middle/last frame sama dengan `sampleScene`/`sampleCamera` (`src/timeline-engine.js`) pada
   `t = 0`, `t = d/2`, `t = d − 1/fps`.
4. Edit scene setelah job mulai tidak mengubah output (F5-03).
5. Cancel di tengah: tidak ada file terunduh, tidak ada encoder yang tertinggal terbuka.
6. Codec failure yang disimulasikan (paksa `isConfigSupported` gagal) → jatuh ke fallback berlabel.

## 13. Batasan spike ini

- Hanya Chrome 152 di satu Mac (arm64). Safari dan Firefox belum diukur; Safari punya WebCodecs tetapi
  set codec dan perilaku `isConfigSupported`-nya berbeda, Firefox baru sebagian. PRD §NFR sudah
  menargetkan Chrome/Edge, jadi ini sesuai scope, tetapi F6-05 harus mendokumentasikan fallback.
- Hardware encoder tidak pernah aktif di bawah automasi; angka kecepatan adalah software encoder
  (batas bawah). Pengguna nyata kemungkinan lebih cepat.
- Muxer WebM di spike ini adalah prototipe: video saja, tanpa audio, tanpa SeekHead, tanpa penanganan
  B-frame/negatif `timestamp`. Untuk produksi tambahkan SeekHead dan uji unit EBML.
- `performance.memory` hanya mengukur heap JS; memori GPU/encoder tidak terlihat di sana.

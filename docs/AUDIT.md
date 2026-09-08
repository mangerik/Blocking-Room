# Audit fungsi dan interaksi — Blocking Room

7 September 2026, **diperbarui 8 September 2026 setelah gate R2 lulus**. Cakupan: review kode lokal, pengujian browser Chrome pada desktop dan pemeriksaan layout 390 px.

Sebagian besar temuan audit ini sudah terselesaikan oleh R1 dan R2; temuan itu dipindahkan ke tabel “Temuan yang sudah terselesaikan” di bawah beserta buktinya, dan tabel “Prioritas produk berikutnya” kini hanya berisi yang **benar-benar tersisa**. Bukti gate: [GATE-R1.md](GATE-R1.md) dan [GATE-R2.md](GATE-R2.md).

## Revisi yang diselesaikan

| Masalah | Penyebab yang ditemukan | Perubahan | Bukti |
|---|---|---|---|
| Tidak ada undo/redo | Mutasi langsung disimpan tanpa history | Snapshot project, 100 langkah, cabang redo, transaksi drag/keyboard/rekam | Unit history dan browser edit/drag/rekam/import undo |
| Lokasi tidak sengaja bergeser | Raycast memilih ruang; klik kosong tetap membuat drag objek aktif | Ruang harus dipilih eksplisit; klik kosong tidak memulai drag; flag lock default pada ruang | Drag pointer nyata pada karakter, ruang kosong, aktor terkunci; pose ruang tidak berubah |
| Arah karakter tidak jelas | Gerak menimpa rotasi; tubuh simetris; tidak ada tool rotasi atau edit POV utama | Yaw independen, R/drag, Q/E, tombol rotasi, hadap kamera, mata dan penanda arah, final view 16:9 | Drag rotasi dan translasi pada final view; keyframe arah tetap setelah perpindahan |
| Mata tidak berfungsi | Ikon statis dalam tombol select | Tombol visibility terpisah; sinkron scene, label, paths, picking, POV dan persistence | Perbedaan gambar POV visible/hidden, status mesh, JSON dan reload |

Keputusan: hide aktor/ruangan berlaku juga pada video. Hide kamera hanya menyembunyikan gizmo/jalur. Lock mencegah edit, tetapi tidak menghentikan animasi yang telah disimpan. Semua flag termasuk perubahan undo.

## Temuan yang sudah terselesaikan

Setiap baris menyebut bukti; tidak ada yang ditandai selesai hanya karena kodenya ada.

| Prioritas asal | Temuan | Diselesaikan oleh | Bukti |
|---|---|---|---|
| P0 | Penyimpanan hanya satu key `blocking-room` di localStorage — tidak ada daftar proyek, isolasi, recovery atau penanganan konflik tab | Fase 2 + Fase 3 | `src/repository.js` (IndexedDB, 5 store, satu transaksi untuk `documents`+`projects`+`revisions`), autosave atomik, ≥10 snapshot recovery, session state, satu writer per proyek, dashboard + tempat sampah 30 hari. `tests/repository-browser.mjs` (termasuk 100 siklus edit/save/reload), `tests/dashboard-browser.mjs` (13 bagian), `docs/GATE-R1.md` §2 |
| P0 | Export memakai MediaRecorder real-time dan waktu animation frame; frame count tergantung perangkat; seek belum dijamin | Fase 5 | Render offline deterministik lewat WebCodecs + muxer WebM buatan sendiri dengan Cues. `ffprobe`: `vp9 1280x720 nb_read_frames=300 duration=10.000000`. MediaRecorder tetap ada tetapi **berlabel** “Real-time (tidak frame-akurat)”. `tests/export-browser.mjs`, `docs/GATE-R2.md` §3 EX-02 |
| P1 | Karakter bergerak langsung melewati ruang; tidak ada pintu | Fase 0.1 + Fase 4b | Bukaan pintu geometris pada dinding kiri/belakang, dinding modular ber-ID (`type: 'wall'`), peringatan lintasan yang memperhitungkan keduanya. `tests/spatial.test.js`, `tests/walk-doors-delete.mjs`, `tests/shot-timeline-browser.mjs` bagian 7 dan 11. **Collision fisik tetap sengaja tidak ada** — lihat prioritas tersisa |
| P1 | Timeline menyimpan seluruh pose pada satu key; belum bisa drag/copy key | Fase 4 + Fase 4b (`schemaVersion: 3`) | Track `position` dan `rotation` terpisah, interpolasi linear/hold/ease per track, frame ruler, snapping, zoom/pan, multi-select, salin/tempel/hapus dengan satu undo dan aturan replace yang terlihat. Kesetaraan gerak lama dibuktikan terhadap golden Fase 0 pada toleransi 1e-9. `tests/timeline-view.test.js`, `tests/migrate.test.js`, `tests/shot-timeline-browser.mjs` |
| P1 | Hanya satu kamera dan satu timeline | Fase 4 | `Project → Scene → Shot`; kamera dan track milik shot, aktor dan set milik scene. Duplicate shot dan perbandingan A/B. Isolasi dibuktikan bertahan melewati undo/redo, reload dan penghapusan shot: `tests/gate-r2-browser.mjs` §3 |
| P1 | Banyak perubahan membangun ulang scene/jalur dan menulis localStorage berulang; belum dibenchmark | Fase 6 (F6-02/F6-03), diukur ulang pada gate R2 | Bottleneck **diukur lebih dahulu**, lalu tiga optimasi: frekuensi save/render UI saat drag, material + geometri jalur dipakai ulang, preview kamera dibatasi 30 fps. Drag p95 49,1 → 11,6 ms, dan tetap 12,5 ms setelah schema v3. Transform incremental **tidak** dikerjakan karena tidak terukur sebagai bottleneck. `docs/PERF-BASELINE.md` §6 dan §8 |
| P1 | Belum ada WebGL context-loss recovery atau dukungan browser teruji | Fase 6 (F6-05) | `webglcontextlost`/`restored` dengan rebuild dari dokumen, layar fallback tanpa WebGL2 yang tidak mengunduh Three.js, deteksi kemampuan terpusat **tanpa sniffing user agent**. `src/capabilities.js`, `src/no-webgl.js`, `tests/capability-browser.mjs`. Matriks `docs/BROWSER-SUPPORT.md` memisahkan “Diuji” dari “Diperkirakan” — Edge/Safari/Firefox masih tersisa |
| P1 | Input properti mudah bercampur playback | Fase 4 (F4-10) | Indikator `#mode-cue` EDIT/PLAY/REKAM/REKAM VIDEO beserta frame aktif; playback dijeda saat fokus inspector. `tests/shot-timeline-browser.mjs` bagian 1 |
| P1 | Touch target mata/gembok kecil di sidebar ponsel | Fase 3 + Fase 6 (F6-04) | Target sentuh ≥44 px pada kontrol inti dan tanpa overflow horizontal pada 390 px, diuji otomatis. Target <44 px turun 57 → 10 pada gate R1. **Tersisa:** penanda keyframe (kini 17 karena schema v3 menggandakan lane) — `docs/A11Y-AUDIT.md` T-01 |
| P2 | Director’s note, camera heading, metadata masih teks contoh | Fase 3 + Fase 4 | Director’s note per scene, nama kamera, nama/catatan/durasi/fps/aspect per shot — semuanya data proyek, bukan teks tetap. `tests/dashboard-browser.mjs` bagian 2, `tests/shots.test.js` |
| P2 | Set decoration ditentukan oleh urutan ruangan | Fase 4b | Blok dekorasi berbasis indeks ruangan **dihapus**; migrasi v2→v3 mengubahnya menjadi 15 prop ber-ID dengan pose dunia identik (diverifikasi dari mesh renderer di browser). `src/migrate.js#legacyDecorProps`, `tests/shot-timeline-browser.mjs` bagian 11 |

## Prioritas produk berikutnya

Yang **benar-benar tersisa** setelah R1 dan R2. Tidak ada baris di sini yang sudah dikerjakan sebagian tanpa disebutkan.

| Prioritas | Temuan/batas nyata | Dampak | Tindakan yang direkomendasikan |
|---|---|---|---|
| **P0** | **Belum ada pengguna nyata.** Seluruh target PRD §11 (keberhasilan tugas, waktu ke video pertama, kembali mengedit, export success) belum terukur | Produk lulus setiap gate teknis tetapi belum pernah diuji oleh orang yang bukan pembuatnya. Ini satu-satunya celah yang tidak dapat ditutup dengan menulis kode | Jalankan pilot F6-10/F6-11. Protokol siap di `docs/PILOT-PROTOCOL.md`; kebutuhannya di `docs/DECISIONS-NEEDED.md` §3 |
| **P0** | Hanya Chrome yang diuji; **Edge belum diuji** padahal PRD §9 menuntutnya | Klaim dukungan browser bertumpu pada deteksi kemampuan, bukan pengujian | Uji Edge secara manual (`docs/BROWSER-SUPPORT.md` §5), lalu ubah barisnya dari “Diperkirakan” menjadi “Diuji”. Safari/Firefox menyusul |
| **P0** | Performa hanya diukur pada Apple M5 / 16 GiB / layar 120 Hz | Margin terhadap target 3,6–8×, tetapi margin bukan pengukuran pada perangkat kelas PRD (8 GB, GPU terintegrasi) | `PERF_LABEL=<perangkat> npm run test:perf` pada perangkat itu, lalu tambahkan barisnya di `docs/PERF-BASELINE.md` §6 |
| **P1** | MP4 belum tersedia; ekspor deterministik hanya WebM/VP9 | Sebagian pipeline hilir dan pemutar menuntut MP4 | Keputusan **D-04** lebih dahulu. Satu-satunya konsekuensi teknis dari “ya” adalah menambah dependency `mp4-muxer` — keputusan kebijakan, bukan teknis (`docs/DECISIONS-NEEDED.md` §2) |
| **P1** | Batch ekspor menghasilkan banyak berkas terpisah | Browser dapat meminta izin “unduh beberapa berkas” | Sudah dimitigasi: unduhan diserialkan berjeda, jumlah berkas disebut sebelum mulai, dan setiap berkas dapat **diunduh ulang** dari dialog. Menggabungkannya menjadi satu berkas per shot menuntut penulis ZIP sendiri — `docs/GATE-R2.md` §7 |
| **P1** | Penanda keyframe 7–10 px, di bawah target sentuh 44 px pada 390 px (17 penanda) | Sulit disentuh pada ponsel; naik dari 10 karena schema v3 menggandakan lane | Perlu desain ulang lane timeline, bukan sekadar memperbesar penanda (akan saling menumpuk). Setiap penanda tetap tombol bernama dan dapat dicapai Tab, dan aksinya tersedia sebagai tombol besar di inspector. `docs/A11Y-AUDIT.md` T-01 |
| **P1** | Aksesibilitas belum diuji dengan pembaca layar; `prefers-reduced-motion` dan zoom 200% belum ditangani | Klaim WCAG 2.2 AA belum dapat dibuat | `docs/A11Y-AUDIT.md` T-03…T-06 |
| **P1** | Buffer chunk ekspor masih di memori | Shot sangat panjang pada 1080p dibatasi RAM | `showSaveFilePicker` + `FileSystemWritableFileStream` untuk streaming ke disk (`docs/SPIKE-ENCODER.md` §8) |
| **P2** | Prop dan dinding modular tidak dapat di-key | Pintu berayun atau meja yang didorong belum bisa dianimasikan | Perlu `track.objectId` yang menunjuk `setObjects` dan penyelarasan lintas shot — perubahan schema tersendiri |
| **P2** | Manekin belum memiliki rig; putaran >360° tidak didukung (D-06) | Video menunjukkan perpindahan blocking, bukan performa tubuh | Import aset tervalidasi lebih dahulu (F8-01), lalu rig (F8-02). Jangan mengakali putaran penuh dengan dua keyframe 0°/360° |
| **P2** | Collision fisik dan auto-routing belum ada — **sengaja** | Peringatan tembus dinding tetap peringatan, bukan penghalang | Pertahankan opsi blocking bebas; ubah hanya bila pilot membuktikan peringatan itu terlewat |
| **P2** | Rename dari dashboard tidak memeriksa kunci writer | Judul lama dapat ditulis kembali oleh tab yang memegang kunci; isi scene tidak terpengaruh | Pakai `projectWriterStatus()` yang sudah ada — `docs/GATE-R2.md` C-07 |

## Verifikasi yang tersedia

Angka di bawah adalah keadaan pada 8 September 2026 (gate R2). Perintahnya ada di
`plan.md` bagian “Verifikasi dan definisi selesai per task”.

- `npm test`: **177** tes unit — sampling per track (linear/hold/ease), clamp waktu, upsert keyframe, validator schema v3, rantai migrasi v1→v2→v3 beserta kesetaraan pose terhadap golden Fase 0, document/command/history, fixture v1 dan fixture beban, repository IndexedDB + autosave + session state + kunci antartab, rute dan operasi dashboard, checksum paket, operasi shot, matematika tampilan timeline, metrik lokal, ekspor rollback v1/v2, dan pipeline ekspor sampai ke byte yang ditulis muxer WebM.
- `npm run build`: bundle produksi Vite; `dashboard` tidak menarik Three.js.
- `npm run test:browser`: **12 suite** Chrome berurutan — `browser-smoke`, `editor-regression`, `walk-doors-delete`, `migration-browser`, `repository-browser`, `dashboard-browser`, `capability-browser`, `a11y-browser`, `shot-timeline-browser`, `gate-r1-browser`, `export-browser`, `gate-r2-browser`. Cakupan per suite: `docs/GATE-R2.md` §2.
- `npm run test:perf`: harness performa F6-02/F6-03; menulis `artifacts/perf-baseline.json` dan **tidak meng-assert target** — angka dan batasnya di `docs/PERF-BASELINE.md` §6.
- `node tests/preview-check.mjs`: verifikasi build produksi lewat server preview; menolak setiap error halaman, error console dan respons HTTP ≥400.
- Untuk gate, `repository-browser` dan `export-browser` dijalankan **3× berturut** dan `npm run test:perf` **3 jalan** — keduanya pernah flaky, dan gate yang flaky tidak dapat dipakai sebagai gate.
- Gambar review dan artefak lain ada di `artifacts/` (diabaikan Git). File artifacts adalah hasil tes lokal sekali jalan, bukan aset produksi maupun bukti permanen; angka yang bertahan ditulis di `docs/PERF-BASELINE.md` dan `docs/A11Y-AUDIT.md`.

## Batas kesimpulan

Tes dilakukan di Chrome lokal pada satu mesin. Yang **tidak** boleh diklaim dari hasil di atas:

- **Sertifikasi WCAG 2.2 AA.** Yang dibuktikan adalah nama aksesibel ada, fokus terlihat, kontras cukup, dan setiap aksi punya padanan keyboard — bukan kepatuhan. Pembaca layar belum diuji.
- **Kompatibilitas semua browser.** Hanya Chrome yang diuji; Edge, Safari dan Firefox diturunkan dari deteksi kemampuan (`docs/BROWSER-SUPPORT.md`).
- **Performa pada perangkat sasaran.** Seluruh angka dari Apple M5 / 16 GiB / layar 120 Hz, bukan dari laptop 8 GB dengan GPU terintegrasi seperti yang disebut PRD §9.
- **Presisi frame ekspor di luar VP9/WebM.** 300 frame / 10,000000 detik dibuktikan untuk VP9; H.264-di-WebM dan AV1 hanya diuji sebagai kapabilitas yang ditawarkan. MP4 tidak ada.
- **Perilaku dengan pengguna nyata.** Belum ada uji pengguna; seluruh target PRD §11 belum terukur.

Yang tetap berlaku sejak audit pertama: riwayat undo bersifat sesi (reload mempertahankan dokumen tetapi menghapus stack undo, dan snapshot recovery adalah mekanisme terpisah yang bertahan), dan penyimpanan browser bukan backup permanen — ekspor paket atau JSON sebelum perubahan besar.

PRD di [PRD.md](PRD.md) menerjemahkan celah ini menjadi scope, acceptance criteria, target terukur, risiko, migrasi dan roadmap. R1 dan R2 kini terimplementasi dan lulus gate ([GATE-R1.md](GATE-R1.md), [GATE-R2.md](GATE-R2.md)); langkah berikutnya adalah pilot, bukan fitur baru — daftar fitur masa depan tidak berarti sudah terpasang di editor.

## Pembaruan: langkah, hapus, pintu

Animasi kaki/tangan kini mengikuti jarak perpindahan karakter. Kamera dapat dihapus menjadi null dan dibuat kembali; delete seluruh jenis item menghormati lock/undo. Dinding kiri/belakang mendukung bukaan geometris dan frame pintu; lintasan melalui bagian dinding solid memunculkan peringatan. Temuan lama tentang ketiadaan pintu/gerak kaki kini sebagian teratasi; collision fisik, rig penuh dan auto-routing belum ada.

Tambahan verifikasi: `tests/spatial.test.js` menguji walk sampling, idle, panel bukaan, validasi ukuran pintu, crossing (kini termasuk segmen dinding modular), dan proyek tanpa kamera. `tests/walk-doors-delete.mjs` menguji aksi UI, empty camera, reload/import, undo, geometri pintu dan ekspor. Jumlah tes unit saat catatan ini pertama ditulis adalah 12; per gate R2 jumlahnya **177** (lihat “Verifikasi yang tersedia”).

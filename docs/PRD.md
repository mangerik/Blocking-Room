# PRD — Blocking Room

Versi 1.1 · 7 September 2026 · Status: draft implementasi untuk rilis berikutnya

Dokumen ini membedakan fitur yang sudah berjalan, kebutuhan rilis berikutnya, dan eksplorasi masa depan. Prioritas dan target di bawah adalah usulan untuk divalidasi bersama pemilik produk; bukan klaim hasil pengukuran atau komitmen tanggal.

> **Catatan status (8 September 2026), bukan perubahan requirement.** Kalimat asli revisi ini berbunyi “sistem banyak proyek belum diimplementasikan pada revisi ini”. Sejak itu R1 **dan** R2 sudah terimplementasi dan lulus gate: banyak proyek, banyak scene, banyak shot, timeline per properti, props/dinding modular, dan ekspor deterministik. Requirement pada §8 dan target pada §9/§11 **tidak diubah**; status implementasinya dicatat terpisah pada bagian “Pembaruan implementasi berikutnya” di akhir dokumen, beserta daftar eksplisit apa yang **belum** diverifikasi karena menunggu pilot.

## 1. Ringkasan

**Masalah:** pembuat film perlu menjelaskan posisi karakter, arah hadap, jalur gerak, dan framing kamera sebelum syuting. Sketsa statis tidak menunjukkan hubungan ruang dan waktu. Editor yang mudah salah memilih objek, kehilangan perubahan, atau tidak memiliki pengelolaan proyek menghambat eksperimen blocking.

**Solusi:** studio previs di browser dengan alur **Proyek → Scene → Shot → Blocking → Preview → Video referensi**. Interaksi harus dapat dibatalkan, objek penting dapat dikunci, dan hasil preview harus sesuai dengan ekspor.

**Nilai produk:** mengurangi waktu menjelaskan blocking kepada tim, menyimpan alternatif shot, dan menghasilkan referensi gerakan yang dapat dipakai saat syuting atau sebagai input proses kreatif berikutnya.

**Jenis rilis:** iterasi menuju MVP produksi untuk kreator individu. Bukan mesin render film fotorealistik.

## 2. Konteks dan kondisi sekarang

Target pengguna dari brief: pembuat film yang menyusun adegan dan gerak kamera. Referensi visual: denah ruangan 3D, karakter sederhana, serta preview kamera.

| Area | Kondisi setelah revisi ini | Celah untuk produk lengkap |
|---|---|---|
| Scene | Tambah/hapus karakter dan ruang persegi, properti posisi/ukuran/warna | Pintu terbuka kiri/belakang sudah ada; belum ada geometri bebas, collision fisik, grouping atau import model |
| Edit aman | Undo/redo dalam sesi; lock dan hide/show tersimpan ke JSON | Belum ada version history antar sesi, recovery snapshots atau konflik tab |
| Rotasi | Drag R, Q/E, input derajat, tombol ±15°, hadap kamera | Langkah kaki/tangan prosedural sudah ada; belum ada rig eksternal, foot IK atau target tatapan terpisah |
| Kamera | Nol/satu kamera yang dapat dihapus/dibuat ulang; lensa, target karakter/manual, final view 16:9 | Belum ada shot list, kamera alternatif, rack focus atau pilihan aspect ratio |
| Timeline | Keyframe posisi/rotasi, scrub, playback, rekam gerak | Belum ada drag/copy keyframe, easing editor, keyframe per properti, shot sequencing |
| Proyek | Satu dokumen aktif di localStorage dan ekspor/impor JSON | Belum ada dashboard proyek, banyak scene, thumbnail, pencarian, trash atau cloud |
| Ekspor | Video real-time 720p sesuai dukungan codec browser | Belum frame-accurate/offline, MP4 universal, audio, antrean atau ekspor shot batch |
| Operasional | Dev server lokal, unit test, browser regression | Belum deploy produksi, instrumentasi, browser support matrix atau pemulihan context GPU |

**Asumsi A1:** prioritas awal adalah pengguna individu di laptop/desktop; ponsel untuk melihat, mengoreksi sederhana dan berbagi referensi.

**Asumsi A2:** proyek privat dan lokal lebih dahulu; akun/cloud tidak menjadi syarat untuk mencoba editor.

**Asumsi A3:** tujuan ekspor adalah kejelasan blocking, bukan realisme material, wajah, atau gerakan tubuh.

**Asumsi A4:** tanggal, anggaran, ukuran tim, model bisnis dan volume pengguna belum ditentukan. Jadwal menggunakan gerbang penerimaan, bukan estimasi kalender yang belum tervalidasi.

## 3. Tujuan dan bukan tujuan

### Tujuan

1. Pengguna baru dapat membuat scene dua karakter, satu gerakan kamera dan video referensi dalam ≤10 menit pada uji tugas terarah.
2. Pengguna dapat membuka proyek lain dan kembali tanpa kehilangan perubahan yang sudah dinyatakan tersimpan.
3. Tidak ada mutasi objek terkunci melalui pointer, keyboard, inspector, timeline, maupun operasi massal.
4. Posisi dan arah hadap pada preview sesuai dengan hasil video pada waktu yang sama.
5. Setiap perubahan dokumen memiliki undo yang dapat diprediksi; satu gestur menjadi satu langkah.

### Bukan tujuan MVP

Render fotorealistik; penyuntingan film lengkap; simulasi fisika karakter; generasi film AI otomatis; marketplace aset; kolaborasi simultan; aplikasi native. Konsep ini tetap dapat dieksplorasi setelah alur proyek dan keandalan editor terbukti.

## 4. Persona dan pekerjaan utama

| Persona | Pekerjaan yang perlu diselesaikan | Kesulitan saat ini |
|---|---|---|
| Sutradara/kreator independen | Menguji apakah blocking menyampaikan adegan sebelum syuting | Sulit menjelaskan hubungan aktor dan kamera dengan sketsa |
| DOP/operator kamera | Membandingkan jalur, lensa dan komposisi shot | Alternatif kamera belum dapat disimpan dan dibandingkan |
| Asisten sutradara/storyboard artist | Membagikan gerakan dan cue kepada tim | Referensi belum memiliki shot ID, anotasi dan versi |
| Pelajar film | Mempelajari arah hadap, eyeline dan kontinuitas | Interaksi editor harus dapat dicoba dan dibatalkan tanpa takut rusak |

Persona selain kreator individu merupakan hipotesis produk; validasi melalui 5–8 wawancara dan uji tugas sebelum meluaskan scope.

## 5. Perjalanan pengguna

**Proyek pertama:** dashboard kosong → buat proyek bernama → pilih scene kosong/template → tambah ruang → kunci set → tambah dua karakter → atur posisi dan arah → atur kamera → buat keyframe → preview → ekspor.

**Melanjutkan pekerjaan:** buka dashboard → cari judul/urut terakhir dibuka → buka scene terakhir pada playhead terakhir → edit → status Menyimpan lalu Tersimpan → tutup → buka kembali dengan data identik.

**Eksperimen shot:** duplikasi shot → ubah lensa dan lintasan kamera → bandingkan dengan shot asal → simpan versi terpilih → ekspor dengan label scene/shot.

**Recovery:** perubahan salah → undo; terhapus → trash/restore; storage penuh → status gagal dan unduh backup; proyek rusak → impor ditolak tanpa mengganti proyek aktif; migrasi gagal → kembali ke data lama.

**Review tim pada fase berikut:** pemilik membuat snapshot review → reviewer membuka tautan baca-saja → memberi komentar pada timestamp → pemilik memperbarui shot → snapshot lama tetap konsisten.

## 6. Scope per rilis

| Rilis | Termasuk | Tidak termasuk |
|---|---|---|
| R0 — revisi ini | Undo/redo, lock, hide/show, rotasi independen, manipulasi di final view, regression test | Dashboard proyek dan fitur cloud |
| R1 — proyek lokal | Dashboard, proyek CRUD/duplicate/trash, banyak scene, autosave/recovery, migrasi v1, thumbnail, impor/ekspor paket | Login, sinkronisasi perangkat, kolaborasi |
| R2 — workflow shot | Shot list, kamera per shot, timeline lanjutan, preset kamera, props dasar, export settings dan kompatibilitas | Render film realistis atau AI generatif |
| R3 — produksi tim | Cloud opsional, versioning, review link, komentar waktu, antrean export | Kolaborasi simultan sampai kebutuhannya terbukti |
| Eksplorasi | GLB/rig, animasi tubuh, audio cue, AI-assisted blocking, denah dari gambar | Tidak masuk komitmen MVP |

**Urutan keputusan:** fondasi proyek dan recovery lebih dahulu, kemudian workflow shot dan ekspor, baru integrasi AI. Kemampuan generatif tidak memperbaiki kehilangan data atau editor yang sulit dikendalikan.

## 7. User stories

1. Sebagai sutradara, saya ingin mengunci lokasi agar saat menggeser aktor saya tidak memindahkan set.
2. Sebagai pembuat blocking, saya ingin arah hadap terpisah dari perpindahan agar aktor bisa mundur sambil menghadap lawan main.
3. Sebagai pengguna yang bereksperimen, saya ingin membatalkan satu gerakan drag sekaligus, bukan puluhan perubahan kecil.
4. Sebagai kreator, saya ingin beberapa proyek dan scene tersimpan terpisah agar pekerjaan film berbeda tidak saling tertimpa.
5. Sebagai DOP, saya ingin alternatif shot berbagi lokasi yang sama tetapi menyimpan kamera/timing masing-masing.
6. Sebagai reviewer, saya ingin melihat video dengan nama shot dan timestamp untuk menyampaikan perubahan yang spesifik.

## 8. Functional requirements dan acceptance criteria

P0 = syarat rilis fase terkait; P1 = penting setelah fondasi stabil; P2 = eksplorasi. “Ada” berarti diimplementasikan pada R0, bukan semua kemungkinan edge case sudah dibuktikan lintas browser.

| ID | Kebutuhan | Prioritas / fase | Acceptance criteria |
|---|---|---|---|
| ED-01 | Undo/redo | P0 / R0 ada | Tombol dan ⌘/Ctrl Z, Shift Z; edit baru setelah undo membuang cabang redo; 100 langkah; satu drag/rekaman satu langkah; perubahan nama, objek, keyframe, lock/hide, durasi dan impor dapat dibatalkan |
| ED-02 | Lock | P0 / R0 ada | Ruang default terkunci; semua properti, delete, keyframe, pointer/keyboard tidak mengubah objek terkunci; playback tetap jalan; buka kunci tersedia dari daftar |
| ED-03 | Visibility | P0 / R0 ada | Hide aktor/ruang menghilangkan geometri, label, jalur, picking dan output video; show memulihkan; kamera hide hanya menyembunyikan gizmo/jalurnya; status survive JSON/reload |
| ED-04 | Rotasi karakter | P0 / R0 ada | Input sudut, drag R, Q/E dan hadap kamera; perpindahan tidak menimpa rotasi; perubahan menghasilkan keyframe; arah wajah terbaca di final view; interpolation shortest path |
| ED-05 | Picking aman | P0 / R0 ada | Drag di ruang kosong tidak menggeser objek terpilih; ruangan harus dipilih eksplisit dan dibuka kuncinya; objek tersembunyi dan gizmo arah tidak menjadi target transform |
| PR-01 | Dashboard proyek | P0 / R1 | Daftar menampilkan judul, thumbnail, jumlah scene, updatedAt; buat, buka, rename, duplikasi; pencarian judul dan urutan terbaru; empty/loading/error states |
| PR-02 | Isolasi proyek | P0 / R1 | Setiap proyek UUID berbeda; membuat/mengedit B tidak mengubah A; uji otomatis dua proyek dengan judul sama; duplicate menyalin ID referensi secara konsisten |
| PR-03 | Autosave | P0 / R1 | Simpan atomik ≤1 detik setelah gestur selesai; status tersimpan hanya setelah transaksi berhasil; kegagalan mempertahankan state di memori dan menawarkan unduh backup |
| PR-04 | Recovery & trash | P0 / R1 | Snapshot recovery minimal 10 revisi/proyek; saat buka pilih pulihkan/buka terakhir; delete proyek masuk trash 30 hari, restore menjaga isi; hapus permanen memakai konfirmasi eksplisit |
| PR-05 | Banyak scene | P0 / R1 | Tambah, nama, duplikasi, urutkan dan hapus scene; tiap scene menyimpan actors/set/timeline sendiri; scene aktif dipulihkan setelah reload |
| PR-06 | Migrasi & paket | P0 / R1 | JSON v1 menjadi satu proyek/satu scene/satu shot tanpa perubahan pose; input invalid tidak menimpa data; paket berisi manifest, scene dan aset beserta checksum; roundtrip ekuivalen |
| PR-07 | Banyak tab | P0 / R1 | Satu tab menjadi writer per proyek; tab lain baca-saja atau membuka salinan; tidak terjadi silent last-write-wins; pesan konflik menjelaskan pilihan pengguna |
| SH-01 | Shot list | P0 / R2 | Nama/nomor shot, kamera aktif, durasi, aspect ratio dan catatan; reorder; duplikasi shot; perubahan satu shot tidak mengubah keyframe shot lain |
| TL-01 | Timeline lanjutan | P0 / R2 | Keyframe dapat digeser, multi-select, salin/tempel, hapus; snapping pada frame; zoom/pan; lock berlaku; undo satu operasi massal; tabrakan keyframe mempunyai aturan replace yang terlihat |
| TL-02 | Track per properti | P1 / R2 | Posisi dan orientasi dapat di-key terpisah; interpolation linear/hold/ease; scrub deterministik; migrasi key gabungan mempertahankan gerakan lama |
| SC-01 | Props dan set | P1 / R2 | Tambah box, kursi, meja, pintu dan dinding modular; transform/lock/hide/duplicate memakai sistem edit yang sama; snap grid dapat dimatikan |
| CA-01 | Kamera sinematik | P1 / R2 | Preset wide/normal/tele dengan nilai nyata; 16:9/9:16/2.39:1, safe area dan focal keyframe; target lock dan manual aim; preview menunjukkan crop ekspor |
| EX-01 | Export dialog | P0 / R2 | Pilih shot/range, resolusi, fps dan codec yang benar-benar tersedia; progress, cancel, retry; nama file mencantumkan proyek_scene_shot; perubahan edit tidak memengaruhi render yang sudah dimulai |
| EX-02 | Ekspor deterministik | P0 / R2 | Pada render deterministik 10 detik ×30 fps =300 frame; tes first/middle/last pose dan hidden objects; jika capability tidak tersedia, fallback real-time diberi label jelas |
| EX-03 | Referensi produksi | P1 / R2 | Opsional burn-in nama shot, timecode, lensa; PNG storyboard dan shot list; overlay editor tidak ikut render tanpa pilihan eksplisit |
| CL-01 | Cloud dan akses | P0 / R3 | Proyek privat default; owner/editor/viewer diperiksa server; sinkronisasi menggunakan revision token; konflik menghasilkan salinan aman, bukan overwrite diam-diam |
| CL-02 | Review snapshot | P1 / R3 | Tautan read-only dengan snapshot immutable, masa berlaku/revoke; komentar timestamp tidak mengubah scene; pemilik dapat menghapus link |

### Semantik yang harus konsisten

- **Lock** melarang edit pengguna, bukan membekukan animasi pada playback. Undo dapat memulihkan keseluruhan state sebelum lock.
- **Hide** saat ini global untuk aktor/ruang, termasuk ekspor. Pada R2 usulkan dua kontrol eksplisit: “Sembunyikan di editor” dan “Sertakan di render”; jangan mengubah perilaku lama tanpa migrasi.
- **Arah gerak ≠ arah hadap.** Jika auto-face ditambahkan nanti, jadikan opsi per karakter yang default mati.
- **Rotasi sudut** mengikuti jalur terpendek. Putaran penuh 360° memerlukan track yaw tak dinormalisasi pada fitur lanjutan, bukan dua keyframe ekuivalen 0°/360°.
- **State sesi** (selection, tool, playhead, observer orbit) dipisahkan dari data kreatif. Sesi boleh dipulihkan, tetapi orbit tidak memenuhi stack undo.
- **Lock shot/scene** pada operasi massal harus menghasilkan daftar item yang dilewati; tidak boleh diam-diam memutasi objek terkunci.

## 9. Non-functional requirements

Semua angka berikut **target usulan**, belum baseline performa terukur. Perangkat referensi awal: laptop 8 GB RAM, GPU terintegrasi, Chrome stabil, 1280×720; perangkat pastinya dicatat saat baseline.

| Area | Target penerimaan |
|---|---|
| Interaksi | p95 respons input → viewport <100 ms pada 20 aktor, 10 ruang, 500 keyframe total |
| Playback | ≥30 fps pada beban referensi selama 60 detik; laporkan frame-time p95 dan dropped frames |
| Buka proyek | p95 ≤2 detik untuk proyek metadata ≤5 MB tanpa aset; 100 proyek dashboard tidak memuat semua scene ke memori |
| Ketahanan | 100 siklus edit/save/reload tanpa beda data; migrasi dan save atomic; tidak menampilkan “tersimpan” pada error quota |
| Memori | 20 kali buka/tutup proyek atau rebuild tidak menghasilkan pertumbuhan memori GPU yang terus naik; dispose geometri/material/stream |
| Aksesibilitas | Target WCAG 2.2 AA pada UI biasa; semua aksi utama punya padanan input/keyboard, nama aksesibel, focus visible, tanpa color-only status |
| Responsif | Tidak ada horizontal overflow pada 390 px; toolbar penting tetap dapat dijangkau; touch target inti ≥44 px pada layout sentuh R1 |
| Kompatibilitas | R1 desktop Chrome/Edge terbaru diuji; Safari/Firefox memakai capability detection dan fallback; jangan menjanjikan codec identik |
| Keamanan | Validasi schema dan referensi ID, batas file/asset, teks user di-escape; R3 otorisasi per resource dan URL aset bertanda tangan |
| Privasi | Lokal tanpa akun pada R1; telemetry opt-in, tidak mengirim isi scene/nama karakter/script; proyek cloud privat default |

## 10. UX dan information architecture

**Dashboard** → kartu proyek sebagai representasi dokumen (thumbnail, judul, tanggal), tombol proyek baru, pencarian, import, trash. Jangan memakai dashboard metrik yang tidak membantu membuka pekerjaan.

**Editor** → breadcrumb proyek/scene/shot yang bisa dinavigasi; scene explorer; viewport observer atau final; inspector; timeline; status autosave; undo/redo dan export. Lock/mata tetap terlihat pada hover, keyboard dan layar sentuh.

**States wajib:** proyek kosong dengan template opsional; tidak ada objek terpilih; objek terkunci; hidden; no WebGL; loading asset; asset missing; import invalid; storage penuh; export unsupported/recording/cancel/error/success; tab konflik; recovery tersedia.

**Catatan copy:** antarmuka utama Bahasa Indonesia. Istilah film umum seperti shot, focal length dan keyframe boleh dipakai dengan penjelasan pendek. “Tersimpan” harus menyebut lokal atau cloud; “Ekspor selesai” hanya sesudah file berhasil disiapkan. Director’s note, scene label dan camera name harus data yang bisa diedit, bukan teks demo tetap.

## 11. Model data, arsitektur dan pengukuran

### Model data usulan R1/R2

```text
Project { id, schemaVersion, title, createdAt, updatedAt, activeSceneId, thumbnailRef }
  Scene { id, projectId, name, setObjects[], actors[], shots[], notes }
    Object { id, type, name, transform, locked, visible, assetRef? }
    Shot { id, sceneId, name, order, duration, fps, aspectRatio, cameraId, tracks[], notes }
      Camera { id, lens, transform, targetId?, locked, visible }
      Track { objectId, property, interpolation, keyframes[{frame, value}] }
Asset { id, projectId, contentHash, mimeType, byteSize, blobRef }
Revision { id, projectId, parentId, createdAt, snapshotRef, schemaVersion }
ExportJob { id, projectId, revisionId, shotIds[], settings, status, outputRef? }
SessionState { projectId, selectedId, playhead, observerPose, activeTool }
```

R1 boleh memakai satu default shot agar migrasi R2 tidak mengubah ownership data. Set dan identitas aktor milik scene; track gerak dan kamera framing milik shot. Invariant: semua foreign IDs harus berada pada project/scene yang sesuai. Penghapusan target kamera harus memilih target manual atau menolak dengan penjelasan.

### Penyimpanan dan lapisan kode

Usulan implementasi: pertahankan Three.js untuk scene/rendering; pisahkan `ProjectRepository`, `EditorCommands/History`, `SceneRenderer`, `TimelineEngine`, `ExportService`, dan UI. Hindari menjadikan DOM atau mesh Three.js sebagai sumber data utama.

Untuk R1, IndexedDB cocok untuk data terstruktur dan blob proyek/aset. Tetap sediakan backup karena penyimpanan browser memiliki quota dan dapat dieviction; permintaan persistent storage bukan jaminan pengguna tidak menghapus data. Sumber: [IndexedDB API](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API), [storage quotas dan eviction](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria).

Command mengubah document state → validasi → commit history → update mesh yang berubah → jadwalkan save. Drag menggabungkan perubahan sampai pointerup/cancel/blur. Undo R0 tersimpan dalam memori sesi; Revision R1 merupakan mekanisme recovery terpisah.

R3 memerlukan database metadata, object storage dan API revision-aware. Pilihan vendor belum diputuskan; jangan mengikat skema ke vendor sebelum kebutuhan budget, region dan tim disepakati.

### Rendering

Ekspor saat ini memakai MediaRecorder; dukungan format harus diperiksa dan runtime failure tetap ditangani. Untuk render deterministik, lakukan spike WebCodecs dengan timestamp frame eksplisit, encoder capability check dan muxer; WebCodecs sendiri tidak menulis container file siap putar. Fallback worker/server dapat dievaluasi sesudah biaya/privasi jelas. Sumber: [MediaRecorder.isTypeSupported](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/isTypeSupported_static), [WebCodecs API](https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API).

### Events yang diusulkan, belum diimplementasikan

| Event | Trigger | Properti non-konten |
|---|---|---|
| project_created/opened | Selesai operasi | local/cloud, duration_ms, schemaVersion |
| autosave_completed/failed | Hasil transaksi | revision, duration_ms, error_code |
| editor_command | Commit | command_type, source, affected_count |
| history_used | Undo/redo | direction, depth |
| export_started/completed/failed | Perubahan job | codec, resolution, fps, duration_ms, error_code |
| recovery_used | Pilihan recovery | snapshot_age, action |

Simpan metrik lokal saat pilot; telemetry eksternal hanya setelah opt-in. Tidak perlu mengirim nama proyek, posisi karakter atau isi aset untuk metrik penggunaan.

| Metrik | Baseline | Target usulan | Jendela |
|---|---|---|---|
| Keberhasilan tugas scene→video | Belum diukur | ≥80% dari 5–8 peserta tanpa bantuan | Pilot R1/R2 |
| Waktu ke video pertama | Belum diukur | Median ≤10 menit | Pilot |
| Kehilangan data tersimpan | Belum diukur | 0 pada 100 skenario recovery otomatis dan pilot | Setiap rilis |
| Keberhasilan export | Smoke lokal lulus; bukan baseline pengguna | ≥95% pada browser/perangkat yang didukung | 2 minggu pilot |
| Proyek dibuka kembali | Belum diukur | ≥50% pengguna pilot kembali mengedit dalam 7 hari | Pilot 2 minggu |

## 12. Dependencies

| Ketergantungan | Owner usulan | Status | Dibutuhkan |
|---|---|---|---|
| Keputusan local-first dan hierarchy scene/shot | Pemilik produk | Asumsi dalam PRD | Sebelum R1 |
| Schema + migrator v1 | Engineering | Belum dibuat untuk multi-project | R1 |
| IndexedDB repository, quota/recovery, writer lock | Engineering | Belum ada | R1 |
| Benchmark scene dan perangkat | QA + Engineering | Belum ditetapkan | Gate performa |
| Shot UX + timeline per properti | Product/design | Konsep PRD | R2 |
| Codec/muxer spike | Engineering | Belum dibenchmark | R2 deterministic export |
| Auth, storage, budget dan kebijakan akses | Pemilik produk + Engineering | Belum dipilih | R3 |

## 13. Risiko dan mitigasi

| Risiko | Kemungkinan / dampak | Mitigasi |
|---|---|---|
| Kehilangan data karena quota, tab ganda, migrasi | Sedang / tinggi | Save atomic, writer lock, snapshot, export backup, migrasi copy-first |
| History snapshot terlalu besar saat aset bertambah | Tinggi / sedang | Aset immutable by reference; history hanya metadata; budget memori; command/diff bila baseline mengharuskan |
| Rebuild seluruh scene saat drag menyebabkan lag | Tinggi / sedang | Update transform mesh saja; reuse material; debounce storage; ukur p95 |
| Video berbeda dengan preview | Sedang / tinggi | Satu fungsi sampling scene per timestamp; golden poses; export snapshot immutable |
| Codec tersedia tetapi encoding gagal | Sedang / tinggi | Capability check, runtime error, retry/fallback, support matrix |
| Import aset membuat proyek berat atau rusak | Sedang / tinggi | Batas ukuran/poligon/tekstur, checksum, validation, lazy load, aset pengganti |
| Terlalu cepat menambah AI/cloud | Tinggi / tinggi | Stage gate: proyek/recovery dan export harus lolos sebelum R3/eksplorasi |
| Salah persepsi hide vs render inclusion | Sedang / sedang | Label jelas; dokumentasi; pisahkan flag pada R2 dengan migrasi eksplisit |

## 14. Rollout dan rollback

1. Development dengan fixture v1, proyek kosong, 20 aktor, corrupted import, quota error, multi-tab dan recovery.
2. Migrasi membaca data v1, menyimpan salinan backup, menulis transaksi v2 baru, memvalidasi roundtrip; jangan hapus sumber lama sebelum sukses.
3. Pilot lokal 5–8 pembuat film. R1 dashboard di balik feature flag selama pilot; fallback editor v1 tetap bisa membuka backup JSON.
4. Gate: unit/integration/browser test lulus, tidak ada bug kehilangan data, lock bypass, export mismatch atau migrasi kritis terbuka.
5. Pantau autosave failures, error codec, time-to-first-video dan task completion selama dua minggu pilot. Setiap kehilangan data menghentikan rollout dan memicu recovery/rollback.
6. Rollback aplikasi tidak boleh menghapus data schema baru. Sediakan export kompatibel atau migrator balik yang diuji; jika tidak tersedia, gunakan build R1 stabil untuk membaca data baru dan salinan v1 untuk fallback lama.

## 15. Milestones dan checklist delivery

Tanggal belum ditetapkan. Owner adalah peran yang perlu ditunjuk, bukan alokasi anggota tim yang sudah ada.

| Milestone | Owner | Pekerjaan berurutan | Exit criteria |
|---|---|---|---|
| M0 — safety editor | Engineering/QA | Revisi R0 dan regression matrix | Empat revisi pengguna lolos uji termasuk pointer nyata dan video |
| M1 — storage foundation | Engineering | Schema → migration → repository → transaction/history boundaries → fixture tests | Dua proyek terisolasi, save/reload setara, quota/recovery dan migrasi gagal aman |
| M2 — project experience | Product/design + Engineering | Dashboard → create/open/duplicate → scene switch → search/trash → thumbnail | Seluruh PR-01…PR-07 memenuhi acceptance criteria |
| M3 — shot workflow | Engineering/QA | Shot ownership → timeline → kamera → props → UX cue | Dua alternatif shot tersimpan independen, multi-select dan undo stabil |
| M4 — output production | Engineering/QA | Export dialog → encoder spike → deterministic rendering → batch/stills | Frame-count dan pose cocok; codec fallback dan cancellation diuji |
| M5 — pilot decision | Pemilik produk | Uji tugas → metrik → evaluasi roadmap | Ada keputusan berbasis observasi untuk iterasi atau cloud |
| M6 — optional team | Product/Engineering | Auth → access controls → revision sync → review links | Tidak ada kebocoran lintas proyek; konflik aman; revoke link bekerja |

## 16. Future features dan pertanyaan terbuka

### Peluang fitur setelah kebutuhan dasar terbukti

| Fitur | Nilai bagi pembuat film | Prasyarat | Cara validasi |
|---|---|---|---|
| GLB karakter/props dan skala manusia | Referensi posisi lebih dekat ke set nyata | Asset pipeline, limits, picking, persistence | Pilot 3 scene dengan aset pengguna |
| Idle/walk/run/crouch, look-at kepala | Arah tubuh dan performa lebih mudah dibaca | Rig dan timeline terpisah | Bandingkan pemahaman blocking dengan manekin |
| Denah gambar sebagai underlay terukur | Memindahkan lokasi nyata ke previs | Unit/snap/import image | Rekonstruksi set dari satu denah |
| Collision warning dan clearance | Mendeteksi aktor/kamera menembus dinding | Geometri pintu/dinding eksplisit | Skenario pintu sempit dan crossing |
| Audio/dialog cue dan anotasi | Menyelaraskan timing tindakan | Timecode dan asset audio | Satu shot dialog dengan cue |
| Continuity tools / 180° line / eyeline | Membantu perencanaan coverage | Multi-shot, target aktor | Uji 3 shot percakapan |
| AI-assisted blocking dari teks | Mempercepat draft posisi/keyframe | Schema stabil, reviewable commands, undo | User menerima/mengubah draft; tidak auto overwrite |
| Paket referensi untuk generasi video | Memakai previs dalam pipeline kreatif lain | Export frame/timecode + manifest | Cocokkan kamera/pose hasil dengan referensi |
| Kolaborasi simultan | Mengedit bersama tim jarak jauh | Auth/revisions, presence, konflik | Validasi kebutuhan setelah async review |

Prospek produk yang paling masuk akal berdasarkan workflow ini adalah alat previs ringan untuk kreator individu lalu review tim. Ini hipotesis nilai, bukan proyeksi pasar. Monetisasi dapat diuji kemudian melalui fitur tim, penyimpanan cloud atau render; harga dan permintaan belum diteliti.

### Pertanyaan untuk keputusan berikutnya

1. Apakah R1 cukup menyimpan banyak proyek lokal, atau akses lintas perangkat wajib sejak awal? Default usulan: lokal dahulu.
2. Apakah satu proyek mewakili satu film atau satu sequence? Default usulan: film → banyak scene → banyak shot.
3. Apakah prioritas R2 adalah shot list/timeline, atau import GLB? Default usulan: shot workflow dan export sebelum aset kompleks.
4. Apakah MP4 wajib bagi tool tujuan Anda, dan targetnya 720p/1080p serta 24/25/30 fps? Perlu ditentukan sebelum encoder dipilih.
5. Apakah hide memang harus menghilangkan item dari render, atau lebih sering hanya menyembunyikan di editor? R0 menggunakan hide global dengan label eksplisit.
6. Perlukah rotasi penuh >360°, animasi tubuh dan gerak mundur dengan walk cycle, atau manekin + yaw cukup untuk fase berikut?
7. Berapa banyak karakter, panjang shot, dan ukuran aset pada proyek nyata yang paling sering dibuat?
8. Kapan cloud dibutuhkan, siapa yang boleh melihat proyek, dan berapa anggaran penyimpanan/render yang disetujui?

## 17. Handoff

**Dapat langsung dibangun berdasarkan asumsi tertulis:** fondasi R1 local-first, schema proyek/scene/shot, migrasi dokumen v1, repository, autosave/recovery, dashboard, duplicate dan trash. Buat fixture dan acceptance tests sebelum mengganti penyimpanan aktif.

**Memerlukan keputusan sebelum implementasi terkait:** cloud/login dan provider, kolaborasi, target MP4/fps, prioritas model ber-rig, biaya rendering, serta monetisasi. Keputusan tersebut tidak menghalangi penyelesaian R1 lokal.

## Pembaruan implementasi berikutnya

*Bagian ini mencatat status implementasi. **Requirement di atas tidak diubah** — tidak ada acceptance criterion yang dilonggarkan, ditambah, atau dihapus.*

### R0.1 (sebelum R1)

Langkah kaki prosedural deterministik, penghapusan semua jenis item termasuk slot kamera, pintu terbuka dengan ukuran/posisi yang dapat diedit, dan peringatan lintasan dinding telah diimplementasikan. Collision fisik, auto-routing dan daun pintu beranimasi tetap menjadi kebutuhan masa depan.

### R1 — terimplementasi, gate lulus 8 September 2026

Bukti per acceptance criterion: [GATE-R1.md](GATE-R1.md) §2.

| Req | Status | Ringkas |
|---|---|---|
| PR-01 Dashboard proyek | Terpenuhi | Daftar kartu dengan thumbnail, jumlah scene dan `updatedAt`; buat/buka/rename/duplikasi; pencarian dan dua urutan; empty/loading/error state. Menampilkan 100 proyek membuka **0** transaksi store `documents` |
| PR-02 Isolasi proyek | Terpenuhi | UUID per proyek; duplikasi memetakan ulang seluruh ID sambil menjaga target kamera dan `objectId` track; diuji dengan dua proyek berjudul **sama** |
| PR-03 Autosave | Terpenuhi | Transaksi IndexedDB atomik; status “tersimpan” hanya setelah commit; kegagalan mempertahankan dokumen di memori dan menawarkan unduh cadangan. **Terukur:** p95 260 ms setelah gestur (target ≤1 detik) |
| PR-04 Recovery & trash | Terpenuhi | ≥10 snapshot per proyek (batas 20), pemulihan = satu langkah undo, tempat sampah 30 hari, hapus permanen berkonfirmasi |
| PR-05 Banyak scene | Terpenuhi | Tambah/nama/duplikasi/urutkan/hapus scene; tiap scene memiliki set, aktor dan timeline sendiri; scene aktif pulih setelah reload (diperkuat perbaikan bug R2-01) |
| PR-06 Migrasi & paket | Terpenuhi | v1 → satu proyek/scene/shot tanpa perubahan pose; paket berchecksum SHA-256 per bagian; roundtrip setara; input invalid tidak pernah menimpa; schema lebih baru tidak dibuka dan tidak ditimpa |
| PR-07 Banyak tab | Terpenuhi | Satu writer per proyek (Web Locks + heartbeat); tab lain baca-saja dengan pilihan “Buka salinan”/“Ambil alih”; penolakan ditegakkan di lapisan command, bukan hanya di UI |

### R2 — terimplementasi, gate lulus 8 September 2026

Bukti per acceptance criterion: [GATE-R2.md](GATE-R2.md) §3. Dokumen naik ke `schemaVersion: 3` lewat **satu** migrasi copy-first.

| Req | Status | Ringkas |
|---|---|---|
| SH-01 Shot list | Terpenuhi | Nama/nomor, kamera aktif, durasi, aspect ratio dan catatan per shot; reorder; duplikasi; perbandingan A/B. Isolasi shot bertahan melewati undo/redo penuh, reload dan penghapusan shot |
| TL-01 Timeline lanjutan | Terpenuhi | Geser/multi-select/salin/tempel/hapus keyframe, snapping ke frame, zoom/pan, satu undo per operasi massal, aturan replace yang terlihat. Lock ditegakkan pada seluruh operasi massal |
| TL-02 Track per properti | Terpenuhi | Track `position` dan `rotation` terpisah, interpolasi linear/hold/ease per track. Kesetaraan gerak lama dibuktikan terhadap golden Fase 0 pada toleransi **1e-9** |
| SC-01 Props dan set | Terpenuhi | Box/meja/kursi/dekorasi sebagai entitas ber-ID, dinding modular `type: 'wall'`, pintu ruangan tetap seperti R0.1; transform/lock/hide/duplikasi memakai jalur command yang sama; snap grid opsional (default mati) |
| CA-01 Kamera sinematik | Terpenuhi | Preset 18/35/85 mm, 16:9 / 9:16 / 2.39:1, safe area, keyframe focal, target lock vs manual aim. Preview memakai crop yang sama dengan ekspor — dibuktikan dengan membandingkan canvas POV dan ukuran berkas hasil decode |
| EX-01 Export dialog | Terpenuhi | Pilih shot/rentang, resolusi, fps, dan codec yang **benar-benar tersedia** (dua daftar kapabilitas terpisah); progress, cancel, retry; nama berkas `proyek_scene_shot`; edit selama job berjalan tidak mengubah hasilnya |
| EX-02 Ekspor deterministik | Terpenuhi | 10 detik × 30 fps = **tepat 300 frame**, durasi container 10,000000 detik (`ffprobe`); kesetaraan pose awal/tengah/akhir dan objek tersembunyi; fallback real-time berlabel jelas |
| EX-03 Referensi produksi | Terpenuhi | Burn-in opsional (nama shot, timecode, lensa), PNG storyboard, shot list JSON + CSV; overlay editor tidak ikut render tanpa pilihan eksplisit |

### NFR §9 — status

Terpenuhi **pada perangkat referensi** dan diukur ulang setelah schema v3: p95 interaksi 12,5–45,1 ms (target <100 ms), playback frame-time p95 10,0 ms (target ≤33,3 ms), buka dokumen 5 MB p95 554 ms (target ≤2 detik), dashboard 100 proyek tanpa memuat scene, dan tidak ada tren naik pada penghitung GPU setelah 20 siklus. Angka lengkap dan definisi metriknya di [PERF-BASELINE.md](PERF-BASELINE.md).

**Terpenuhi sebagian:** aksesibilitas (kontras, nama, fokus dan padanan keyboard lulus otomatis; pembaca layar, `prefers-reduced-motion` dan zoom 200% belum) dan kompatibilitas (hanya Chrome yang diuji; Edge belum, meskipun §9 menyebutnya).

### Yang BELUM diverifikasi — memerlukan pilot

Gate teknis tidak dapat menggantikan pengguna. Berikut yang tetap tidak terbukti sampai F6-10/F6-11 dijalankan, dan karena itu **tidak boleh dinyatakan tercapai**:

- **Seluruh metrik §11**: keberhasilan tugas ≥80% tanpa bantuan, median waktu ke video pertama ≤10 menit, export success ≥95%, kembali mengedit dalam 7 hari ≥50%, kehilangan data tersimpan = 0. Yang ada sekarang hanyalah instrumentasi lokal yang siap menghitungnya, bukan hasilnya.
- **Tujuan §3 poin 1** (“pengguna baru dapat membuat scene dua karakter, satu gerakan kamera dan video referensi dalam ≤10 menit pada uji tugas terarah”) — belum pernah diuji pada pengguna baru.
- **Performa pada kelas perangkat §9** (laptop 8 GB, GPU terintegrasi).
- **Browser selain Chrome**, termasuk Edge yang disebut §9.
- **Kuota penyimpanan penuh pada perangkat nyata** — jalur `StorageQuotaError` baru diuji lewat kegagalan buatan.
- **Aksesibilitas dengan pembaca layar dan pengguna sungguhan.**

Protokol pilot siap dipakai apa adanya di [PILOT-PROTOCOL.md](PILOT-PROTOCOL.md), termasuk kriteria keputusan §14 yang ditetapkan **sebelum** pilot dimulai. Keputusan yang masih terbuka dan menahan fase berikutnya — termasuk D-04 (MP4) dan D-07 (cloud) — ada di [DECISIONS-NEEDED.md](DECISIONS-NEEDED.md). **Fase cloud (CL-01/CL-02) belum dikerjakan sama sekali** dan tetap bergantung pada keputusan tersebut.

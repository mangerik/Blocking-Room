# Audit fungsi dan interaksi — Blocking Room

7 September 2026. Cakupan: review kode lokal, pengujian browser Chrome pada desktop dan pemeriksaan layout 390 px. Empat revisi pengguna sudah diimplementasikan; analisis di bawah adalah backlog menuju produk lengkap.

## Revisi yang diselesaikan

| Masalah | Penyebab yang ditemukan | Perubahan | Bukti |
|---|---|---|---|
| Tidak ada undo/redo | Mutasi langsung disimpan tanpa history | Snapshot project, 100 langkah, cabang redo, transaksi drag/keyboard/rekam | Unit history dan browser edit/drag/rekam/import undo |
| Lokasi tidak sengaja bergeser | Raycast memilih ruang; klik kosong tetap membuat drag objek aktif | Ruang harus dipilih eksplisit; klik kosong tidak memulai drag; flag lock default pada ruang | Drag pointer nyata pada karakter, ruang kosong, aktor terkunci; pose ruang tidak berubah |
| Arah karakter tidak jelas | Gerak menimpa rotasi; tubuh simetris; tidak ada tool rotasi atau edit POV utama | Yaw independen, R/drag, Q/E, tombol rotasi, hadap kamera, mata dan penanda arah, final view 16:9 | Drag rotasi dan translasi pada final view; keyframe arah tetap setelah perpindahan |
| Mata tidak berfungsi | Ikon statis dalam tombol select | Tombol visibility terpisah; sinkron scene, label, paths, picking, POV dan persistence | Perbedaan gambar POV visible/hidden, status mesh, JSON dan reload |

Keputusan: hide aktor/ruangan berlaku juga pada video. Hide kamera hanya menyembunyikan gizmo/jalur. Lock mencegah edit, tetapi tidak menghentikan animasi yang telah disimpan. Semua flag termasuk perubahan undo.

## Prioritas produk berikutnya

| Prioritas | Temuan/batas nyata | Dampak | Tindakan yang direkomendasikan |
|---|---|---|---|
| P0 | Penyimpanan hanya satu key `blocking-room` di localStorage | Tidak ada daftar proyek, isolasi scene, recovery atau penanganan konflik tab | Project repository, UUID, IndexedDB, autosave atomik, recovery dan dashboard — PRD R1 |
| P0 | Export memakai MediaRecorder real-time dan waktu animation frame | Frame count/tempo tergantung perangkat; codec browser berbeda; metadata durasi WebM belum dijamin seekable | Export settings, timebase frame, codec capability tests, deterministic render spike — R2 |
| P1 | Karakter bergerak langsung melewati ruang; tidak ada pintu/collision | Blocking spasial dapat terlihat valid walau jalur menembus dinding | Dinding modular, pintu dan clearance warning opsional; jangan memblokir blocking artistik tanpa opsi |
| P1 | Timeline menyimpan seluruh pose pada satu key; belum bisa drag/copy key | Sulit menyunting gerak dan arah secara terpisah atau mengubah timing | Track per properti, snapping, multi-select, easing dan keyframe editor |
| P1 | Hanya satu kamera dan satu timeline | Sulit membuat coverage, shot alternatif atau urutan film | Project → scene → shot; camera/track per shot; duplicate dan compare |
| P1 | Banyak perubahan membangun ulang scene/jalur dan menulis localStorage berulang | Berpotensi lag saat jumlah objek/keyframe naik; belum dibenchmark beban maksimum | Update mesh transform incremental, cache material, throttle preview, save akhir gestur; ukur sebelum optimasi lebih luas |
| P1 | Belum ada WebGL context-loss recovery atau dukungan browser teruji menyeluruh | Pengguna perangkat/browser lain dapat gagal tanpa recovery yang memadai | Error boundary renderer, retry, capability checks, support matrix |
| P1 | Input properti mudah bercampur playback | Pengeditan pada waktu bergerak membingungkan | Revisi ini menjeda playback saat fokus inspector; R2 tambahkan state Edit/Play/Record yang jelas dan cue frame aktif |
| P1 | Touch target mata/gembok masih kecil di sidebar ponsel | Salah tekan saat touch; layout bebas overflow bukan bukti aksesibilitas lengkap | Layout objek sentuh dengan target ≥44 px dan inspector drawer pada R1 |
| P2 | Director’s note, camera heading, scene/shot metadata sebagian masih teks contoh | UI tidak sepenuhnya mencerminkan proyek pengguna | Jadikan metadata sebagai field proyek/scene/shot |
| P2 | Set decoration ditentukan oleh urutan ruangan | Menghapus ruangan dapat memindahkan dekorasi contoh ke ruang lain | Pisahkan props sebagai entitas eksplisit ber-ID, jangan bergantung pada index |
| P2 | Manekin belum memiliki rig/gerak kaki/pose | Video menunjukkan perpindahan blocking, bukan performa tubuh | Import asset tervalidasi dan animasi tubuh setelah pipeline aset siap |

## Verifikasi yang tersedia

- `npm test`: 8 tes unit — sampling linear/rotasi, clamp waktu, upsert, schema, migrasi flag lama, history undo/redo, transaksi dan batas history.
- `node tests/browser-smoke.mjs`: scene awal, tambah/edit aktor, keyframe, lensa, playback, JSON download/import, localStorage, video download, no browser exception dan mobile overflow.
- `node tests/editor-regression.mjs`: undo/redo dan cabang baru; hidden geometry dan perubahan POV; lock inspector/delete/pointer/keyboard; drag miss tidak mengubah data; satu drag satu undo; lokasi default lock/unlock; transform karakter di final camera; yaw independen; recording terikat pada aktor dan dapat di-undo satu langkah; JSON/reload/import undo; layout desktop/ponsel.
- `npm run build`: bundle produksi Vite.
- Gambar review: `artifacts/revision-desktop.png`, `artifacts/revision-final-view.png`, `artifacts/revision-mobile.png`. File artifacts merupakan hasil tes lokal, bukan aset produksi.

## Batas kesimpulan

Tes dilakukan di Chrome lokal. Tidak mengklaim sertifikasi WCAG, kompatibilitas semua browser, performa 50 aktor/30 ruang, presisi frame export, atau pengujian multi-perangkat. Belum ada uji pengguna nyata. Riwayat undo bersifat sesi; reload mempertahankan dokumen tetapi menghapus stack undo. Status autosave lokal bukan backup permanen.

PRD di [PRD.md](PRD.md) menerjemahkan celah ini menjadi scope, acceptance criteria, target terukur, risiko, migrasi dan roadmap. R1 proyek lokal bisa menjadi pekerjaan berikutnya; daftar fitur masa depan tidak berarti sudah terpasang di editor.

## Pembaruan: langkah, hapus, pintu

Animasi kaki/tangan kini mengikuti jarak perpindahan karakter. Kamera dapat dihapus menjadi null dan dibuat kembali; delete seluruh jenis item menghormati lock/undo. Dinding kiri/belakang mendukung bukaan geometris dan frame pintu; lintasan melalui bagian dinding solid memunculkan peringatan. Temuan lama tentang ketiadaan pintu/gerak kaki kini sebagian teratasi; collision fisik, rig penuh dan auto-routing belum ada.

Tambahan verifikasi: `tests/spatial.test.js` menguji walk sampling, idle, panel bukaan, validasi ukuran pintu, crossing, dan proyek tanpa kamera. `tests/walk-doors-delete.mjs` menguji aksi UI, empty camera, reload/import, undo, geometri pintu dan ekspor. Total tes unit saat pembaruan: 12.

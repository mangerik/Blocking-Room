# Dukungan browser — F6-05

PRD §9 Kompatibilitas: *"R1 desktop Chrome/Edge terbaru diuji; Safari/Firefox memakai
capability detection dan fallback; jangan menjanjikan codec identik."*

Dokumen ini mengikuti kalimat itu secara harfiah. **Hanya Chrome yang benar-benar
diuji.** Baris untuk browser lain adalah turunan dari kemampuan yang dideteksi
aplikasi, bukan hasil pengujian — dan ditandai demikian.

## 1. Aturan: deteksi kemampuan, bukan nama browser

Seluruh keputusan fitur ada di `src/capabilities.js`. Tidak ada satu pun cabang kode
yang memeriksa user agent. Konsekuensinya: browser baru, browser dengan flag tidak
biasa, mode privat dan kebijakan enterprise semuanya ditangani oleh mekanisme yang
sama, tanpa daftar putih yang harus dipelihara.

| Kemampuan | Dipakai untuk | Bila tidak ada |
|---|---|---|
| **WebGL2** | seluruh viewport 3D | Editor tidak dibuka. Router memuat `src/no-webgl.js`: penjelasan, tombol ke daftar proyek, unduh proyek sebagai JSON, tombol coba lagi. Three.js tidak diunduh sama sekali. |
| **IndexedDB** | penyimpanan proyek, revisi, session, aset | Editor tetap terbuka **di memori**, autosave mati, status berubah menjadi "Penyimpanan tidak tersedia", tombol unduh cadangan muncul. Dashboard menampilkan error state dengan tombol "coba lagi". |
| **Web Locks** | kunci writer antar-tab | Turun ke heartbeat `localStorage` (`src/tab-lock.js`). Perlindungan tetap ada, deteksi tab lain sedikit lebih lambat. |
| **BroadcastChannel** | pemberitahuan antar-tab | Perubahan tab lain terdeteksi lewat heartbeat, bukan seketika. |
| **MediaRecorder + `canvas.captureStream`** | ekspor video | Tombol "Ekspor video" **dinonaktifkan** dengan alasan yang terbaca, bukan gagal saat ditekan. Ekspor JSON dan paket tetap jalan. |
| **VideoEncoder (WebCodecs)** | render deterministik (Fase 5, belum dipakai) | Tidak berpengaruh pada R1. |
| **`navigator.storage.persist`** | meminta penyimpanan persisten | Dilewati; penyimpanan tetap bekerja, hanya lebih mudah dibersihkan browser. |
| **localStorage** | proyek aktif, feature flag, metrik lokal, titipan darurat | Semua penulisan dibungkus try/catch; aplikasi tetap terbuka tanpa memori antar-sesi ringan. |

Kemampuan yang terdeteksi dapat dilihat pengguna: layar fallback no-WebGL menampilkannya
apa adanya di bagian "Rincian kemampuan browser", dan `window.blockingRoom.getCapabilities()`
mengembalikannya di editor.

## 2. Matriks dukungan

Kolom **Status** memakai tiga nilai saja:

- **Diuji** — dijalankan pada browser itu oleh suite di repo ini.
- **Diperkirakan** — diturunkan dari kemampuan yang dibutuhkan dan dukungan yang
  didokumentasikan vendor. **Belum dijalankan.**
- **Tidak didukung** — kemampuan penghalang tidak ada.

| Browser | Versi | Viewport 3D | Penyimpanan | Kunci antar-tab | Ekspor video | Status |
|---|---|---|---|---|---|---|
| **Google Chrome (macOS arm64)** | 152.0.7977.76 | ya (ANGLE Metal) | IndexedDB | Web Locks | WebM VP9 | **Diuji** — 8 suite browser + harness performa, 8 Sep 2026 |
| Chrome (Windows/Linux) | terbaru | ya | IndexedDB | Web Locks | WebM VP9 | Diperkirakan — mesin sama, belum dijalankan |
| Microsoft Edge | terbaru | ya | IndexedDB | Web Locks | WebM VP9 | Diperkirakan — Chromium, kemampuan sama; **PRD menuntut ini diuji, belum dilakukan** |
| Firefox | terbaru | ya | IndexedDB | Web Locks (sejak FF 96) | WebM VP8/VP9 | Diperkirakan; codec berbeda dari Chrome |
| Safari (macOS) | 17+ | ya | IndexedDB | Web Locks (sejak 15.4) | MP4/H.264 bila ada, jika tidak tombol mati | Diperkirakan; risiko tertinggi (lihat §3) |
| Safari (iOS/iPadOS) | 17+ | ya | IndexedDB | Web Locks | sering tidak ada | Diperkirakan; layout sentuh sudah disiapkan (F6-04), belum diuji perangkat |
| Browser tanpa WebGL2 | — | tidak | — | — | tidak | Fallback `src/no-webgl.js` — **diuji** dengan WebGL diblokir |

## 3. Risiko yang diketahui per browser

**Safari — risiko tertinggi.** Tiga hal yang paling mungkin berbeda:
1. **Codec ekspor.** Safari cenderung menyediakan MP4/H.264, bukan WebM/VP9.
   `ExportService.pickMimeType()` memilih kandidat pertama yang benar-benar didukung dan
   ekstensi berkas mengikuti mime hasilnya, jadi jalur ini seharusnya bekerja — tetapi
   **hasil videonya tidak dijanjikan identik dengan Chrome** (PRD §9).
2. **Kuota IndexedDB dan pembersihan storage** lebih agresif, terutama tanpa
   `navigator.storage.persist()`. Konsekuensi nyata: proyek dapat hilang setelah 7 hari
   tidak dipakai. Ini alasan tombol unduh cadangan dan ekspor paket ada.
3. **`preserveDrawingBuffer`** dan pembacaan canvas untuk thumbnail dapat berperilaku
   berbeda. Kegagalannya sudah ditangani (thumbnail memakai placeholder), tetapi belum
   diamati.

**Firefox.** `WEBGL_debug_renderer_info` sering disembunyikan, sehingga kolom
`renderer`/`vendor` pada capability akan `null` — ini normal, bukan kegagalan.

**iOS/iPadOS.** Semua browser memakai WebKit. Selain risiko Safari di atas, memori GPU
jauh lebih terbatas; fixture beban (20 aktor, 10 ruang) belum pernah dijalankan di sana.

**Chrome/Edge di GPU terintegrasi kelas bawah.** Bukan masalah kemampuan, tetapi
performa: seluruh angka `docs/PERF-BASELINE.md` berasal dari Apple M5. Lihat §7 dokumen itu.

## 4. Kehilangan konteks WebGL

Konteks WebGL dapat hilang kapan saja: GPU reset, driver crash, tab lama di latar,
laptop bangun dari sleep. Perilaku aplikasi (`src/scene-renderer.js`):

1. `webglcontextlost` di-`preventDefault()` — **syarat** agar browser mau mengirim
   `webglcontextrestored`. Tanpa itu canvas mati permanen.
2. Renderer berhenti menggambar selama konteks hilang, jadi console tidak dibanjiri error.
3. Panel `role="alert"` muncul di atas viewport: penjelasan + tombol "Coba pulihkan
   tampilan". Dokumen tetap dapat dibaca dan tersimpan selama periode ini.
4. Tombol memanggil `restoreContext()`. Referensi ekstensi `WEBGL_lose_context` diambil
   **saat konstruksi** — setelah konteks hilang `getExtension()` mengembalikan `null`,
   sehingga mencarinya belakangan berarti pemulihan tidak akan pernah bisa dipanggil.
   Bila ekstensi tidak tersedia, tombol memuat ulang halaman.
5. Pada `webglcontextrestored`, scene **dibangun ulang dari dokumen**, bukan dari isi GPU.
   Dokumen adalah sumber kebenaran, jadi tidak ada data yang hilang.

Diuji sungguhan di Chrome: `tests/capability-browser.mjs` bagian 1 (hilangkan konteks →
banner muncul → pulihkan → jumlah objek scene identik → tanpa error halaman).

## 5. Cara memverifikasi di browser lain

Belum ada otomasi lintas browser (Playwright di repo ini dipasang dengan
`channel:'chrome'`). Langkah manual minimum per browser:

1. Buka aplikasi, jalankan `window.blockingRoom.getCapabilities()` di console dan simpan
   hasilnya ke tabel §2.
2. Buat proyek, tambah aktor, geser, reload — periksa perubahan bertahan.
3. Buka proyek yang sama di dua tab — periksa banner "sedang dibuka di tab lain".
4. Tekan Ekspor video: harus menghasilkan berkas **atau** tombol nonaktif dengan alasan.
   Yang tidak boleh terjadi: tombol aktif lalu gagal diam-diam.
5. Impor kembali paket yang diekspor dari Chrome — dokumen harus setara.

Sampai langkah itu dijalankan, baris "Diperkirakan" tetap "Diperkirakan".

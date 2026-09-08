# Protokol uji tugas pilot — bahan untuk F6-10, F6-11, F6-12

**Status: BAHAN, belum dijalankan.** F6-10/F6-11/F6-12 memerlukan 5–8 pembuat film
sungguhan selama dua minggu; tidak ada bagiannya yang dapat diotomasi, dan tidak satu pun
dari ketiga task itu boleh dicentang berdasarkan dokumen ini. Dokumen ini hanya
menyiapkan protokolnya supaya pilot dapat dimulai tanpa merancang ulang.

Sumber target: PRD §11 (tabel metrik) dan §14 (rollout). Prasyarat: gate R1 lulus
(`docs/GATE-R1.md`).

## 1. Peserta

**Jumlah:** 5–8 orang (PRD §11). Di bawah 5, satu peserta yang gagal sudah menggeser
angka keberhasilan lebih dari 15% dan kesimpulannya tidak berarti.

**Kriteria:** membuat film/video sebagai pekerjaan atau praktik serius (sutradara, DOP,
AD, storyboard artist, kreator konten naratif), **belum pernah memakai Blocking Room**,
dan pernah setidaknya sekali membutuhkan previs/blocking untuk pekerjaan nyata.

**Yang sengaja dikecualikan:** siapa pun yang ikut membangun produk ini, dan orang yang
sudah pernah melihat demo. Keduanya membuat angka "menyelesaikan tanpa bantuan" tidak ada
artinya.

**Perangkat:** perangkat peserta sendiri, bukan perangkat tim. Catat model, RAM, GPU,
browser dan versinya untuk setiap peserta — ini satu-satunya kesempatan mendapatkan angka
performa dari perangkat kelas PRD (lihat `docs/PERF-BASELINE.md` §7).

## 2. Persiapan (dilakukan fasilitator sebelum sesi)

1. Sajikan build hasil `npm run build` (verifikasi dengan `npm run preview`, lihat
   `docs/ROLLOUT.md` §1). Catat hash commit build.
2. Tentukan status feature flag dashboard dan catat: `blocking-room.flags.dashboard`
   `on` (default) atau `off`. **Gunakan setelan yang sama untuk semua peserta** —
   mencampur keduanya membuat angka tidak dapat dibandingkan.
3. Kosongkan metrik lokal di perangkat peserta sebelum sesi (panel "Lihat metrik lokal"
   → Hapus riwayat) supaya data pilot tidak tercampur data uji coba fasilitator.
4. Siapkan lembar catatan per peserta (§6) dan alat perekam layar bila peserta setuju.
5. Siapkan naskah pengantar (§3) — dibaca sama persis untuk setiap peserta.

## 3. Pengantar yang dibacakan (sama untuk semua peserta)

> "Ini alat previsualisasi 3D di browser untuk merencanakan blocking dan gerakan kamera.
> Saya akan memberi tiga tugas. Kerjakan seperti biasanya Anda bekerja. Saya tidak akan
> membantu kecuali Anda benar-benar buntu — dan kalau itu terjadi saya akan mencatatnya,
> karena yang sedang diuji alatnya, bukan Anda. Silakan bicara keras-keras apa yang sedang
> Anda pikirkan. Kalau ada yang membingungkan, itu temuan yang berguna."

**Yang TIDAK boleh dilakukan fasilitator:** menunjukkan tombol, mengucapkan nama fitur
yang belum ditemukan peserta, atau menjawab "bagaimana caranya" sebelum peserta meminta
bantuan secara eksplisit. Setiap pelanggaran menghapus peserta itu dari angka
"menyelesaikan tanpa bantuan".

## 4. Tugas

### Tugas 1 — Scene ke video (tugas utama, mengukur target PRD ≥80%)

> "Buat blocking untuk satu adegan pendek: **dua karakter** di sebuah ruangan, salah
> satunya berjalan mendekati yang lain, lalu **gerakkan kamera** mengikuti adegan itu.
> Kalau sudah puas, **ekspor videonya** ke komputer Anda."

Ini persis tugas PRD F6-10: buat dua aktor, gerak kamera, ekspor.

**Selesai bila:** ada berkas video terunduh yang memperlihatkan dua karakter dengan
setidaknya satu perpindahan posisi dan satu perubahan posisi kamera.

**Ukur:**
- **Waktu ke video pertama** — dari kalimat terakhir pengantar sampai berkas terunduh.
  Target PRD: **median ≤10 menit**.
- **Selesai tanpa bantuan** — ya/tidak. Target PRD: **≥80% peserta**.
- Jumlah dan isi setiap permintaan bantuan, beserta waktunya.
- Titik peserta berhenti dan mencari-cari (>10 detik tanpa aksi).

### Tugas 2 — Buka kembali dan lanjutkan (mengukur PR-04/PR-07)

> "Tutup tab-nya. … Sekarang buka lagi alatnya dan lanjutkan adegan tadi: tambahkan
> **satu scene baru** untuk sudut lain dari cerita yang sama."

**Selesai bila:** proyek yang sama terbuka kembali dengan isi utuh, dan ada scene kedua.

**Ukur:** apakah peserta menemukan pekerjaannya sendiri tanpa bantuan; apakah peserta
menyadari perbedaan **proyek** dan **scene**; berapa lama sampai scene kedua ada.

### Tugas 3 — Pemulihan (mengukur PR-03/PR-04, "kehilangan data = 0")

Fasilitator menutup tab **saat peserta sedang menggeser karakter** (dengan izin, sebagai
bagian dari tugas), lalu:

> "Buka lagi. Apa yang terjadi dengan perubahan terakhir Anda?"

**Ukur:** apakah perubahan terakhir kembali; bila tidak, **berapa banyak** yang hilang
(dalam gestur, bukan dalam detik); apakah peserta memahami status yang ditampilkan;
apakah peserta menemukan "Riwayat versi" bila diperlukan.

**Aturan mutlak:** setiap kehilangan data yang tidak dapat dijelaskan **menghentikan
pilot** untuk peserta berikutnya sampai penyebabnya ditemukan (PRD §14 poin 5).

### Tugas cadangan (hanya bila waktu tersisa)

- Ekspor paket proyek dan impor kembali di jendela lain.
- Buka proyek yang sama di dua tab dan amati apakah peserta memahami pesan konflik.

## 5. Pemantauan dua minggu (F6-11)

Peserta memakai alat untuk pekerjaan sendiri selama 14 hari. Pada akhir periode, minta:

1. **Ekspor metrik lokal** (header → "Lihat metrik lokal" → Ekspor JSON). Berkas ini
   tidak memuat nama proyek maupun isi scene (dijamin `src/metrics.js`), jadi dapat
   dikirim apa adanya.
2. Wawancara 20 menit: apa yang dipakai, apa yang ditinggalkan, apa yang membuat berhenti.

| Metrik PRD §11 | Cara menghitung dari metrik lokal | Target |
|---|---|---|
| Keberhasilan tugas scene→video | dari observasi Tugas 1, bukan dari metrik | ≥80% |
| Waktu ke video pertama | observasi Tugas 1; `project_created.duration_ms` sebagai pembanding | median ≤10 menit |
| Kehilangan data tersimpan | jumlah `autosave_failed` + laporan Tugas 3 + wawancara | **0** |
| Keberhasilan export | `export_completed / (export_started)` per peserta | ≥95% |
| Proyek dibuka kembali dalam 7 hari | ada `project_opened` pada hari ke-1..7 setelah `project_created` | ≥50% peserta |

**Batas yang harus ditulis di laporan hasil:** metrik lokal hanya ada di perangkat yang
peserta bersedia ekspor. Peserta yang berhenti memakai alat kemungkinan besar juga tidak
mengirim metrik — jadi angka "kembali mengedit" **bias ke atas**. Wawancara wajib
menanyakan alasan berhenti kepada semua peserta, termasuk yang tidak mengirim data.

## 6. Lembar catatan per peserta

```
Peserta        : P-0_
Tanggal        :
Perangkat      : model / RAM / GPU / OS
Browser        : nama + versi (dari window.blockingRoom.getCapabilities())
Build          : hash commit
Flag dashboard : on / off

TUGAS 1  mulai __:__  selesai __:__  durasi ____   tanpa bantuan: ya / tidak
  Permintaan bantuan (waktu + kalimat persis):
  Titik macet (>10 detik diam):
  Berkas video terunduh: ya / tidak   codec:

TUGAS 2  durasi ____   tanpa bantuan: ya / tidak
  Menemukan proyeknya kembali sendiri: ya / tidak
  Memahami proyek vs scene: ya / sebagian / tidak

TUGAS 3  perubahan terakhir kembali: ya / sebagian / tidak
  Yang hilang (jumlah gestur):
  Memahami status yang ditampilkan: ya / tidak

Kutipan verbatim (minimal 3):
Bug/anomali yang teramati:
Metrik lokal diekspor: ya / tidak
```

## 7. Kriteria keputusan (F6-12)

Diputuskan **sebelum** pilot dimulai supaya hasilnya tidak ditafsir belakangan:

| Hasil | Keputusan |
|---|---|
| Ada **satu** kejadian kehilangan data tersimpan yang tidak dapat dijelaskan | **Hentikan rollout.** Jalankan `docs/ROLLOUT.md` §5, buat task mitigasi sebelum apa pun dilanjutkan. |
| Keberhasilan Tugas 1 <80% | Iterasi UX pada titik macet yang paling sering, ulangi pilot. Jangan lanjut ke R2. |
| Median waktu ke video pertama >10 menit | Iterasi onboarding/alur ekspor; boleh lanjut ke R2 hanya bila keberhasilan ≥80%. |
| Keberhasilan export <95% | Perbaiki jalur ekspor/codec sebelum R2 (bergantung pada `docs/BROWSER-SUPPORT.md`). |
| Kembali mengedit <50% | Bukan penghenti rilis; jadi masukan prioritas fitur, bukan alasan menambah fitur baru. |
| Semua target terpenuhi | Lanjut ke R2 (Fase 4–5). **Cloud/AI tetap tidak dikerjakan** tanpa keputusan terpisah (PRD §16). |

## 8. Etika dan data peserta

- Persetujuan tertulis untuk merekam layar dan mengutip; peserta boleh menarik data
  kapan saja.
- Metrik lokal dikirim atas kehendak peserta, bukan otomatis. **Telemetry eksternal tidak
  diimplementasikan sama sekali** (`docs/ROLLOUT.md` §7) — jangan menjanjikan pengumpulan
  otomatis kepada peserta.
- Karya peserta adalah milik peserta. Jangan menyimpan berkas proyek tanpa izin eksplisit;
  bila disimpan untuk reproduksi bug, hapus setelah bug ditutup.
- Laporkan hasil dengan pembilang dan penyebut (mis. "5 dari 7"), bukan persentase saja.
  Dengan n ≤ 8, persentase tanpa penyebut menyesatkan.

# Brief orkestrasi — pelaksanaan plan.md

Dokumen ini dibaca oleh setiap sub-agent sebelum bekerja. Sumber kebenaran: `docs/PRD.md` (requirement) dan `plan.md` (ceklist). Konteks kode: `README.md`, `docs/AUDIT.md`.

## Aturan kerja untuk setiap sub-agent

1. **Scope**: kerjakan hanya task yang ditugaskan orkestrator. Jangan melompat ke fase lain. Jangan menghapus fitur yang sudah ada (undo, lock, visibility, yaw independen, langkah kaki, pintu, kamera null, kompatibilitas JSON v1).
2. **Definisi selesai** (dari plan.md): perilaku memenuhi acceptance criteria PRD, ada bukti test, dan `plan.md` diperbarui (centang `[x]` + baris di tabel "Log pelaksanaan" dengan bukti). Jangan centang task hanya karena kode dibuat.
3. **Verifikasi wajib sebelum selesai**: `npm test` dan `npm run build` harus lulus. Untuk perubahan UI/editor jalankan juga browser test: `npm run dev -- --port 5174 --strictPort` di background, lalu `node tests/browser-smoke.mjs`, `node tests/editor-regression.mjs`, `node tests/walk-doors-delete.mjs` (Chrome terpasang, Playwright memakai `channel:'chrome'`). Matikan dev server setelah selesai.
4. **Gaya kode**: proyek memakai vanilla JS ESM + Vite + Three.js, tanpa framework. `src/main.js` ditulis padat (baris panjang). Kode baru boleh ditulis normal/readable dalam modul terpisah di `src/`. Tetap tanpa dependency baru kecuali benar-benar perlu (catat alasannya).
5. **Bahasa UI**: Bahasa Indonesia. Bahasa dokumentasi/log: Bahasa Indonesia.
6. **Jangan commit / jangan push.** Orkestrator yang melakukan commit per fase.
7. **Batas konteks 80%**: jika konteks kamu terasa sudah mendekati 80% (sudah banyak membaca file besar / output panjang), BERHENTI menambah pekerjaan baru. Pastikan kode dalam keadaan konsisten (test lulus atau catat mana yang gagal), lalu tulis laporan handover (format di bawah) dan akhiri. Sub-agent berikutnya akan melanjutkan dari laporan itu.
8. **Laporan handover** ditulis ke `docs/handoff/<fase>-report.md` (contoh `phase1-report.md`). Jika melanjutkan pekerjaan agent sebelumnya, tambahkan bagian baru di file yang sama, jangan menimpa.

## Format laporan handover

```
# Laporan <fase> — <tanggal>

## Status task
| Task | Status (selesai / sebagian / belum) | Bukti |

## Perubahan file
- path — ringkasan

## Keputusan & asumsi
- ...

## Hasil verifikasi
- npm test: ...
- npm run build: ...
- browser tests: ...

## Yang belum selesai / cara melanjutkan (WAJIB detail jika berhenti karena batas konteks)
- task, file, fungsi, langkah berikutnya yang konkret

## Risiko / catatan untuk fase berikutnya
```

## Urutan fase (dari plan.md)
0 → 1 → 2 → 3 → gate R1 (F6-08 + F6 task teknis) → 4 → 5 → gate R2 (F6-09) → F6 sisa → (F7 hanya bila keputusan cloud ada) → F8 backlog (tidak dikerjakan tanpa validasi).

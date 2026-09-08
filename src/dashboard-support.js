// Helper murni untuk dashboard (F3-01/F3-02/F3-08) — tanpa DOM, agar dapat diuji di Node.
import {TRASH_RETENTION_DAYS} from './repository.js';

/** Judul unik: "Judul", lalu "Judul 2", "Judul 3", … Dipakai duplicate dan impor. */
export function uniqueTitle(base, taken) {
  const used = new Set(taken);
  if (!used.has(base)) return base;
  for (let i = 2; i < 1000; i += 1) {
    const candidate = `${base} ${i}`.slice(0, 100);
    if (!used.has(candidate)) return candidate;
  }
  return base.slice(0, 100);
}

/** Tanggal yang enak dibaca untuk kartu proyek. */
export const stamp = iso => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('id-ID', {dateStyle: 'medium', timeStyle: 'short'});
};

/** Sisa retensi item di tempat sampah. */
export function trashRemaining(deletedAt, now = Date.now()) {
  const elapsed = now - Date.parse(deletedAt);
  const left = Math.ceil((TRASH_RETENTION_DAYS * 86400000 - elapsed) / 86400000);
  return left <= 0 ? 'akan dibersihkan' : `${left} hari lagi`;
}

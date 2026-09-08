// Feature flag lokal (F6-07, PRD §14 poin 3: "R1 dashboard di balik feature flag
// selama pilot").
//
// Flag disimpan di localStorage dengan awalan `blocking-room.flags.`, satu kunci
// per flag, sehingga dapat diubah dari devtools atau skrip pilot tanpa build baru:
//
//   localStorage.setItem('blocking-room.flags.dashboard', 'off')
//
// Aturan: flag hanya boleh MEMATIKAN permukaan UI, tidak pernah mengubah bentuk
// data. Mematikan `dashboard` membuat aplikasi selalu membuka editor proyek
// terakhir; proyek, scene dan dokumen yang sudah tersimpan tidak tersentuh, jadi
// menyalakannya kembali langsung memunculkan semuanya lagi.

export const FLAG_PREFIX = 'blocking-room.flags.';

/** Nilai bawaan tiap flag. Default aktif: pilot dimulai dengan dashboard menyala. */
export const DEFAULT_FLAGS = Object.freeze({dashboard: true});

const TRUE = new Set(['on', 'true', '1', 'yes', 'aktif']);
const FALSE = new Set(['off', 'false', '0', 'no', 'mati']);

/**
 * Membaca satu flag. Nilai yang tidak dikenal (atau storage yang diblokir)
 * mengembalikan nilai bawaan — flag tidak boleh membuat aplikasi gagal terbuka.
 */
export function readFlag(name, storage = globalThis.localStorage) {
  const fallback = DEFAULT_FLAGS[name] ?? false;
  let raw = null;
  try {raw = storage?.getItem(FLAG_PREFIX + name);} catch {return fallback;}
  if (raw === null || raw === undefined) return fallback;
  const value = String(raw).trim().toLowerCase();
  if (TRUE.has(value)) return true;
  if (FALSE.has(value)) return false;
  return fallback;
}

/** Menyetel flag. `null` menghapus penyetelan sehingga kembali ke nilai bawaan. */
export function setFlag(name, value, storage = globalThis.localStorage) {
  try {
    if (value === null) storage?.removeItem(FLAG_PREFIX + name);
    else storage?.setItem(FLAG_PREFIX + name, value ? 'on' : 'off');
    return true;
  } catch {return false;}
}

/** Seluruh flag beserta nilai efektifnya. */
export function allFlags(storage = globalThis.localStorage) {
  return Object.fromEntries(Object.keys(DEFAULT_FLAGS).map(name => [name, readFlag(name, storage)]));
}

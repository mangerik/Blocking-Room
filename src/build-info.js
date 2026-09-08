// Identitas build yang terlihat pengguna (gate R1 catatan C-05, `docs/ROLLOUT.md` §8).
//
// Tujuannya satu: laporan bug dari pilot dapat ditelusuri ke build tertentu. Nilainya
// disuntikkan oleh `define` di `vite.config.js`; ketiga konstanta punya fallback supaya
// modul ini tetap dapat diimpor dari `node --test` (tanpa Vite) tanpa melempar.
/* global __APP_VERSION__, __APP_COMMIT__, __APP_BUILT_AT__ */

// Ketiga identifier di bawah diganti menjadi literal string oleh `define` saat build. Di luar
// Vite (mis. `node --test`) identifier itu tidak ada dan pembacaannya melempar ReferenceError —
// karena itu setiap pembacaan dibungkus try/catch dan punya nilai cadangan.
const read = (name, fallback) => {
  try {
    const value = name === 'version' ? __APP_VERSION__ : name === 'commit' ? __APP_COMMIT__ : __APP_BUILT_AT__;
    return typeof value === 'string' && value ? value : fallback;
  } catch {
    return fallback;
  }
};

export const BUILD_VERSION = read('version', '0.0.0-dev');
export const BUILD_COMMIT = read('commit', 'dev');
export const BUILD_TIME = read('builtAt', '');

/** Label pendek untuk footer dan panel metrik, mis. `v1.0.0 · 549b7f0`. */
export function buildLabel() {
  return `v${BUILD_VERSION} · ${BUILD_COMMIT}`;
}

/** Teks lengkap untuk `title=` — memuat waktu build bila tersedia. */
export function buildTitle() {
  const built = BUILD_TIME ? ` · dibangun ${BUILD_TIME}` : '';
  return `Versi build ${BUILD_VERSION}, commit ${BUILD_COMMIT}${built}. Sebutkan ini saat melaporkan bug.`;
}

// Deteksi kemampuan browser (F6-05) — satu tempat untuk semua pertanyaan
// "apakah browser ini bisa …".
//
// Aturan modul ini:
// 1. **Deteksi kemampuan, bukan browser.** Tidak ada sniffing user agent untuk
//    memutuskan fitur. `docs/BROWSER-SUPPORT.md` menurunkan matriks dukungan dari
//    hasil deteksi ini, bukan dari klaim per browser.
// 2. **Tidak pernah melempar.** Setiap probe dibungkus try/catch; browser yang
//    memblokir sebuah API (mode privat, kebijakan enterprise) tetap menghasilkan
//    objek kemampuan yang lengkap dengan nilai `false`.
// 3. **Efek samping minimum.** Probe WebGL membuat satu canvas sementara lalu
//    melepas konteksnya kembali, sehingga tidak menahan konteks GPU.
// 4. **Sinkron.** UI perlu memutuskan sebelum menggambar apa pun; probe yang
//    memerlukan await (kuota penyimpanan) bukan bagian dari objek ini.
import {MIME_CANDIDATES} from './export-service.js';

/** Melepas konteks WebGL probe supaya tidak menahan slot konteks GPU. */
function releaseContext(gl) {
  try {gl?.getExtension('WEBGL_lose_context')?.loseContext();} catch {/* opsional */}
}

function probeWebGL(scope) {
  const out = {webgl2: false, webgl1: false, renderer: null, vendor: null};
  const documentRef = scope.document;
  if (!documentRef?.createElement) return out;
  // Satu canvas hanya boleh memegang satu jenis konteks, jadi tiap probe memakai
  // canvas sendiri — kalau tidak, `webgl` selalu null setelah `webgl2` berhasil.
  for (const [key, name] of [['webgl2', 'webgl2'], ['webgl1', 'webgl']]) {
    let gl = null, canvas = null;
    try {
      canvas = documentRef.createElement('canvas');
      gl = canvas.getContext(name);
    } catch {gl = null;}
    if (!gl) continue;
    out[key] = true;
    if (!out.renderer) {
      try {
        const info = gl.getExtension('WEBGL_debug_renderer_info');
        if (info) {
          out.renderer = gl.getParameter(info.UNMASKED_RENDERER_WEBGL);
          out.vendor = gl.getParameter(info.UNMASKED_VENDOR_WEBGL);
        }
      } catch {/* beberapa browser menyembunyikan info ini */}
    }
    releaseContext(gl);
  }
  return out;
}

function probeIndexedDB(scope) {
  try {return typeof scope.indexedDB?.open === 'function';} catch {return false;}
}

function probeMediaRecorder(scope) {
  const out = {supported: false, canvasCapture: false, mimeTypes: [], preferred: null};
  const Recorder = scope.MediaRecorder;
  out.canvasCapture = typeof scope.HTMLCanvasElement?.prototype?.captureStream === 'function';
  if (typeof Recorder === 'undefined') return out;
  out.supported = out.canvasCapture;
  for (const type of MIME_CANDIDATES) {
    try {if (Recorder.isTypeSupported?.(type)) out.mimeTypes.push(type);} catch {/* abaikan */}
  }
  out.preferred = out.mimeTypes[0] ?? null;
  return out;
}

/**
 * Membaca seluruh kemampuan yang dipakai aplikasi.
 * @param {typeof globalThis} scope objek global yang diperiksa (dapat diganti saat uji)
 */
export function detectCapabilities(scope = globalThis) {
  const webgl = probeWebGL(scope);
  const mediaRecorder = probeMediaRecorder(scope);
  return {
    ...webgl,
    // WebGL2 adalah syarat viewport 3D; WebGL1 saja tidak cukup untuk renderer ini.
    webgl: webgl.webgl2,
    indexedDB: probeIndexedDB(scope),
    // Kunci writer antar-tab (F2-07) punya fallback heartbeat localStorage, jadi
    // Web Locks yang tidak ada bukan penghenti — hanya menurunkan jaminannya.
    webLocks: (() => {try {return typeof scope.navigator?.locks?.request === 'function';} catch {return false;}})(),
    broadcastChannel: typeof scope.BroadcastChannel === 'function',
    mediaRecorder,
    // VideoEncoder (WebCodecs) dipakai render deterministik pada Fase 5; belum wajib.
    videoEncoder: typeof scope.VideoEncoder === 'function',
    persistentStorage: (() => {try {return typeof scope.navigator?.storage?.persist === 'function';} catch {return false;}})(),
    structuredClone: typeof scope.structuredClone === 'function',
    localStorage: (() => {
      try {
        const probe = '__blocking-room-probe__';
        scope.localStorage.setItem(probe, '1');
        scope.localStorage.removeItem(probe);
        return true;
      } catch {return false;}
    })(),
  };
}

let cached = null;
/** Kemampuan yang dideteksi sekali per halaman. */
export function capabilities(scope = globalThis) {
  cached ??= detectCapabilities(scope);
  return cached;
}
/** Hanya untuk uji: memaksa deteksi ulang. */
export function resetCapabilities() {cached = null;}

/**
 * Daftar keterbatasan yang perlu ditampilkan ke pengguna, dalam Bahasa Indonesia.
 * Bukan daftar semua kemampuan — hanya yang mengubah apa yang bisa dikerjakan.
 * @returns {{id:string, level:'blocking'|'degraded', message:string}[]}
 */
export function capabilityWarnings(caps = capabilities()) {
  const list = [];
  if (!caps.webgl) {
    list.push({
      id: 'webgl',
      level: 'blocking',
      message: 'Browser ini tidak mendukung WebGL2, jadi viewport 3D tidak dapat ditampilkan. '
        + 'Daftar proyek, impor dan ekspor JSON tetap dapat dipakai.',
    });
  }
  if (!caps.indexedDB) {
    list.push({
      id: 'indexeddb',
      level: 'blocking',
      message: 'Penyimpanan lokal (IndexedDB) tidak tersedia. Pekerjaan hanya bertahan selama tab terbuka; '
        + 'unduh cadangan JSON sebelum menutup halaman.',
    });
  }
  if (!caps.mediaRecorder.supported || !caps.mediaRecorder.preferred) {
    list.push({
      id: 'mediarecorder',
      level: 'degraded',
      message: 'Browser ini tidak mendukung perekaman video dari canvas. Ekspor video dinonaktifkan; '
        + 'gunakan Chrome atau Edge untuk mengekspor.',
    });
  }
  if (!caps.webLocks) {
    list.push({
      id: 'weblocks',
      level: 'degraded',
      message: 'Web Locks tidak tersedia. Perlindungan satu penulis per proyek memakai heartbeat '
        + 'dan sedikit lebih lambat mendeteksi tab lain.',
    });
  }
  return list;
}

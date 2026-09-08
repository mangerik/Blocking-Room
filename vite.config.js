import {execSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {defineConfig} from 'vite';

// Versi build yang terlihat di UI (gate R1 C-05 / docs/ROLLOUT.md §8).
// Laporan bug pilot harus dapat ditelusuri ke build tertentu, jadi versi paket dan hash
// commit pendek disuntikkan saat build. Keduanya punya fallback: `git` bisa tidak ada
// pada mesin/CI yang membangun dari arsip tarball, dan kegagalan itu tidak boleh
// menggagalkan build.
const version = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version;
const git = (args, fallback) => {
  try {return execSync(`git ${args}`, {stdio: ['ignore', 'pipe', 'ignore']}).toString().trim() || fallback;}
  catch {return fallback;}
};
const commit = git('rev-parse --short HEAD', 'tanpa-git');
const dirty = git('status --porcelain', '') ? '+lokal' : '';

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __APP_COMMIT__: JSON.stringify(`${commit}${dirty}`),
    __APP_BUILT_AT__: JSON.stringify(new Date().toISOString()),
  },
  build: {rollupOptions: {output: {manualChunks: {three: ['three']}}}},
});

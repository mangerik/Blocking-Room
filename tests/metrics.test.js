// F6-06 — metrik lokal: skema tertutup, ring buffer, opt-in tanpa pengiriman.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  EVENT_SCHEMA, EVENT_NAMES, METRICS_KEY, MetricsRecorder, RING_LIMIT,
  TELEMETRY_OPT_IN_KEY, sanitizeProps,
} from '../src/metrics.js';

/** localStorage palsu yang cukup untuk MetricsRecorder. */
function fakeStorage({failOnWrite = false} = {}) {
  const map = new Map();
  return {
    map,
    getItem: key => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => {
      if (failOnWrite) throw new DOMException('kuota penuh', 'QuotaExceededError');
      map.set(key, String(value));
    },
    removeItem: key => {map.delete(key);},
  };
}

const recorder = options => new MetricsRecorder({storage: fakeStorage(), now: () => 1_700_000_000_000, sessionId: 'uji', ...options});

test('PRD §11: seluruh event yang diusulkan punya skema', () => {
  for (const name of [
    'project_created', 'project_opened', 'autosave_completed', 'autosave_failed',
    'editor_command', 'history_used', 'export_started', 'export_completed',
    'export_failed', 'recovery_used',
  ]) {
    assert.ok(EVENT_NAMES.includes(name), `event ${name} belum punya skema`);
  }
});

test('properti di luar skema dibuang', () => {
  const clean = sanitizeProps('editor_command', {
    command_type: 'move', source: 'pointer', affected_count: 3,
    projectTitle: 'Pertemuan di galeri', actorName: 'Alex', x: 3.4,
  });
  assert.deepEqual(clean, {command_type: 'move', source: 'pointer', affected_count: 3});
});

test('teks bebas tidak dapat lolos: nilai enum asing menjadi "other"', () => {
  const clean = sanitizeProps('editor_command', {command_type: 'Scene rahasia klien', source: 'Alex Wijaya'});
  assert.deepEqual(clean, {command_type: 'other', source: 'other'});
});

test('properti angka dipaksa menjadi angka dan dibatasi', () => {
  assert.deepEqual(sanitizeProps('history_used', {direction: 'undo', depth: '7'}), {direction: 'undo', depth: 7});
  assert.deepEqual(sanitizeProps('history_used', {direction: 'redo', depth: Number.NaN}), {direction: 'redo'});
  assert.equal(sanitizeProps('project_opened', {duration_ms: 1e30}).duration_ms, 1e12);
});

test('tidak ada nilai yang tersimpan mengandung teks di luar daftar tertutup', () => {
  const store = recorder();
  store.record('editor_command', {command_type: 'move', source: 'pointer', affected_count: 1});
  store.record('project_opened', {storage: 'local', duration_ms: 120, schemaVersion: 2, scenes: 3});
  store.record('export_failed', {codec: 'vp9', resolution: '720p', fps: 30, error_code: 'unsupported'});
  const allowed = new Set(['local', 'memory', 'move', 'pointer', 'vp9', '720p', 'unsupported', 'other']);
  for (const entry of store.list()) {
    for (const value of Object.values(entry.p)) {
      if (typeof value === 'string') assert.ok(allowed.has(value), `nilai teks tidak terduga: ${value}`);
    }
  }
});

test('event yang tidak dikenal tidak disimpan', () => {
  const store = recorder();
  assert.equal(store.record('scene_dump', {payload: 'seluruh dokumen'}), null);
  assert.equal(store.list().length, 0);
  assert.equal(store.dropped, 1);
});

test('ring buffer membuang event terlama', () => {
  const store = recorder({limit: 5});
  for (let i = 0; i < 12; i++) store.record('history_used', {direction: 'undo', depth: i});
  const list = store.list();
  assert.equal(list.length, 5);
  assert.deepEqual(list.map(entry => entry.p.depth), [7, 8, 9, 10, 11]);
});

test('batas bawaan ring buffer adalah RING_LIMIT', () => {
  assert.equal(new MetricsRecorder({storage: fakeStorage()}).limit, RING_LIMIT);
});

test('kegagalan penyimpanan tidak melempar', () => {
  const store = new MetricsRecorder({storage: fakeStorage({failOnWrite: true}), sessionId: 'uji'});
  assert.doesNotThrow(() => store.record('autosave_completed', {revision: 1, duration_ms: 10}));
  assert.equal(store.dropped, 1);
});

test('storage yang tidak ada sama sekali tetap aman', () => {
  const store = new MetricsRecorder({storage: undefined});
  assert.doesNotThrow(() => store.record('autosave_completed', {revision: 1}));
  assert.deepEqual(store.list(), []);
});

test('ringkasan menghitung per jenis event', () => {
  const store = recorder();
  store.record('history_used', {direction: 'undo', depth: 1});
  store.record('history_used', {direction: 'redo', depth: 1});
  store.record('editor_command', {command_type: 'move', source: 'keyboard'});
  assert.deepEqual(store.summary(), {history_used: 2, editor_command: 1});
});

test('ekspor JSON hanya berisi event tersaring dan skemanya', () => {
  const store = recorder();
  store.record('project_created', {storage: 'local', template: 'demo', duration_ms: 42, schemaVersion: 2});
  const payload = store.toExport();
  assert.equal(payload.count, 1);
  assert.deepEqual(payload.events[0].p, {storage: 'local', template: 'demo', duration_ms: 42, schemaVersion: 2});
  assert.deepEqual(payload.schema, EVENT_SCHEMA);
  assert.ok(!JSON.stringify(payload).includes('Pertemuan'));
});

test('opt-in telemetry hanya disimpan, tidak ada pengiriman', async () => {
  const storage = fakeStorage();
  const store = new MetricsRecorder({storage, sessionId: 'uji'});
  assert.equal(store.telemetryOptIn, false);
  store.setTelemetryOptIn(true);
  assert.equal(storage.getItem(TELEMETRY_OPT_IN_KEY), 'true');
  assert.equal(store.telemetryOptIn, true);
  // Bukti struktural: modul metrik tidak memuat satu pun pemanggilan jaringan.
  const source = await (await import('node:fs/promises')).readFile(new URL('../src/metrics.js', import.meta.url), 'utf8');
  for (const forbidden of ['fetch(', 'XMLHttpRequest', 'sendBeacon', 'WebSocket', 'import(']) {
    assert.ok(!source.includes(forbidden), `metrics.js tidak boleh memuat ${forbidden}`);
  }
});

test('clear mengosongkan ring buffer', () => {
  const store = recorder();
  store.record('history_used', {direction: 'undo', depth: 1});
  assert.equal(store.list().length, 1);
  store.clear();
  assert.deepEqual(store.list(), []);
  assert.equal(store.storage.getItem(METRICS_KEY), null);
});

test('isi ring buffer yang rusak tidak membuat pembacaan gagal', () => {
  const store = recorder();
  store.storage.setItem(METRICS_KEY, '{bukan json');
  assert.deepEqual(store.list(), []);
  store.storage.setItem(METRICS_KEY, '{"bukan":"array"}');
  assert.deepEqual(store.list(), []);
});

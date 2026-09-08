import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {join} from 'node:path';
import {validateProject} from '../src/model.js';
import {baselineOf} from './fixtures/baseline.mjs';
import {validFixtures, invalidFixtures} from './fixtures/generate.mjs';

const dir = new URL('./fixtures/', import.meta.url).pathname;
const read = path => JSON.parse(readFileSync(join(dir, path), 'utf8'));
const names = kind => readdirSync(join(dir, kind)).filter(f => f.endsWith('.json')).map(f => f.replace(/\.json$/, ''));

test('fixture v1 tersimpan lengkap dan cocok dengan generator', () => {
  const stored = names('v1');
  for (const name of Object.keys(validFixtures)) assert.ok(stored.includes(name), `fixture hilang: ${name}`);
  for (const name of Object.keys(invalidFixtures)) assert.ok(stored.includes(name), `fixture hilang: ${name}`);
  assert.equal(stored.length, Object.keys(validFixtures).length + Object.keys(invalidFixtures).length);
  for (const [name, make] of Object.entries(validFixtures)) assert.deepEqual(read(`v1/${name}.json`), make());
});

test('setiap fixture valid lolos validator v1 tanpa mengubah pose', () => {
  for (const name of Object.keys(validFixtures)) {
    const raw = read(`v1/${name}.json`);
    const before = structuredClone(raw);
    const validated = validateProject(raw);
    assert.deepEqual(validated.actors.map(a => a.keys), before.actors.map(a => a.keys), name);
    assert.deepEqual(validated.camera?.keys ?? null, before.camera?.keys ?? null, name);
  }
});

test('baseline pose awal/tengah/akhir sama dengan golden file', () => {
  for (const name of Object.keys(validFixtures)) {
    const project = validateProject(read(`v1/${name}.json`));
    assert.deepEqual(baselineOf(project), read(`baseline/${name}.json`), `baseline berubah: ${name}`);
  }
});

test('fixture invalid ditolak dan tidak memutasi sumbernya', () => {
  for (const name of Object.keys(invalidFixtures)) {
    const raw = read(`v1/${name}.json`);
    const before = structuredClone(raw);
    assert.throws(() => validateProject(raw), `seharusnya ditolak: ${name}`);
    if (name !== 'invalid-key-out-of-range') assert.deepEqual(raw, before, `sumber berubah: ${name}`);
  }
});

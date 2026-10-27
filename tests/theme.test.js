import test from 'node:test';
import assert from 'node:assert/strict';
import {THEME_KEY, applyTheme, currentTheme, initTheme, toggleTheme} from '../src/theme.js';

function environment({stored = null, systemDark = false} = {}) {
  const values = new Map(stored ? [[THEME_KEY, stored]] : []);
  const meta = {content: '', setAttribute(name, value) {if (name === 'content') this.content = value;}};
  globalThis.localStorage = {getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value)};
  globalThis.matchMedia = () => ({matches: systemDark});
  globalThis.document = {documentElement: {dataset: {}, style: {}}, querySelector: selector => selector === 'meta[name="theme-color"]' ? meta : null};
  globalThis.CustomEvent = class {constructor(type, options) {this.type = type; this.detail = options?.detail;}};
  globalThis.window = {dispatchEvent() {}};
  return {values, meta};
}

test('tema awal memakai preferensi tersimpan sebelum preferensi sistem', () => {
  environment({stored: 'light', systemDark: true});
  assert.equal(initTheme(), 'light');
  assert.equal(currentTheme(), 'light');
  assert.equal(document.documentElement.style.colorScheme, 'light');
});

test('toggle tema menerapkan dark mode, menyimpan preferensi, dan memperbarui browser chrome', () => {
  const {values, meta} = environment({stored: 'light'});
  applyTheme('light');
  assert.equal(toggleTheme(), 'dark');
  assert.equal(document.documentElement.dataset.theme, 'dark');
  assert.equal(values.get(THEME_KEY), 'dark');
  assert.equal(meta.content, '#161915');
});


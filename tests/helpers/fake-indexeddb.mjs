// Fake IndexedDB minimal untuk unit test Node — TANPA dependency baru.
//
// Hanya mengimplementasikan yang dipakai `src/repository.js`:
//   factory.open / onupgradeneeded / onsuccess
//   db.createObjectStore({keyPath}) · store.createIndex(name, keyPath)
//   db.transaction(names, mode) · tx.objectStore · tx.abort · oncomplete/onerror/onabort
//   store.get / put / delete / getAll · index.getAll / getAllKeys
//   IDBKeyRange.bound
//
// Sifat yang penting untuk pengujian: penulisan ditahan di staging dan baru
// diterapkan saat transaksi commit, sehingga abort benar-benar membatalkan semua
// perubahan (bukti transaksi atomik). Perilaku nyata tetap diuji di Chrome lewat
// `tests/repository-browser.mjs`.

const clone = value => (value === undefined ? undefined : structuredClone(value));

const compare = (a, b) => {
  if (Array.isArray(a) && Array.isArray(b)) {
    for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
      const c = compare(a[i], b[i]);
      if (c !== 0) return c;
    }
    return 0;
  }
  if (a === undefined) return b === undefined ? 0 : -1;
  if (b === undefined) return 1;
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
};

export class FakeKeyRange {
  constructor(lower, upper) {this.lower = lower; this.upper = upper;}
  static bound(lower, upper) {return new FakeKeyRange(lower, upper);}
  includes(key) {return compare(key, this.lower) >= 0 && compare(key, this.upper) <= 0;}
}

const pathValue = (value, keyPath) =>
  (Array.isArray(keyPath) ? keyPath.map(p => value?.[p]) : value?.[keyPath]);

class FakeRequest {
  constructor() {this.result = undefined; this.error = null; this.onsuccess = null; this.onerror = null;}
}

class FakeIndex {
  constructor(store, name, keyPath) {this.store = store; this.name = name; this.keyPath = keyPath;}
  entries(range) {
    return [...this.store.rows(this.name)]
      .map(([key, value]) => ({key, value, indexKey: pathValue(value, this.keyPath)}))
      .filter(e => !range || range.includes(e.indexKey))
      .sort((a, b) => compare(a.indexKey, b.indexKey) || compare(a.key, b.key));
  }
  getAll(range) {return this.store.request(() => this.entries(range).map(e => clone(e.value)));}
  getAllKeys(range) {return this.store.request(() => this.entries(range).map(e => e.key));}
}

class FakeObjectStore {
  constructor(tx, data, meta) {this.tx = tx; this.data = data; this.meta = meta;}
  get keyPath() {return this.meta.keyPath;}
  index(name) {
    if (!this.meta.indexes.has(name)) throw new Error(`Index ${name} tidak ada.`);
    return new FakeIndex(this, name, this.meta.indexes.get(name));
  }
  /** Pandangan gabungan data commit + staging transaksi berjalan. */
  rows() {
    const merged = new Map(this.data);
    for (const [key, value] of this.tx.staged(this.meta.name)) {
      if (value === undefined) merged.delete(key); else merged.set(key, value);
    }
    return merged;
  }
  request(fn) {return this.tx.enqueue(fn);}
  get(key) {return this.request(() => clone(this.rows().get(key)) ?? undefined);}
  getAll() {return this.request(() => [...this.rows().values()].map(clone));}
  put(value) {
    return this.request(() => {
      const key = pathValue(value, this.keyPath);
      if (key === undefined) throw new Error('Key tidak ditemukan pada nilai yang disimpan.');
      this.tx.stage(this.meta.name, key, clone(value));
      return key;
    });
  }
  delete(key) {return this.request(() => {this.tx.stage(this.meta.name, key, undefined); return undefined;});}
}

class FakeTransaction {
  constructor(db, names, mode) {
    this.db = db;
    this.names = Array.isArray(names) ? names : [names];
    this.mode = mode;
    this.pending = 0;
    this.finished = false;
    this.writes = new Map();
    this.oncomplete = null;
    this.onerror = null;
    this.onabort = null;
    this.error = null;
    this.completionTimer = null;
    this.scheduleCompletion();
  }
  staged(store) {return this.writes.get(store) ?? new Map();}
  stage(store, key, value) {
    if (this.mode !== 'readwrite') throw new Error('Transaksi readonly tidak boleh menulis.');
    if (!this.writes.has(store)) this.writes.set(store, new Map());
    this.writes.get(store).set(key, value);
  }
  objectStore(name) {
    if (!this.names.includes(name)) throw new Error(`Store ${name} tidak termasuk transaksi.`);
    const meta = this.db.stores.get(name);
    if (!meta) throw new Error(`Store ${name} tidak ada.`);
    return new FakeObjectStore(this, meta.data, meta);
  }
  enqueue(fn) {
    const request = new FakeRequest();
    this.pending += 1;
    queueMicrotask(() => {
      this.pending -= 1;
      if (this.finished) return;
      try {
        request.result = fn();
        request.onsuccess?.({target: request});
      } catch (error) {
        request.error = error;
        request.onerror?.({target: request});
        this.abort(error);
        return;
      }
      this.scheduleCompletion();
    });
    return request;
  }
  /**
   * IndexedDB melakukan commit ketika transaksi tidak lagi punya permintaan tertunda
   * dan kendali kembali ke event loop. Pemeriksaan memakai makrotask supaya seluruh
   * rantai microtask (`await` di dalam body transaksi) selesai lebih dahulu — persis
   * seperti perilaku browser.
   */
  scheduleCompletion() {
    clearTimeout(this.completionTimer);
    this.completionTimer = setTimeout(() => {
      if (this.finished) return;
      if (this.pending > 0) {this.scheduleCompletion(); return;}
      this.finished = true;
      for (const [store, writes] of this.writes) {
        const {data} = this.db.stores.get(store);
        for (const [key, value] of writes) {
          if (value === undefined) data.delete(key); else data.set(key, value);
        }
      }
      this.oncomplete?.();
    }, 0);
  }
  abort(error) {
    if (this.finished) return;
    clearTimeout(this.completionTimer);
    this.finished = true;
    this.error = error ?? null;
    this.writes.clear();
    queueMicrotask(() => this.onabort?.());
  }
}

class FakeDatabase {
  constructor(name) {this.name = name; this.stores = new Map(); this.closed = false;}
  get objectStoreNames() {
    const names = [...this.stores.keys()];
    return {contains: n => names.includes(n), length: names.length};
  }
  createObjectStore(name, {keyPath}) {
    const meta = {name, keyPath, data: new Map(), indexes: new Map()};
    this.stores.set(name, meta);
    return {createIndex: (indexName, indexPath) => meta.indexes.set(indexName, indexPath)};
  }
  transaction(names, mode = 'readonly') {
    if (this.closed) throw new Error('Database sudah ditutup.');
    return new FakeTransaction(this, names, mode);
  }
  close() {this.closed = true;}
}

/** Factory in-memory. Satu instance = satu "profil browser" (bisa dibagi antar tab palsu). */
export class FakeIndexedDB {
  constructor() {this.databases = new Map();}
  open(name) {
    const request = new FakeRequest();
    request.onupgradeneeded = null;
    request.onblocked = null;
    const fresh = !this.databases.has(name);
    if (fresh) this.databases.set(name, new FakeDatabase(name));
    const db = this.databases.get(name);
    queueMicrotask(() => {
      if (fresh) request.onupgradeneeded?.({target: {result: db}});
      db.closed = false;
      request.result = db;
      request.onsuccess?.({target: request});
    });
    return request;
  }
  deleteDatabase(name) {
    const request = new FakeRequest();
    this.databases.delete(name);
    queueMicrotask(() => request.onsuccess?.({target: request}));
    return request;
  }
}

/** Storage palsu bergaya localStorage untuk uji migrasi tanpa browser. */
export class FakeStorage {
  constructor(entries = {}) {this.map = new Map(Object.entries(entries));}
  getItem(key) {return this.map.has(key) ? this.map.get(key) : null;}
  setItem(key, value) {this.map.set(key, String(value));}
  removeItem(key) {this.map.delete(key);}
  clear() {this.map.clear();}
  get length() {return this.map.size;}
  key(index) {return [...this.map.keys()][index] ?? null;}
}

// Almacenamiento offline con IndexedDB (la "base de datos" interna del navegador).
// Un solo object store, `colectas`: una fila por colecta, con su foto en base64
// hasta que exista la sincronización con Google Drive (etapa siguiente).

const DB_NAME = 'colecta-semillas';
const DB_VERSION = 1;
const STORE = 'colectas';

let _db = null;

function open() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const s = db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
        s.createIndex('sincronizado', 'sincronizado', { unique: false });
        s.createIndex('record_id', 'record_id', { unique: true });
      }
    };
    req.onsuccess = (e) => { _db = e.target.result; resolve(_db); };
    req.onerror = () => reject(req.error);
  });
}

function tx(mode, fn) {
  return open().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = fn(t.objectStore(STORE));
        t.oncomplete = () => resolve(req ? req.result : undefined);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      })
  );
}

export function addColecta(reg) {
  const now = new Date().toISOString();
  reg.fecha_creacion = now;
  reg.fecha_ultima_modificacion = now;
  reg.sincronizado = 0;
  return tx('readwrite', (s) => s.add(reg));
}

export function updateColecta(reg) {
  reg.fecha_ultima_modificacion = new Date().toISOString();
  return tx('readwrite', (s) => s.put(reg));
}

export function deleteColecta(id) {
  return tx('readwrite', (s) => s.delete(id));
}

export function getColecta(id) {
  return tx('readonly', (s) => s.get(id));
}

export function getColectas() {
  return tx('readonly', (s) => s.getAll()).then((r) => r || []);
}

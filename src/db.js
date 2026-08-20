const DB_NAME = "diagram-tool-db";
const DB_VERSION = 1;

function openDatabase() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("diagrams")) {
        db.createObjectStore("diagrams", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("meta")) {
        db.createObjectStore("meta", { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function reqPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function saveDiagram(diagram) {
  const db = await openDatabase();
  const tx = db.transaction("diagrams", "readwrite");
  tx.objectStore("diagrams").put(diagram);
  await txDone(tx);
}

export async function getAllDiagrams() {
  const db = await openDatabase();
  const tx = db.transaction("diagrams", "readonly");
  const result = await reqPromise(tx.objectStore("diagrams").getAll());
  return (result || []).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function deleteDiagram(id) {
  const db = await openDatabase();
  const tx = db.transaction("diagrams", "readwrite");
  tx.objectStore("diagrams").delete(id);
  await txDone(tx);
}

export async function saveMeta(key, value) {
  const db = await openDatabase();
  const tx = db.transaction("meta", "readwrite");
  tx.objectStore("meta").put({ key, value });
  await txDone(tx);
}

export async function getMeta(key) {
  const db = await openDatabase();
  const tx = db.transaction("meta", "readonly");
  const result = await reqPromise(tx.objectStore("meta").get(key));
  return result ? result.value : null;
}

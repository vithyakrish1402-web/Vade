/**
 * Local cryptographic key storage using browser IndexedDB with in-memory fallback.
 * Private keys are stored locally and NEVER transmitted over network.
 */

const DB_NAME = 'enctxt_crypto_db';
const DB_VERSION = 1;
const STORE_NAME = 'identity_keys';

interface StoredKeyRecord {
  userId: string;
  keyId: string;
  privateKey: CryptoKey;
  publicKey: CryptoKey;
  publicKeyBase64: string;
  createdAt: number;
}

// In-memory fallback map for non-IndexedDB environments (e.g. Node tests)
const memoryKeyStore = new Map<string, StoredKeyRecord>();

function isIndexedDBAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'userId' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveIdentityKeys(
  userId: string,
  keyId: string,
  keyPair: CryptoKeyPair,
  publicKeyBase64: string
): Promise<void> {
  const record: StoredKeyRecord = {
    userId,
    keyId,
    privateKey: keyPair.privateKey,
    publicKey: keyPair.publicKey,
    publicKeyBase64,
    createdAt: Date.now(),
  };

  if (!isIndexedDBAvailable()) {
    memoryKeyStore.set(userId, record);
    return;
  }

  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(record);

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    memoryKeyStore.set(userId, record);
  }
}

export async function loadIdentityKeys(
  userId: string
): Promise<{ keyId: string; keyPair: CryptoKeyPair; publicKeyBase64: string } | null> {
  if (!isIndexedDBAvailable()) {
    const record = memoryKeyStore.get(userId);
    if (!record) return null;
    return {
      keyId: record.keyId,
      keyPair: {
        privateKey: record.privateKey,
        publicKey: record.publicKey,
      },
      publicKeyBase64: record.publicKeyBase64,
    };
  }

  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(userId);

      req.onsuccess = () => {
        const record = req.result as StoredKeyRecord | undefined;
        if (!record) {
          // Check memory store as fallback
          const mem = memoryKeyStore.get(userId);
          if (mem) {
            resolve({
              keyId: mem.keyId,
              keyPair: { privateKey: mem.privateKey, publicKey: mem.publicKey },
              publicKeyBase64: mem.publicKeyBase64,
            });
          } else {
            resolve(null);
          }
          return;
        }

        resolve({
          keyId: record.keyId,
          keyPair: {
            privateKey: record.privateKey,
            publicKey: record.publicKey,
          },
          publicKeyBase64: record.publicKeyBase64,
        });
      };

      req.onerror = () => reject(req.error);
    });
  } catch {
    const record = memoryKeyStore.get(userId);
    if (!record) return null;
    return {
      keyId: record.keyId,
      keyPair: {
        privateKey: record.privateKey,
        publicKey: record.publicKey,
      },
      publicKeyBase64: record.publicKeyBase64,
    };
  }
}

export async function deleteIdentityKeys(userId: string): Promise<void> {
  memoryKeyStore.delete(userId);

  if (!isIndexedDBAvailable()) return;

  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(userId);

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    // Ignore cleanup error
  }
}

export function clearMemoryKeys(): void {
  memoryKeyStore.clear();
}

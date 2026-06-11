import * as SQLite from "expo-sqlite";
import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import CryptoJS from "crypto-js";

const DB_NAME = "netraastra-offline.db";
const ENCRYPTION_KEY_STORE_KEY = "offline_cache_key_v1";

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;
let keyPromise: Promise<string> | null = null;

async function createDb(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync(DB_NAME);
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS cached_scans (
      id TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS cached_legal_analyses (
      id TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS cached_bns_mappings (
      id TEXT PRIMARY KEY,
      payload TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS scan_outbox (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      file_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      payload TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      error_message TEXT,
      created_at TEXT NOT NULL
    );
  `);
  return db;
}

/** Lazily opens (and migrates) the local offline cache database. */
export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) dbPromise = createDb();
  return dbPromise;
}

// Generates a random 256-bit AES key on first use and persists it in the
// platform secure keystore (Keychain / Keystore) via expo-secure-store.
async function getEncryptionKey(): Promise<string> {
  if (!keyPromise) {
    keyPromise = (async () => {
      const existing = await SecureStore.getItemAsync(ENCRYPTION_KEY_STORE_KEY);
      if (existing) return existing;

      const bytes = await Crypto.getRandomBytesAsync(32);
      const key = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
      await SecureStore.setItemAsync(ENCRYPTION_KEY_STORE_KEY, key);
      return key;
    })();
  }
  return keyPromise;
}

/** Encrypts a JSON-serializable value for storage in the local cache. */
export async function encryptJson(value: unknown): Promise<string> {
  const key = await getEncryptionKey();
  return CryptoJS.AES.encrypt(JSON.stringify(value), key).toString();
}

/** Decrypts a value previously stored with {@link encryptJson}. */
export async function decryptJson<T>(ciphertext: string): Promise<T> {
  const key = await getEncryptionKey();
  const bytes = CryptoJS.AES.decrypt(ciphertext, key);
  return JSON.parse(bytes.toString(CryptoJS.enc.Utf8)) as T;
}

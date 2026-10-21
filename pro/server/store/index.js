import { MemoryStore } from './memory.js';
import { FileStore } from './file.js';

export async function openStore(cfg) {
  if (cfg.dataStore === 'file') return new FileStore(cfg.dataDir);
  if (cfg.dataStore === 'firestore') {
    const { FirestoreStore } = await import('./firestore.js');   // only loaded when used
    return new FirestoreStore({ projectId: cfg.firestoreProject });
  }
  return new MemoryStore();
}

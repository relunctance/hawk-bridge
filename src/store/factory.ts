import type { MemoryStore } from './interface.js';
import { LanceDBAdapter } from './adapters/lancedb.js';

let storeInstance: MemoryStore | null = null;

export async function createMemoryStore(provider: string = 'lancedb'): Promise<MemoryStore> {
  switch (provider) {
    case 'lancedb':
      return new LanceDBAdapter();
    case 'qdrant':
      // TODO: implement qdrant adapter
      throw new Error('Qdrant adapter not implemented yet');
    default:
      throw new Error(`Unknown memory store provider: ${provider}`);
  }
}

export async function getMemoryStore(): Promise<MemoryStore> {
  if (!storeInstance) {
    storeInstance = await createMemoryStore(process.env.HAWK_DB_PROVIDER || 'lancedb');
    await storeInstance.init();
  }
  return storeInstance;
}

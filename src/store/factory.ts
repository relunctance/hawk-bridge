import type { MemoryStore } from './interface.js';
import { LanceDBAdapter } from './adapters/lancedb.js';
import { HTTPAdapter } from './adapters/http.js';

let storeInstance: MemoryStore | null = null;

export async function createMemoryStore(provider: string = 'lancedb'): Promise<MemoryStore> {
  switch (provider) {
    case 'lancedb':
      return new LanceDBAdapter();
    case 'http':
      return new HTTPAdapter();
    // Qdrant 适配器开发中，临时禁用
    // case 'qdrant':
    //   throw new Error('Qdrant adapter not implemented yet');
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

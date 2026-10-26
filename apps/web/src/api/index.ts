import { mockCatalog, mockClient } from './client';
import { createHttpCatalog, createHttpClient } from './http';
import { createHttpStore, createMockStore } from './store';

/**
 * Qual "motor" a interface usa. Por padrão, a API de verdade.
 * `VITE_USE_MOCK=1` liga o cliente simulado (útil para trabalhar só no visual); os testes também usam o simulado.
 */
const useMock = import.meta.env.MODE === 'test' || import.meta.env.VITE_USE_MOCK === '1';

export const defaultClient = useMock ? mockClient : createHttpClient(import.meta.env.VITE_API_URL ?? '');

export const defaultCatalog = useMock ? mockCatalog : createHttpCatalog(import.meta.env.VITE_API_URL ?? '');

export const defaultStore = useMock ? createMockStore() : createHttpStore(import.meta.env.VITE_API_URL ?? '');

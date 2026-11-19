const store = (globalThis.__sortline_kvs = globalThis.__sortline_kvs || new Map());
export const kvs = {
  get: async (k) => (store.has(k) ? store.get(k) : undefined),
  set: async (k, v) => { store.set(k, v); },
  delete: async (k) => { store.delete(k); },
};
export const __store = store;

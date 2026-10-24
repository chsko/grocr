/** The subset of MMKV the app uses, so pure modules can be tested with an in-memory store. */
export type KeyValueStore = {
  getString(key: string): string | undefined;
  set(key: string, value: string): void;
  remove(key: string): boolean;
  getAllKeys(): string[];
};

export function memoryStore(): KeyValueStore {
  const map = new Map<string, string>();
  return {
    getString: (key) => map.get(key),
    set: (key, value) => void map.set(key, value),
    remove: (key) => map.delete(key),
    getAllKeys: () => [...map.keys()],
  };
}

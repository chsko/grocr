// MMKV is a native (Nitro) module; tests use an in-memory store with the same interface.
jest.mock('react-native-mmkv', () => ({
  createMMKV: () => jest.requireActual('@/lib/key-value-store').memoryStore(),
}));

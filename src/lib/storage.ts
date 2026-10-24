import { createMMKV } from 'react-native-mmkv';

import type { KeyValueStore } from './key-value-store';

export const storage: KeyValueStore = createMMKV({ id: 'grocr' });

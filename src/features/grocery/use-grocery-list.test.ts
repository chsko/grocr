import { act, renderHook, waitFor } from '@testing-library/react-native';

import type { Id } from '@/convex/_generated/dataModel';
import { storage } from '@/lib/storage';

import { createGroceryOfflineStore } from './offline-store';
import { useGroceryList } from './use-grocery-list';

const mockQuery = jest.fn();
const mockSend = jest.fn();
const mockConnection = { isWebSocketConnected: false };

jest.mock('convex/react', () => ({
  useQuery: () => mockQuery(),
  useConvexConnectionState: () => mockConnection,
  useMutation: () => Object.assign(mockSend, { withOptimisticUpdate: () => mockSend }),
}));

const groupId = 'g1' as Id<'groups'>;
const startDate = '2026-10-26';
const items = [
  { _id: 'a', name: 'Milk', section: 'Dairy', checked: false },
  { _id: 'b', name: 'Onion', section: 'Produce', checked: false },
];

beforeEach(() => {
  for (const key of storage.getAllKeys()) storage.remove(key);
  mockQuery.mockReset();
  mockSend.mockReset();
});

test('cold start without signal shows the list saved on the device', async () => {
  createGroceryOfflineStore(storage, 'u1').saveList({ groupId, startDate, items, savedAt: 42 });
  mockQuery.mockReturnValue(undefined); // no server answer yet

  const { result } = await renderHook(() => useGroceryList('u1', groupId, startDate));

  expect(result.current.source).toBe('cache');
  expect(result.current.savedAt).toBe(42);
  expect(result.current.items.map((item) => item.name)).toEqual(['Milk', 'Onion']);
});

test('a live result is saved for the next cold start', async () => {
  mockQuery.mockReturnValue({ list: {}, items: [{ ...items[0], groupId, listId: 'l1' }] });
  await renderHook(() => useGroceryList('u1', groupId, startDate));
  expect(createGroceryOfflineStore(storage, 'u1').loadList(groupId, startDate)?.items).toEqual([
    items[0],
  ]);
});

test('an offline tick shows at once, survives a restart, and is resent until confirmed', async () => {
  createGroceryOfflineStore(storage, 'u1').saveList({ groupId, startDate, items, savedAt: 1 });
  mockQuery.mockReturnValue(undefined);
  mockSend.mockReturnValue(new Promise(() => {})); // offline: Convex holds the mutation

  const first = await renderHook(() => useGroceryList('u1', groupId, startDate));
  await act(async () => first.result.current.setChecked(['a'], true));
  expect(first.result.current.items[0].checked).toBe(true);
  expect(first.result.current.pendingCount).toBe(1);
  await first.unmount(); // the app is killed before reconnecting

  mockSend.mockReset();
  mockSend.mockResolvedValue(1);
  const second = await renderHook(() => useGroceryList('u1', groupId, startDate));
  expect(second.result.current.items[0].checked).toBe(true);
  await waitFor(() => expect(second.result.current.pendingCount).toBe(0));
  expect(mockSend).toHaveBeenCalledWith({ itemIds: ['a'], checked: true });
});

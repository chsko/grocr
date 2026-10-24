import { act, renderHook, waitFor } from '@testing-library/react-native';
import { ConvexError } from 'convex/values';

import type { Id } from '@/convex/_generated/dataModel';
import { storage } from '@/lib/storage';

import { createGroceryOfflineStore } from './offline-store';
import { useGroceryList } from './use-grocery-list';

const mockQuery = jest.fn();
const mockSend = jest.fn();
const mockConnection = { isWebSocketConnected: false };
const mockAuth = { isAuthenticated: true, isLoading: false };

// Like the real client, every call returns new function objects.
jest.mock('convex/react', () => ({
  useQuery: () => mockQuery(),
  useConvexAuth: () => mockAuth,
  useConvexConnectionState: () => mockConnection,
  useMutation: () => {
    const mutation = (args: unknown) => mockSend(args);
    mutation.withOptimisticUpdate = () => (args: unknown) => mockSend(args);
    return mutation;
  },
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
  mockConnection.isWebSocketConnected = false;
  mockAuth.isAuthenticated = true;
});

test('cold start without signal shows the list saved on the device', async () => {
  createGroceryOfflineStore(storage, 'u1').saveList({ groupId, startDate, items, savedAt: 42 });
  mockQuery.mockReturnValue(undefined); // no server answer yet

  const { result } = await renderHook(() => useGroceryList('u1', groupId, startDate));

  expect(result.current.source).toBe('cache');
  expect(result.current.savedAt).toBe(42);
  expect(result.current.items.map((item) => item.name)).toEqual(['Milk', 'Onion']);
});

test('settles after a few renders even though the client returns new functions', async () => {
  mockConnection.isWebSocketConnected = true;
  mockQuery.mockReturnValue(undefined);
  mockSend.mockResolvedValue(0);
  let renders = 0;
  await renderHook(() => {
    renders++;
    return useGroceryList('u1', groupId, startDate);
  });
  await act(async () => {});
  expect(renders).toBeLessThan(5);
});

test('a live result is saved for the next cold start', async () => {
  mockQuery.mockReturnValue({ list: {}, items: [{ ...items[0], groupId, listId: 'l1' }] });
  await renderHook(() => useGroceryList('u1', groupId, startDate));
  expect(createGroceryOfflineStore(storage, 'u1').loadList(groupId, startDate)?.items).toEqual([
    items[0],
  ]);
});

test('an offline tick shows at once, survives a restart, and is resent once online', async () => {
  createGroceryOfflineStore(storage, 'u1').saveList({ groupId, startDate, items, savedAt: 1 });
  mockQuery.mockReturnValue(undefined);
  mockSend.mockReturnValue(new Promise(() => {})); // offline: Convex holds the mutation

  const first = await renderHook(() => useGroceryList('u1', groupId, startDate));
  await act(async () => first.result.current.setChecked(['a'], true));
  expect(first.result.current.items[0].checked).toBe(true);
  expect(first.result.current.pendingCount).toBe(1);
  await first.unmount(); // the app is killed before reconnecting

  // Cold start, still offline: the tick is still shown and still queued.
  mockSend.mockReset();
  mockSend.mockResolvedValue(1);
  const second = await renderHook(() => useGroceryList('u1', groupId, startDate));
  expect(second.result.current.items[0].checked).toBe(true);
  expect(second.result.current.pendingCount).toBe(1);
});

test('queued ticks are kept when the server says the session is not signed in yet', async () => {
  createGroceryOfflineStore(storage, 'u1').queueChecks(['a'], true);
  mockConnection.isWebSocketConnected = true;
  mockQuery.mockReturnValue(undefined);
  mockSend.mockRejectedValue(new ConvexError({ code: 'UNAUTHENTICATED' }));

  const { result } = await renderHook(() => useGroceryList('u2', groupId, startDate));
  await act(async () => {});
  expect(createGroceryOfflineStore(storage, 'u1').pendingChecks()).toHaveLength(1);
  expect(result.current.pendingCount).toBe(0); // u2 never sees u1's queue
});

test('nothing is sent before auth is ready', async () => {
  createGroceryOfflineStore(storage, 'u3').queueChecks(['a'], true);
  mockConnection.isWebSocketConnected = true;
  mockAuth.isAuthenticated = false;
  mockQuery.mockReturnValue(undefined);
  await renderHook(() => useGroceryList('u3', groupId, startDate));
  await act(async () => {});
  expect(mockSend).not.toHaveBeenCalled();
});

test('reconnecting sends the queue and clears it once confirmed', async () => {
  createGroceryOfflineStore(storage, 'u4').queueChecks(['a'], true);
  mockConnection.isWebSocketConnected = true;
  mockQuery.mockReturnValue(undefined);
  mockSend.mockResolvedValue(1);
  const { result } = await renderHook(() => useGroceryList('u4', groupId, startDate));
  await waitFor(() => expect(result.current.pendingCount).toBe(0));
  expect(mockSend).toHaveBeenCalledWith({ itemIds: ['a'], checked: true });
});

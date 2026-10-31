import { fireEvent, render as rtlRender, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { UpdateBanner } from '@/components/update-banner';
import i18n from '@/lib/i18n';
import { checkForUpdateNow, FOREGROUND_CHECK_INTERVAL_MS } from '@/lib/updates';

const mockState = {
  isEnabled: true,
  isUpdatePending: false,
  downloadedUpdate: undefined as { updateId: string } | undefined,
};
const mockReload = jest.fn(() => Promise.resolve());
const mockCheck = jest.fn(() => Promise.resolve({ isAvailable: true }));
const mockFetch = jest.fn(() => Promise.resolve({ isNew: true }));
jest.mock('expo-updates', () => ({
  get isEnabled() {
    return mockState.isEnabled;
  },
  useUpdates: () => ({
    isUpdatePending: mockState.isUpdatePending,
    downloadedUpdate: mockState.downloadedUpdate,
  }),
  reloadAsync: () => mockReload(),
  checkForUpdateAsync: () => mockCheck(),
  fetchUpdateAsync: () => mockFetch(),
}));

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};
const render = () =>
  rtlRender(
    <SafeAreaProvider initialMetrics={metrics}>
      <UpdateBanner />
    </SafeAreaProvider>,
  );

beforeEach(async () => {
  jest.clearAllMocks();
  mockState.isEnabled = true;
  mockState.isUpdatePending = false;
  mockState.downloadedUpdate = undefined;
  await i18n.changeLanguage('en');
});

test('shows nothing until an update has downloaded', async () => {
  await render();
  expect(screen.queryByText('New version ready')).toBeNull();
});

test('shows nothing where expo-updates is off (Expo Go, dev, web)', async () => {
  mockState.isEnabled = false;
  mockState.isUpdatePending = true;
  mockState.downloadedUpdate = { updateId: 'a' };
  await render();
  expect(screen.queryByText('New version ready')).toBeNull();
});

test('tapping the banner reloads into the new version', async () => {
  mockState.isUpdatePending = true;
  mockState.downloadedUpdate = { updateId: 'a' };
  await render();
  await fireEvent.press(screen.getByRole('button', { name: 'New version ready, Update' }));
  expect(mockReload).toHaveBeenCalledTimes(1);
});

test('closing hides it until a newer update arrives', async () => {
  mockState.isUpdatePending = true;
  mockState.downloadedUpdate = { updateId: 'c' };
  const view = await render();
  await fireEvent.press(screen.getByRole('button', { name: 'Not now' }));
  expect(screen.queryByText('New version ready')).toBeNull();
  expect(mockReload).not.toHaveBeenCalled();

  mockState.downloadedUpdate = { updateId: 'd' };
  await view.rerender(
    <SafeAreaProvider initialMetrics={metrics}>
      <UpdateBanner />
    </SafeAreaProvider>,
  );
  expect(screen.getByText('New version ready')).toBeTruthy();
});

test('speaks Norwegian', async () => {
  mockState.isUpdatePending = true;
  mockState.downloadedUpdate = { updateId: 'a' };
  await i18n.changeLanguage('nb');
  await render();
  expect(screen.getByText('Ny versjon er klar')).toBeTruthy();
  expect(screen.getByText('Oppdater')).toBeTruthy();
});

test('foreground checks download a new update at most once per interval', async () => {
  const later = Date.now() + FOREGROUND_CHECK_INTERVAL_MS + 1;
  await checkForUpdateNow(later);
  expect(mockCheck).toHaveBeenCalledTimes(1);
  expect(mockFetch).toHaveBeenCalledTimes(1);

  await checkForUpdateNow(later + 1000);
  expect(mockCheck).toHaveBeenCalledTimes(1);

  await checkForUpdateNow(later + FOREGROUND_CHECK_INTERVAL_MS);
  expect(mockCheck).toHaveBeenCalledTimes(2);
});

import { act, fireEvent, render as rtlRender, screen } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import WhatsNewScreen from '@/app/whats-new';
import { WhatsNewSheet } from '@/components/whats-new';
import i18n from '@/lib/i18n';
import { SessionContext, type Me } from '@/lib/session';
import { LATEST_WHATS_NEW } from '@/lib/whats-new';

const mockSee = jest.fn((_: { upTo: number }) => Promise.resolve(null));
jest.mock('convex/react', () => ({
  useMutation: () => mockSee,
}));
jest.mock('@/convex/_generated/api', () => ({
  api: new Proxy(
    {},
    { get: (_, mod) => new Proxy({}, { get: (__, fn) => `${String(mod)}.${String(fn)}` }) },
  ),
}));
const mockRouter = { navigate: jest.fn(), push: jest.fn() };
let mockPathname = '/week';
jest.mock('expo-router', () => ({
  get router() {
    return mockRouter;
  },
  usePathname: () => mockPathname,
}));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  selectionAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light' },
}));

// undefined stands for a backend from before GRO-66, which leaves the field out.
const me = (whatsNewSeen: number | null | undefined, tourDone = true): Me => ({
  user: {
    _id: 'u1' as Me['user']['_id'],
    name: 'Kari',
    email: undefined,
    tourDone,
    whatsNewSeen: whatsNewSeen as number | null,
  },
  family: null,
});

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};
const render = (ui: React.ReactElement, value: Me) =>
  rtlRender(
    <SafeAreaProvider initialMetrics={metrics}>
      <SessionContext.Provider value={value}>{ui}</SessionContext.Provider>
    </SafeAreaProvider>,
  );

async function openSheet(value: Me) {
  await render(<WhatsNewSheet />, value);
  await act(() => jest.advanceTimersByTime(1000));
}

beforeEach(async () => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockPathname = '/week';
  await i18n.changeLanguage('en');
});
afterEach(() => {
  jest.useRealTimers();
});

describe("what's new sheet", () => {
  test('rises after a moment with only the entries they have not seen', async () => {
    await render(<WhatsNewSheet />, me(LATEST_WHATS_NEW - 1));
    expect(screen.queryByText('New in Grocr')).toBeNull();
    await act(() => jest.advanceTimersByTime(1000));
    expect(screen.getByText('New in Grocr')).toBeTruthy();
    expect(screen.getByText('Link to a recipe online')).toBeTruthy();
    expect(screen.queryByText('Dinner ideas')).toBeNull();
  });

  test('stays away when everything is seen, or before the tour is done', async () => {
    await openSheet(me(LATEST_WHATS_NEW));
    expect(screen.queryByText('New in Grocr')).toBeNull();
    await openSheet(me(null, false));
    expect(screen.queryByText('New in Grocr')).toBeNull();
  });

  test('a new member finishing the tour never sees it', async () => {
    // The tour hands over to the tabs before its write lands, then tourDone and the seen
    // marker arrive together.
    const view = await render(<WhatsNewSheet />, me(null, false));
    await act(() => jest.advanceTimersByTime(1000));
    await view.rerender(
      <SafeAreaProvider initialMetrics={metrics}>
        <SessionContext.Provider value={me(LATEST_WHATS_NEW, true)}>
          <WhatsNewSheet />
        </SessionContext.Provider>
      </SafeAreaProvider>,
    );
    await act(() => jest.advanceTimersByTime(1000));
    expect(screen.queryByText('New in Grocr')).toBeNull();
  });

  test('an older backend without the field shows nothing, so it cannot repeat', async () => {
    await openSheet(me(undefined));
    expect(screen.queryByText('New in Grocr')).toBeNull();
  });

  test('waits while another screen is open over the tabs', async () => {
    mockPathname = '/recipe/edit';
    await openSheet(me(null));
    expect(screen.queryByText('New in Grocr')).toBeNull();
  });

  test('closing records everything as seen, with a light tap', async () => {
    await openSheet(me(null));
    await fireEvent.press(screen.getByText('Nice'));
    expect(mockSee).toHaveBeenCalledWith({ upTo: LATEST_WHATS_NEW });
    expect(Haptics.impactAsync).toHaveBeenCalledWith('light');
    expect(screen.queryByText('New in Grocr')).toBeNull();
  });

  test('tapping outside closes it too', async () => {
    await openSheet(me(null));
    await fireEvent.press(screen.getByLabelText('Close'));
    expect(mockSee).toHaveBeenCalledWith({ upTo: LATEST_WHATS_NEW });
  });

  test('"Show me" closes it and opens the feature', async () => {
    await openSheet(me(LATEST_WHATS_NEW - 1));
    await fireEvent.press(screen.getByRole('link', { name: 'Show me: Link to a recipe online' }));
    expect(mockSee).toHaveBeenCalledWith({ upTo: LATEST_WHATS_NEW });
    expect(mockRouter.navigate).toHaveBeenCalledWith('/recipes');
    expect(screen.queryByText('New in Grocr')).toBeNull();
  });

  test('speaks Norwegian', async () => {
    await i18n.changeLanguage('nb');
    await openSheet(me(LATEST_WHATS_NEW - 1));
    expect(screen.getByText('Nytt i Grocr')).toBeTruthy();
    expect(screen.getByText('Lenke til oppskrifter på nett')).toBeTruthy();
    expect(screen.getByText('Fint')).toBeTruthy();
  });
});

describe("Family > What's new", () => {
  test('lists every entry by date, marks the unseen ones, and saves them as seen', async () => {
    await render(<WhatsNewScreen />, me(LATEST_WHATS_NEW - 2));
    expect(screen.getByText('Dark mode')).toBeTruthy();
    expect(screen.getByText('Dinner ideas')).toBeTruthy();
    expect(screen.getAllByText('New')).toHaveLength(2);
    expect(screen.getByText('31 Oct')).toBeTruthy();
    expect(mockSee).toHaveBeenCalledWith({ upTo: LATEST_WHATS_NEW });
  });
});

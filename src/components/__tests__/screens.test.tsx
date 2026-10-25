import { fireEvent, render as rtlRender, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import WeekScreen from '@/app/(tabs)/week';
import { slideFrom } from '@/components/ui';
import SignInScreen from '@/app/sign-in';
import { Palettes } from '@/constants/theme';
import { SchemeContext } from '@/lib/appearance';
import i18n from '@/lib/i18n';
import { SessionContext, type Me } from '@/lib/session';

// A stand-in tab navigator: the Week tab, with Groceries next to it.
const mockNav = {
  index: 0,
  listeners: {} as Record<string, (() => void)[]>,
  emit(type: string) {
    for (const fn of this.listeners[type] ?? []) fn();
  },
};
jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  useRoute: () => ({ key: 'week' }),
  useNavigation: () => mockNavigation,
}));
const mockNavigation = {
  isFocused: () => mockNav.index === 0,
  getState: () => ({ index: mockNav.index, routes: [{ key: 'week' }, { key: 'groceries' }] }),
  addListener: (type: string, fn: () => void) => {
    (mockNav.listeners[type] ??= []).push(fn);
    return () => {
      mockNav.listeners[type] = mockNav.listeners[type].filter((f) => f !== fn);
    };
  },
};

const mockUseQuery = jest.fn();
jest.mock('convex/react', () => ({
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
  useMutation: () => Object.assign(jest.fn(), { withOptimisticUpdate: () => jest.fn() }),
}));
jest.mock('@convex-dev/auth/react', () => ({
  useAuthActions: () => ({ signIn: jest.fn(), signOut: jest.fn() }),
}));
jest.mock('@/convex/_generated/api', () => ({
  api: new Proxy(
    {},
    { get: (_, mod) => new Proxy({}, { get: (__, fn) => `${String(mod)}.${String(fn)}` }) },
  ),
}));

const me: Me = {
  user: {
    _id: 'u1' as Me['user']['_id'],
    name: 'Kari Hansen',
    email: 'kari@example.no',
    tourDone: true,
  },
  family: {
    groupId: 'g1' as NonNullable<Me['family']>['groupId'],
    name: 'Hansen family',
    role: 'owner',
    weekStartsOn: 1,
    timezone: 'Europe/Oslo',
    sectionOrder: ['produce', 'meat', 'dairy', 'bakery', 'dry', 'frozen', 'household', 'other'],
  },
};

beforeEach(() => {
  mockUseQuery.mockReset();
  mockNav.index = 0;
});

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};
const render = (ui: React.ReactElement) =>
  rtlRender(<SafeAreaProvider initialMetrics={metrics}>{ui}</SafeAreaProvider>);

describe('sign-in', () => {
  test('lists the test users in Norwegian', async () => {
    await i18n.changeLanguage('nb');
    mockUseQuery.mockReturnValue({
      google: false,
      apple: false,
      personas: [{ id: 'kari', name: 'Kari Hansen' }],
    });
    await render(<SignInScreen />);
    expect(screen.getByText('Fortsett som Kari Hansen')).toBeTruthy();
  });

  test('offers Google and no test users when they are off', async () => {
    await i18n.changeLanguage('en');
    mockUseQuery.mockReturnValue({ google: true, apple: true, personas: [] });
    await render(<SignInScreen />);
    expect(screen.getByText('Continue with Google')).toBeTruthy();
    expect(screen.queryByText('Test users')).toBeNull();
  });
});

describe('week', () => {
  test('shows the planned dinner, empty days and the grocery banner', async () => {
    await i18n.changeLanguage('en');
    mockUseQuery.mockImplementation((_fn, args: { startDate: string }) => ({
      dinners: [
        {
          _id: 'e1',
          date: args.startDate,
          recipeId: 'r1',
          title: 'Tacos',
          isNote: false,
          servings: 4,
        },
      ],
      openLines: 3,
    }));
    await render(
      <SessionContext.Provider value={me}>
        <WeekScreen />
      </SessionContext.Provider>,
    );
    expect(screen.getByText('Tacos')).toBeTruthy();
    expect(screen.getByText('Serves 4')).toBeTruthy();
    expect(screen.getAllByText('+ Add dinner')).toHaveLength(6);
    expect(screen.getByText('3 items on the grocery list')).toBeTruthy();
    expect(screen.getByText(/^Week \d+$/)).toBeTruthy();
  });

  test('shows blank days, not "Add dinner", while a week loads', async () => {
    await i18n.changeLanguage('en');
    mockUseQuery.mockReturnValue(undefined);
    await render(
      <SessionContext.Provider value={me}>
        <WeekScreen />
      </SessionContext.Provider>,
    );
    expect(screen.queryByText('+ Add dinner')).toBeNull();
  });

  test('keeps the weeks either side subscribed and steps to them', async () => {
    await i18n.changeLanguage('en');
    mockUseQuery.mockReturnValue({ dinners: [], openLines: 0 });
    await render(
      <SessionContext.Provider value={me}>
        <WeekScreen />
      </SessionContext.Provider>,
    );
    const starts = () =>
      mockUseQuery.mock.calls.map((c) => (c[1] as { startDate: string }).startDate);
    const shown = starts()[0];
    const week = (s: string) => Math.round(Date.parse(s) / (7 * 24 * 3600 * 1000));
    expect(new Set(starts().map((s) => week(s) - week(shown)))).toEqual(new Set([-1, 0, 1]));
    const title = screen.getByText(/^Week \d+$/).props.children as string;
    mockUseQuery.mockClear();
    await fireEvent.press(screen.getByLabelText('Next week'));
    expect(week(starts()[0]) - week(shown)).toBe(1);
    expect(screen.getByText(/^Week \d+$/).props.children).not.toBe(title);
  });

  test('draws in dark mode', async () => {
    await i18n.changeLanguage('en');
    mockUseQuery.mockReturnValue({ dinners: [], openLines: 0 });
    await render(
      <SchemeContext.Provider value="dark">
        <SessionContext.Provider value={me}>
          <WeekScreen />
        </SessionContext.Provider>
      </SchemeContext.Provider>,
    );
    expect(screen.getByText(/^Week \d+$/)).toHaveStyle({ color: Palettes.dark.ink });
  });
});

describe('tab switch', () => {
  test('slides a tab in after switching away and back, not after a pushed screen', async () => {
    await i18n.changeLanguage('en');
    mockUseQuery.mockReturnValue({ dinners: [], openLines: 0 });
    await render(
      <SessionContext.Provider value={me}>
        <WeekScreen />
      </SessionContext.Provider>,
    );
    const content = screen.getByTestId('tab-content');
    expect(content).toHaveStyle({ opacity: 1 });

    // A recipe pushed over the tabs: Week stays the selected tab, so it stays visible.
    mockNav.emit('blur');
    expect(content).toHaveStyle({ opacity: 1 });

    // Switching to Groceries hides Week, and coming back slides it in again.
    mockNav.index = 1;
    mockNav.emit('blur');
    expect(content).toHaveStyle({ opacity: 0 });
    mockNav.index = 0;
    mockNav.emit('focus');
    expect(content).toHaveStyle({ opacity: 1, transform: [{ translateX: 0 }] });
  });

  test('slides in from the side of the tab you came from', () => {
    expect(slideFrom(0, 2)).toBe(40);
    expect(slideFrom(3, 1)).toBe(-40);
    expect(slideFrom(1, 1)).toBe(0);
    expect(slideFrom(-1, 2)).toBe(0);
  });
});

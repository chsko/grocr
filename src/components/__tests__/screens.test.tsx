import { render as rtlRender, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import WeekScreen from '@/app/(tabs)/week';
import SignInScreen from '@/app/sign-in';
import { Palettes } from '@/constants/theme';
import { SchemeContext } from '@/lib/appearance';
import i18n from '@/lib/i18n';
import { SessionContext, type Me } from '@/lib/session';

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
  user: { _id: 'u1' as Me['user']['_id'], name: 'Kari Hansen', email: 'kari@example.no' },
  family: {
    groupId: 'g1' as NonNullable<Me['family']>['groupId'],
    name: 'Hansen family',
    role: 'owner',
    weekStartsOn: 1,
    timezone: 'Europe/Oslo',
    sectionOrder: ['produce', 'meat', 'dairy', 'bakery', 'dry', 'frozen', 'household', 'other'],
  },
};

beforeEach(() => mockUseQuery.mockReset());

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};
const render = (ui: React.ReactElement) =>
  rtlRender(<SafeAreaProvider initialMetrics={metrics}>{ui}</SafeAreaProvider>);

describe('sign-in', () => {
  test('lists the test users in Norwegian', async () => {
    await i18n.changeLanguage('nb');
    mockUseQuery.mockReturnValue([{ id: 'kari', name: 'Kari Hansen' }]);
    await render(<SignInScreen />);
    expect(screen.getByText('Fortsett som Kari Hansen')).toBeTruthy();
  });

  test('says sign-in is coming when test users are off', async () => {
    await i18n.changeLanguage('en');
    mockUseQuery.mockReturnValue([]);
    await render(<SignInScreen />);
    expect(screen.getByText(/coming soon/)).toBeTruthy();
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

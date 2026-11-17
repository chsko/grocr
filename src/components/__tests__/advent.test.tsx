import { fireEvent, render as rtlRender, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import GiftsScreen from '@/app/gifts';
import { SECTIONS } from '@/convex/lib/catalog';
import i18n from '@/lib/i18n';
import { SessionContext, type Me } from '@/lib/session';

// The Kalender tab in Julegaver (#88), against a stand-in Convex client: queries answer from
// `mockQueries` by function name, mutations are recorded in `mockCalls`.
const mockQueries: Record<string, unknown> = {};
const mockCalls: [string, unknown][] = [];
const mockArgs: Record<string, unknown> = {};
jest.mock('convex/react', () => ({
  useQuery: (name: string, args: unknown) => {
    mockArgs[name] = args;
    return args === 'skip' ? undefined : mockQueries[name];
  },
  useMutation: (name: string) => {
    const fn = (args: unknown) => {
      mockCalls.push([name, args]);
      return Promise.resolve('new-id');
    };
    return Object.assign(fn, { withOptimisticUpdate: () => fn });
  },
}));
jest.mock('@/convex/_generated/api', () => ({
  api: new Proxy(
    {},
    { get: (_, mod) => new Proxy({}, { get: (__, fn) => `${String(mod)}.${String(fn)}` }) },
  ),
}));
const mockRouter = { push: jest.fn(), back: jest.fn(), canGoBack: () => true };
jest.mock('expo-router', () => ({
  get router() {
    return mockRouter;
  },
  Stack: {
    Screen: ({ options }: { options?: { headerRight?: () => React.ReactNode } }) =>
      options?.headerRight?.() ?? null,
  },
  useLocalSearchParams: () => ({ tab: 'calendar' }),
}));

const me: Me = {
  user: {
    _id: 'u1' as Me['user']['_id'],
    name: 'Kari',
    email: undefined,
    tourDone: true,
    whatsNewSeen: 13,
  },
  family: {
    groupId: 'g1' as NonNullable<Me['family']>['groupId'],
    name: 'Hansen',
    role: 'owner',
    weekStartsOn: 1,
    timezone: 'Europe/Oslo',
    sections: SECTIONS.map((key) => ({ key })),
    sectionOrder: [...SECTIONS],
  },
};
const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};
const render = (ui: React.ReactElement) =>
  rtlRender(
    <SafeAreaProvider initialMetrics={metrics}>
      <SessionContext.Provider value={me}>{ui}</SessionContext.Provider>
    </SafeAreaProvider>,
  );

const december = Array.from({ length: 24 }, (_, i) => `2026-12-${String(i + 1).padStart(2, '0')}`);

beforeEach(async () => {
  for (const key of Object.keys(mockQueries)) delete mockQueries[key];
  mockCalls.length = 0;
  await i18n.changeLanguage('nb');
  mockQueries['gifts.christmas'] = {
    year: 2026,
    currentYear: 2026,
    groups: [],
    recipients: [],
    others: [],
    totals: { idea: 0, bought: 0, wrapped: 0, spent: 0, planned: 0, budget: null },
  };
  mockQueries['advent.calendars'] = {
    year: 2026,
    currentYear: 2026,
    today: '2026-12-04',
    members: [
      { id: 'u2', name: 'Ola', withoutApp: false },
      { id: 'u3', name: 'Emma', withoutApp: false },
      { id: 'u4', name: 'Jonas', withoutApp: false },
    ],
    calendars: [
      {
        _id: 'c1',
        name: null,
        recipients: [{ id: 'u3', name: 'Emma', withoutApp: false }],
        days: december,
        doors: [
          {
            day: '2026-12-04',
            number: 4,
            title: 'Viskelær',
            status: 'wrapped',
            price: 29,
            note: null,
          },
          {
            day: '2026-12-05',
            number: 5,
            title: 'Fargeblyanter',
            status: 'bought',
            price: 89,
            note: null,
          },
        ],
        totals: { idea: 0, bought: 1, wrapped: 1, empty: 22, spent: 118, planned: 118 },
      },
      {
        _id: 'c2',
        name: 'Søndagskalender',
        recipients: [
          { id: 'u3', name: 'Emma', withoutApp: false },
          { id: 'u4', name: 'Jonas', withoutApp: false },
        ],
        days: ['2026-11-29', '2026-12-06', '2026-12-13', '2026-12-20'],
        doors: [],
        totals: { idea: 0, bought: 0, wrapped: 0, empty: 4, spent: 0, planned: 0 },
      },
    ],
  };
});

describe('the Kalender tab', () => {
  test('opens on the first calendar with its doors and sums', async () => {
    await render(<GiftsScreen />);
    expect(screen.getByRole('header', { name: 'Emma' })).toBeTruthy();
    expect(screen.getByText('Til Emma · 24 dager')).toBeTruthy();
    expect(screen.getByText('1 av 24 pakket · 22 tomme')).toBeTruthy();
    expect(screen.getByText('118 kr brukt av 118 kr planlagt')).toBeTruthy();
    expect(screen.getByLabelText('Luke 4, fre 4. des.: Viskelær, Pakket')).toBeTruthy();
    expect(screen.getByText('Skjult for Emma.')).toBeTruthy();
  });

  test('a chip switches calendar; a short one numbers doors by place', async () => {
    await render(<GiftsScreen />);
    await fireEvent.press(screen.getByText('Søndagskalender'));
    expect(screen.getByText('Til Emma og Jonas · 4 dager')).toBeTruthy();
    expect(screen.getByLabelText('Luke 3, søn 13. des.: tom')).toBeTruthy();
  });

  test('a door opens its sheet and saves what goes in it', async () => {
    await render(<GiftsScreen />);
    await fireEvent.press(screen.getByLabelText('Luke 6, søn 6. des.: tom'));
    expect(screen.getByText('Luke 6 · Emma')).toBeTruthy();
    await fireEvent.changeText(screen.getByPlaceholderText('F.eks. Viskelær'), 'Lommelykt');
    await fireEvent.changeText(screen.getByPlaceholderText('F.eks. 299'), '79,50');
    await fireEvent.press(screen.getByRole('radio', { name: 'Kjøpt' }));
    await fireEvent.press(screen.getByText('Lagre'));
    expect(mockCalls).toContainEqual([
      'advent.setDoor',
      {
        calendarId: 'c1',
        day: '2026-12-06',
        title: 'Lommelykt',
        status: 'bought',
        price: 79.5,
        note: '',
      },
    ]);
  });

  test('a new calendar starts from 1-24 December and can switch to the Sundays', async () => {
    await render(<GiftsScreen />);
    await fireEvent.press(screen.getByText('Ny kalender'));
    expect(
      screen.getByText('24 dager valgt. Trykk på en dato for å legge til eller fjerne den.'),
    ).toBeTruthy();
    await fireEvent.press(screen.getByText('Adventssøndagene'));
    expect(
      screen.getByText('4 dager valgt. Trykk på en dato for å legge til eller fjerne den.'),
    ).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('fre 4. des.'));
    await fireEvent.press(screen.getByText('Jonas'));
    await fireEvent.press(screen.getByText('Lag kalender'));
    expect(mockCalls).toContainEqual([
      'advent.createCalendar',
      {
        groupId: 'g1',
        year: 2026,
        recipientIds: ['u4'],
        days: ['2026-11-29', '2026-12-04', '2026-12-06', '2026-12-13', '2026-12-20'],
        name: '',
      },
    ]);
  });
});

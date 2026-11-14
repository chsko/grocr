import { fireEvent, render as rtlRender, screen } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import GiftRecipientsScreen from '@/app/gift-recipients';
import GiftsScreen from '@/app/gifts';
import { SECTIONS } from '@/convex/lib/catalog';
import i18n from '@/lib/i18n';
import { SessionContext, type Me } from '@/lib/session';

// Christmas gifts screens (#78), against a stand-in Convex client: queries answer from
// `mockQueries` by function name, mutations are recorded in `mockCalls`.
const mockQueries: Record<string, unknown> = {};
const mockCalls: [string, unknown][] = [];
jest.mock('convex/react', () => ({
  useQuery: (name: string, args: unknown) => (args === 'skip' ? undefined : mockQueries[name]),
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
  Stack: { Screen: () => null },
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

const gift = (id: string, title: string, status = 'idea') => ({ _id: id, title, status });

beforeEach(async () => {
  for (const key of Object.keys(mockQueries)) delete mockQueries[key];
  mockCalls.length = 0;
  await i18n.changeLanguage('nb');
});

describe('one gift list', () => {
  beforeEach(() => {
    mockQueries['gifts.christmas'] = {
      year: 2026,
      currentYear: 2026,
      recipients: [
        {
          _id: 'r1',
          name: 'Bestemor',
          linkedName: null,
          counts: { idea: 1, bought: 1, wrapped: 0 },
          gifts: [gift('a', 'Ullpledd', 'bought'), gift('b', 'Hyasinter')],
        },
        {
          _id: 'r2',
          name: 'Ola',
          linkedName: 'Ola',
          counts: { idea: 0, bought: 0, wrapped: 1 },
          gifts: [gift('c', 'Lego', 'wrapped')],
        },
      ],
      totals: { idea: 1, bought: 1, wrapped: 1 },
    };
  });

  test('groups this Christmas by recipient', async () => {
    await render(<GiftsScreen />);
    expect(screen.getByText('Jul 2026')).toBeTruthy();
    expect(screen.getByText('Bestemor')).toBeTruthy();
    expect(screen.getByText('Ullpledd')).toBeTruthy();
    expect(screen.getByText('Ola')).toBeTruthy();
  });

  test('adds a gift under a recipient', async () => {
    await render(<GiftsScreen />);
    await fireEvent.changeText(screen.getByLabelText('Ny gave til Ola'), 'Sykkel');
    await fireEvent(screen.getByLabelText('Ny gave til Ola'), 'submitEditing');
    expect(mockCalls).toContainEqual([
      'gifts.addGift',
      { recipientId: 'r2', title: 'Sykkel', year: 2026 },
    ]);
  });

  test('sums up how many gifts are bought', async () => {
    await render(<GiftsScreen />);
    expect(screen.getByText('2 av 3 kjøpt')).toBeTruthy();
  });

  test('tapping a status moves the gift on', async () => {
    await render(<GiftsScreen />);
    await fireEvent.press(screen.getByLabelText('Ullpledd: Kjøpt'));
    await fireEvent.press(screen.getByLabelText('Lego: Pakket'));
    expect(mockCalls).toEqual([
      ['gifts.setGiftStatus', { giftId: 'a', status: 'wrapped' }],
      ['gifts.setGiftStatus', { giftId: 'c', status: 'idea' }],
    ]);
  });

  test('the status filter narrows the list and hides empty groups', async () => {
    await render(<GiftsScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Idé' }));
    expect(screen.getByText('Hyasinter')).toBeTruthy();
    expect(screen.queryByText('Ullpledd')).toBeNull();
    expect(screen.queryByText('Ola')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Alle' }));
    expect(screen.getByText('Ola')).toBeTruthy();
  });

  test('without recipients it explains how to start', async () => {
    mockQueries['gifts.christmas'] = {
      year: 2026,
      currentYear: 2026,
      recipients: [],
      totals: { idea: 0, bought: 0, wrapped: 0 },
    };
    await render(<GiftsScreen />);
    expect(screen.getByText(/Legg til dem dere gir gaver til/)).toBeTruthy();
  });
});

describe('recipients', () => {
  beforeEach(() => {
    mockQueries['gifts.recipients'] = {
      recipients: [
        { _id: 'r1', name: 'Bestemor', linkedUserId: null, linkedName: null },
        { _id: 'r2', name: 'Ola', linkedUserId: 'u2', linkedName: 'Ola' },
      ],
      members: [
        { userId: 'u2', name: 'Ola', linked: true },
        { userId: 'u3', name: 'Emma', linked: false },
      ],
    };
  });

  test('shows who is in the family', async () => {
    await render(<GiftRecipientsScreen />);
    expect(screen.getByText('I familien: Ola')).toBeTruthy();
    expect(screen.getByText('Ikke koblet til familien')).toBeTruthy();
  });

  test('links a recipient to a member who is not linked yet', async () => {
    const alert = jest.spyOn(Alert, 'alert');
    await render(<GiftRecipientsScreen />);
    await fireEvent.press(screen.getByText('Bestemor'));
    const [, , actions] = alert.mock.calls.at(-1)!;
    await actions!.find((a) => a.text === 'Koble til noen i familien')!.onPress!();
    const [, , members] = alert.mock.calls.at(-1)!;
    // Ola is linked to someone else already, so only Emma is offered.
    expect(members!.map((a) => a.text)).toEqual(['Emma', 'Avbryt']);
    await members![0].onPress!();
    expect(mockCalls).toContainEqual([
      'gifts.linkRecipient',
      { recipientId: 'r1', memberUserId: 'u3' },
    ]);
  });

  test('adds a recipient by name', async () => {
    await render(<GiftRecipientsScreen />);
    await fireEvent.changeText(screen.getByLabelText('Navn'), 'Tante Liv');
    await fireEvent(screen.getByLabelText('Navn'), 'submitEditing');
    expect(mockCalls).toContainEqual(['gifts.addRecipient', { groupId: 'g1', name: 'Tante Liv' }]);
  });
});

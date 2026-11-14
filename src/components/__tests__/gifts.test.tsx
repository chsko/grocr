import { fireEvent, render as rtlRender, screen } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import GiftScreen from '@/app/gift/[id]';
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
  useLocalSearchParams: () => ({ id: 'a' }),
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

const gift = (id: string, title: string, status = 'idea') => ({
  _id: id,
  title,
  status,
  price: null,
  url: null,
  note: null,
  buyerUserId: null,
  buyerName: null,
});

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
          spent: 300,
          planned: 0,
          budget: 500,
          lastBudget: null,
          bankCount: 1,
          gifts: [gift('a', 'Ullpledd', 'bought'), gift('b', 'Hyasinter')],
        },
        {
          _id: 'r2',
          name: 'Ola',
          linkedName: 'Ola',
          counts: { idea: 0, bought: 0, wrapped: 1 },
          spent: 900,
          planned: 0,
          budget: 800,
          lastBudget: 750,
          bankCount: 0,
          gifts: [gift('c', 'Lego', 'wrapped')],
        },
      ],
      totals: { idea: 1, bought: 1, wrapped: 1, budget: 1300, spent: 1200, planned: 0 },
    };
  });

  test('each person shows spent against budget, left or over', async () => {
    await render(<GiftsScreen />);
    expect(screen.getByText('300 kr av 500 kr · 200 kr igjen')).toBeTruthy();
    expect(screen.getByText('900 kr av 800 kr · 100 kr over budsjett')).toBeTruthy();
    expect(screen.getByText('1\u00a0200 kr av 1\u00a0300 kr · 100 kr igjen')).toBeTruthy();
  });

  test('the budget sheet offers last year’s amount and saves the typed one', async () => {
    await render(<GiftsScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Budsjett for Ola' }));
    await fireEvent.press(screen.getByRole('button', { name: 'I fjor: 750 kr' }));
    expect(screen.getByDisplayValue('750')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Beløp i kroner'), '1 000');
    await fireEvent.press(screen.getByRole('button', { name: 'Lagre' }));
    expect(mockCalls).toEqual([
      ['gifts.setBudget', { recipientId: 'r2', year: 2026, amount: 1000 }],
    ]);
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

  test('a gift line shows price, buyer and shop, and opens the gift', async () => {
    const xmas = mockQueries['gifts.christmas'] as { recipients: { gifts: object[] }[] };
    xmas.recipients[0].gifts[0] = {
      ...gift('a', 'Ullpledd', 'bought'),
      price: 1299.5,
      buyerName: 'Ola',
      url: 'https://www.example.com/pledd',
    };
    await render(<GiftsScreen />);
    expect(screen.getByText('1\u00a0299,50 kr · Ola · example.com')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Ullpledd' }));
    expect(mockRouter.push).toHaveBeenCalledWith('/gift/a');
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
      totals: { idea: 0, bought: 0, wrapped: 0, budget: null, spent: 0, planned: 0 },
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

describe('idea bank tab', () => {
  beforeEach(() => {
    mockQueries['gifts.christmas'] = {
      year: 2026,
      currentYear: 2026,
      recipients: [
        {
          _id: 'r1',
          name: 'Bestemor',
          linkedName: null,
          counts: { idea: 0, bought: 0, wrapped: 0 },
          spent: 0,
          planned: 0,
          budget: null,
          lastBudget: null,
          bankCount: 1,
          gifts: [],
        },
      ],
      totals: { idea: 0, bought: 0, wrapped: 0, budget: null, spent: 0, planned: 0 },
    };
    mockQueries['gifts.ideas'] = {
      currentYear: 2026,
      recipients: [
        { _id: 'r1', name: 'Bestemor', ideas: [gift('i1', 'Bok')] },
        { _id: 'r2', name: 'Ola', ideas: [] },
      ],
    };
  });

  test('the list says how many ideas wait, and leads to the bank', async () => {
    await render(<GiftsScreen />);
    expect(screen.queryByText('Bok')).toBeNull();
    await fireEvent.press(screen.getByText('1 i idébanken'));
    expect(screen.getByText('Bok')).toBeTruthy();
  });

  test('moves an idea into this Christmas and adds new ideas without a year', async () => {
    await render(<GiftsScreen />);
    await fireEvent.press(screen.getByRole('tab', { name: 'Idébank' }));
    await fireEvent.press(screen.getByLabelText('Bok: Legg til i jul 2026'));
    await fireEvent.changeText(screen.getByLabelText('Ny idé til Ola'), 'Sokker');
    await fireEvent(screen.getByLabelText('Ny idé til Ola'), 'submitEditing');
    await fireEvent.press(screen.getByLabelText('Bok: Idé'));
    expect(mockCalls).toEqual([
      ['gifts.moveGift', { giftId: 'i1', year: 2026 }],
      ['gifts.addGift', { recipientId: 'r2', title: 'Sokker' }],
      ['gifts.setGiftStatus', { giftId: 'i1', status: 'bought' }],
    ]);
  });
});

describe('gift sheet', () => {
  beforeEach(() => {
    mockQueries['gifts.gift'] = {
      ...gift('a', 'Ullpledd', 'bought'),
      price: 499,
      year: 2026,
      recipientId: 'r1',
      recipientName: 'Bestemor',
      buyers: [
        { userId: 'u1', name: 'Kari' },
        { userId: 'u2', name: 'Ola' },
      ],
    };
  });

  test('saves the details with the price read the Norwegian way', async () => {
    await render(<GiftScreen />);
    expect(screen.getByText('Til Bestemor')).toBeTruthy();
    expect(screen.getByDisplayValue('499')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Pris (kr)'), '1 299,50');
    await fireEvent.changeText(screen.getByLabelText('Lenke'), 'example.com/pledd');
    await fireEvent.changeText(screen.getByLabelText('Notat'), 'Grå');
    await fireEvent.press(screen.getByRole('button', { name: 'Ola' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Lagre' }));
    expect(mockCalls).toEqual([
      [
        'gifts.updateGift',
        {
          giftId: 'a',
          title: 'Ullpledd',
          price: 1299.5,
          url: 'example.com/pledd',
          note: 'Grå',
          buyerUserId: 'u2',
        },
      ],
    ]);
    expect(mockRouter.back).toHaveBeenCalled();
  });

  test('a price that is not a price is refused before saving', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await render(<GiftScreen />);
    await fireEvent.changeText(screen.getByLabelText('Pris (kr)'), 'mye');
    await fireEvent.press(screen.getByRole('button', { name: 'Lagre' }));
    expect(mockCalls).toEqual([]);
    expect(alert).toHaveBeenCalledWith('Noe gikk galt', 'Det ser ikke ut som et beløp i kroner.');
    alert.mockRestore();
  });

  test('moves a gift back to the idea bank', async () => {
    await render(<GiftScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Flytt til idébanken' }));
    expect(mockCalls).toEqual([['gifts.moveGift', { giftId: 'a', year: null }]]);
  });

  test('deletes after asking', async () => {
    const alert = jest.spyOn(Alert, 'alert');
    await render(<GiftScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Slett gave' }));
    const buttons = alert.mock.calls[0][2]!;
    await buttons.find((b) => b.style === 'destructive')!.onPress!();
    expect(mockCalls).toEqual([['gifts.removeGift', { giftId: 'a' }]]);
    alert.mockRestore();
  });

  test('a gift gone on another phone just closes the sheet', async () => {
    mockQueries['gifts.gift'] = null;
    mockRouter.back.mockClear();
    await render(<GiftScreen />);
    expect(mockRouter.back).toHaveBeenCalled();
  });
});

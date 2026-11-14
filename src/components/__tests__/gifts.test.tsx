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
      others: [],
      groups: [],
      totals: { idea: 1, bought: 1, wrapped: 1, budget: 1300, spent: 1200, planned: 0 },
    };
  });

  test('people stand under their gift group, with a check when everyone has a bought gift', async () => {
    const xmas = mockQueries['gifts.christmas'] as {
      groups: unknown[];
      recipients: { giftGroupId?: string | null }[];
    };
    xmas.groups = [{ _id: 'gg1', name: 'Svigers', done: true }];
    xmas.recipients[0].giftGroupId = 'gg1';
    xmas.recipients[1].giftGroupId = null;
    await render(<GiftsScreen />);
    expect(screen.getByText('Svigers')).toBeTruthy();
    expect(screen.getByText('Uten gruppe')).toBeTruthy();
    expect(screen.getByLabelText('Kjøpt til alle i Svigers')).toBeTruthy();
    expect(screen.getAllByText('1 person')).toHaveLength(2);
  });

  test('a group folds shut and open again from its heading', async () => {
    const xmas = mockQueries['gifts.christmas'] as {
      groups: unknown[];
      recipients: { name: string; giftGroupId?: string | null }[];
    };
    xmas.groups = [{ _id: 'gg1', name: 'Svigers', done: false }];
    xmas.recipients[0].giftGroupId = 'gg1';
    const name = xmas.recipients[0].name;
    await render(<GiftsScreen />);
    expect(screen.getByText(name)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: /Svigers/ }));
    expect(screen.queryByText(name)).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: /Svigers/ }));
    expect(screen.getByText(name)).toBeTruthy();
  });

  test('Personer is a button in the header', async () => {
    await render(<GiftsScreen />);
    await fireEvent.press(screen.getAllByRole('button', { name: 'Personer' })[0]);
    expect(mockRouter.push).toHaveBeenCalledWith('/gift-recipients');
  });

  test('no headings when the family has no groups', async () => {
    await render(<GiftsScreen />);
    expect(screen.queryByText('Uten gruppe')).toBeNull();
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
      others: [],
      groups: [],
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
        {
          _id: 'r1',
          name: 'Bestemor',
          linkedUserId: null,
          linkedName: null,
          archived: false,
          giftGroupId: null,
        },
        { _id: 'r2', name: 'Ola', linkedUserId: 'u2', linkedName: 'Ola', archived: false },
        { _id: 'r4', name: 'Onkel Per', linkedUserId: null, linkedName: null, archived: true },
      ],
      members: [
        { userId: 'u2', name: 'Ola', linked: true, match: null },
        { userId: 'u3', name: 'Emma Hansen', linked: false, match: null },
      ],
      cardStart: '11-01',
      groups: [{ _id: 'gg1', name: 'Svigers' }],
    };
  });

  test('suggests family members who are not linked yet', async () => {
    await render(<GiftRecipientsScreen />);
    expect(screen.getByText('Ikke koblet ennå')).toBeTruthy();
    // Added by first name, the way the family speaks of her.
    await fireEvent.press(screen.getByRole('button', { name: 'Legg til Emma' }));
    expect(mockCalls).toEqual([
      ['gifts.addRecipient', { groupId: 'g1', name: 'Emma', memberUserId: 'u3' }],
    ]);
  });

  test('a suggestion links a recipient with the same name', async () => {
    const data = mockQueries['gifts.recipients'] as { members: { match: string | null }[] };
    data.members[1].match = 'r1';
    await render(<GiftRecipientsScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Koble til Emma Hansen' }));
    expect(mockCalls).toEqual([['gifts.linkRecipient', { recipientId: 'r1', memberUserId: 'u3' }]]);
  });

  test('archived people are listed apart and can come back', async () => {
    await render(<GiftRecipientsScreen />);
    expect(screen.getByText('Arkivert')).toBeTruthy();
    await fireEvent.press(screen.getByText('Onkel Per'));
    await fireEvent.press(screen.getByRole('button', { name: 'Hent tilbake' }));
    expect(mockCalls).toEqual([
      ['gifts.setRecipientArchived', { recipientId: 'r4', archived: false }],
    ]);
  });

  test('archives a person', async () => {
    await render(<GiftRecipientsScreen />);
    await fireEvent.press(screen.getByText('Bestemor'));
    await fireEvent.press(screen.getByRole('button', { name: 'Arkiver' }));
    expect(mockCalls).toEqual([
      ['gifts.setRecipientArchived', { recipientId: 'r1', archived: true }],
    ]);
  });

  test('deleting warns that gifts, ideas and budgets go too', async () => {
    const alert = jest.spyOn(Alert, 'alert');
    await render(<GiftRecipientsScreen />);
    await fireEvent.press(screen.getByText('Bestemor'));
    await fireEvent.press(screen.getByRole('button', { name: 'Slett' }));
    const [title, body, confirm] = alert.mock.calls.at(-1)!;
    expect(title).toBe('Slette Bestemor?');
    expect(body).toMatch(/Gavene, idéene og budsjettene slettes også/);
    expect(mockCalls).toEqual([]);
    await confirm!.find((a) => a.style === 'destructive')!.onPress!();
    expect(mockCalls).toEqual([['gifts.removeRecipient', { recipientId: 'r1' }]]);
    alert.mockRestore();
  });

  test('renames a person', async () => {
    await render(<GiftRecipientsScreen />);
    await fireEvent.press(screen.getByText('Bestemor'));
    await fireEvent.press(screen.getByRole('button', { name: 'Gi nytt navn' }));
    await fireEvent.changeText(screen.getByDisplayValue('Bestemor'), 'Oldemor');
    await fireEvent.press(screen.getByRole('button', { name: 'Lagre' }));
    expect(mockCalls).toEqual([['gifts.renameRecipient', { recipientId: 'r1', name: 'Oldemor' }]]);
  });

  test('people without a group are on top, the rest under their group', async () => {
    const data = mockQueries['gifts.recipients'] as {
      recipients: { _id: string; giftGroupId?: string | null }[];
      groups: { _id: string; name: string }[];
    };
    data.recipients.find((r) => r._id === 'r2')!.giftGroupId = 'gg1';
    data.groups.push({ _id: 'gg2', name: 'Naboer' });
    await render(<GiftRecipientsScreen />);
    const texts = screen.getAllByText(/^(Bestemor|Ola|Svigers|Naboer|Dra personer hit)$/);
    expect(texts.map((n) => n.props.children)).toEqual([
      'Bestemor',
      'Svigers',
      'Ola',
      'Naboer',
      'Dra personer hit',
    ]);
  });

  test('a group folds shut and still shows how many are in it', async () => {
    const data = mockQueries['gifts.recipients'] as {
      recipients: { _id: string; name: string; giftGroupId?: string | null }[];
    };
    const ola = data.recipients.find((r) => r._id === 'r2')!;
    ola.giftGroupId = 'gg1';
    await render(<GiftRecipientsScreen />);
    expect(screen.getByText(ola.name)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Svigers' }));
    expect(screen.queryByText(ola.name)).toBeNull();
    expect(screen.getByText('1 person')).toBeTruthy();
  });

  test('adds a person straight into a group', async () => {
    await render(<GiftRecipientsScreen />);
    const field = screen.getByLabelText('Legg til person i Svigers');
    await fireEvent.changeText(field, 'Tante');
    await fireEvent(field, 'submitEditing');
    expect(mockCalls).toEqual([
      ['gifts.addRecipient', { groupId: 'g1', name: 'Tante', giftGroupId: 'gg1' }],
    ]);
  });

  test('adds a group by name', async () => {
    await render(<GiftRecipientsScreen />);
    await fireEvent.changeText(screen.getByLabelText('Ny gruppe'), 'Barna');
    await fireEvent(screen.getByLabelText('Ny gruppe'), 'submitEditing');
    expect(mockCalls).toEqual([['gifts.addGiftGroup', { groupId: 'g1', name: 'Barna' }]]);
  });

  test('puts a person in a group', async () => {
    await render(<GiftRecipientsScreen />);
    await fireEvent.press(screen.getByText('Bestemor'));
    await fireEvent.press(screen.getByRole('button', { name: 'Gruppe: Ingen gruppe' }));
    // The last one is in the sheet; the first is the group's row on the screen behind it.
    await fireEvent.press(screen.getAllByRole('button', { name: 'Svigers' }).at(-1)!);
    expect(mockCalls).toEqual([
      ['gifts.setRecipientGroup', { recipientId: 'r1', giftGroupId: 'gg1' }],
    ]);
  });

  test('renames a group, and deletes it after saying the people stay', async () => {
    const alert = jest.spyOn(Alert, 'alert');
    await render(<GiftRecipientsScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Valg for Svigers' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Gi nytt navn' }));
    await fireEvent.changeText(screen.getByDisplayValue('Svigers'), 'Svigerfamilien');
    await fireEvent.press(screen.getByRole('button', { name: 'Lagre' }));
    expect(mockCalls).toEqual([
      ['gifts.renameGiftGroup', { giftGroupId: 'gg1', name: 'Svigerfamilien' }],
    ]);
    await fireEvent.press(screen.getByRole('button', { name: 'Valg for Svigers' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Slett gruppe' }));
    const [title, body, confirm] = alert.mock.calls.at(-1)!;
    expect([title, body]).toEqual(['Slette Svigers?', 'Personene blir stående, bare uten gruppe.']);
    await confirm!.find((a) => a.style === 'destructive')!.onPress!();
    expect(mockCalls.at(-1)).toEqual(['gifts.removeGiftGroup', { giftGroupId: 'gg1' }]);
    alert.mockRestore();
  });

  test('sets the day the card on Week starts showing', async () => {
    await render(<GiftRecipientsScreen />);
    expect(screen.getByText('1. nov.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Vis på Uke fra' }));
    await fireEvent.press(screen.getByLabelText('Måned −'));
    await fireEvent.press(screen.getByLabelText('Dag +'));
    await fireEvent.press(screen.getByRole('button', { name: 'Lagre' }));
    expect(mockCalls).toEqual([['gifts.setCardStart', { groupId: 'g1', start: '10-02' }]]);
  });

  test('shows who is in the family', async () => {
    await render(<GiftRecipientsScreen />);
    expect(screen.getByText('I familien: Ola')).toBeTruthy();
    expect(screen.getAllByText('Ikke koblet til familien')).toHaveLength(2);
  });

  test('links a recipient to a member who is not linked yet', async () => {
    await render(<GiftRecipientsScreen />);
    await fireEvent.press(screen.getByText('Bestemor'));
    await fireEvent.press(screen.getByRole('button', { name: 'Koble til noen i familien' }));
    // Ola is linked to someone else already, so only Emma is offered.
    expect(screen.queryByRole('button', { name: 'Ola' })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Emma Hansen' }));
    expect(mockCalls).toEqual([['gifts.linkRecipient', { recipientId: 'r1', memberUserId: 'u3' }]]);
  });

  test('adds a recipient by name', async () => {
    await render(<GiftRecipientsScreen />);
    await fireEvent.changeText(screen.getByLabelText('Ny person'), 'Tante Liv');
    await fireEvent(screen.getByLabelText('Ny person'), 'submitEditing');
    expect(mockCalls).toContainEqual(['gifts.addRecipient', { groupId: 'g1', name: 'Tante Liv' }]);
  });
});

describe('earlier Christmases', () => {
  test('steps back a year and fills in a gift for someone not listed yet', async () => {
    mockQueries['gifts.christmas'] = {
      year: 2026,
      currentYear: 2026,
      recipients: [],
      others: [],
      groups: [],
      totals: { idea: 0, bought: 0, wrapped: 0, budget: null, spent: 0, planned: 0 },
    };
    const view = await render(<GiftsScreen />);
    expect(screen.queryByRole('button', { name: 'Neste jul' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Forrige jul' }));
    expect(mockArgs['gifts.christmas']).toEqual({ groupId: 'g1', year: 2025 });

    mockQueries['gifts.christmas'] = {
      ...(mockQueries['gifts.christmas'] as object),
      year: 2025,
      others: [{ _id: 'r3', name: 'Per' }],
    };
    await view.rerender(
      <SafeAreaProvider initialMetrics={metrics}>
        <SessionContext.Provider value={me}>
          <GiftsScreen />
        </SessionContext.Provider>
      </SafeAreaProvider>,
    );
    expect(screen.getByText('Ingen gaver ble planlagt denne julen.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Per' }));
    await fireEvent.changeText(screen.getByLabelText('Ny gave til Per'), 'Termos');
    await fireEvent(screen.getByLabelText('Ny gave til Per'), 'submitEditing');
    expect(mockCalls).toEqual([
      ['gifts.addGift', { recipientId: 'r3', title: 'Termos', year: 2025 }],
    ]);
    await fireEvent.press(screen.getByRole('button', { name: 'I år' }));
    expect(mockArgs['gifts.christmas']).toEqual({ groupId: 'g1' });
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
      others: [],
      groups: [],
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

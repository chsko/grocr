import { act, fireEvent, render as rtlRender, screen } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';
import { Alert } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import FamilyScreen from '@/app/(tabs)/family';
import { GroceryLineEditor } from '@/components/grocery-line-editor';
import GroceriesScreen from '@/app/(tabs)/groceries';
import RecipeEditScreen from '@/app/recipe/edit';
import WeekScreen from '@/app/(tabs)/week';
import ItemsScreen from '@/app/items';
import SectionsScreen from '@/app/sections';
import SignInScreen from '@/app/sign-in';
import StaplesScreen from '@/app/staples';
import { Palettes } from '@/constants/theme';
import { SECTIONS } from '@/convex/lib/catalog';
import { SchemeContext } from '@/lib/appearance';
import * as build from '@/lib/build';
import { SUGGEST_DELAY_MS } from '@/lib/item-suggestions';
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
  // Header options need a real stack; the screens under test render fine without one.
  Stack: { Screen: () => null },
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
const mockAddManual = jest.fn();
const mockRename = jest.fn(() => Promise.resolve(null));
const mockSetAtHome = jest.fn((_args: unknown) => Promise.resolve(1));
const mockSetChecked = jest.fn((_args: unknown) => Promise.resolve(1));
const mockEditMerged = jest.fn((_args: unknown) => Promise.resolve(null));
const mockSetSection = jest.fn((_args: unknown) => Promise.resolve(null));
const mockRenameItem = jest.fn((_args: unknown) => Promise.resolve(null));
const mockMergeItems = jest.fn((_args: unknown) => Promise.resolve(null));
const mockAddStaples = jest.fn((_args: unknown) => Promise.resolve(1));
const mockDismissStaples = jest.fn((_args: unknown) => Promise.resolve(null));
const mockSetStaple = jest.fn((_args: unknown) => Promise.resolve(null));
const mockAddStaple = jest.fn((_args: unknown) => Promise.resolve('ing-new'));
const mockMutations: Record<string, unknown> = {
  'grocery.setChecked': { withOptimisticUpdate: () => mockSetChecked },
  'grocery.addStaples': { withOptimisticUpdate: () => mockAddStaples },
  'grocery.dismissStaples': { withOptimisticUpdate: () => mockDismissStaples },
  'staples.set': mockSetStaple,
  'staples.add': mockAddStaple,
};
jest.mock('convex/react', () => ({
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
  useMutation: (name: string) =>
    mockMutations[name] ??
    (name === 'grocery.addManual'
      ? mockAddManual
      : name === 'groups.rename'
        ? mockRename
        : name === 'grocery.setAtHome'
          ? { withOptimisticUpdate: () => mockSetAtHome }
          : name === 'grocery.editMerged'
            ? mockEditMerged
            : name === 'ingredients.setSection'
              ? mockSetSection
              : name === 'ingredients.rename'
                ? mockRenameItem
                : name === 'ingredients.merge'
                  ? mockMergeItems
                  : Object.assign(jest.fn(), { withOptimisticUpdate: () => jest.fn() })),
}));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  selectionAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light' },
  NotificationFeedbackType: { Success: 'success' },
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
    whatsNewSeen: 7,
  },
  family: {
    groupId: 'g1' as NonNullable<Me['family']>['groupId'],
    name: 'Hansen family',
    role: 'owner',
    weekStartsOn: 1,
    timezone: 'Europe/Oslo',
    sections: SECTIONS.map((key) => ({ key })),
    sectionOrder: [...SECTIONS],
  },
};

beforeEach(() => {
  mockUseQuery.mockReset();
  mockAddManual.mockReset();
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

  test('hides the test users in TestFlight and store builds', async () => {
    await i18n.changeLanguage('en');
    mockUseQuery.mockReturnValue({
      google: true,
      apple: false,
      personas: [{ id: 'kari', name: 'Kari Hansen' }],
    });
    jest.spyOn(build, 'isDevBuild').mockReturnValue(false);
    await render(<SignInScreen />);
    expect(screen.getByText('Continue with Google')).toBeTruthy();
    expect(screen.queryByText('Continue as Kari Hansen')).toBeNull();
  });

  test('offers Google and no test users when they are off', async () => {
    await i18n.changeLanguage('en');
    mockUseQuery.mockReturnValue({ google: true, apple: true, personas: [] });
    await render(<SignInScreen />);
    expect(screen.getByText('Continue with Google')).toBeTruthy();
    expect(screen.queryByText('Test users')).toBeNull();
  });
});

describe('sections', () => {
  const family = {
    ...me.family!,
    sections: [
      { key: 'dry', name: 'Hermetikk' },
      { key: 'produce' },
      { key: 'ctaco', name: 'Tacohylla' },
      { key: 'other' },
    ],
  };

  test("lists the family's own, renamed and built-in sections in Norwegian", async () => {
    await i18n.changeLanguage('nb');
    await render(
      <SchemeContext.Provider value="dark">
        <SessionContext.Provider value={{ ...me, family }}>
          <SectionsScreen />
        </SessionContext.Provider>
      </SchemeContext.Provider>,
    );
    for (const name of ['Hermetikk', 'Frukt og grønt', 'Tacohylla', 'Annet']) {
      expect(screen.getByText(name)).toHaveStyle({ color: Palettes.dark.ink });
    }
    expect(screen.getByLabelText('Ny avdeling')).toBeTruthy();
  });

  test('a renamed built-in section offers its standard name; Other cannot be deleted', async () => {
    await i18n.changeLanguage('en');
    await render(
      <SessionContext.Provider value={{ ...me, family }}>
        <SectionsScreen />
      </SessionContext.Provider>,
    );
    await fireEvent.press(screen.getByLabelText('Rename or delete Hermetikk'));
    expect(screen.getByText('Use the standard name (Dry goods)')).toBeTruthy();
    expect(screen.getByText('Delete section')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Close'));
    await fireEvent.press(screen.getByLabelText('Rename or delete Other'));
    expect(screen.queryByText('Delete section')).toBeNull();
    expect(screen.getByText(/can’t be deleted/)).toBeTruthy();
  });
});

describe('family', () => {
  test('a member renames the family from the Family tab', async () => {
    await i18n.changeLanguage('nb');
    mockUseQuery.mockReturnValue(undefined);
    await render(
      <SessionContext.Provider value={{ ...me, family: { ...me.family!, role: 'member' } }}>
        <FamilyScreen />
      </SessionContext.Provider>,
    );
    await fireEvent.press(screen.getByText('Familienavn'));
    const field = screen.getByLabelText('Familienavn');
    expect(field.props.value).toBe('Hansen family');
    await fireEvent.changeText(field, 'Familien Hansen');
    await fireEvent.press(screen.getByText('Lagre'));
    expect(mockRename).toHaveBeenCalledWith({ groupId: 'g1', name: 'Familien Hansen' });
    expect(screen.queryByLabelText('Familienavn')).toBeNull();
  });
});

describe('items', () => {
  const items = [
    {
      _id: 'melk',
      name: 'Melk',
      normalizedName: 'melk',
      section: 'dairy',
      aliases: ['mlek'],
      recipeCount: 2,
    },
    {
      _id: 'helmelk',
      name: 'Helmelk',
      normalizedName: 'helmelk',
      section: 'dairy',
      aliases: [],
      recipeCount: 0,
    },
    {
      _id: 'løk',
      name: 'Løk',
      normalizedName: 'løk',
      section: 'gone',
      aliases: [],
      recipeCount: 1,
    },
  ];
  const showItems = async () => {
    mockUseQuery.mockReturnValue(items);
    await render(
      <SchemeContext.Provider value="dark">
        <SessionContext.Provider value={me}>
          <ItemsScreen />
        </SessionContext.Provider>
      </SchemeContext.Provider>,
    );
  };

  test('lists items by section, with their recipes and other names, and filters them', async () => {
    await i18n.changeLanguage('nb');
    await showItems();
    expect(screen.getByText('Melk')).toHaveStyle({ color: Palettes.dark.ink });
    expect(screen.getByText('I 2 oppskrifter · også mlek')).toBeTruthy();
    // An item in a deleted section shows under Annet.
    expect(screen.getByText('Annet · 1')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Søk i varer'), 'MLEK');
    expect(screen.getByText('Melk')).toBeTruthy();
    expect(screen.queryByText('Løk')).toBeNull();
    expect(screen.queryByText('Helmelk')).toBeNull();
  });

  test('renames, moves and merges an item', async () => {
    await i18n.changeLanguage('en');
    mockRenameItem.mockClear();
    mockSetSection.mockClear();
    mockMergeItems.mockClear();
    const alert = jest.spyOn(Alert, 'alert');
    await showItems();
    await fireEvent.press(screen.getByText('Løk'));
    await fireEvent.press(screen.getByText('Produce'));
    expect(mockSetSection).toHaveBeenCalledWith({ ingredientId: 'løk', section: 'produce' });
    await fireEvent.changeText(screen.getByLabelText('Name'), ' rødløk ');
    await act(() => fireEvent.press(screen.getByText('Save')));
    expect(mockRenameItem).toHaveBeenCalledWith({ ingredientId: 'løk', name: 'Rødløk' });

    // A name another item answers to offers a merge instead of renaming.
    await fireEvent.press(screen.getByText('Helmelk'));
    await fireEvent.changeText(screen.getByLabelText('Name'), 'mlek');
    await act(() => fireEvent.press(screen.getByText('Save')));
    expect(mockRenameItem).toHaveBeenCalledTimes(1);
    expect(alert.mock.calls.at(-1)?.[0]).toBe('Melk is already an item');
    const offer = alert.mock.calls.at(-1)?.[2]?.find((b) => b.text === 'Merge');
    await act(() => offer?.onPress?.());
    const confirm = alert.mock.calls.at(-1)?.[2]?.find((b) => b.text === 'Merge');
    await act(() => confirm?.onPress?.());
    expect(mockMergeItems).toHaveBeenCalledWith({ fromId: 'helmelk', intoId: 'melk' });
    alert.mockRestore();
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
    expect(screen.getAllByText('Add dinner')).toHaveLength(6);
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
    expect(screen.queryByText('Add dinner')).toBeNull();
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

describe('groceries', () => {
  // Adding sets a timer that lets go of the flash; fake timers keep it from outliving the test.
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  const row = (id: string, name: string, atHome = false) => ({
    _id: id,
    ingredientId: `ing-${name}`,
    name,
    section: 'dairy',
    checked: false,
    atHome,
    source: { kind: 'manual' as const },
  });
  const list = (items: ReturnType<typeof row>[]) => ({
    items,
    sources: {},
    addedBy: {},
    sectionOrder: undefined,
    carryOver: null,
    stapleIds: [] as string[],
    staplesOffer: [] as { ingredientId: string; name: string }[],
  });

  test('typing shows Ferdig, which adds what is typed and leaves typing mode', async () => {
    await i18n.changeLanguage('nb');
    mockUseQuery.mockReturnValue(list([]));
    mockAddManual.mockResolvedValue('i1');
    await render(
      <SessionContext.Provider value={me}>
        <GroceriesScreen />
      </SessionContext.Provider>,
    );
    const field = screen.getByLabelText('Legg til en vare');
    expect(screen.queryByText('Ferdig')).toBeNull();
    await fireEvent(field, 'focus');
    await fireEvent.changeText(field, '2 l melk');
    await fireEvent.press(screen.getByText('Ferdig'));
    expect(mockAddManual).toHaveBeenCalledWith(expect.objectContaining({ name: 'melk', qty: 2 }));
    await fireEvent(field, 'blur');
    expect(screen.queryByText('Ferdig')).toBeNull();
  });

  test('lines name their dinner only when the list has more than one', async () => {
    await i18n.changeLanguage('en');
    const meal = (id: string, name: string, entry: string) => ({
      ...row(id, name),
      section: 'produce',
      source: { kind: 'meal' as const, mealPlanEntryId: entry },
    });
    const sources = {
      e1: { date: '2026-10-26', title: 'Tacos' },
      e2: { date: '2026-10-27', title: 'Soup' },
    };
    mockUseQuery.mockReturnValue({
      ...list([]),
      items: [meal('i0', 'Onion', 'e1'), meal('i1', 'Lime', 'e1')],
      sources,
    });
    const ui = (
      <SessionContext.Provider value={me}>
        <GroceriesScreen />
      </SessionContext.Provider>
    );
    await render(ui);
    expect(screen.getByText('Onion')).toBeTruthy();
    expect(screen.queryByText(/Tacos/)).toBeNull();

    mockUseQuery.mockReturnValue({
      ...list([]),
      items: [meal('i0', 'Onion', 'e1'), meal('i1', 'Leek', 'e2')],
      sources,
    });
    await render(ui);
    expect(screen.getByText(/Tacos/)).toBeTruthy();
    expect(screen.getByText(/Soup/)).toBeTruthy();
  });

  test('a new item flashes its line and gives a light tap', async () => {
    await i18n.changeLanguage('en');
    mockUseQuery.mockReturnValue(list([row('i0', 'Butter')]));
    mockAddManual.mockResolvedValue('i1');
    const ui = (
      <SessionContext.Provider value={me}>
        <GroceriesScreen />
      </SessionContext.Provider>
    );
    await render(ui);
    await fireEvent.changeText(screen.getByLabelText('Add an item'), 'milk');
    // The list updates with the new row before the mutation resolves.
    mockUseQuery.mockReturnValue(list([row('i0', 'Butter'), row('i1', 'Milk')]));
    await act(() => fireEvent(screen.getByLabelText('Add an item'), 'submitEditing'));
    expect(screen.getAllByTestId('added-flash')).toHaveLength(1);
    expect(Haptics.impactAsync).toHaveBeenCalledWith('light');
    // The flash is let go after a moment, so unticking the item later does not flash it again.
    await act(() => jest.runOnlyPendingTimers());
    expect(screen.queryByTestId('added-flash')).toBeNull();
  });

  test("typing suggests the family's items; one tap adds it with the typed amount", async () => {
    await i18n.changeLanguage('nb');
    const found = [
      { _id: 'ing-Melk', name: 'Melk', section: 'dairy' },
      { _id: 'ing-lettmelk', name: 'Lettmelk', section: 'dairy' },
    ];
    const searched: unknown[] = [];
    let loading = false;
    mockUseQuery.mockImplementation((name: string, args: unknown) => {
      if (name === 'grocery.listForWeek') return list([row('i0', 'Melk')]);
      if (args === 'skip') return undefined;
      searched.push(args);
      return loading ? undefined : found;
    });
    mockAddManual.mockResolvedValue('i1');
    await render(
      <SessionContext.Provider value={me}>
        <GroceriesScreen />
      </SessionContext.Provider>,
    );
    const field = screen.getByLabelText('Legg til en vare');
    await fireEvent(field, 'focus');
    await fireEvent.changeText(field, '2 l m');
    await fireEvent.changeText(field, '2 l me');
    // Nothing is searched until typing pauses, and then only the name.
    expect(searched).toEqual([]);
    await act(() => jest.advanceTimersByTime(SUGGEST_DELAY_MS));
    expect(new Set(searched.map((a) => JSON.stringify(a)))).toEqual(
      new Set([JSON.stringify({ groupId: 'g1', text: 'me' })]),
    );
    expect(screen.getByText('Står allerede på listen')).toBeTruthy();
    expect(screen.getByText('Lettmelk')).toBeTruthy();

    // While the next search loads, the last results stay up instead of blinking away.
    loading = true;
    await fireEvent.changeText(field, '2 l mel');
    await act(() => jest.advanceTimersByTime(SUGGEST_DELAY_MS));
    expect(screen.getByText('Lettmelk')).toBeTruthy();
    loading = false;

    await act(() => fireEvent.press(screen.getByLabelText(/^Legg til Lettmelk,/)));
    expect(mockAddManual).toHaveBeenCalledWith(
      expect.objectContaining({
        ingredientId: 'ing-lettmelk',
        name: 'Lettmelk',
        qty: 2,
        unit: 'l',
      }),
    );
    // The field is empty again, so the suggestions are gone.
    expect(screen.queryByText('Lettmelk')).toBeNull();
  });

  test('ticking a line shows its check first, then sends it to the cart with a light tap', async () => {
    await i18n.changeLanguage('en');
    mockSetChecked.mockClear();
    jest.mocked(Haptics.impactAsync).mockClear();
    mockUseQuery.mockReturnValue(list([row('i0', 'Butter'), row('i1', 'Milk')]));
    await render(
      <SessionContext.Provider value={me}>
        <GroceriesScreen />
      </SessionContext.Provider>,
    );
    await fireEvent.press(screen.getByText('Butter'));
    // The box shows the check before the line leaves; a second tap meanwhile does nothing.
    expect(screen.getAllByRole('checkbox', { checked: true })).toHaveLength(1);
    expect(Haptics.impactAsync).toHaveBeenCalledWith('light');
    await fireEvent.press(screen.getByText('Butter'));
    expect(mockSetChecked).not.toHaveBeenCalled();
    await act(() => jest.runOnlyPendingTimers());
    expect(mockSetChecked).toHaveBeenCalledTimes(1);
    expect(mockSetChecked).toHaveBeenCalledWith({ itemIds: ['i0'], checked: true });
  });

  test('ticking the last open line buzzes success, and an all-shopped list says so', async () => {
    await i18n.changeLanguage('en');
    jest.mocked(Haptics.notificationAsync).mockClear();
    mockUseQuery.mockReturnValue(list([row('i0', 'Butter'), row('i1', 'Milk', true)]));
    const ui = (
      <SessionContext.Provider value={me}>
        <GroceriesScreen />
      </SessionContext.Provider>
    );
    await render(ui);
    expect(screen.queryByTestId('all-shopped')).toBeNull();
    await fireEvent.press(screen.getByText('Butter'));
    expect(Haptics.notificationAsync).toHaveBeenCalledWith('success');
    mockUseQuery.mockReturnValue(
      list([{ ...row('i0', 'Butter'), checked: true }, row('i1', 'Milk', true)]),
    );
    await act(() => jest.runOnlyPendingTimers());
    await render(ui);
    expect(screen.getByText('All shopped')).toBeTruthy();
  });

  test("lines someone else adds get the wash; lines there on first show don't", async () => {
    await i18n.changeLanguage('en');
    mockUseQuery.mockReturnValue(list([row('i0', 'Butter')]));
    // A new element each time, so the screen renders again and reads the updated query.
    const ui = () => (
      <SessionContext.Provider value={me}>
        <GroceriesScreen />
      </SessionContext.Provider>
    );
    const view = await render(ui());
    expect(screen.queryByTestId('added-flash')).toBeNull();
    mockUseQuery.mockReturnValue(list([row('i0', 'Butter'), row('i2', 'Eggs')]));
    await view.rerender(<SafeAreaProvider initialMetrics={metrics}>{ui()}</SafeAreaProvider>);
    expect(screen.getAllByTestId('added-flash')).toHaveLength(1);
    await act(() => jest.runOnlyPendingTimers());
    expect(screen.queryByTestId('added-flash')).toBeNull();
  });

  test('the house button marks a line as at home, and the at-home group puts it back', async () => {
    await i18n.changeLanguage('nb');
    mockSetAtHome.mockClear();
    mockUseQuery.mockReturnValue(list([row('i0', 'Smør'), row('i1', 'Melk', true)]));
    await render(
      <SessionContext.Provider value={me}>
        <GroceriesScreen />
      </SessionContext.Provider>,
    );
    await fireEvent.press(screen.getByLabelText('Har hjemme: Smør'));
    expect(mockSetAtHome).toHaveBeenCalledWith({ itemIds: ['i0'], atHome: true });

    // Melk is not on the shopping part of the list, only in the collapsed group.
    expect(screen.queryByLabelText('Har hjemme: Melk')).toBeNull();
    expect(screen.queryByText('Melk')).toBeNull();
    await fireEvent.press(screen.getByText('Har hjemme · 1'));
    await fireEvent.press(screen.getByLabelText('Sett Melk på listen igjen'));
    expect(mockSetAtHome).toHaveBeenCalledWith({ itemIds: ['i1'], atHome: false });
  });
});

describe('staples offer', () => {
  const offer = {
    items: [],
    sources: {},
    addedBy: {},
    sectionOrder: undefined,
    carryOver: null,
    stapleIds: ['ing-milk', 'ing-bread'],
    staplesOffer: [
      { ingredientId: 'ing-bread', name: 'Brød' },
      { ingredientId: 'ing-milk', name: 'Melk' },
    ],
  };

  test('adds one staple, all of them, or skips them this week', async () => {
    await i18n.changeLanguage('nb');
    mockAddStaples.mockClear();
    mockDismissStaples.mockClear();
    mockUseQuery.mockReturnValue(offer);
    await render(
      <SessionContext.Provider value={me}>
        <GroceriesScreen />
      </SessionContext.Provider>,
    );
    expect(screen.getByText(/2 faste varer er ikke på listen/)).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Legg Melk på listen'));
    expect(mockAddStaples).toHaveBeenLastCalledWith(
      expect.objectContaining({ groupId: 'g1', ingredientIds: ['ing-milk'] }),
    );
    await fireEvent.press(screen.getByText('Legg til alle'));
    expect(mockAddStaples).toHaveBeenLastCalledWith(
      expect.objectContaining({ ingredientIds: ['ing-bread', 'ing-milk'] }),
    );
    await fireEvent.press(screen.getByText('Ikke denne uka'));
    expect(mockDismissStaples).toHaveBeenCalledWith(expect.objectContaining({ groupId: 'g1' }));
  });

  test('leaves out staples the carry-over card offers to move', async () => {
    await i18n.changeLanguage('en');
    mockUseQuery.mockReturnValue({
      ...offer,
      carryOver: { count: 1, ingredientIds: ['ing-milk'] },
    });
    await render(
      <SessionContext.Provider value={me}>
        <GroceriesScreen />
      </SessionContext.Provider>,
    );
    await fireEvent.press(screen.getByText('This week'));
    expect(screen.getByText('Move 1 item')).toBeTruthy();
    expect(screen.getByLabelText('Add Brød to the list')).toBeTruthy();
    expect(screen.queryByLabelText('Add Melk to the list')).toBeNull();
    // Next week has no carry-over card, so it offers both.
    await fireEvent.press(screen.getByText('Next week'));
    expect(screen.getByLabelText('Add Melk to the list')).toBeTruthy();
  });

  test('shows nothing when every staple is on the list', async () => {
    await i18n.changeLanguage('en');
    mockUseQuery.mockReturnValue({ ...offer, staplesOffer: [] });
    await render(
      <SessionContext.Provider value={me}>
        <GroceriesScreen />
      </SessionContext.Provider>,
    );
    expect(screen.queryByText('Add all')).toBeNull();
  });
});

describe('staples screen', () => {
  afterEach(() => jest.useRealTimers());

  test('lists staples, removes one, and adds a typed or suggested item', async () => {
    jest.useFakeTimers();
    await i18n.changeLanguage('en');
    mockSetStaple.mockClear();
    mockAddStaple.mockClear();
    const staples = [{ _id: 'ing-milk', name: 'Milk', section: 'dairy' }];
    const found = [
      { _id: 'ing-milk', name: 'Milk', section: 'dairy' },
      { _id: 'ing-oat', name: 'Oat milk', section: 'dairy' },
    ];
    mockUseQuery.mockImplementation((name: string, args: unknown) =>
      name === 'staples.list' ? staples : args === 'skip' ? undefined : found,
    );
    await render(
      <SessionContext.Provider value={me}>
        <StaplesScreen />
      </SessionContext.Provider>,
    );
    expect(screen.getByText('Milk')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Stop offering Milk'));
    expect(mockSetStaple).toHaveBeenCalledWith({ ingredientId: 'ing-milk', staple: false });

    const field = screen.getByLabelText('New staple');
    await fireEvent.changeText(field, 'milk');
    await act(() => jest.advanceTimersByTime(SUGGEST_DELAY_MS));
    // Milk is already a staple, so only Oat milk is suggested.
    await act(() => fireEvent.press(screen.getByText('Oat milk')));
    expect(mockAddStaple).toHaveBeenCalledWith({
      groupId: 'g1',
      name: 'Oat milk',
      ingredientId: 'ing-oat',
    });

    mockAddStaple.mockClear();
    await fireEvent.changeText(field, 'Coffee');
    await act(() => fireEvent.press(screen.getByText('Add')));
    expect(mockAddStaple).toHaveBeenCalledWith({
      groupId: 'g1',
      name: 'Coffee',
      ingredientId: undefined,
    });
  });
});

describe('grocery line editor', () => {
  const line = {
    key: 'open|ing-onion',
    ingredientId: 'ing-onion',
    name: 'Onion',
    section: 'produce',
    checked: false,
    atHome: false,
    itemIds: ['i0', 'i1'],
    amounts: [{ qty: 4, unit: 'pcs' as const }],
    entryIds: ['e1', 'e2'],
    addedBy: [],
  };

  test('saving after only moving the line to another section is no edit', async () => {
    await i18n.changeLanguage('en');
    mockEditMerged.mockClear();
    mockSetSection.mockClear();
    const onClose = jest.fn();
    await render(
      <SessionContext.Provider value={me}>
        <GroceryLineEditor line={line} isStaple={false} onClose={onClose} />
      </SessionContext.Provider>,
    );
    await fireEvent.press(screen.getByText('Frozen'));
    expect(mockSetSection).toHaveBeenCalledWith({ ingredientId: 'ing-onion', section: 'frozen' });
    await act(() => fireEvent.press(screen.getByText('Save')));
    expect(mockEditMerged).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  test('"Buy every week" makes the item a staple, or stops it being one', async () => {
    await i18n.changeLanguage('en');
    mockSetStaple.mockClear();
    const view = await render(
      <SessionContext.Provider value={me}>
        <GroceryLineEditor line={line} isStaple={false} onClose={jest.fn()} />
      </SessionContext.Provider>,
    );
    await fireEvent.press(screen.getByRole('switch', { name: 'Buy every week' }));
    expect(mockSetStaple).toHaveBeenLastCalledWith({ ingredientId: 'ing-onion', staple: true });
    await view.rerender(
      <SafeAreaProvider initialMetrics={metrics}>
        <SessionContext.Provider value={me}>
          <GroceryLineEditor line={line} isStaple onClose={jest.fn()} />
        </SessionContext.Provider>
      </SafeAreaProvider>,
    );
    await fireEvent.press(screen.getByRole('switch', { name: 'Buy every week' }));
    expect(mockSetStaple).toHaveBeenLastCalledWith({ ingredientId: 'ing-onion', staple: false });
  });

  test('saving a new amount edits the line', async () => {
    await i18n.changeLanguage('en');
    mockEditMerged.mockClear();
    await render(
      <SessionContext.Provider value={me}>
        <GroceryLineEditor line={line} isStaple={false} onClose={jest.fn()} />
      </SessionContext.Provider>,
    );
    await fireEvent.changeText(screen.getByDisplayValue('4'), '3');
    await act(() => fireEvent.press(screen.getByText('Save')));
    expect(mockEditMerged).toHaveBeenCalledWith({ itemIds: ['i0', 'i1'], qty: 3, unit: 'pcs' });
  });
});

describe('recipe edit', () => {
  const editor = async () => {
    await i18n.changeLanguage('en');
    mockUseQuery.mockReturnValue(undefined);
    await render(
      <SessionContext.Provider value={me}>
        <RecipeEditScreen />
      </SessionContext.Provider>,
    );
  };
  const names = () => screen.getAllByLabelText('Ingredient');

  test('Return on the last ingredient adds a row, but not after a blank one', async () => {
    await editor();
    expect(names()).toHaveLength(1);
    // A blank last row puts the keyboard away rather than adding another blank row.
    await fireEvent(names()[0], 'submitEditing');
    expect(names()).toHaveLength(1);

    await fireEvent.changeText(names()[0], 'milk');
    await fireEvent(names()[0], 'submitEditing');
    expect(names()).toHaveLength(2);
    await fireEvent(names()[1], 'submitEditing');
    expect(names()).toHaveLength(2);
  });

  test('Return in the qty field goes on to the name, even when empty', async () => {
    await editor();
    const qty = screen.getByLabelText('Qty');
    expect(qty.props.returnKeyType).toBe('next');
    await fireEvent(qty, 'submitEditing');
    expect(names()).toHaveLength(1);
  });
});

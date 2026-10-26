import { act, fireEvent, render as rtlRender, screen } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import FamilyScreen from '@/app/(tabs)/family/index';
import GroceriesScreen from '@/app/(tabs)/groceries/index';
import RecipeEditScreen from '@/app/recipe/edit';
import WeekScreen from '@/app/(tabs)/week/index';
import SectionsScreen from '@/app/(tabs)/family/sections';
import SignInScreen from '@/app/sign-in';
import { Palettes } from '@/constants/theme';
import { SECTIONS } from '@/convex/lib/catalog';
import { SchemeContext } from '@/lib/appearance';
import * as build from '@/lib/build';
import i18n from '@/lib/i18n';
import { SessionContext, type Me } from '@/lib/session';

jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  // Header options need a real stack; the screens under test render fine without one.
  Stack: { Screen: () => null },
}));
const mockUseQuery = jest.fn();
const mockAddManual = jest.fn();
const mockRename = jest.fn(() => Promise.resolve(null));
const mockSetAtHome = jest.fn((_args: unknown) => Promise.resolve(1));
jest.mock('convex/react', () => ({
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
  useMutation: (name: string) =>
    name === 'grocery.addManual'
      ? mockAddManual
      : name === 'groups.rename'
        ? mockRename
        : name === 'grocery.setAtHome'
          ? { withOptimisticUpdate: () => mockSetAtHome }
          : Object.assign(jest.fn(), { withOptimisticUpdate: () => jest.fn() }),
}));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  selectionAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light' },
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
    sections: SECTIONS.map((key) => ({ key })),
    sectionOrder: [...SECTIONS],
  },
};

beforeEach(() => {
  mockUseQuery.mockReset();
  mockAddManual.mockReset();
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

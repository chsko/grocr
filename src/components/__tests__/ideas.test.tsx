import { act, fireEvent, render as rtlRender, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import RecipesScreen from '@/app/(tabs)/recipes';
import WeekScreen from '@/app/(tabs)/week';
import PickDinnerScreen from '@/app/pick-dinner';
import { SECTIONS } from '@/convex/lib/catalog';
import i18n from '@/lib/i18n';
import { SessionContext, type Me } from '@/lib/session';
import { resetShownWeek } from '@/lib/shown-week';
import { addDays, startOfWeek, todayIn } from '@/lib/week';

// Dinner ideas (#106): plan a dish that has no recipe yet.
const WEDNESDAY = addDays(startOfWeek(todayIn('Europe/Oslo'), 1), 9);

jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  router: { back: jest.fn(), push: jest.fn(), navigate: jest.fn() },
  useLocalSearchParams: () => ({ date: mockDate }),
  useRoute: () => ({ key: 'week' }),
  useNavigation: () => ({
    isFocused: () => true,
    getState: () => ({ index: 0, routes: [{ key: 'week' }] }),
    addListener: () => () => undefined,
  }),
  useIsFocused: () => true,
  Stack: { Screen: () => null },
}));
let mockDate = '';

const mockQueries: Record<string, unknown> = {};
const mockPlanIdea = jest.fn((_args: unknown) => Promise.resolve('r9'));
const mockSet = jest.fn((_args: unknown) => Promise.resolve('e9'));
jest.mock('convex/react', () => ({
  useQuery: (name: string, args: unknown) =>
    typeof mockQueries[name] === 'function'
      ? (mockQueries[name] as (mockArgs: unknown) => unknown)(args)
      : (mockQueries[name] ?? null),
  useMutation: (name: string) =>
    name === 'mealPlan.planIdea'
      ? mockPlanIdea
      : name === 'mealPlan.set'
        ? mockSet
        : Object.assign(jest.fn(), { withOptimisticUpdate: () => jest.fn() }),
}));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  selectionAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light' },
  NotificationFeedbackType: { Success: 'success' },
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
    whatsNewSeen: 99,
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

const recipe = (id: string, title: string, isIdea = false, ingredientCount = 3) => ({
  _id: id,
  title,
  icon: '🍝',
  servings: 4,
  ingredientCount,
  isIdea,
  rating: { average: null, count: 0, mine: null },
  lastCooked: null,
  nextPlanned: null,
});

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

beforeEach(async () => {
  resetShownWeek();
  for (const key of Object.keys(mockQueries)) delete mockQueries[key];
  mockPlanIdea.mockClear();
  mockDate = WEDNESDAY;
  await i18n.changeLanguage('en');
});

describe('dinner picker', () => {
  test('offers to plan what was typed as an idea when nothing is called that', async () => {
    mockQueries['mealPlan.week'] = { dinners: [], openLines: 0 };
    mockQueries['recipes.list'] = [recipe('r1', 'Tacos'), recipe('r2', 'Thai curry', true, 2)];
    await render(<PickDinnerScreen />);

    expect(screen.getByText('Ideas')).toBeTruthy();
    expect(screen.getByText('Thai curry')).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText('Search recipes'), 'Lasagne');
    expect(screen.getByText('No recipe is called that.')).toBeTruthy();
    await fireEvent.press(screen.getByText('Plan «Lasagne» as an idea'));
    expect(screen.getByText('No items yet. Add them on the idea.')).toBeTruthy();
    await act(() => fireEvent.press(screen.getByText('Plan the idea')));
    expect(mockPlanIdea).toHaveBeenCalledWith({
      groupId: 'g1',
      date: WEDNESDAY,
      title: 'Lasagne',
      servings: 4,
    });
  });

  test('does not offer an idea for a title the family already has', async () => {
    mockQueries['mealPlan.week'] = { dinners: [], openLines: 0 };
    mockQueries['recipes.list'] = [recipe('r1', 'Tacos')];
    await render(<PickDinnerScreen />);
    await fireEvent.changeText(screen.getByLabelText('Search recipes'), ' tacos ');
    expect(screen.queryByText(/as an idea/)).toBeNull();
    await fireEvent.changeText(screen.getByLabelText('Search recipes'), 'Tac');
    expect(screen.getByText('Plan «Tac» as an idea')).toBeTruthy();
  });
});

describe('week', () => {
  test('marks an idea with a pill and its item count', async () => {
    mockQueries['mealPlan.week'] = (args: { startDate: string }) => ({
      dinners: [
        {
          _id: 'e1',
          date: args.startDate,
          recipeId: 'r2',
          title: 'Lasagne',
          icon: '🍝',
          isNote: false,
          isIdea: true,
          ingredientCount: 3,
          servings: 4,
        },
      ],
      openLines: 0,
    });
    await render(<WeekScreen />);
    expect(screen.getByText('Lasagne')).toBeTruthy();
    expect(screen.getByText('IDEA')).toBeTruthy();
    expect(screen.getByText('3 items · Serves 4')).toBeTruthy();
  });
});

describe('recipes', () => {
  test('lists ideas in their own section above the recipes', async () => {
    mockQueries['recipes.list'] = (args: { archived: boolean }) =>
      args.archived
        ? []
        : [recipe('r1', 'Tacos'), recipe('r2', 'Lasagne', true, 1), recipe('r3', 'Fish soup')];
    await render(<RecipesScreen />);
    expect(screen.getByText('Ideas · 1')).toBeTruthy();
    expect(screen.getByText('Recipes · 2')).toBeTruthy();
    expect(screen.getByText('1 item')).toBeTruthy();
    const titles = screen.getAllByText(/^(Tacos|Lasagne|Fish soup)$/).map((n) => n.props.children);
    expect(titles).toEqual(['Lasagne', 'Tacos', 'Fish soup']);
  });

  test('shows no headings when there are no ideas', async () => {
    mockQueries['recipes.list'] = (args: { archived: boolean }) =>
      args.archived ? [] : [recipe('r1', 'Tacos')];
    await render(<RecipesScreen />);
    expect(screen.queryByText(/^Ideas/)).toBeNull();
    expect(screen.queryByText(/^Recipes ·/)).toBeNull();
  });
});

import { act, fireEvent, render as rtlRender, screen } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import WeekScreen from '@/app/(tabs)/week';
import RecipeScreen from '@/app/recipe/[id]';
import SuggestWeekScreen from '@/app/suggest-week';
import { addDays, todayIn } from '@/convex/lib/week';
import i18n from '@/lib/i18n';
import { SessionContext, type Me } from '@/lib/session';

const mockUseQuery = jest.fn();
const mockPlan = jest.fn((_args: unknown) => Promise.resolve(1));
const mockRate = jest.fn((_args: unknown) => Promise.resolve(null));
jest.mock('convex/react', () => ({
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
  useMutation: (name: string) =>
    name === 'mealPlan.planSuggested'
      ? mockPlan
      : name === 'recipes.rate'
        ? { withOptimisticUpdate: () => mockRate }
        : Object.assign(jest.fn(), { withOptimisticUpdate: () => jest.fn() }),
}));
jest.mock('@/convex/_generated/api', () => ({
  api: new Proxy(
    {},
    { get: (_, mod) => new Proxy({}, { get: (__, fn) => `${String(mod)}.${String(fn)}` }) },
  ),
}));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  selectionAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light' },
  NotificationFeedbackType: { Success: 'success' },
}));
const mockRouter = { back: jest.fn(), push: jest.fn(), navigate: jest.fn() };
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  get router() {
    return mockRouter;
  },
  useLocalSearchParams: () => mockParams,
  Stack: { Screen: () => null },
  useNavigation: () => ({ isFocused: () => true, addListener: () => () => {} }),
  useRoute: () => ({ key: 'week' }),
}));

const me: Me = {
  user: {
    _id: 'u1' as Me['user']['_id'],
    name: 'Kari Hansen',
    email: undefined,
    tourDone: true,
    whatsNewSeen: null,
  },
  family: {
    groupId: 'g1' as NonNullable<Me['family']>['groupId'],
    name: 'Hansen family',
    role: 'owner',
    weekStartsOn: 1,
    timezone: 'Europe/Oslo',
    sections: [{ key: 'other' }],
    sectionOrder: ['other'],
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

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
});

const today = todayIn('Europe/Oslo');
const candidate = (recipeId: string, title: string, rating: number | null) => ({
  recipeId,
  title,
  icon: '🍝',
  servings: 4,
  rating,
  lastCooked: rating === null ? null : addDays(today, -40),
});

describe('suggest a week', () => {
  test('the Week tab offers suggestions only while a day from today on is empty', async () => {
    await i18n.changeLanguage('en');
    mockUseQuery.mockReturnValue({ dinners: [], openLines: 0 });
    await render(<WeekScreen />);
    await fireEvent.press(screen.getByText('Suggest dinners'));
    expect(mockRouter.push).toHaveBeenCalledWith(
      expect.objectContaining({ pathname: '/suggest-week' }),
    );
  });

  test('the Week tab hides suggestions when every day has a dinner', async () => {
    await i18n.changeLanguage('en');
    mockUseQuery.mockImplementation((_fn, args: { startDate: string }) => ({
      dinners: Array.from({ length: 7 }, (_, i) => ({
        _id: `e${i}`,
        date: addDays(args.startDate, i),
        recipeId: 'r1',
        title: 'Tacos',
        icon: '🌮',
        isNote: false,
        servings: 4,
      })),
      openLines: 0,
    }));
    await render(<WeekScreen />);
    expect(screen.queryByText('Suggest dinners')).toBeNull();
  });

  test('swaps and skips days, then plans the ones kept', async () => {
    await i18n.changeLanguage('en');
    const days = [addDays(today, 1), addDays(today, 2)];
    mockUseQuery.mockReturnValue({
      days,
      candidates: [
        candidate('r1', 'Lasagne', 5),
        candidate('r2', 'Soup', 3.5),
        candidate('r3', 'Fish cakes', null),
      ],
    });
    await render(<SuggestWeekScreen />);
    expect(screen.getByText('Lasagne')).toBeTruthy();
    expect(screen.getByText('Soup')).toBeTruthy();
    expect(screen.getByLabelText('Rated 3.5 out of 5')).toBeTruthy();
    expect(screen.getByText('Plan 2 dinners')).toBeTruthy();

    await fireEvent.press(screen.getAllByLabelText(/^Another dinner for/)[0]);
    expect(screen.queryByText('Lasagne')).toBeNull();
    expect(screen.getByText('Fish cakes')).toBeTruthy();
    expect(screen.getByText('Not cooked yet')).toBeTruthy();

    await fireEvent.press(screen.getAllByLabelText(/^Skip/)[1]);
    expect(screen.getByText('Skipped')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText('Plan 1 dinner'));
    });
    expect(mockPlan).toHaveBeenCalledWith({
      groupId: 'g1',
      dinners: [{ date: days[0], recipeId: 'r3' }],
    });
    expect(mockRouter.back).toHaveBeenCalled();
  });

  test('swaps survive the family changing something elsewhere; extra days say why they are empty', async () => {
    await i18n.changeLanguage('en');
    const days = [addDays(today, 1), addDays(today, 2), addDays(today, 3)];
    const answer = () => ({
      days,
      candidates: [candidate('r1', 'Lasagne', 5), candidate('r2', 'Soup', 3.5)],
    });
    mockUseQuery.mockReturnValue(answer());
    await render(<SuggestWeekScreen />);
    expect(screen.getByText('No more recipes to suggest')).toBeTruthy();
    await fireEvent.press(screen.getAllByLabelText(/^Skip/)[0]);
    expect(screen.getAllByText('Skipped')).toHaveLength(1);
    expect(screen.getByText('No dinner yet')).toBeTruthy();
    // A new answer from the server (someone rated a recipe) keeps the skip.
    mockUseQuery.mockReturnValue(answer());
    await screen.rerender(
      <SafeAreaProvider initialMetrics={metrics}>
        <SessionContext.Provider value={me}>
          <SuggestWeekScreen />
        </SessionContext.Provider>
      </SafeAreaProvider>,
    );
    expect(screen.getAllByText('Skipped')).toHaveLength(1);
    expect(screen.getByText('Plan 1 dinner')).toBeTruthy();
  });

  test('says so when there are no recipes or no empty days', async () => {
    await i18n.changeLanguage('nb');
    mockUseQuery.mockReturnValue({ days: [today], candidates: [] });
    await render(<SuggestWeekScreen />);
    expect(screen.getByText(/Legg inn noen oppskrifter først/)).toBeTruthy();
    expect(screen.queryByText(/Planlegg/)).toBeNull();
  });
});

describe('rating a recipe', () => {
  const recipe = {
    _id: 'r1',
    title: 'Lasagne',
    servings: 4,
    shownIcon: '🍝',
    ingredients: [],
    steps: [],
    lastCooked: addDays(today, -14),
    nextPlanned: null,
    timesCooked: 3,
    ratings: [{ name: 'Ola Berg', stars: 4, isMe: false }],
    rating: { average: 4, count: 1, mine: null },
  };

  test('shows when it was last cooked and the family stars; a tap rates it', async () => {
    await i18n.changeLanguage('en');
    mockParams = { id: 'r1' };
    mockUseQuery.mockReturnValue(recipe);
    await render(<RecipeScreen />);
    expect(screen.getByText('4 servings · Last cooked 2 weeks ago · cooked 3 times')).toBeTruthy();
    expect(screen.getByText('Family: 4 from 1 rating · Ola 4★')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByLabelText('5 stars'));
    });
    expect(mockRate).toHaveBeenCalledWith({ recipeId: 'r1', stars: 5 });
    expect(Haptics.impactAsync).toHaveBeenCalledWith('light');
  });

  test('tapping your own rating again clears it', async () => {
    await i18n.changeLanguage('nb');
    mockParams = { id: 'r1' };
    mockUseQuery.mockReturnValue({
      ...recipe,
      ratings: [{ name: 'Kari Hansen', stars: 3, isMe: true }],
      rating: { average: 3, count: 1, mine: 3 },
    });
    await render(<RecipeScreen />);
    await act(async () => {
      fireEvent.press(screen.getByLabelText('3 stjerner'));
    });
    expect(mockRate).toHaveBeenCalledWith({ recipeId: 'r1', stars: null });
    expect(Haptics.selectionAsync).toHaveBeenCalled();
    expect(Haptics.impactAsync).not.toHaveBeenCalled();
  });
});

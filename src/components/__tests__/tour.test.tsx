import { fireEvent, render as rtlRender, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import TourScreen from '@/app/tour';
import i18n from '@/lib/i18n';
import { SessionContext, type Me } from '@/lib/session';

const mockUseQuery = jest.fn();
const mockFinish = jest.fn(() => Promise.resolve(null));
jest.mock('convex/react', () => ({
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
  useMutation: () => mockFinish,
}));
jest.mock('@/convex/_generated/api', () => ({
  api: new Proxy(
    {},
    { get: (_, mod) => new Proxy({}, { get: (__, fn) => `${String(mod)}.${String(fn)}` }) },
  ),
}));
const mockRouter = {
  canGoBack: jest.fn(() => false),
  back: jest.fn(),
  replace: jest.fn(),
  push: jest.fn(),
  navigate: jest.fn(),
};
// A getter, because the mock factory runs before mockRouter is initialised.
jest.mock('expo-router', () => ({
  get router() {
    return mockRouter;
  },
}));

const me = (tourDone: boolean): Me => ({
  user: { _id: 'u1' as Me['user']['_id'], name: 'Kari Hansen', email: undefined, tourDone },
  family: {
    groupId: 'g1' as NonNullable<Me['family']>['groupId'],
    name: 'Hansen family',
    role: 'owner',
    weekStartsOn: 1,
    timezone: 'Europe/Oslo',
    sectionOrder: [],
  },
});

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};
const render = (tourDone = false) =>
  rtlRender(
    <SafeAreaProvider initialMetrics={metrics}>
      <SessionContext.Provider value={me(tourDone)}>
        <TourScreen />
      </SessionContext.Provider>
    </SafeAreaProvider>,
  );

beforeEach(() => {
  jest.clearAllMocks();
  mockRouter.canGoBack.mockReturnValue(false);
});

async function toLastPage() {
  for (let i = 0; i < 4; i++) await fireEvent.press(screen.getByText('Next'));
}

describe('get-started tour', () => {
  test('walks the five pages and ends in the recipe editor for a new family', async () => {
    await i18n.changeLanguage('en');
    mockUseQuery.mockReturnValue([]);
    await render();
    expect(screen.getByText('Welcome to Grocr')).toBeTruthy();
    expect(screen.getByLabelText('Page 1 of 5')).toBeTruthy();
    await toLastPage();
    expect(screen.getByLabelText('Page 5 of 5')).toBeTruthy();
    expect(screen.queryByText('Skip')).toBeNull();

    await fireEvent.press(screen.getByText('Add your first recipe'));
    expect(mockFinish).toHaveBeenCalledTimes(1);
    expect(mockRouter.replace).toHaveBeenCalledWith('/recipes');
    expect(mockRouter.push).toHaveBeenCalledWith('/recipe/edit');
  });

  test('offers planning when the family already has recipes', async () => {
    await i18n.changeLanguage('en');
    mockUseQuery.mockReturnValue([{ _id: 'r1', title: 'Tacos' }]);
    await render();
    await toLastPage();
    await fireEvent.press(screen.getByText('Plan this week'));
    expect(mockRouter.replace).toHaveBeenCalledWith('/week');
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  test('skipping saves it as done and opens the week', async () => {
    await i18n.changeLanguage('nb');
    mockUseQuery.mockReturnValue([]);
    await render();
    expect(screen.getByText('Velkommen til Grocr')).toBeTruthy();
    await fireEvent.press(screen.getByText('Hopp over'));
    expect(mockFinish).toHaveBeenCalledTimes(1);
    expect(mockRouter.replace).toHaveBeenCalledWith('/week');
  });

  test('reopened from Family it closes back and does not save again', async () => {
    await i18n.changeLanguage('en');
    mockUseQuery.mockReturnValue([{ _id: 'r1', title: 'Tacos' }]);
    mockRouter.canGoBack.mockReturnValue(true);
    await render(true);
    await fireEvent.press(screen.getByText('Skip'));
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
    expect(mockRouter.replace).not.toHaveBeenCalled();
    expect(mockFinish).not.toHaveBeenCalled();
  });

  test('reopened, the recipe button goes to Recipes first, and a double tap leaves once', async () => {
    await i18n.changeLanguage('en');
    mockUseQuery.mockReturnValue([]);
    mockRouter.canGoBack.mockReturnValue(true);
    await render(true);
    await toLastPage();
    await fireEvent.press(screen.getByText('Add your first recipe'));
    await fireEvent.press(screen.getByText('Add your first recipe'));
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
    expect(mockRouter.navigate).toHaveBeenCalledWith('/recipes');
    expect(mockRouter.push).toHaveBeenCalledTimes(1);
    expect(mockRouter.push).toHaveBeenCalledWith('/recipe/edit');
  });
});

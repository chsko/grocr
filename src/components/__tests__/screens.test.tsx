import { render, screen } from '@testing-library/react-native';

import GroceriesScreen from '@/app/(tabs)/groceries';
import WeekScreen from '@/app/(tabs)/week';
import i18n from '@/lib/i18n';

describe('tab screens', () => {
  test('render in Norwegian', async () => {
    await i18n.changeLanguage('nb');
    await render(<WeekScreen />);
    expect(screen.getByText('Denne uken')).toBeTruthy();
  });

  test('render in English with the week number', async () => {
    await i18n.changeLanguage('en');
    await render(<GroceriesScreen />);
    expect(screen.getByText('Groceries')).toBeTruthy();
    expect(screen.getByText(/^Week \d+$/)).toBeTruthy();
  });
});

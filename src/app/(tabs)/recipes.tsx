import { useTranslation } from 'react-i18next';

import { PlaceholderScreen } from '@/components/placeholder-screen';

export default function RecipesScreen() {
  const { t } = useTranslation();
  return <PlaceholderScreen title={t('recipes.title')} message={t('recipes.empty')} />;
}

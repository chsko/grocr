import { useTranslation } from 'react-i18next';

import { PlaceholderScreen } from '@/components/placeholder-screen';

export default function WeekScreen() {
  const { t } = useTranslation();
  return <PlaceholderScreen title={t('week.title')} message={t('week.empty')} />;
}

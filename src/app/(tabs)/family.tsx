import { useTranslation } from 'react-i18next';

import { PlaceholderScreen } from '@/components/placeholder-screen';

export default function FamilyScreen() {
  const { t } = useTranslation();
  return <PlaceholderScreen title={t('family.title')} message={t('family.empty')} />;
}

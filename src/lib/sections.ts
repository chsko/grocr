import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';

import { isSection, type FamilySection } from '@/convex/lib/catalog';
import { useFamily } from '@/lib/session';

/** A section's name: the family's own, else the app's translated name for a built-in one. */
export function sectionName(t: TFunction, section: FamilySection): string {
  if (section.name !== undefined) return section.name;
  return t(`sections.${(isSection(section.key) ? section.key : 'other') as 'other'}`);
}

/**
 * Names the family's sections by key. A key the family no longer has (a section deleted a moment
 * ago) is named as "other", which is where its lines show.
 */
export function useSectionName() {
  const { t } = useTranslation();
  const { sections } = useFamily();
  return (key: string) =>
    sectionName(
      t,
      sections.find((s) => s.key === key) ??
        sections.find((s) => s.key === 'other') ?? { key: 'other' },
    );
}

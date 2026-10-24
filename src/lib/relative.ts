import type { TFunction } from 'i18next';

import type { LocalDate } from '@/lib/week';

/** "today", "yesterday", "3 days ago", "last week", "2 weeks ago", "a month ago". */
export function relativeDay(t: TFunction, date: LocalDate, today: LocalDate) {
  const days = Math.round((Date.parse(today) - Date.parse(date)) / (24 * 3600 * 1000));
  if (days <= 0) return t('relative.today');
  if (days === 1) return t('relative.yesterday');
  if (days < 7) return t('relative.daysAgo', { count: days });
  if (days < 14) return t('relative.lastWeek');
  if (days < 30) return t('relative.weeksAgo', { count: Math.floor(days / 7) });
  if (days < 60) return t('relative.monthAgo');
  return t('relative.monthsAgo', { count: Math.floor(days / 30) });
}

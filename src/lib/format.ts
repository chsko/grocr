import type { TFunction } from 'i18next';

import { formatQty, type Amount } from '@/convex/lib/units';
import { addDays, isoWeekNumber, weekday, type LocalDate } from '@/lib/week';

const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
const MONTHS = [
  'jan',
  'feb',
  'mar',
  'apr',
  'may',
  'jun',
  'jul',
  'aug',
  'sep',
  'oct',
  'nov',
  'dec',
] as const;

function parts(date: LocalDate) {
  const [, m, d] = date.split('-').map(Number);
  return { month: MONTHS[m - 1], day: d };
}

/** "Mon", "man" */
export function dayShort(t: TFunction, date: LocalDate) {
  return t(`dates.dayShort.${DAYS[weekday(date)]}`);
}

/** "28 Oct" / "28. okt" */
export function dayMonth(t: TFunction, date: LocalDate) {
  const { month, day } = parts(date);
  return t('dates.dayMonth', { day, month: t(`dates.monthShort.${month}`) });
}

/** "Wed 28 Oct" / "ons. 28. okt" */
export function dayLabel(t: TFunction, date: LocalDate) {
  return t('dates.dayLabel', { weekday: dayShort(t, date), date: dayMonth(t, date) });
}

/** "26 Oct – 1 Nov" */
export function weekSpan(t: TFunction, startDate: LocalDate) {
  return `${dayMonth(t, startDate)} – ${dayMonth(t, addDays(startDate, 6))}`;
}

export function weekTitle(t: TFunction, startDate: LocalDate) {
  return t('dates.weekNumber', { week: isoWeekNumber(startDate) });
}

/** "1 can + 200 g", with translated unit names and a decimal comma in Norwegian. */
export function formatAmounts(t: TFunction, language: string, amounts: Amount[]) {
  return amounts
    .filter((a) => a.qty !== undefined || a.unit !== undefined)
    .map((a) => {
      const unit = a.unit ? t(`units.${a.unit}`) : '';
      if (a.qty === undefined) return unit;
      return unit ? `${formatQty(a.qty, language)} ${unit}` : formatQty(a.qty, language);
    })
    .join(' + ');
}

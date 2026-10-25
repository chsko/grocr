import { Redirect } from 'expo-router';
import { useContext } from 'react';

import { SessionContext } from '@/lib/session';

/** The anchor every guard falls back to; sends people where their sign-in state belongs. */
export default function Index() {
  const me = useContext(SessionContext);
  if (me === null) return <Redirect href="/sign-in" />;
  if (me.family === null) return <Redirect href="/welcome" />;
  // Only an explicit false: an older backend without the field must not loop into the tour.
  if (me.user.tourDone === false) return <Redirect href="/tour" />;
  return <Redirect href="/week" />;
}

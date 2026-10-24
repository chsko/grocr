import { api } from '@/convex/_generated/api';
import type { FunctionReturnType } from 'convex/server';
import { createContext, useContext } from 'react';

export type Me = NonNullable<FunctionReturnType<typeof api.users.me>>;
export type Family = NonNullable<Me['family']>;

export const SessionContext = createContext<Me | null>(null);

/** The signed-in user; only call inside screens that require sign-in. */
export function useMe(): Me {
  const me = useContext(SessionContext);
  if (me === null) throw new Error('useMe outside a signed-in screen');
  return me;
}

/** The user's family; only call inside screens that require a family. */
export function useFamily(): Family {
  const { family } = useMe();
  if (family === null) throw new Error('useFamily outside a family screen');
  return family;
}

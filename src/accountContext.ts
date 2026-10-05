import { createContext, useContext } from 'react';

import type { AccountUser } from './webApi';

// Who's signed in (web version). The phone app has no accounts, so this stays null there.
export type Account = { user: AccountUser; signOut: () => Promise<void> };

export const AccountContext = createContext<Account | null>(null);

export function useAccount() {
  return useContext(AccountContext);
}

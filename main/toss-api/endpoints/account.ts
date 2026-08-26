import type { DatabaseSync } from 'node:sqlite';
import { upsertAccount } from '../../db/repositories/accounts';
import { tossRequest } from '../http-client';

export interface AccountSummary {
  accountSeq: string;
  alias?: string;
  accountType?: string;
}

export interface Holding {
  symbol: string;
  quantity: number;
  averagePrice: number;
}

export async function fetchAndCacheAccounts(db: DatabaseSync): Promise<AccountSummary[]> {
  const accounts = await tossRequest<AccountSummary[]>(db, 'ACCOUNT', '/api/v1/accounts');

  for (const account of accounts) {
    upsertAccount(db, {
      accountSeq: account.accountSeq,
      alias: account.alias ?? null,
      accountType: account.accountType ?? null,
    });
  }

  return accounts;
}

export function getHoldings(db: DatabaseSync, accountSeq: string): Promise<Holding[]> {
  return tossRequest<Holding[]>(db, 'ASSET', '/api/v1/holdings', { accountSeq });
}

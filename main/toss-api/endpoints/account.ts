import type { DatabaseSync } from 'node:sqlite';
import { upsertAccount } from '../../db/repositories/accounts';
import { tossRequest } from '../http-client';
import { TOSS_API_PATHS } from '../paths';

// accountSeq 필드명은 openapi.json에서 확인됨. 나머지 필드와 holdings 응답 형태는
// { result: [...] } 포맷을 따른다고 가정(다른 조회 API와 동일 패턴) — 실 계정으로 보정 필요.

export interface AccountSummary {
  accountSeq: string;
  alias?: string;
  accountType?: string;
}

interface AccountsResponse {
  result: AccountSummary[];
}

export interface Holding {
  symbol: string;
  quantity: number;
  averagePrice: number;
}

interface HoldingsResponse {
  result: Holding[];
}

export async function fetchAndCacheAccounts(db: DatabaseSync): Promise<AccountSummary[]> {
  const response = await tossRequest<AccountsResponse>(db, 'ACCOUNT', TOSS_API_PATHS.ACCOUNTS);

  for (const account of response.result) {
    upsertAccount(db, {
      accountSeq: account.accountSeq,
      alias: account.alias ?? null,
      accountType: account.accountType ?? null,
    });
  }

  return response.result;
}

export async function getHoldings(db: DatabaseSync, accountSeq: string): Promise<Holding[]> {
  const response = await tossRequest<HoldingsResponse>(db, 'ASSET', TOSS_API_PATHS.HOLDINGS, { accountSeq });
  return response.result;
}

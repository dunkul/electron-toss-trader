import type { Kysely } from 'kysely';
import type { Database } from '../../db/schema';
import { upsertAccount } from '../../db/repositories/accounts';
import { tossRequest } from '../http-client';
import { TOSS_API_PATHS } from '../paths';
import { API_GROUPS } from '../rate-limiter';

// 실 계정 응답으로 확인된 형태(2026-08-26). accountSeq는 문자열이 아니라 숫자로 내려온다.
export interface AccountSummary {
  accountNo: string;
  accountSeq: number;
  accountType: string;
}

interface AccountsResponse {
  result: AccountSummary[];
}

interface MoneyByCurrency {
  krw: string;
  usd: string;
}

interface HoldingMarketValue {
  purchaseAmount: string;
  amount: string;
  amountAfterCost: string;
}

interface HoldingProfitLoss {
  amount: string;
  amountAfterCost: string;
  rate: string;
  rateAfterCost: string;
}

interface HoldingDailyProfitLoss {
  amount: string;
  rate: string;
}

export interface Holding {
  symbol: string;
  name: string;
  marketCountry: 'KR' | 'US';
  currency: string;
  quantity: string;
  lastPrice: string;
  averagePurchasePrice: string;
  marketValue: HoldingMarketValue;
  profitLoss: HoldingProfitLoss;
  dailyProfitLoss: HoldingDailyProfitLoss;
  cost: { commission: string; tax: string | null };
}

// GET /api/v1/holdings는 보유 종목 배열이 아니라, 계좌 평가금액 요약 + items 배열을 함께 반환한다.
export interface HoldingsSummary {
  totalPurchaseAmount: MoneyByCurrency;
  marketValue: { amount: MoneyByCurrency; amountAfterCost: MoneyByCurrency };
  profitLoss: {
    amount: MoneyByCurrency;
    amountAfterCost: MoneyByCurrency;
    rate: string;
    rateAfterCost: string;
  };
  dailyProfitLoss: { amount: MoneyByCurrency; rate: string };
  items: Holding[];
}

interface HoldingsResponse {
  result: HoldingsSummary;
}

const EMPTY_HOLDINGS_SUMMARY: HoldingsSummary = {
  totalPurchaseAmount: { krw: '0', usd: '0' },
  marketValue: { amount: { krw: '0', usd: '0' }, amountAfterCost: { krw: '0', usd: '0' } },
  profitLoss: {
    amount: { krw: '0', usd: '0' },
    amountAfterCost: { krw: '0', usd: '0' },
    rate: '0',
    rateAfterCost: '0',
  },
  dailyProfitLoss: { amount: { krw: '0', usd: '0' }, rate: '0' },
  items: [],
};

export async function fetchAndCacheAccounts(db: Kysely<Database>): Promise<AccountSummary[]> {
  const response = await tossRequest<AccountsResponse>(db, API_GROUPS.ACCOUNT, TOSS_API_PATHS.ACCOUNTS);
  const accounts = response.result ?? [];

  for (const account of accounts) {
    await upsertAccount(db, { accountSeq: String(account.accountSeq), accountType: account.accountType });
  }

  return accounts;
}

export async function getHoldings(db: Kysely<Database>, accountSeq: string): Promise<HoldingsSummary> {
  const response = await tossRequest<HoldingsResponse>(db, API_GROUPS.ASSET, TOSS_API_PATHS.HOLDINGS, {
    accountSeq,
  });
  return response.result ?? EMPTY_HOLDINGS_SUMMARY;
}

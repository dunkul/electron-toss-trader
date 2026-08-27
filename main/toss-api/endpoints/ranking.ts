import type { Kysely } from 'kysely';
import type { Database, Market } from '../../db/schema';
import { getStockNames } from '../../db/repositories/stocks';
import { tossRequest } from '../http-client';
import { TOSS_API_PATHS } from '../paths';
import { API_GROUPS } from '../rate-limiter';

export type RankingType =
  | 'MARKET_TRADING_AMOUNT'
  | 'MARKET_TRADING_VOLUME'
  | 'TOP_GAINERS'
  | 'TOP_LOSERS'
  | 'TOSS_SECURITIES_TRADING_AMOUNT'
  | 'TOSS_SECURITIES_TRADING_VOLUME';

// 모든 기간은 거래일 기준. TOP_GAINERS/TOP_LOSERS는 realtime을 지원하지 않는다(400 unsupported-ranking-duration).
export type RankingDuration = 'realtime' | '1d' | '1w' | '1mo' | '3mo' | '6mo' | '1y';

export interface RankingPrice {
  lastPrice: string;
  basePrice: string;
  changeRate: string | null;
}

export interface RankingItem {
  rank: number;
  symbol: string;
  /** API 응답엔 없는 필드 — 로컬 stocks 캐시로 보강. 캐시에 없으면 null(symbol만 표시). */
  name: string | null;
  currency: string;
  price: RankingPrice;
  tradingVolume: string;
  tradingAmount: string;
}

export interface RankingResult {
  rankedAt: string | null;
  rankings: RankingItem[];
}

interface RankingApiResponse {
  result: {
    rankedAt: string | null;
    rankings: Omit<RankingItem, 'name'>[];
  };
}

export interface GetRankingsParams {
  type: RankingType;
  marketCountry: Market;
  duration: RankingDuration;
  excludeInvestmentCaution?: boolean;
  count?: number;
}

const EMPTY_RESULT: RankingResult = { rankedAt: null, rankings: [] };

export async function getRankings(db: Kysely<Database>, params: GetRankingsParams): Promise<RankingResult> {
  const response = await tossRequest<RankingApiResponse>(db, API_GROUPS.RANKING, TOSS_API_PATHS.RANKINGS, {
    query: {
      type: params.type,
      marketCountry: params.marketCountry,
      duration: params.duration,
      // false는 API 기본값과 같으므로 생략하고, true일 때만 명시적으로 보낸다(query는 boolean을 못 받는다).
      excludeInvestmentCaution: params.excludeInvestmentCaution ? 'true' : undefined,
      count: params.count,
    },
  });

  const result = response.result ?? EMPTY_RESULT;
  if (result.rankings.length === 0) return { rankedAt: result.rankedAt, rankings: [] };

  const names = await getStockNames(
    db,
    result.rankings.map((item) => item.symbol),
  );
  return {
    rankedAt: result.rankedAt,
    rankings: result.rankings.map((item) => ({ ...item, name: names[item.symbol] ?? null })),
  };
}

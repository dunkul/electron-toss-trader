import type { Kysely } from 'kysely';
import type { Database, TossExchange } from '../../db/schema';
import { tossRequest } from '../http-client';
import { TOSS_API_PATHS } from '../paths';
import { API_GROUPS } from '../rate-limiter';

export interface StockMasterItem {
  symbol: string;
  name: string;
  securityType: string;
  isCommonShare: boolean;
  isinCode: string;
}

interface StocksAllResponse {
  result: StockMasterItem[];
}

// 하루 배치로만 갱신되는 저변동 데이터라 API 문서가 1일 1회 조회 + 로컬 캐싱을 권장한다.
// (rate limit 그룹 STOCK_ALL: 1 TPS)
export async function getAllStocks(db: Kysely<Database>, market: TossExchange): Promise<StockMasterItem[]> {
  const response = await tossRequest<StocksAllResponse>(db, API_GROUPS.STOCK_ALL, TOSS_API_PATHS.STOCKS_ALL, {
    query: { market },
  });
  return response.result ?? [];
}

export interface InvestorTradingFigure {
  buyVolume: string;
  sellVolume: string;
  netBuyVolume: string;
}

// 개인/외국인/기타법인은 당일 잠정치 미제공일에 null, 기관은 buy/sell/net은 항상 있고 세부
// breakdown만 잠정치일 때 null이다. foreignerHolding/cfd 등 이 앱에서 쓰지 않는 필드는 타입에서
// 생략한다(구조적 타이핑이라 실제 응답엔 존재해도 무방).
export interface InvestorTradingRecord {
  date: string;
  updatedAt: string;
  individual: InvestorTradingFigure | null;
  foreigner: InvestorTradingFigure | null;
  institution: (InvestorTradingFigure & { breakdown: Record<string, InvestorTradingFigure> | null }) | null;
  otherCorporation: InvestorTradingFigure | null;
}

interface InvestorTradingResponse {
  result: { nextUntil: string | null; records: InvestorTradingRecord[] };
}

// 국내(KR) 종목만 지원한다(다른 시장은 400 unsupported-market). 거래대금(금액) 축은 API가
// 제공하지 않아 모든 수량은 거래량(주) 기준이다.
export async function getInvestorTrading(
  db: Kysely<Database>,
  symbol: string,
  params: { count?: number; until?: string } = {},
): Promise<InvestorTradingRecord[]> {
  const response = await tossRequest<InvestorTradingResponse>(
    db,
    API_GROUPS.STOCK_TRADING_TREND,
    TOSS_API_PATHS.STOCK_INVESTOR_TRADING(symbol),
    { query: { count: params.count, until: params.until } },
  );
  return response.result?.records ?? [];
}

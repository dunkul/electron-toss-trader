import type { Kysely } from 'kysely';
import type { Database } from '../../db/schema';
import { tossRequest } from '../http-client';
import { TOSS_API_PATHS } from '../paths';
import { API_GROUPS } from '../rate-limiter';

export interface ExchangeRate {
  baseCurrency: string;
  quoteCurrency: string;
  rate: string;
  midRate: string;
  // 등락률(%)을 100배한 값 — 예: "40" = 0.40%. rate/midRate로부터 이미 계산되어 온다.
  basisPoint: string;
  rateChangeType: 'UP' | 'DOWN' | 'FLAT';
  validFrom: string;
  validUntil: string;
}

interface ExchangeRateResponse {
  result: ExchangeRate;
}

// 1분 주기 갱신, 참고용 표시 환율(실제 주문 체결 환율과 다를 수 있음).
export async function getExchangeRate(
  db: Kysely<Database>,
  params: { baseCurrency: string; quoteCurrency: string; dateTime?: string },
): Promise<ExchangeRate> {
  const response = await tossRequest<ExchangeRateResponse>(
    db,
    API_GROUPS.MARKET_INFO,
    TOSS_API_PATHS.EXCHANGE_RATE,
    {
      query: {
        baseCurrency: params.baseCurrency,
        quoteCurrency: params.quoteCurrency,
        dateTime: params.dateTime,
      },
    },
  );
  return response.result;
}

export interface MarketSession {
  startTime: string;
  singlePriceAuctionStartTime: string;
  endTime: string;
}

export interface KrMarketDay {
  date: string;
  // 휴장일이면 null(장 운영 정보 없음).
  integrated: {
    preMarket: MarketSession;
    regularMarket: MarketSession;
    afterMarket: { startTime: string; singlePriceAuctionEndTime: string; endTime: string };
  } | null;
}

export interface KrMarketCalendar {
  today: KrMarketDay;
  previousBusinessDay: KrMarketDay;
  nextBusinessDay: KrMarketDay;
}

interface KrMarketCalendarResponse {
  result: KrMarketCalendar;
}

// KRX+NXT 통합 기준 국내 장 운영 시간(정규장 시작~종료 등). 대시보드 지수 카드의 "장중"/"장마감"
// 배지 판정에 쓴다.
export async function getKrMarketCalendar(db: Kysely<Database>, date?: string): Promise<KrMarketCalendar> {
  const response = await tossRequest<KrMarketCalendarResponse>(
    db,
    API_GROUPS.MARKET_INFO,
    TOSS_API_PATHS.MARKET_CALENDAR_KR,
    { query: { date } },
  );
  return response.result;
}

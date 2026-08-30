// tossRequest(db, group, ...) 호출부에서 그룹명을 문자열 리터럴로 반복 입력하지 않도록
// 하는 단일 출처. TOSS_API_PATHS/IPC_CHANNELS와 동일한 패턴.
export const API_GROUPS = {
  AUTH: 'AUTH',
  ACCOUNT: 'ACCOUNT',
  ASSET: 'ASSET',
  STOCK: 'STOCK',
  STOCK_ALL: 'STOCK_ALL',
  MARKET_DATA: 'MARKET_DATA',
  MARKET_DATA_CHART: 'MARKET_DATA_CHART',
  RANKING: 'RANKING',
  STOCK_TRADING_TREND: 'STOCK_TRADING_TREND',
  MARKET_INDICATOR_PRICE: 'MARKET_INDICATOR_PRICE',
  MARKET_INDICATOR_CHART: 'MARKET_INDICATOR_CHART',
  MARKET_INFO: 'MARKET_INFO',
  ORDER_INFO: 'ORDER_INFO',
  ORDER: 'ORDER',
  ORDER_HISTORY: 'ORDER_HISTORY',
} as const;

export type ApiGroup = (typeof API_GROUPS)[keyof typeof API_GROUPS];

// 1차 범위에서 실사용하는 그룹만 등록한다. 조건주문 계열(CONDITIONAL_ORDER,
// CONDITIONAL_ORDER_HISTORY)과 시장지표 투자자별 매매대금(bare MARKET_INDICATOR, 아직 엔드포인트
// 자체가 구현돼 있지 않음)은 아직 미사용이라 등록하지 않는다. ORDER_INFO(매수가능금액/매도가능
// 수량 등 조회 전용)는 호가창의 매매지원 화면(수량 %/최대 계산용)이 필요로 해서 예외적으로
// 먼저 등록했다.
//
// 값의 출처: 개발자 문서의 "Rate Limits" 표(그룹별 초당 요청 수) — 운영 상황에 따라 사전 공지
// 없이 조정될 수 있다고 문서에 명시돼 있으므로, 여기 값이 실제와 어긋나도 요청 자체는 실패하지
// 않는다 — http-client.ts가 429 응답을 Retry-After 기준 백오프로 재시도하므로 이 값은 어디까지나
// 클라이언트 쪽 선제적 페이싱용이다. ORDER/ORDER_INFO는 장 시작 직후(09:00~09:10 KST)에 문서상
// 더 낮은 피크 한도(ORDER_INFO는 초당 3회)가 별도로 있지만, 이 리미터는 시간대별 한도를 구분하지
// 않는다 — 그 구간에는 429가 더 자주 나고 백오프로 흡수될 뿐이다.
const RATE_LIMITS: Record<ApiGroup, number> = {
  [API_GROUPS.AUTH]: 5,
  [API_GROUPS.ACCOUNT]: 1,
  [API_GROUPS.ASSET]: 5,
  [API_GROUPS.STOCK]: 5,
  [API_GROUPS.STOCK_ALL]: 1,
  [API_GROUPS.MARKET_DATA]: 15,
  [API_GROUPS.MARKET_DATA_CHART]: 20,
  [API_GROUPS.RANKING]: 5,
  [API_GROUPS.STOCK_TRADING_TREND]: 10,
  [API_GROUPS.MARKET_INDICATOR_PRICE]: 10,
  [API_GROUPS.MARKET_INDICATOR_CHART]: 5,
  [API_GROUPS.MARKET_INFO]: 3,
  [API_GROUPS.ORDER_INFO]: 6,
  [API_GROUPS.ORDER]: 10,
  [API_GROUPS.ORDER_HISTORY]: 5,
};

interface Bucket {
  capacity: number;
  tokens: number;
  lastRefill: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class RateLimiter {
  private readonly buckets = new Map<ApiGroup, Bucket>();

  private getBucket(group: ApiGroup): Bucket {
    let bucket = this.buckets.get(group);
    if (!bucket) {
      const capacity = RATE_LIMITS[group];
      bucket = { capacity, tokens: capacity, lastRefill: Date.now() };
      this.buckets.set(group, bucket);
    }
    return bucket;
  }

  private refill(bucket: Bucket): void {
    const now = Date.now();
    const elapsedSec = (now - bucket.lastRefill) / 1000;
    if (elapsedSec <= 0) return;
    bucket.tokens = Math.min(bucket.capacity, bucket.tokens + elapsedSec * bucket.capacity);
    bucket.lastRefill = now;
  }

  async acquire(group: ApiGroup): Promise<void> {
    const bucket = this.getBucket(group);
    for (;;) {
      this.refill(bucket);
      if (bucket.tokens >= 1) {
        bucket.tokens -= 1;
        return;
      }
      const waitMs = ((1 - bucket.tokens) / bucket.capacity) * 1000;
      await sleep(Math.max(waitMs, 10));
    }
  }
}

export const rateLimiter = new RateLimiter();

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
  MARKET_INDICATOR: 'MARKET_INDICATOR',
  MARKET_INDICATOR_CHART: 'MARKET_INDICATOR_CHART',
  MARKET_INFO: 'MARKET_INFO',
} as const;

export type ApiGroup = (typeof API_GROUPS)[keyof typeof API_GROUPS];

// 1차 범위에서 실사용하는 그룹만 등록한다. 주문 계열(ORDER, ORDER_INFO, CONDITIONAL_ORDER)은
// 2차 개발 착수 시 추가한다.
const RATE_LIMITS: Record<ApiGroup, number> = {
  [API_GROUPS.AUTH]: 5,
  [API_GROUPS.ACCOUNT]: 1,
  [API_GROUPS.ASSET]: 5,
  [API_GROUPS.STOCK]: 5,
  [API_GROUPS.STOCK_ALL]: 1,
  [API_GROUPS.MARKET_DATA]: 15,
  [API_GROUPS.MARKET_DATA_CHART]: 20,
  // openapi.json 문서에 RANKING 그룹의 정확한 TPS가 명시돼 있지 않아, 무거운 집계 조회임을
  // 감안해 ACCOUNT보다는 여유롭고 STOCK_ALL보다는 빠듯한 값으로 보수적으로 잡는다.
  [API_GROUPS.RANKING]: 5,
  // 투자자별 매매동향 등 종목별 수급 동향 조회 그룹. 문서에 정확한 TPS가 없어 같은 Stock Info
  // 태그로 묶인 STOCK 그룹과 동일하게 보수적으로 잡는다.
  [API_GROUPS.STOCK_TRADING_TREND]: 5,
  // 지수/국채 현재가·환율·장 운영 캘린더. 문서에 정확한 TPS가 없어 대시보드 배너 수준의
  // 가벼운 조회로 보고 보수적으로 잡는다(캔들은 MARKET_DATA_CHART보다 낮춤).
  [API_GROUPS.MARKET_INDICATOR]: 5,
  [API_GROUPS.MARKET_INDICATOR_CHART]: 10,
  [API_GROUPS.MARKET_INFO]: 5,
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

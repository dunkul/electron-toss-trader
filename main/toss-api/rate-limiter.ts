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

import type { Kysely } from 'kysely';
import type { Database } from '../../db/schema';
import { tossRequest } from '../http-client';
import { TOSS_API_PATHS } from '../paths';
import { API_GROUPS } from '../rate-limiter';

// 주문 실행(POST /orders)이 아니라 매수가능금액/매도가능수량 조회 전용 엔드포인트만 다룬다.
// 호가창의 매매지원 화면에서 "10%/25%/50%/최대" 수량 버튼과 주문가능금액 표시에 쓴다.

export interface BuyingPower {
  currency: string;
  cashBuyingPower: string;
}

interface BuyingPowerResponse {
  result: BuyingPower;
}

export async function getBuyingPower(
  db: Kysely<Database>,
  accountSeq: string,
  currency: 'KRW' | 'USD',
): Promise<BuyingPower> {
  const response = await tossRequest<BuyingPowerResponse>(
    db,
    API_GROUPS.ORDER_INFO,
    TOSS_API_PATHS.BUYING_POWER,
    { accountSeq, query: { currency } },
  );
  return response.result ?? { currency, cashBuyingPower: '0' };
}

interface SellableQuantityResult {
  sellableQuantity: string;
}

interface SellableQuantityResponse {
  result: SellableQuantityResult;
}

export async function getSellableQuantity(
  db: Kysely<Database>,
  accountSeq: string,
  symbol: string,
): Promise<string> {
  const response = await tossRequest<SellableQuantityResponse>(
    db,
    API_GROUPS.ORDER_INFO,
    TOSS_API_PATHS.SELLABLE_QUANTITY,
    { accountSeq, query: { symbol } },
  );
  return response.result?.sellableQuantity ?? '0';
}

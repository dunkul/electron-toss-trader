import type { Kysely } from 'kysely';
import type { Database } from '../../db/schema';
import { TossApiError } from '../errors';
import { tossRequest } from '../http-client';
import { TOSS_API_PATHS } from '../paths';
import { API_GROUPS } from '../rate-limiter';

// 주문 생성/정정/취소(POST /orders, /orders/{id}/modify, /orders/{id}/cancel)를 다룬다.
// 조건주문은 아직 미구현. 이 앱의 매매지원 화면은 수량 지정 주문만 지원해(금액 지정 주문은
// US MARKET 전용이라 UI에 없음), quantity 기반 스키마(OrderCreateQuantityBased)만 구현한다.

export interface CreateOrderParams {
  symbol: string;
  side: 'BUY' | 'SELL';
  orderType: 'LIMIT' | 'MARKET';
  /** 주문 수량(주 단위, 정수). */
  quantity: string;
  /** LIMIT일 때만 필수 — MARKET은 전달하면 안 된다. */
  price?: string;
  /** 멱등성 키. 같은 값으로 재요청하면 이전 주문 결과를 그대로 재반환한다(10분간 유효). */
  clientOrderId?: string;
  /** 1억원 이상 주문 시 true 필요 — 미확인 상태로 보내면 confirm-high-value-required로 거부된다. */
  confirmHighValueOrder?: boolean;
}

export interface CreateOrderResult {
  orderId: string;
  clientOrderId?: string;
}

interface CreateOrderResponse {
  result: CreateOrderResult;
}

export type CreateOrderOutcome =
  | ({ ok: true } & CreateOrderResult)
  | { ok: false; code: string; message: string };

// 1억원 이상 주문 확인 같은 "사용자 재확인이 필요한" 실패는 예외가 아니라 결과값으로 돌려준다 —
// IPC 경계를 넘으면 Error의 커스텀 필드(code)가 보존되지 않아, 렌더러가 분기하려면 결과 자체에
// 담아 보내야 한다. 그 외 예상 밖 실패는 그대로 던져 호출부의 공통 에러 처리로 넘긴다.
export async function createOrder(
  db: Kysely<Database>,
  accountSeq: string,
  params: CreateOrderParams,
): Promise<CreateOrderOutcome> {
  try {
    const response = await tossRequest<CreateOrderResponse>(db, API_GROUPS.ORDER, TOSS_API_PATHS.ORDERS, {
      accountSeq,
      method: 'POST',
      body: params,
    });
    return { ok: true, ...response.result };
  } catch (err) {
    if (err instanceof TossApiError && err.code === 'confirm-high-value-required') {
      return { ok: false, code: err.code, message: err.message };
    }
    throw err;
  }
}

export interface OrderActionResult {
  /** 정정/취소로 새로 발급된 주문 식별자 — 원주문의 orderId와 다르다. */
  orderId: string;
}

interface OrderActionResponse {
  result: OrderActionResult;
}

export type OrderActionOutcome =
  | ({ ok: true } & OrderActionResult)
  | { ok: false; code: string; message: string };

export interface ModifyOrderParams {
  orderType: 'LIMIT' | 'MARKET';
  /** KR: 필수(정수). US: 전달 불가(전달 시 us-modify-quantity-not-supported로 거부). */
  quantity?: string;
  /** LIMIT일 때만 필수 — MARKET은 전달하면 안 된다. */
  price?: string;
  confirmHighValueOrder?: boolean;
}

export async function modifyOrder(
  db: Kysely<Database>,
  accountSeq: string,
  orderId: string,
  params: ModifyOrderParams,
): Promise<OrderActionOutcome> {
  try {
    const response = await tossRequest<OrderActionResponse>(
      db,
      API_GROUPS.ORDER,
      TOSS_API_PATHS.ORDER_MODIFY(orderId),
      { accountSeq, method: 'POST', body: params },
    );
    return { ok: true, ...response.result };
  } catch (err) {
    if (err instanceof TossApiError && err.code === 'confirm-high-value-required') {
      return { ok: false, code: err.code, message: err.message };
    }
    throw err;
  }
}

export async function cancelOrder(
  db: Kysely<Database>,
  accountSeq: string,
  orderId: string,
): Promise<OrderActionResult> {
  const response = await tossRequest<OrderActionResponse>(
    db,
    API_GROUPS.ORDER,
    TOSS_API_PATHS.ORDER_CANCEL(orderId),
    { accountSeq, method: 'POST' },
  );
  return response.result;
}

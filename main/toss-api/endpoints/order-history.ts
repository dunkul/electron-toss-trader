import type { Kysely } from 'kysely';
import type { Database } from '../../db/schema';
import { tossRequest } from '../http-client';
import { TOSS_API_PATHS } from '../paths';
import { API_GROUPS } from '../rate-limiter';

// GET /orders(주문 목록 조회)만 다룬다 — 매매지원 패널의 "대기"(status=OPEN)/"완료"
// (status=CLOSED) 탭에서 종목별 주문 목록을 보여주는 용도.

export interface OrderExecution {
  filledQuantity: string;
  averageFilledPrice: string | null;
  filledAmount: string | null;
  commission: string | null;
  tax: string | null;
  filledAt: string | null;
  settlementDate: string | null;
}

// status: PENDING | PENDING_CANCEL | PENDING_REPLACE | PARTIAL_FILLED | FILLED | CANCELED |
// REJECTED | CANCEL_REJECTED | REPLACE_REJECTED | REPLACED (unknown 값도 허용해야 해 string으로 받는다)
export interface OrderHistoryItem {
  orderId: string;
  symbol: string;
  side: string;
  orderType: string;
  timeInForce: string;
  status: string;
  price: string | null;
  quantity: string;
  orderAmount: string | null;
  currency: string;
  orderedAt: string;
  canceledAt: string | null;
  execution: OrderExecution;
}

export interface OrderHistoryPage {
  orders: OrderHistoryItem[];
  nextCursor: string | null;
  hasNext: boolean;
}

interface OrdersResponse {
  result: OrderHistoryPage;
}

export interface ListOrdersParams {
  status: 'OPEN' | 'CLOSED';
  symbol?: string;
  limit?: number;
  cursor?: string;
}

const EMPTY_ORDER_HISTORY_PAGE: OrderHistoryPage = { orders: [], nextCursor: null, hasNext: false };

export async function listOrders(
  db: Kysely<Database>,
  accountSeq: string,
  params: ListOrdersParams,
): Promise<OrderHistoryPage> {
  const response = await tossRequest<OrdersResponse>(db, API_GROUPS.ORDER_HISTORY, TOSS_API_PATHS.ORDERS, {
    accountSeq,
    query: {
      status: params.status,
      symbol: params.symbol,
      limit: params.limit,
      cursor: params.cursor,
    },
  });
  return response.result ?? EMPTY_ORDER_HISTORY_PAGE;
}

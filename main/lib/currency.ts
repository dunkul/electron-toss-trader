import type { Market } from '../db/schema';

// 전략의 market('KR'|'US')에 맞는 통화 단위로 가격을 표시한다 — 국내 전용으로 항상 "원"을
// 붙이면 해외(US) 전략의 알림/신호 사유 문구가 잘못된 단위로 표시된다.
export function formatPriceWithUnit(price: number, market: Market): string {
  return market === 'US' ? `$${price.toLocaleString()}` : `${price.toLocaleString()}원`;
}

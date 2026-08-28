import type { Market } from './ipc';

// 국내/해외 마켓 선택 옵션 — home.tsx(보유종목 탭), strategies.tsx(전략 생성 폼),
// RankingCard.tsx(랭킹 마켓 토글)에서 공통으로 쓴다.
export const MARKET_OPTIONS: { label: string; value: Market }[] = [
  { label: '국내', value: 'KR' },
  { label: '해외', value: 'US' },
];

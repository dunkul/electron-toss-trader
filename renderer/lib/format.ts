import { profitColors, profitFlashColors } from './theme';

// 원화는 소수점이 의미 없어 정수로 반올림하고, 그 외 통화(달러 등)는 등락폭이 1 미만인 경우가
// 흔해 소수점 둘째 자리까지 보여준다(안 그러면 "-0"처럼 정보가 사라져 보임).
export function formatAmount(value: string | number, currency: string): string {
  const amount = Number(value);
  if (currency === 'KRW') return Math.round(amount).toLocaleString();
  return amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatRate(rate: string | number): string {
  return `${(Number(rate) * 100).toFixed(2)}%`;
}

export function profitColor(value: number): string {
  if (value > 0) return profitColors.up;
  if (value < 0) return profitColors.down;
  return profitColors.neutral;
}

export function profitFlashColor(value: number): string {
  if (value > 0) return profitFlashColors.up;
  if (value < 0) return profitFlashColors.down;
  return profitFlashColors.neutral;
}

export function currencySymbol(currency: string): string {
  if (currency === 'KRW') return '₩';
  if (currency === 'USD') return '$';
  return currency;
}

/** 거래대금 등 큰 금액을 조/억(KRW) 또는 K/M/B(그 외 통화) 단위로 축약. */
export function formatCompactAmount(value: number, currency: string): string {
  if (currency === 'KRW') {
    const abs = Math.abs(value);
    if (abs >= 1_0000_0000_0000) return `${(value / 1_0000_0000_0000).toFixed(1)}조`;
    if (abs >= 1_0000_0000) return `${(value / 1_0000_0000).toFixed(1)}억`;
    if (abs >= 1_0000) return `${(value / 1_0000).toFixed(0)}만`;
    return value.toLocaleString();
  }
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

export function signalColor(signal: string): string {
  if (signal === 'BUY') return 'green';
  if (signal === 'SELL') return 'red';
  return 'default';
}

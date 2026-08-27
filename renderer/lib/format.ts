import { profitColors } from './theme';

export function formatAmount(value: string | number): string {
  return Math.round(Number(value)).toLocaleString();
}

export function formatRate(rate: string | number): string {
  return `${(Number(rate) * 100).toFixed(2)}%`;
}

export function profitColor(value: number): string {
  return value >= 0 ? profitColors.up : profitColors.down;
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

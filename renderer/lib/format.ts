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

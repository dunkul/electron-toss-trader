import PriceBlock from './PriceBlock';
import { formatAmount, formatRate, profitColor, profitFlashColor } from '../lib/format';
import type { PriceQuote } from '../lib/ipc';

interface QuotePriceBlockProps {
  quote: PriceQuote;
  // 전일종가 — 없으면(로딩 전/실패) 등락 없이 가격만 표시한다.
  referencePrice?: number;
  alignRight?: boolean;
  flash?: boolean;
  lineHeight?: number;
}

export default function QuotePriceBlock({
  quote,
  referencePrice,
  alignRight = false,
  flash = true,
  lineHeight,
}: QuotePriceBlockProps) {
  const lastPrice = Number(quote.lastPrice);
  const hasReference = referencePrice !== undefined && referencePrice !== 0;
  const change = hasReference ? lastPrice - referencePrice : undefined;
  const rate = hasReference ? change! / referencePrice : undefined;
  const color = change !== undefined ? profitColor(change) : undefined;
  const flashColor = flash && change !== undefined ? profitFlashColor(change) : undefined;

  return (
    <PriceBlock
      currency={quote.currency}
      main={lastPrice.toLocaleString()}
      secondary={
        change !== undefined && rate !== undefined
          ? `${formatAmount(change, quote.currency)}(${formatRate(rate)})`
          : undefined
      }
      color={color}
      align={alignRight ? 'right' : undefined}
      flashColor={flashColor}
      lineHeight={lineHeight}
    />
  );
}

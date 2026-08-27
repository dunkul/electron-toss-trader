import { useState } from 'react';

export default function StockLogo({ symbol, size = 28 }: { symbol: string; size?: number }) {
  const [failedSymbol, setFailedSymbol] = useState<string | null>(null);

  if (failedSymbol === symbol) return null;

  return (
    <img
      src={`https://static.toss.im/png-icons/securities/icn-sec-fill-${symbol}.png`}
      alt=""
      width={size}
      height={size}
      style={{ borderRadius: '50%', flexShrink: 0 }}
      onError={() => setFailedSymbol(symbol)}
    />
  );
}

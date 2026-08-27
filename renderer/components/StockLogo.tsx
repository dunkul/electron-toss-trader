import { useState } from 'react';

/** 토스 CDN에서 심볼로 불러오는 원형 종목 로고. 이미지가 없으면(404) 아무것도 렌더링하지 않는다. 주로 StockCell 내부에서 사용. */
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

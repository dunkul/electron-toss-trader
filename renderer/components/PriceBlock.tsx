import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Typography } from 'antd';
import { currencySymbol } from '../lib/format';

const { Text } = Typography;

interface PriceBlockProps {
  currency: string;
  main: string;
  secondary?: string;
  color?: string;
  align?: 'right';
  // 지정하면 main이 바뀔 때마다 이 색 배경이 반짝였다가 서서히 사라지는 이펙트를 준다
  // (관심종목 실시간 틱 표시용). 페이드 도중 다시 main이 바뀌면 처음부터 다시 반짝인다.
  flashColor?: string;
  // StockCell처럼 두 줄(가격/등락)의 줄간격 — 기본 브라우저 줄간격을 쓰면 StockCell(기본 1.3,
  // Card title에서는 보통 1.1)과 나란히 놓았을 때 세로 리듬이 안 맞아 보인다. 그런 컨텍스트에서
  // StockCell에 넘긴 값과 동일하게 맞춰서 넘긴다.
  lineHeight?: number;
}

/**
 * 색상이 적용된 가격 + 그 아래 작은 보조 텍스트(등락폭/등락률 등). home.tsx 현재가/평가손익 컬럼,
 * market.tsx 시세 표시에서 사용. main/secondary는 호출부에서 이미 포맷된 문자열이고(통화기호만 여기서 붙임),
 * color 역시 호출부가 profitColor 등으로 미리 계산해서 넘긴다.
 */
export default function PriceBlock({
  currency,
  main,
  secondary,
  color,
  align,
  flashColor,
  lineHeight,
}: PriceBlockProps) {
  const [flashKey, setFlashKey] = useState(0);
  const prevMainRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (flashColor && prevMainRef.current !== undefined && prevMainRef.current !== main) {
      setFlashKey((key) => key + 1);
    }
    prevMainRef.current = main;
  }, [main, flashColor]);

  return (
    <div style={{ textAlign: align === 'right' ? 'right' : undefined, lineHeight }}>
      <div
        // key를 바꿔 매번 새 DOM 노드로 렌더링해야, 이미 반짝이는 도중 다시 값이 바뀌어도
        // CSS 애니메이션이 처음부터 다시 시작된다(같은 노드에 클래스만 유지하면 재시작되지 않는다).
        key={flashKey}
        className={flashKey > 0 ? 'price-flash' : undefined}
        style={{ color, lineHeight, '--price-flash-color': flashColor } as CSSProperties}
      >
        {currencySymbol(currency)}
        {main}
      </div>
      {secondary && (
        <Text style={{ color, fontSize: 12, lineHeight, display: 'block' }}>{secondary}</Text>
      )}
    </div>
  );
}

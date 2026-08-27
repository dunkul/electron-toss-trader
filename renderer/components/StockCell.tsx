import { Typography } from 'antd';
import StockLogo from './StockLogo';

const { Text } = Typography;

/**
 * 로고+종목명+코드로 구성된 "종목" 셀. home.tsx 보유종목 표, market.tsx 관심종목/선택종목/차트
 * 타이틀에서 사용. market을 넘기면 코드 옆에 거래소를 함께 표시한다(예: KOSPI(024110)).
 */
export default function StockCell({
  name,
  symbol,
  market,
  lineHeight = 1.3,
}: {
  name: string;
  symbol: string;
  market?: string;
  /** 이름/코드 두 줄의 줄간격. Card title처럼 큰 폰트 컨텍스트에서 기본값이 넓어 보이면 줄여서 넘긴다. */
  lineHeight?: number;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
      <StockLogo symbol={symbol} />
      <div style={{ minWidth: 0, lineHeight }}>
        <div
          style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight }}
          title={name}
        >
          {name}
        </div>
        <Text type="secondary" style={{ fontSize: 12, lineHeight }}>
          {market ? `${market}(${symbol})` : `(${symbol})`}
        </Text>
      </div>
    </div>
  );
}

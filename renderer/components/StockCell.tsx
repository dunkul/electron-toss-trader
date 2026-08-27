import { Typography } from 'antd';
import StockLogo from './StockLogo';

const { Text } = Typography;

/** 로고+종목명+코드로 구성된 "종목" 셀. home.tsx 보유종목 표, market.tsx 관심종목/선택종목에서 사용. */
export default function StockCell({ name, symbol }: { name: string; symbol: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
      <StockLogo symbol={symbol} />
      <div style={{ minWidth: 0 }}>
        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={name}>
          {name}
        </div>
        <Text type="secondary" style={{ fontSize: 12 }}>
          ({symbol})
        </Text>
      </div>
    </div>
  );
}

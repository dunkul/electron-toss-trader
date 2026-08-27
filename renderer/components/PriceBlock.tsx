import { Typography } from 'antd';
import { currencySymbol } from '../lib/format';

const { Text } = Typography;

interface PriceBlockProps {
  currency: string;
  main: string;
  secondary?: string;
  color?: string;
  align?: 'right';
}

/**
 * 색상이 적용된 가격 + 그 아래 작은 보조 텍스트(등락폭/등락률 등). home.tsx 현재가/평가손익 컬럼,
 * market.tsx 시세 표시에서 사용. main/secondary는 호출부에서 이미 포맷된 문자열이고(통화기호만 여기서 붙임),
 * color 역시 호출부가 profitColor 등으로 미리 계산해서 넘긴다.
 */
export default function PriceBlock({ currency, main, secondary, color, align }: PriceBlockProps) {
  return (
    <div style={align === 'right' ? { textAlign: 'right' } : undefined}>
      <div style={{ color }}>
        {currencySymbol(currency)}
        {main}
      </div>
      {secondary && <Text style={{ color, fontSize: 12 }}>{secondary}</Text>}
    </div>
  );
}

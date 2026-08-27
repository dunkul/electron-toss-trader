import { forwardRef, useCallback, useEffect, useImperativeHandle, useState } from 'react';
import { Button, Card, Segmented, Select, Space, Table, Typography } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import StockCell from './StockCell';
import PriceBlock from './PriceBlock';
import { api } from '../lib/ipc';
import { formatCompactAmount, formatRate, profitColor } from '../lib/format';
import { TABLE_HEADER_HEIGHT_SM, useMeasuredHeight } from '../hooks/useMeasuredHeight';
import type { Market, RankingDuration, RankingItem, RankingType } from '../lib/ipc';

const { Text } = Typography;

const RANKING_TYPE_LABELS: Record<RankingType, string> = {
  MARKET_TRADING_AMOUNT: '거래대금 상위',
  MARKET_TRADING_VOLUME: '거래량 상위',
  TOP_GAINERS: '급상승',
  TOP_LOSERS: '급하락',
  TOSS_SECURITIES_TRADING_AMOUNT: '토스증권 거래대금 상위',
  TOSS_SECURITIES_TRADING_VOLUME: '토스증권 거래량 상위',
};

const DURATION_LABELS: Record<RankingDuration, string> = {
  realtime: '실시간',
  '1d': '1일',
  '1w': '1주',
  '1mo': '1개월',
  '3mo': '3개월',
  '6mo': '6개월',
  '1y': '1년',
};

// TOP_GAINERS/TOP_LOSERS는 realtime 기간을 지원하지 않는다(400 unsupported-ranking-duration).
const REALTIME_UNSUPPORTED: ReadonlySet<RankingType> = new Set(['TOP_GAINERS', 'TOP_LOSERS']);

const RANKING_TYPE_OPTIONS = (Object.entries(RANKING_TYPE_LABELS) as [RankingType, string][]).map(
  ([value, label]) => ({ value, label }),
);

export interface RankingCardHandle {
  refresh: () => void;
}

export interface RankingCardProps {
  /** 이 카드의 새로고침 버튼을 눌렀을 때 함께 실행할 콜백(예: 대시보드의 다른 카드 새로고침). */
  onRefresh?: () => void;
}

/** 대시보드용 주식 랭킹 카드. 시장/랭킹종류/기간을 고르면 상위 10개 종목을 보여준다. */
const RankingCard = forwardRef<RankingCardHandle, RankingCardProps>(function RankingCard({ onRefresh }, ref) {
  const [market, setMarket] = useState<Market>('KR');
  const [type, setType] = useState<RankingType>('MARKET_TRADING_AMOUNT');
  const [duration, setDuration] = useState<RankingDuration>('realtime');
  const [rankings, setRankings] = useState<RankingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [tableWrapRef, tableWrapHeight] = useMeasuredHeight<HTMLDivElement>();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.getRankings({ type, marketCountry: market, duration, count: 10 });
      setRankings(result.rankings);
    } catch {
      setRankings([]);
    } finally {
      setLoading(false);
    }
  }, [market, type, duration]);

  useEffect(() => {
    load();
  }, [load]);

  useImperativeHandle(ref, () => ({ refresh: load }), [load]);

  const handleRefreshClick = () => {
    load();
    onRefresh?.();
  };

  const handleTypeChange = (value: RankingType) => {
    setType(value);
    if (REALTIME_UNSUPPORTED.has(value) && duration === 'realtime') setDuration('1d');
  };

  const durationOptions = Object.entries(DURATION_LABELS)
    .filter(([value]) => !(REALTIME_UNSUPPORTED.has(type) && value === 'realtime'))
    .map(([value, label]) => ({ value, label }));

  const columns: ColumnsType<RankingItem> = [
    {
      title: '',
      dataIndex: 'rank',
      width: 40,
      align: 'center',
      render: (value: number) => <Text type="secondary">{value}</Text>,
    },
    {
      title: '종목',
      key: 'symbol',
      render: (_value, record) => <StockCell name={record.name ?? record.symbol} symbol={record.symbol} />,
    },
    {
      title: '현재가',
      key: 'price',
      align: 'right',
      width: 120,
      render: (_value, record) => {
        const changeRate = record.price.changeRate !== null ? Number(record.price.changeRate) : undefined;
        return (
          <PriceBlock
            currency={record.currency}
            main={Number(record.price.lastPrice).toLocaleString()}
            secondary={changeRate !== undefined ? formatRate(changeRate) : undefined}
            color={changeRate !== undefined ? profitColor(changeRate) : undefined}
            align="right"
          />
        );
      },
    },
    {
      title: '거래대금',
      dataIndex: 'tradingAmount',
      align: 'right',
      width: 90,
      render: (value: string, record) => (
        <Text type="secondary">{formatCompactAmount(Number(value), record.currency)}</Text>
      ),
    },
  ];

  return (
    <Card
      title="주식 랭킹"
      extra={
        <Space size={8}>
          <Button
            type="text"
            size="small"
            icon={<ReloadOutlined spin={loading} />}
            onClick={handleRefreshClick}
          />
        </Space>
      }
      style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
      styles={{
        body: { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
      }}
    >
      {/* antd Space는 자식마다 별도 .ant-space-item div로 한 번 더 감싸서, 그 안의 flex:1은
          진짜 flex 컨테이너의 직계 자식이 아니게 되어 먹히지 않는다(테이블 높이가 안 늘어나고
          제자리에서만 스크롤 박스가 눌려버려 행이 거의 안 보이는 버그로 나타남) — 높이가
          중요한 이 wrapper는 Space 대신 순수 flex div로 만든다. */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Space size={8} wrap style={{ flex: 'none' }}>
          <Segmented
            value={market}
            onChange={(value) => setMarket(value as Market)}
            options={[
              { label: '국내', value: 'KR' },
              { label: '해외', value: 'US' },
            ]}
          />
          <Select
            value={type}
            onChange={handleTypeChange}
            options={RANKING_TYPE_OPTIONS}
            style={{ width: 168 }}
          />
          <Select value={duration} onChange={setDuration} options={durationOptions} style={{ width: 84 }} />
        </Space>

        {/* 랭킹은 최대 10건이라 대부분은 안 넘치지만, 시세/차트의 관심종목 카드와 같은 방식으로
            남은 세로 공간만큼 잡아서(scroll.y) 창 높이에 맞춰 카드 자체 크기가 늘어나게 한다. */}
        <div ref={tableWrapRef} style={{ flex: 1, minHeight: 0 }}>
          <Table<RankingItem>
            size="small"
            rowKey="symbol"
            pagination={false}
            scroll={{ y: Math.max(tableWrapHeight - TABLE_HEADER_HEIGHT_SM, 0) }}
            dataSource={rankings}
            locale={{ emptyText: '집계된 랭킹이 없습니다.' }}
            columns={columns}
          />
        </div>
      </div>
    </Card>
  );
});

export default RankingCard;

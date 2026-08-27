import { useCallback, useEffect, useState } from 'react';
import { Button, Card, Segmented, Select, Space, Table, Typography } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import StockCell from './StockCell';
import PriceBlock from './PriceBlock';
import { api } from '../lib/ipc';
import { formatCompactAmount, formatRate, profitColor } from '../lib/format';
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

/** 대시보드용 주식 랭킹 카드. 시장/랭킹종류/기간을 고르면 상위 10개 종목을 보여준다. */
export default function RankingCard() {
  const [market, setMarket] = useState<Market>('KR');
  const [type, setType] = useState<RankingType>('MARKET_TRADING_AMOUNT');
  const [duration, setDuration] = useState<RankingDuration>('realtime');
  const [rankings, setRankings] = useState<RankingItem[]>([]);
  const [rankedAt, setRankedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.getRankings({ type, marketCountry: market, duration, count: 10 });
      setRankings(result.rankings);
      setRankedAt(result.rankedAt);
    } catch {
      setRankings([]);
      setRankedAt(null);
    } finally {
      setLoading(false);
    }
  }, [market, type, duration]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 조건(시장/종류/기간) 변경 시 재조회하는 표준 fetch 패턴
    load();
  }, [load]);

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
          {rankedAt && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              {new Date(rankedAt).toLocaleTimeString('ko-KR')} 기준
            </Text>
          )}
          <Button type="text" size="small" icon={<ReloadOutlined spin={loading} />} onClick={load} />
        </Space>
      }
    >
      <Space orientation="vertical" size={12} style={{ width: '100%' }}>
        <Space size={8} wrap>
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

        <Table<RankingItem>
          size="small"
          rowKey="symbol"
          loading={loading}
          pagination={false}
          dataSource={rankings}
          locale={{ emptyText: '집계된 랭킹이 없습니다.' }}
          columns={columns}
        />
      </Space>
    </Card>
  );
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { App, Card, Empty, Spin, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import StockCell from './StockCell';
import { api, CANDLE_INTERVALS } from '../lib/ipc';
import type { Candle, ChartWindowStock, InvestorTradingRecord } from '../lib/ipc';
import { formatAmount, formatCompactAmount, formatCompactNumber, formatRate, profitColor } from '../lib/format';
import { profitColors } from '../lib/theme';
import { TABLE_HEADER_HEIGHT_SM, useMeasuredHeight } from '../hooks/useMeasuredHeight';

const { Text } = Typography;

// 한 번에 보여줄 거래일 수. candles(최대 200)·investor-trading(최대 100) 둘 다 여유 있게 수용한다.
const DAILY_PRICE_COUNT = 60;

// 투자자별 매매동향 API는 국내(KR) 종목만 지원한다.
const KR_EXCHANGES = new Set(['KOSPI', 'KOSDAQ', 'KR_ETC']);

interface DailyPriceRow {
  date: string;
  closePrice: number;
  changeRate: number | null;
  tradingAmount: number;
  currency: string;
}

// getCandles는 최신순으로 내려온다(index 0 = 최신). API가 일별 거래대금을 따로 제공하지 않아
// 종가 x 거래량으로 근사한다(정확한 VWAP 기준 거래대금은 아니다).
function buildDailyRows(candles: Candle[]): DailyPriceRow[] {
  return candles.map((candle, index) => {
    const prevClose = candles[index + 1]?.closePrice;
    const closePrice = Number(candle.closePrice);
    const changeRate = prevClose ? (closePrice - Number(prevClose)) / Number(prevClose) : null;
    return {
      date: candle.timestamp.slice(0, 10),
      closePrice,
      changeRate,
      tradingAmount: closePrice * Number(candle.volume),
      currency: candle.currency,
    };
  });
}

// 개인/외국인/기관 순매수 거래량(주)을 가로 막대로 보여준다. 금액(원) 축은 API가 제공하지
// 않아 거래량 기준이다.
function InvestorTradingBars({ record, supported }: { record: InvestorTradingRecord | null; supported: boolean }) {
  if (!supported) {
    return (
      <Empty description="해외 종목은 투자자별 매매동향을 지원하지 않습니다." image={Empty.PRESENTED_IMAGE_SIMPLE} />
    );
  }

  const rows = [
    { label: '개인', figure: record?.individual ?? null },
    { label: '외국인', figure: record?.foreigner ?? null },
    { label: '기관', figure: record?.institution ?? null },
  ];
  const maxAbs = Math.max(1, ...rows.map((row) => Math.abs(row.figure ? Number(row.figure.netBuyVolume) : 0)));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {rows.map((row) => {
        const net = row.figure ? Number(row.figure.netBuyVolume) : null;
        return (
          <div key={row.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Text style={{ width: 44 }}>{row.label}</Text>
            <Text strong style={{ width: 78, textAlign: 'right', color: net === null ? undefined : profitColor(net) }}>
              {net === null ? '-' : `${net > 0 ? '+' : ''}${formatCompactNumber(net)}주`}
            </Text>
            <div style={{ flex: 1, height: 10, borderRadius: 5, background: '#f0f0f0', position: 'relative' }}>
              {net !== null && net !== 0 && (
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    bottom: 0,
                    [net >= 0 ? 'left' : 'right']: '50%',
                    width: `${(Math.abs(net) / maxAbs) * 50}%`,
                    background: net >= 0 ? profitColors.up : profitColors.down,
                    borderRadius: 5,
                  }}
                />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** 일별시세 팝업 창(daily-prices-window.tsx) 본문. 종목의 일자별 종가/등락률/거래대금 목록과,
 * 선택한 날짜의 투자자별(개인/외국인/기관) 순매수 거래량을 위에 함께 보여준다. */
export default function DailyPricesCard({ stock }: { stock: ChartWindowStock }) {
  const { message } = App.useApp();
  const [rows, setRows] = useState<DailyPriceRow[]>([]);
  const [investorByDate, setInvestorByDate] = useState<Map<string, InvestorTradingRecord>>(new Map());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tableWrapRef, tableWrapHeight] = useMeasuredHeight<HTMLDivElement>();

  const isKr = KR_EXCHANGES.has(stock.market);
  // 종목을 빠르게 여러 번 바꾸면(창이 재사용될 때) 먼저 보낸 요청이 나중에 도착할 수 있다 —
  // RankingCard.load와 같은 패턴으로, 이 호출이 최신 요청인지 확인해서 오래된 응답이 덮어쓰지
  // 않게 한다.
  const requestSeqRef = useRef(0);

  const load = useCallback(async () => {
    const seq = ++requestSeqRef.current;
    setLoading(true);
    try {
      const candlesPage = await api.getCandles({
        symbol: stock.symbol,
        interval: CANDLE_INTERVALS.ONE_DAY,
        count: DAILY_PRICE_COUNT,
      });
      const investorRecords = isKr ? await api.getInvestorTrading(stock.symbol, { count: DAILY_PRICE_COUNT }) : [];
      if (seq !== requestSeqRef.current) return;
      const dailyRows = buildDailyRows(candlesPage.candles);
      setRows(dailyRows);
      setInvestorByDate(new Map(investorRecords.map((record) => [record.date, record])));
      // 처음 열렸을 때는 가장 최근 날짜를 기본으로 보여준다.
      setSelectedDate(dailyRows[0]?.date ?? null);
    } catch {
      if (seq !== requestSeqRef.current) return;
      setRows([]);
      setSelectedDate(null);
      message.error('일별시세를 불러오지 못했습니다.');
    } finally {
      if (seq === requestSeqRef.current) setLoading(false);
    }
  }, [stock.symbol, isKr, message]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 종목이 바뀔 때마다 다시 불러온다(RankingCard.load와 동일 패턴)
    load();
  }, [load]);

  const selectedRecord = selectedDate ? (investorByDate.get(selectedDate) ?? null) : null;

  const columns: ColumnsType<DailyPriceRow> = [
    { title: '일자', dataIndex: 'date', width: 96 },
    {
      title: '종가',
      key: 'close',
      align: 'right',
      render: (_value, row) => formatAmount(row.closePrice, row.currency),
    },
    {
      title: '등락률',
      key: 'changeRate',
      align: 'right',
      render: (_value, row) =>
        row.changeRate === null ? (
          '-'
        ) : (
          <Text style={{ color: profitColor(row.changeRate) }}>
            {row.changeRate > 0 ? '+' : ''}
            {formatRate(row.changeRate)}
          </Text>
        ),
    },
    {
      title: '거래대금',
      key: 'tradingAmount',
      align: 'right',
      render: (_value, row) => formatCompactAmount(row.tradingAmount, row.currency),
    },
  ];

  return (
    <Card
      title={<StockCell name={stock.name} symbol={stock.symbol} market={stock.market} lineHeight={1.1} />}
      style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
      styles={{
        body: {
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          overflow: 'hidden',
          position: 'relative',
        },
      }}
    >
      <div>
        <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
          {selectedDate ? `${selectedDate} 거래주체 순매수` : '거래주체 순매수'}
        </Text>
        <InvestorTradingBars record={selectedRecord} supported={isKr} />
      </div>

      {/* tableWrapRef는 항상 마운트해둔다 — useMeasuredHeight의 ResizeObserver는 마운트 시
          한 번만 붙는데, loading일 때 이 div를 통째로 안 그리면 그 시점엔 ref가 비어 있어
          옵저버가 붙지 못하고, 이후 로딩이 끝나 다시 그려져도(같은 ref, effect는 재실행 안 됨)
          영영 붙지 않아 scroll.y가 0에 고정되면서 행이 하나도 안 보이는 버그가 생긴다. */}
      <div ref={tableWrapRef} style={{ flex: 1, minHeight: 0 }}>
        <Table<DailyPriceRow>
          size="small"
          rowKey="date"
          pagination={false}
          dataSource={rows}
          columns={columns}
          scroll={{ y: Math.max(tableWrapHeight - TABLE_HEADER_HEIGHT_SM, 0) }}
          locale={{ emptyText: '일별시세가 없습니다.' }}
          onRow={(row) => ({
            onClick: () => setSelectedDate(row.date),
            style: { cursor: 'pointer', background: row.date === selectedDate ? '#fff7e6' : undefined },
          })}
        />
      </div>

      {loading && (
        // 콘텐츠를 언마운트하는 대신 위에 그대로 덮어서(항상 마운트 유지) 로딩 중엔 빈/이전
        // 데이터가 잠깐 보이지 않게 하면서도 레이아웃 크기는 전혀 안 바뀌게 한다.
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Spin size="large" />
        </div>
      )}
    </Card>
  );
}

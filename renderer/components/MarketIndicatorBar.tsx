import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Skeleton, Typography } from 'antd';
import { api, CANDLE_INTERVALS } from '../lib/ipc';
import type { KrMarketCalendar, MarketIndicatorSymbol } from '../lib/ipc';
import { formatRate, profitColor } from '../lib/format';

const { Text } = Typography;

// profitColors(up/down)를 옅게 탄 배경 — 등락 텍스트 뒤 필(pill) 배경용. profitFlashColors는
// 틱 반짝임용이라 알파가 너무 강해서(0.28) 여기서는 따로 낮은 알파로 정의한다.
const CHANGE_PILL_BG = { up: 'rgba(207, 19, 34, 0.08)', down: 'rgba(23, 101, 173, 0.08)' };
const LIVE_DOT_COLOR = '#52c41a';
const CLOSED_DOT_COLOR = '#bfbfbf';
const CARD_WIDTH = 260;
const REFRESH_INTERVAL_MS = 60_000;
const SPARKLINE_CANDLE_COUNT = 60;

export interface MarketIndicatorBarHandle {
  refresh: () => void;
}

interface IndexCardData {
  key: string;
  label: string;
  isLive: boolean;
  value: number | null;
  changeAmount: number | null;
  changeRate: number | null;
  /** 시계열이 없으면(환율) null — 스파크라인을 그리지 않는다. */
  points: number[] | null;
}

function isKrRegularMarketOpen(calendar: KrMarketCalendar | null): boolean {
  const session = calendar?.today.integrated?.regularMarket;
  if (!session) return false;
  const now = Date.now();
  return now >= new Date(session.startTime).getTime() && now <= new Date(session.endTime).getTime();
}

async function loadIndexCard(
  symbol: MarketIndicatorSymbol,
  label: string,
  isLive: boolean,
): Promise<IndexCardData> {
  const base = { key: symbol, label, isLive };
  try {
    const [prices, refPage, sparkPage] = await Promise.all([
      api.getMarketIndicatorPrices([symbol]),
      api.getMarketIndicatorCandles({ symbol, interval: CANDLE_INTERVALS.ONE_DAY, count: 2 }),
      api.getMarketIndicatorCandles({
        symbol,
        interval: CANDLE_INTERVALS.ONE_MINUTE,
        count: SPARKLINE_CANDLE_COUNT,
      }),
    ]);
    const last = prices[0] ? Number(prices[0].lastPrice) : null;
    // candles는 최신순으로 온다 — index 1이 전일 종가(전일 대비 등락 계산의 기준가).
    const ref = refPage.candles[1] ? Number(refPage.candles[1].closePrice) : null;
    const changeAmount = last !== null && ref !== null ? last - ref : null;
    const changeRate = changeAmount !== null && ref ? changeAmount / ref : null;
    const points =
      sparkPage.candles.length >= 2 ? sparkPage.candles.map((c) => Number(c.closePrice)).reverse() : null;
    return { ...base, value: last, changeAmount, changeRate, points };
  } catch {
    return { ...base, value: null, changeAmount: null, changeRate: null, points: null };
  }
}

async function loadUsdCard(): Promise<IndexCardData> {
  // 환율은 과거 시계열(캔들) API가 없어 스파크라인은 그릴 수 없다 — midRate를 기준가 삼아
  // 등락만 계산한다. basisPoint는 이미 (rate-midRate)/midRate를 만 분율(1bp=0.01%)로 준다.
  const base = { key: 'USD', label: '미국 USD', isLive: true, points: null as number[] | null };
  try {
    const rate = await api.getExchangeRate({ baseCurrency: 'USD', quoteCurrency: 'KRW' });
    const last = Number(rate.rate);
    const changeAmount = last - Number(rate.midRate);
    const changeRate = Number(rate.basisPoint) / 10000;
    return { ...base, value: last, changeAmount, changeRate };
  } catch {
    return { ...base, value: null, changeAmount: null, changeRate: null };
  }
}

function Sparkline({ points, color }: { points: number[]; color: string }) {
  const width = 72;
  const height = 32;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const stepX = width / (points.length - 1);
  const coords = points.map((p, i) => [i * stepX, height - ((p - min) / range) * height] as const);
  const linePath = coords
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(' ');
  const areaPath = `${linePath} L${width},${height} L0,${height} Z`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ flexShrink: 0 }}>
      <path d={areaPath} fill={color} fillOpacity={0.12} />
      <path d={linePath} fill="none" stroke={color} strokeWidth={1.5} />
    </svg>
  );
}

const CARD_CONTAINER_STYLE = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  width: CARD_WIDTH,
  flex: '0 0 auto',
  padding: '12px 16px',
  background: '#fff',
  border: '1px solid #e8e8e8',
  borderRadius: 12,
  boxShadow: '0 1px 2px rgba(16, 24, 40, 0.04), 0 1px 8px rgba(16, 24, 40, 0.04)',
} as const;

function IndexCard({ data }: { data: IndexCardData }) {
  const color = profitColor(data.changeAmount ?? 0);
  const pillBg =
    data.changeAmount === null ? undefined : data.changeAmount >= 0 ? CHANGE_PILL_BG.up : CHANGE_PILL_BG.down;

  return (
    <div style={CARD_CONTAINER_STYLE}>
      {/* 카드 전체 너비를 쓰는 행 — 상태 배지를 스파크라인 옆이 아니라 카드의 진짜 오른쪽
          가장자리에 붙인다(아래 값/스파크라인 행과는 별개 행이라야 가운데로 밀리지 않는다). */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 12,
          fontWeight: 600,
          color: '#595959',
        }}
      >
        <span>{data.label}</span>
        <span
          style={{
            marginLeft: 'auto',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 11,
            fontWeight: 400,
            color: '#8c8c8c',
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: data.isLive ? LIVE_DOT_COLOR : CLOSED_DOT_COLOR,
            }}
          />
          {data.isLive ? '실시간' : '장마감'}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {data.value === null ? (
            <Text type="secondary">-</Text>
          ) : (
            <>
              <div
                style={{
                  fontSize: 21,
                  fontWeight: 700,
                  lineHeight: 1.25,
                  letterSpacing: -0.3,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {data.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              {data.changeAmount !== null && data.changeRate !== null && (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    marginTop: 4,
                    padding: '1px 6px',
                    borderRadius: 4,
                    background: pillBg,
                    fontSize: 12,
                    fontWeight: 600,
                    color,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {data.changeAmount >= 0 ? '▲' : '▼'}{' '}
                  {Math.abs(data.changeAmount).toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}{' '}
                  ({data.changeRate >= 0 ? '+' : ''}
                  {formatRate(data.changeRate)})
                </span>
              )}
            </>
          )}
        </div>
        {data.points && data.points.length >= 2 && <Sparkline points={data.points} color={color} />}
      </div>
    </div>
  );
}

/** 대시보드 최상단 배너 — 코스피/코스닥/원-달러 환율. 토스증권 Open API의 Market Indicators
 * 그룹은 이 두 지수(+국채 6종)만 지원하고 미국 3대 지수(S&P 500·나스닥·다우존스)는 지원하지
 * 않아 넣지 않는다. */
const MarketIndicatorBar = forwardRef<MarketIndicatorBarHandle>(function MarketIndicatorBar(_props, ref) {
  const [cards, setCards] = useState<IndexCardData[]>([]);
  const requestSeqRef = useRef(0);

  const load = useCallback(async () => {
    const seq = ++requestSeqRef.current;
    const calendar = await api.getKrMarketCalendar().catch(() => null);
    if (seq !== requestSeqRef.current) return;
    const isLive = isKrRegularMarketOpen(calendar);

    const [kospi, kosdaq, usd] = await Promise.all([
      loadIndexCard('KOSPI', '코스피', isLive),
      loadIndexCard('KOSDAQ', '코스닥', isLive),
      loadUsdCard(),
    ]);
    if (seq !== requestSeqRef.current) return;
    setCards([kospi, kosdaq, usd]);
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [load]);

  useImperativeHandle(ref, () => ({ refresh: load }), [load]);

  return (
    <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 2 }}>
      {cards.length === 0
        ? Array.from({ length: 3 }, (_, i) => (
            <div key={i} style={CARD_CONTAINER_STYLE}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <Skeleton active title={{ width: '60%' }} paragraph={{ rows: 1, width: '80%' }} />
              </div>
            </div>
          ))
        : cards.map((data) => <IndexCard key={data.key} data={data} />)}
    </div>
  );
});

export default MarketIndicatorBar;

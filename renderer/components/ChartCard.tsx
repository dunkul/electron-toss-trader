import { useCallback, useEffect, useRef, useState } from 'react';
import { App, Card, Segmented, Space, Spin, Typography } from 'antd';
import {
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  createChart,
  type BarPrice,
  type CandlestickData,
  type HistogramData,
  type IChartApi,
  type ISeriesApi,
  type LogicalRange,
  type MouseEventParams,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts';
import StockCell from './StockCell';
import QuotePriceBlock from './QuotePriceBlock';
import { computeSMA, toChartTime, type ChartPoint } from '../lib/chart-indicators';
import { KRW, formatAmount, profitColor } from '../lib/format';
import { profitColors } from '../lib/theme';
import { fetchReferencePrices } from '../lib/market-data';
import { useMarketSubscription } from '../hooks/useMarketSubscription';
import { api, onMarketTick } from '../lib/ipc';
import type { Candle, CandleInterval, PriceQuote } from '../lib/ipc';
import type { SelectedStock } from '../store/useSelectedStockStore';

const CANDLE_PAGE_SIZE = 200; // Toss API의 /candles는 한 번 요청에 최대 200개까지만 허용한다.

const MA_PERIODS = [5, 20, 60, 120] as const;
const MA_COLORS: Record<(typeof MA_PERIODS)[number], string> = {
  5: '#2e7d32', // 녹색
  20: '#f2994a', // 주황
  60: '#c0392b', // 적갈색
  120: '#8e44ad', // 보라
};

const VOLUME_MA_PERIOD = 20;
const VOLUME_MA_COLOR = '#2f80ed';

const { Text } = Typography;

interface LegendOhlc {
  time: UTCTimestamp;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface ChartCardProps {
  stock: SelectedStock;
}

// 재사용 가능한 시세/차트 카드 — 캔들+거래량+이동평균선+OHLC 레전드+일봉/1분봉 토글을 전부
// 포함한다. 종목(symbol/market)만 prop으로 받고 관심종목/보유종목 등 이 페이지 특유의 상태는
// 전혀 모른다 — 다른 페이지에서도 <ChartCard stock={...} />로 그대로 가져다 쓸 수 있게 하기
// 위함이다. 실시간 구독은 useMarketSubscription으로 스스로 선언한다.
export default function ChartCard({ stock }: ChartCardProps) {
  const { message } = App.useApp();

  const [price, setPrice] = useState<PriceQuote | null>(null);
  const [referencePrice, setReferencePrice] = useState<number | undefined>(undefined);
  const [loadingChart, setLoadingChart] = useState(false);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [candleInterval, setCandleInterval] = useState<CandleInterval>('1d');
  const [visibleMaPeriods, setVisibleMaPeriods] = useState<Set<number>>(new Set(MA_PERIODS));
  const [hoveredOhlc, setHoveredOhlc] = useState<LegendOhlc | null>(null);
  const [liveTodayOhlc, setLiveTodayOhlc] = useState<LegendOhlc | null>(null);

  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const volumeMaSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const maSeriesRefs = useRef<Record<number, ISeriesApi<'Line'>>>({});
  const chartApiRef = useRef<IChartApi | null>(null);
  const activeSymbolRef = useRef<string | null>(null);
  // 실시간 틱 리스너는 마운트 시 한 번만 등록되므로, 현재 종목/봉 단위는 이 ref들로 참조한다.
  const stockSymbolRef = useRef(stock.symbol);
  const candleIntervalRef = useRef<CandleInterval>('1d');
  // 차트에는 안 쓰이는 화면 상태가 아니라 렌더링용 원본 데이터라 ref로 보관한다(최신순/내림차순 그대로).
  // 과거 페이지를 이어붙일 때도 그냥 뒤에 concat하면 되고, 차트에 넣기 직전에만 오름차순으로 뒤집는다.
  const candlesRef = useRef<Candle[]>([]);
  const loadingMoreRef = useRef(false);
  // 차트 생성 effect는 마운트 시 한 번만 실행되므로, 그 안의 스크롤 구독 콜백은 handleLoadMore의
  // 최신 버전을 이 ref를 통해 참조해야 한다(그렇지 않으면 최초 렌더 시점의 stale 클로저를 계속 쓰게 된다).
  const handleLoadMoreRef = useRef<() => void>(() => {});

  useMarketSubscription([{ symbol: stock.symbol, market: stock.market }]);

  useEffect(() => {
    stockSymbolRef.current = stock.symbol;
  }, [stock.symbol]);

  useEffect(() => {
    candleIntervalRef.current = candleInterval;
  }, [candleInterval]);

  useEffect(() => {
    return onMarketTick((tick) => {
      if (stockSymbolRef.current !== tick.symbol) return;
      setPrice({
        symbol: tick.symbol,
        lastPrice: tick.lastPrice,
        currency: tick.currency,
        timestamp: tick.timestamp,
      });

      const currentCandle = candlesRef.current[0];
      if (!currentCandle) return;
      const lastPrice = Number(tick.lastPrice);
      // 1분봉일 때는 틱 시각이 맨 앞 봉의 분(minute)을 벗어나면 새 봉을 하나 추가한다
      // (일봉은 "오늘 봉"이 세션 내내 하나로 유지된다고 보고 계속 그 봉만 갱신한다).
      const isNewMinuteBar =
        candleIntervalRef.current === '1m' &&
        Math.floor(new Date(tick.timestamp).getTime() / 60000) !==
          Math.floor(new Date(currentCandle.timestamp).getTime() / 60000);

      let candle: Candle;
      if (isNewMinuteBar) {
        const barStartMs = Math.floor(new Date(tick.timestamp).getTime() / 60000) * 60000;
        candle = {
          timestamp: new Date(barStartMs).toISOString(),
          openPrice: tick.lastPrice,
          highPrice: tick.lastPrice,
          lowPrice: tick.lastPrice,
          closePrice: tick.lastPrice,
          volume: tick.volume,
          currency: tick.currency,
        };
        candlesRef.current = [candle, ...candlesRef.current];
      } else {
        candle = currentCandle;
        if (lastPrice > Number(candle.highPrice)) candle.highPrice = tick.lastPrice;
        if (lastPrice < Number(candle.lowPrice)) candle.lowPrice = tick.lastPrice;
        candle.closePrice = tick.lastPrice;
        // tick.volume은 이 flush 주기 동안의 체결량 합(register.ts가 합산해서 보냄) —
        // 누적 거래량이 아니라 "그만큼 늘었다"이므로 기존 값에 더한다.
        candle.volume = String(Number(candle.volume) + Number(tick.volume));
      }

      const barTime = toChartTime(candle.timestamp);
      seriesRef.current?.update({
        time: barTime,
        open: Number(candle.openPrice),
        high: Number(candle.highPrice),
        low: Number(candle.lowPrice),
        close: Number(candle.closePrice),
      });
      volumeSeriesRef.current?.update({
        time: barTime,
        value: Number(candle.volume),
        color: profitColor(Number(candle.closePrice) - Number(candle.openPrice)),
      });
      setLiveTodayOhlc({
        time: barTime,
        open: Number(candle.openPrice),
        high: Number(candle.highPrice),
        low: Number(candle.lowPrice),
        close: Number(candle.closePrice),
        volume: Number(candle.volume),
      });
      MA_PERIODS.forEach((period) => {
        if (candlesRef.current.length < period) return; // 로드된 봉이 기간보다 적으면 스킵
        const sum = candlesRef.current.slice(0, period).reduce((acc, c) => acc + Number(c.closePrice), 0);
        maSeriesRefs.current[period]?.update({ time: barTime, value: sum / period });
      });
      if (candlesRef.current.length >= VOLUME_MA_PERIOD) {
        const volumeSum = candlesRef.current
          .slice(0, VOLUME_MA_PERIOD)
          .reduce((acc, c) => acc + Number(c.volume), 0);
        volumeMaSeriesRef.current?.update({ time: barTime, value: volumeSum / VOLUME_MA_PERIOD });
      }
    });
  }, []);

  useEffect(() => {
    const container = chartContainerRef.current;
    if (!container) return;

    const chart = createChart(container, {
      height: 460,
      layout: { textColor: '#333' },
      grid: { vertLines: { color: '#f0f0f0' }, horzLines: { color: '#f0f0f0' } },
      // 기본 dateFormat('dd MMM \'yy')이 브라우저 로케일과 섞이면 "14 7월 26"처럼 순서가
      // 뒤죽박죽으로 보인다 — 크로스헤어 하단 날짜 라벨을 한국식(연-월-일) 순서로 고정한다.
      localization: { locale: 'ko-KR', dateFormat: 'yyyy년 MM월 dd일' },
    });
    // lightweight-charts 기본값은 상승=녹색/하락=빨강(서구권 관례)이라, 국내 증시 관례(상승=빨강/
    // 하락=파랑)를 쓰는 앱 전역 profitColors와 맞춰 명시적으로 지정한다.
    const series = chart.addSeries(CandlestickSeries, {
      upColor: profitColors.up,
      downColor: profitColors.down,
      borderUpColor: profitColors.up,
      borderDownColor: profitColors.down,
      wickUpColor: profitColors.up,
      wickDownColor: profitColors.down,
    });
    chartApiRef.current = chart;
    seriesRef.current = series;

    // 거래량 — 캔들과 같은 시간축을 쓰는 아래쪽 별도 패인(paneIndex 1)에 그린다. 가격 패인과
    // 4:1 비율로 나눠 토스증권 차트의 "거래량" 서브패널과 비슷한 높이가 되게 한다.
    const volumeSeries = chart.addSeries(
      HistogramSeries,
      { priceFormat: { type: 'volume' }, priceScaleId: 'volume' },
      1,
    );
    volumeSeriesRef.current = volumeSeries;

    // 거래량 이동평균선(20) — 거래량과 같은 패인(paneIndex 1)에 겹쳐 그린다. 가격 MA와 달리
    // 켜기/끄기 토글 없이 항상 표시한다.
    volumeMaSeriesRef.current = chart.addSeries(
      LineSeries,
      {
        color: VOLUME_MA_COLOR,
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      },
      1,
    );

    chart.panes()[0]?.setStretchFactor(4);
    chart.panes()[1]?.setStretchFactor(1);

    // 이동평균선 — 캔들과 같은 메인 패인(paneIndex 생략)에 겹쳐 그린다.
    MA_PERIODS.forEach((period) => {
      maSeriesRefs.current[period] = chart.addSeries(LineSeries, {
        color: MA_COLORS[period],
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false, // 우측 축에 MA 마지막 값 라벨은 안 띄움(가격 라벨과 겹쳐 지저분해짐)
        crosshairMarkerVisible: false,
      });
    });

    // 컨테이너 폭이 바뀔 때마다(창 리사이즈뿐 아니라, 이 카드를 나중에 숨겨진 탭/모달 등에
    // 넣었다가 다시 보여주는 경우에도) 자동으로 맞춘다.
    const resizeObserver = new ResizeObserver(() => {
      chart.applyOptions({ width: container.clientWidth });
    });
    resizeObserver.observe(container);

    // 차트를 왼쪽(과거 방향)으로 드래그해서 로딩된 데이터의 시작 지점 근처까지 가면
    // 자동으로 이전 페이지를 이어붙인다(무한 스크롤). 10봉 여유를 두고 미리 불러온다.
    const handleVisibleLogicalRangeChange = (range: LogicalRange | null) => {
      if (range && range.from < 10) {
        handleLoadMoreRef.current();
      }
    };
    chart.timeScale().subscribeVisibleLogicalRangeChange(handleVisibleLogicalRangeChange);

    // 마우스가 캔들 위에 있는 동안 그 시점의 OHLC+거래량을 상단 레전드에 보여준다.
    const handleCrosshairMove = (param: MouseEventParams<Time>) => {
      if (!param.time || !seriesRef.current) {
        setHoveredOhlc(null);
        return;
      }
      const bar = param.seriesData.get(seriesRef.current) as CandlestickData<Time> | undefined;
      if (!bar) {
        setHoveredOhlc(null);
        return;
      }
      const volumeBar = volumeSeriesRef.current
        ? (param.seriesData.get(volumeSeriesRef.current) as HistogramData<Time> | undefined)
        : undefined;
      setHoveredOhlc({
        time: param.time as UTCTimestamp,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: volumeBar?.value ?? 0,
      });
    };
    chart.subscribeCrosshairMove(handleCrosshairMove);

    return () => {
      resizeObserver.disconnect();
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(handleVisibleLogicalRangeChange);
      chart.unsubscribeCrosshairMove(handleCrosshairMove);
      chart.remove();
    };
  }, []);

  // candlesDesc: API가 내려주는 그대로(최신순) 캔들 목록. 차트에 넣기 직전에만 뒤집는다.
  const renderChart = useCallback((candlesDesc: Candle[]) => {
    const ascendingCandles = [...candlesDesc].reverse();
    // 국내(KRW)는 소수점 단위 거래가 없어 정수로, 그 외 통화는 기존처럼 센트 단위(소수점 둘째
    // 자리)까지 표시한다. lightweight-charts 내장 'price' 포맷은 천 단위 콤마를 안 찍어주므로
    // formatAmount(다른 화면의 가격 표시와 동일 규칙)로 커스텀 포맷터를 직접 지정한다.
    const chartCurrency = ascendingCandles[0]?.currency ?? KRW;
    seriesRef.current?.applyOptions({
      priceFormat: {
        type: 'custom',
        formatter: (price: BarPrice) => formatAmount(price, chartCurrency),
        minMove: chartCurrency === KRW ? 1 : 0.01,
      },
    });
    seriesRef.current?.setData(
      ascendingCandles.map((candle) => ({
        time: toChartTime(candle.timestamp),
        open: Number(candle.openPrice),
        high: Number(candle.highPrice),
        low: Number(candle.lowPrice),
        close: Number(candle.closePrice),
      })),
    );
    volumeSeriesRef.current?.setData(
      ascendingCandles.map((candle) => ({
        time: toChartTime(candle.timestamp),
        value: Number(candle.volume),
        color: profitColor(Number(candle.closePrice) - Number(candle.openPrice)),
      })),
    );

    const closePoints: ChartPoint[] = ascendingCandles.map((candle) => ({
      time: toChartTime(candle.timestamp),
      value: Number(candle.closePrice),
    }));
    MA_PERIODS.forEach((period) => {
      maSeriesRefs.current[period]?.setData(computeSMA(closePoints, period));
    });

    const volumePoints: ChartPoint[] = ascendingCandles.map((candle) => ({
      time: toChartTime(candle.timestamp),
      value: Number(candle.volume),
    }));
    volumeMaSeriesRef.current?.setData(computeSMA(volumePoints, VOLUME_MA_PERIOD));

    const lastCandle = ascendingCandles[ascendingCandles.length - 1];
    setLiveTodayOhlc(
      lastCandle
        ? {
            time: toChartTime(lastCandle.timestamp),
            open: Number(lastCandle.openPrice),
            high: Number(lastCandle.highPrice),
            low: Number(lastCandle.lowPrice),
            close: Number(lastCandle.closePrice),
            volume: Number(lastCandle.volume),
          }
        : null,
    );
  }, []);

  const loadCandles = useCallback(
    async (symbol: string, interval: CandleInterval) => {
      setLoadingChart(true);
      try {
        const page = await api.getCandles({ symbol, interval, count: CANDLE_PAGE_SIZE });
        if (activeSymbolRef.current !== symbol) return;
        candlesRef.current = page.candles;
        setNextBefore(page.nextBefore);
        renderChart(page.candles);
      } catch {
        message.error('차트 정보를 불러오지 못했습니다.');
      } finally {
        setLoadingChart(false);
      }
    },
    [message, renderChart],
  );

  // 종목이 바뀔 때마다(최초 진입 포함) 시세/전일종가/캔들을 새로 불러온다. candleInterval은
  // state가 아니라 ref로 읽어서, 봉 단위 토글(handleIntervalChange)과 별개로 이 effect가
  // 인터벌 변경 때마다 또 도는 일이 없게 한다.
  useEffect(() => {
    activeSymbolRef.current = stock.symbol;
    api
      .getPrices([stock.symbol])
      .then((prices) => setPrice(prices[0] ?? null))
      .catch(() => setPrice(null));
    fetchReferencePrices([stock.symbol]).then((refs) => setReferencePrice(refs[stock.symbol]));
    // 종목이 바뀌는 순간 이전 종목의 커서를 들고 있으면, 그 사이 스크롤로 handleLoadMore가
    // 트리거될 때 새 종목에 옛 커서로 이전 페이지를 요청하는 버그가 생길 수 있어 먼저 비운다.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 종목 전환 시 즉시 리셋 필요
    setNextBefore(null);
    loadCandles(stock.symbol, candleIntervalRef.current);
  }, [stock.symbol, stock.market, loadCandles]);

  const handleLoadMore = useCallback(async () => {
    // 1분봉은 API에 당일치만 있어 이전 페이지 요청이 항상 실패한다(토스트 스팸 방지) — 애초에 호출하지 않는다.
    if (!nextBefore || loadingMoreRef.current || candleInterval === '1m') return;
    const symbol = stock.symbol;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const page = await api.getCandles({
        symbol,
        interval: candleInterval,
        count: CANDLE_PAGE_SIZE,
        before: nextBefore,
      });
      if (activeSymbolRef.current !== symbol) return;
      candlesRef.current = [...candlesRef.current, ...page.candles];
      renderChart(candlesRef.current);
      setNextBefore(page.nextBefore);
    } catch {
      message.error('이전 데이터를 불러오지 못했습니다.');
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [stock.symbol, nextBefore, candleInterval, message, renderChart]);

  useEffect(() => {
    handleLoadMoreRef.current = handleLoadMore;
  }, [handleLoadMore]);

  // 봉 단위(일봉/1분봉) 전환 — 같은 종목의 캔들을 새 간격으로 다시 불러온다.
  const handleIntervalChange = useCallback(
    (interval: CandleInterval) => {
      setCandleInterval(interval);
      chartApiRef.current?.applyOptions({
        timeScale: { timeVisible: interval === '1m', secondsVisible: false },
      });
      setNextBefore(null);
      loadCandles(stock.symbol, interval);
    },
    [stock.symbol, loadCandles],
  );

  return (
    <Card
      title={
        <Space align="center" size={24}>
          <StockCell name={stock.name} symbol={stock.symbol} market={stock.market} lineHeight={1.1} />
          {price && (
            <QuotePriceBlock quote={price} referencePrice={referencePrice} flash={false} lineHeight={1.4} />
          )}
        </Space>
      }
      extra={
        <Segmented
          size="small"
          value={candleInterval}
          onChange={(value) => handleIntervalChange(value as CandleInterval)}
          options={[
            { label: '일봉', value: '1d' },
            { label: '1분봉', value: '1m' },
          ]}
        />
      }
    >
      <div style={{ position: 'relative' }}>
        <Spin spinning={loadingChart}>
          <div ref={chartContainerRef} style={{ width: '100%' }} />
        </Spin>
        {loadingMore && (
          <Text type="secondary" style={{ position: 'absolute', top: 4, left: 8, pointerEvents: 'none' }}>
            이전 데이터 불러오는 중...
          </Text>
        )}
        {(hoveredOhlc ?? liveTodayOhlc) && (
          <div
            style={{
              position: 'absolute',
              top: -10,
              left: 12,
              fontSize: 12,
              zIndex: 1,
              pointerEvents: 'none',
            }}
          >
            {(() => {
              // 여기 등락은 그 캔들 자체의 종가-시가 기준(관심종목 목록의 전일종가 대비 등락과는 다른 기준).
              const o = hoveredOhlc ?? liveTodayOhlc!;
              const color = profitColor(o.close - o.open);
              return (
                <span style={{ color }}>
                  시가 {o.open.toLocaleString()} 고가 {o.high.toLocaleString()} 저가 {o.low.toLocaleString()}{' '}
                  종가 {o.close.toLocaleString()} 거래량 {o.volume.toLocaleString()}
                </span>
              );
            })()}
          </div>
        )}
        <Space style={{ position: 'absolute', top: 10, left: 12, zIndex: 1 }} size={8}>
          {MA_PERIODS.map((period) => {
            const isVisible = visibleMaPeriods.has(period);
            return (
              <span
                key={period}
                onClick={() => {
                  setVisibleMaPeriods((prev) => {
                    const next = new Set(prev);
                    if (next.has(period)) next.delete(period);
                    else next.add(period);
                    return next;
                  });
                  maSeriesRefs.current[period]?.applyOptions({ visible: !isVisible });
                }}
                style={{
                  color: MA_COLORS[period],
                  fontSize: 12,
                  cursor: 'pointer',
                  opacity: isVisible ? 1 : 0.35,
                }}
              >
                {period}
              </span>
            );
          })}
        </Space>
      </div>
    </Card>
  );
}

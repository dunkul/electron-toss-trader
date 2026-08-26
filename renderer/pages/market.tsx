import { useCallback, useEffect, useRef, useState } from 'react';
import Head from 'next/head';
import { AutoComplete, Card, Descriptions, Empty, Spin, Typography } from 'antd';
import {
  CandlestickSeries,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from 'lightweight-charts';
import AppLayout from '../components/AppLayout';
import { api } from '../lib/ipc';
import type { PriceQuote, StockRow } from '../lib/ipc';

const { Text } = Typography;

export default function MarketPage() {
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState<StockRow[]>([]);
  const [selected, setSelected] = useState<StockRow | null>(null);
  const [price, setPrice] = useState<PriceQuote | null>(null);
  const [loadingChart, setLoadingChart] = useState(false);

  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const chartApiRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (query.length === 0) {
        setOptions([]);
        return;
      }
      api
        .searchStocks(query, 15)
        .then(setOptions)
        .catch(() => setOptions([]));
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const container = chartContainerRef.current;
    if (!container) return;

    const chart = createChart(container, {
      height: 360,
      layout: { textColor: '#333' },
      grid: { vertLines: { color: '#f0f0f0' }, horzLines: { color: '#f0f0f0' } },
    });
    const series = chart.addSeries(CandlestickSeries);
    chartApiRef.current = chart;
    seriesRef.current = series;

    const handleResize = () => chart.applyOptions({ width: container.clientWidth });
    window.addEventListener('resize', handleResize);
    handleResize();

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, []);

  const loadSymbol = useCallback(async (stock: StockRow) => {
    setSelected(stock);
    setQuery('');
    setOptions([]);
    setLoadingChart(true);
    try {
      const [prices, candles] = await Promise.all([
        api.getPrices([stock.symbol]),
        api.getCandles({ symbol: stock.symbol, interval: '1d', count: 90 }),
      ]);
      setPrice(prices[0] ?? null);
      seriesRef.current?.setData(
        candles.map((candle) => ({
          time: Math.floor(new Date(candle.timestamp).getTime() / 1000) as UTCTimestamp,
          open: Number(candle.openPrice),
          high: Number(candle.highPrice),
          low: Number(candle.lowPrice),
          close: Number(candle.closePrice),
        })),
      );
    } finally {
      setLoadingChart(false);
    }
  }, []);

  return (
    <AppLayout title="시세/차트">
      <Head>
        <title>시세/차트 - 토스증권 알림</title>
      </Head>

      <Card style={{ marginBottom: 16 }}>
        <AutoComplete
          style={{ width: 320 }}
          placeholder="종목명 또는 코드 검색"
          value={query}
          onChange={setQuery}
          options={options.map((stock) => ({
            value: stock.symbol,
            label: `${stock.name} (${stock.symbol})`,
          }))}
          onSelect={(value: string) => {
            const stock = options.find((item) => item.symbol === value);
            if (stock) loadSymbol(stock);
          }}
        />
        {query.length > 0 && options.length === 0 && (
          <Text type="secondary" style={{ marginLeft: 12 }}>
            검색 결과가 없습니다. 설정 화면에서 종목 캐시 동기화 상태를 확인하세요.
          </Text>
        )}
      </Card>

      {!selected ? (
        <Card>
          <Empty description="종목을 검색해 선택하세요." />
        </Card>
      ) : (
        <>
          <Card style={{ marginBottom: 16 }}>
            <Descriptions column={4} size="small">
              <Descriptions.Item label="종목">
                {selected.name} ({selected.symbol})
              </Descriptions.Item>
              <Descriptions.Item label="마켓">{selected.market}</Descriptions.Item>
              <Descriptions.Item label="현재가">
                {price ? `${Number(price.lastPrice).toLocaleString()} ${price.currency}` : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="기준시각">
                {price ? new Date(price.timestamp).toLocaleString('ko-KR') : '-'}
              </Descriptions.Item>
            </Descriptions>
          </Card>
          <Card>
            <Spin spinning={loadingChart}>
              <div ref={chartContainerRef} style={{ width: '100%' }} />
            </Spin>
          </Card>
        </>
      )}
    </AppLayout>
  );
}

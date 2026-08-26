import { useCallback, useEffect, useRef, useState } from 'react';
import Head from 'next/head';
import { App, AutoComplete, Button, Card, Empty, Popconfirm, Spin, Table, Typography } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import {
  CandlestickSeries,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type LogicalRange,
  type UTCTimestamp,
} from 'lightweight-charts';
import AppLayout from '../components/AppLayout';
import { api } from '../lib/ipc';
import type { Candle, PriceQuote, StockRow, WatchlistRow } from '../lib/ipc';

const CANDLE_PAGE_SIZE = 200; // Toss API의 /candles는 한 번 요청에 최대 200개까지만 허용한다.

const { Text } = Typography;

interface SelectedStock {
  symbol: string;
  name: string;
  market: string;
}

export default function MarketPage() {
  const { message } = App.useApp();
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState<StockRow[]>([]);
  const [selected, setSelected] = useState<SelectedStock | null>(null);
  const [price, setPrice] = useState<PriceQuote | null>(null);
  const [loadingChart, setLoadingChart] = useState(false);
  const [watchlist, setWatchlist] = useState<WatchlistRow[]>([]);
  const [watchlistPrices, setWatchlistPrices] = useState<Record<string, PriceQuote>>({});
  const [watchlistBusy, setWatchlistBusy] = useState(false);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const chartApiRef = useRef<IChartApi | null>(null);
  const activeSymbolRef = useRef<string | null>(null);
  // 차트에는 안 쓰이는 화면 상태가 아니라 렌더링용 원본 데이터라 ref로 보관한다(최신순/내림차순 그대로).
  // 과거 페이지를 이어붙일 때도 그냥 뒤에 concat하면 되고, 차트에 넣기 직전에만 오름차순으로 뒤집는다.
  const candlesRef = useRef<Candle[]>([]);
  const loadingMoreRef = useRef(false);
  // 차트 생성 effect는 마운트 시 한 번만 실행되므로, 그 안의 스크롤 구독 콜백은 handleLoadMore의
  // 최신 버전을 이 ref를 통해 참조해야 한다(그렇지 않으면 최초 렌더 시점의 stale 클로저를 계속 쓰게 된다).
  const handleLoadMoreRef = useRef<() => void>(() => {});

  const loadWatchlist = useCallback(() => {
    api
      .listWatchlist()
      .then((rows) => {
        setWatchlist(rows);
        if (rows.length === 0) {
          setWatchlistPrices({});
          return;
        }
        api
          .getPrices(rows.map((row) => row.symbol))
          .then((prices) => {
            setWatchlistPrices(Object.fromEntries(prices.map((quote) => [quote.symbol, quote])));
          })
          .catch(() => setWatchlistPrices({}));
      })
      .catch(() => setWatchlist([]));
  }, []);

  useEffect(() => {
    loadWatchlist();
  }, [loadWatchlist]);

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

    // 차트를 왼쪽(과거 방향)으로 드래그해서 로딩된 데이터의 시작 지점 근처까지 가면
    // 자동으로 이전 페이지를 이어붙인다(무한 스크롤). 10봉 여유를 두고 미리 불러온다.
    const handleVisibleLogicalRangeChange = (range: LogicalRange | null) => {
      if (range && range.from < 10) {
        handleLoadMoreRef.current();
      }
    };
    chart.timeScale().subscribeVisibleLogicalRangeChange(handleVisibleLogicalRangeChange);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(handleVisibleLogicalRangeChange);
      chart.remove();
    };
  }, []);

  useEffect(() => {
    // 미선택 상태에서는 차트 Card가 display:none이라 클라이언트 폭이 0으로 잡혀 있다.
    // 종목이 선택되어 Card가 다시 보이는 시점에 폭을 재계산해줘야 캔들이 실제로 그려진다.
    if (!selected) return;
    const container = chartContainerRef.current;
    if (container && chartApiRef.current) {
      chartApiRef.current.applyOptions({ width: container.clientWidth });
    }
  }, [selected]);

  // candlesDesc: API가 내려주는 그대로(최신순) 캔들 목록. 차트에 넣기 직전에만 뒤집는다.
  const renderChart = useCallback((candlesDesc: Candle[]) => {
    const ascendingCandles = [...candlesDesc].reverse();
    seriesRef.current?.setData(
      ascendingCandles.map((candle) => ({
        time: Math.floor(new Date(candle.timestamp).getTime() / 1000) as UTCTimestamp,
        open: Number(candle.openPrice),
        high: Number(candle.highPrice),
        low: Number(candle.lowPrice),
        close: Number(candle.closePrice),
      })),
    );
  }, []);

  const loadSymbol = useCallback(
    async (stock: SelectedStock) => {
      setSelected(stock);
      setQuery('');
      setOptions([]);
      setLoadingChart(true);
      activeSymbolRef.current = stock.symbol;
      try {
        const [prices, page] = await Promise.all([
          api.getPrices([stock.symbol]),
          api.getCandles({ symbol: stock.symbol, interval: '1d', count: CANDLE_PAGE_SIZE }),
        ]);
        if (activeSymbolRef.current !== stock.symbol) return;
        setPrice(prices[0] ?? null);
        candlesRef.current = page.candles;
        setNextBefore(page.nextBefore);
        renderChart(page.candles);
      } catch {
        message.error('시세/차트 정보를 불러오지 못했습니다.');
      } finally {
        setLoadingChart(false);
      }
    },
    [message, renderChart],
  );

  const handleLoadMore = useCallback(async () => {
    if (!selected || !nextBefore || loadingMoreRef.current) return;
    const symbol = selected.symbol;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const page = await api.getCandles({
        symbol,
        interval: '1d',
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
  }, [selected, nextBefore, message, renderChart]);

  useEffect(() => {
    handleLoadMoreRef.current = handleLoadMore;
  }, [handleLoadMore]);

  const handleSelectFromSearch = useCallback(
    async (stock: StockRow) => {
      await loadSymbol(stock);
      try {
        await api.addToWatchlist({ symbol: stock.symbol, name: stock.name, market: stock.market });
        loadWatchlist();
      } catch {
        message.error('관심종목 저장에 실패했습니다.');
      }
    },
    [loadSymbol, loadWatchlist, message],
  );

  const handleRemove = useCallback(
    async (symbol: string) => {
      setWatchlistBusy(true);
      try {
        await api.removeFromWatchlist(symbol);
        loadWatchlist();
      } catch {
        message.error('관심종목 삭제에 실패했습니다.');
      } finally {
        setWatchlistBusy(false);
      }
    },
    [loadWatchlist, message],
  );

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
            if (stock) handleSelectFromSearch(stock);
          }}
        />
        {query.length > 0 && options.length === 0 && (
          <Text type="secondary" style={{ marginLeft: 12 }}>
            검색 결과가 없습니다. 설정 화면에서 종목 캐시 동기화 상태를 확인하세요.
          </Text>
        )}
      </Card>

      <Card title="관심종목" style={{ marginBottom: 16 }}>
        <Table<WatchlistRow>
          rowKey="id"
          size="small"
          dataSource={watchlist}
          pagination={false}
          locale={{ emptyText: '종목을 검색해서 선택하면 관심종목에 자동으로 저장됩니다.' }}
          columns={[
            {
              title: '종목',
              key: 'symbol',
              render: (_value, record) => (
                <a onClick={() => loadSymbol(record)}>
                  {record.name} ({record.symbol})
                </a>
              ),
            },
            { title: '마켓', dataIndex: 'market' },
            {
              title: '현재가',
              key: 'price',
              align: 'right',
              render: (_value, record) => {
                const quote = watchlistPrices[record.symbol];
                return quote ? `${Number(quote.lastPrice).toLocaleString()} ${quote.currency}` : '-';
              },
            },
            {
              title: '',
              key: 'actions',
              width: 64,
              render: (_value, record) => (
                <Popconfirm
                  title={`"${record.name}" 관심종목을 삭제할까요?`}
                  onConfirm={() => handleRemove(record.symbol)}
                  okText="삭제"
                  cancelText="취소"
                >
                  <Button type="text" danger size="small" icon={<DeleteOutlined />} disabled={watchlistBusy} />
                </Popconfirm>
              ),
            },
          ]}
        />
      </Card>

      {!selected && (
        <Card style={{ marginBottom: 16 }}>
          <Empty description="종목을 검색해 선택하세요." />
        </Card>
      )}

      {/* 차트 컨테이너는 selected 여부와 무관하게 항상 마운트되어 있어야 한다.
          createChart는 마운트 시 한 번만 실행되므로, 이 div가 조건부로 사라졌다 나타나면
          최초 마운트 시점에 container가 null이라 차트가 영영 생성되지 않는다. */}
      <Card
        title={selected ? `${selected.name} (${selected.symbol})` : undefined}
        extra={
          selected && price ? (
            <Text>
              {Number(price.lastPrice).toLocaleString()} {price.currency}
              <Text type="secondary" style={{ marginLeft: 8 }}>
                {new Date(price.timestamp).toLocaleString('ko-KR')}
              </Text>
            </Text>
          ) : undefined
        }
        style={{ display: selected ? 'block' : 'none' }}
      >
        <div style={{ position: 'relative' }}>
          <Spin spinning={loadingChart}>
            <div ref={chartContainerRef} style={{ width: '100%' }} />
          </Spin>
          {loadingMore && (
            <Text
              type="secondary"
              style={{ position: 'absolute', top: 4, left: 8, pointerEvents: 'none' }}
            >
              이전 데이터 불러오는 중...
            </Text>
          )}
        </div>
      </Card>
    </AppLayout>
  );
}

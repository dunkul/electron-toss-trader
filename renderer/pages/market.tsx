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
import StockLogo from '../components/StockLogo';
import { currencySymbol, formatAmount, formatRate, profitColor } from '../lib/format';
import { api, onMarketTick } from '../lib/ipc';
import type { Candle, PriceQuote, StockRow, TossExchange, WatchlistRow } from '../lib/ipc';

const CANDLE_PAGE_SIZE = 200; // Toss API의 /candles는 한 번 요청에 최대 200개까지만 허용한다.

const { Text } = Typography;

interface SelectedStock {
  symbol: string;
  name: string;
  market: TossExchange;
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
  // 종목별 전일종가 — 현재가 등락 색상/등락률 계산의 기준가로만 쓰인다(당일 중 바뀌지 않음).
  const [referencePrices, setReferencePrices] = useState<Record<string, number>>({});
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
  // 실시간 틱 리스너는 마운트 시 한 번만 등록되므로, 어떤 종목이 "관심종목"/"선택된 종목"인지는
  // 이 ref들을 통해 항상 최신 상태로 참조해야 한다(그렇지 않으면 최초 등록 시점의 stale 값을 계속 참조하게 된다).
  const watchlistSymbolsRef = useRef<Set<string>>(new Set());
  const selectedSymbolRef = useRef<string | null>(null);

  const loadWatchlist = useCallback(() => {
    api
      .listWatchlist()
      .then((rows) => {
        setWatchlist(rows);
        if (rows.length === 0) {
          setWatchlistPrices({});
          setReferencePrices({});
          return;
        }
        api
          .getPrices(rows.map((row) => row.symbol))
          .then((prices) => {
            setWatchlistPrices(Object.fromEntries(prices.map((quote) => [quote.symbol, quote])));
          })
          .catch(() => setWatchlistPrices({}));

        // 전일종가 = 일봉 2개 중 어제 것(최신순으로 오므로 index 1). 상장 첫날 등 1개뿐이면 등락 표시를 생략한다.
        Promise.all(
          rows.map(async (row) => {
            try {
              const page = await api.getCandles({ symbol: row.symbol, interval: '1d', count: 2 });
              const ref = page.candles[1]?.closePrice;
              return ref ? ([row.symbol, Number(ref)] as const) : null;
            } catch {
              return null;
            }
          }),
        ).then((entries) => {
          setReferencePrices(
            Object.fromEntries(entries.filter((entry): entry is readonly [string, number] => entry !== null)),
          );
        });
      })
      .catch(() => setWatchlist([]));
  }, []);

  useEffect(() => {
    loadWatchlist();
  }, [loadWatchlist]);

  // 관심종목/선택된 종목이 바뀔 때마다 main 프로세스에 구독 대상 전체를 다시 선언한다(full-replace).
  useEffect(() => {
    watchlistSymbolsRef.current = new Set(watchlist.map((row) => row.symbol));
    selectedSymbolRef.current = selected?.symbol ?? null;

    const symbols = watchlist.map((row) => ({ symbol: row.symbol, market: row.market }));
    if (selected && !symbols.some((s) => s.symbol === selected.symbol)) {
      symbols.push({ symbol: selected.symbol, market: selected.market });
    }
    api.subscribeMarket(symbols);
  }, [watchlist, selected]);

  // 페이지를 떠날 때는 구독을 비워 main 프로세스가 불필요한 시세를 계속 받지 않도록 한다.
  useEffect(() => {
    return () => {
      api.subscribeMarket([]);
    };
  }, []);

  useEffect(() => {
    return onMarketTick((tick) => {
      const quote: PriceQuote = {
        symbol: tick.symbol,
        lastPrice: tick.lastPrice,
        currency: tick.currency,
        timestamp: tick.timestamp,
      };
      if (watchlistSymbolsRef.current.has(tick.symbol)) {
        setWatchlistPrices((prev) => ({ ...prev, [tick.symbol]: quote }));
      }
      if (selectedSymbolRef.current === tick.symbol) {
        setPrice(quote);

        // 차트는 다시 그리지 않고, 오늘(마지막) 봉의 고가/저가/종가만 실시간으로 갱신한다.
        const todayCandle = candlesRef.current[0];
        if (todayCandle) {
          const lastPrice = Number(tick.lastPrice);
          if (lastPrice > Number(todayCandle.highPrice)) todayCandle.highPrice = tick.lastPrice;
          if (lastPrice < Number(todayCandle.lowPrice)) todayCandle.lowPrice = tick.lastPrice;
          todayCandle.closePrice = tick.lastPrice;
          seriesRef.current?.update({
            time: Math.floor(new Date(todayCandle.timestamp).getTime() / 1000) as UTCTimestamp,
            open: Number(todayCandle.openPrice),
            high: Number(todayCandle.highPrice),
            low: Number(todayCandle.lowPrice),
            close: lastPrice,
          });
        }
      }
    });
  }, []);

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

  // 대시보드 보유종목의 종목 셀과 같은 형태: 로고 + 종목명, 그 아래 작은 회색 글씨로 코드.
  const renderStockCell = useCallback(
    (name: string, symbol: string) => (
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
    ),
    [],
  );

  // 대시보드 보유종목의 현재가 셀과 같은 형태: 위에 등락색이 적용된 가격, 아래에 등락폭(등락률).
  // 기준가(전일종가)가 아직 없으면(referencePrices 로딩 전/실패) 색상 없이 가격만 표시한다.
  const renderPriceBlock = useCallback(
    (quote: PriceQuote, alignRight = false) => {
      const lastPrice = Number(quote.lastPrice);
      const referencePrice = referencePrices[quote.symbol];
      const hasReference = referencePrice !== undefined && referencePrice !== 0;
      const change = hasReference ? lastPrice - referencePrice : undefined;
      const rate = hasReference ? change! / referencePrice : undefined;
      const color = change !== undefined ? profitColor(change) : undefined;

      return (
        <div style={alignRight ? { textAlign: 'right' } : undefined}>
          <div style={{ color }}>
            {currencySymbol(quote.currency)}
            {lastPrice.toLocaleString()}
          </div>
          {change !== undefined && rate !== undefined && (
            <Text style={{ color, fontSize: 12 }}>
              {formatAmount(change)}({formatRate(rate)})
            </Text>
          )}
        </div>
      );
    },
    [referencePrices],
  );

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
                <a onClick={() => loadSymbol(record)}>{renderStockCell(record.name, record.symbol)}</a>
              ),
            },
            { title: '마켓', dataIndex: 'market' },
            {
              title: '현재가',
              key: 'price',
              align: 'right',
              render: (_value, record) => {
                const quote = watchlistPrices[record.symbol];
                return quote ? renderPriceBlock(quote) : '-';
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
                  <Button
                    type="text"
                    danger
                    size="small"
                    icon={<DeleteOutlined />}
                    disabled={watchlistBusy}
                  />
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
        title={selected ? renderStockCell(selected.name, selected.symbol) : undefined}
        extra={selected && price ? renderPriceBlock(price, true) : undefined}
        style={{ display: selected ? 'block' : 'none' }}
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
        </div>
      </Card>
    </AppLayout>
  );
}

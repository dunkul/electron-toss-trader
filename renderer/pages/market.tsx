import { useCallback, useEffect, useRef, useState, type MutableRefObject, type ReactNode } from 'react';
import Head from 'next/head';
import {
  App,
  AutoComplete,
  Button,
  Card,
  Col,
  Empty,
  Input,
  Modal,
  Popconfirm,
  Row,
  Spin,
  Table,
  Tabs,
  Typography,
  type TabsProps,
} from 'antd';
import { DeleteOutlined, EditOutlined, HolderOutlined, PlusOutlined } from '@ant-design/icons';
import {
  CandlestickSeries,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type LogicalRange,
  type UTCTimestamp,
} from 'lightweight-charts';
import AppLayout from '../components/AppLayout';
import StockCell from '../components/StockCell';
import PriceBlock from '../components/PriceBlock';
import { formatAmount, formatRate, profitColor, profitFlashColor } from '../lib/format';
import { useStockSearch } from '../hooks/useStockSearch';
import { useMeasuredHeight } from '../hooks/useMeasuredHeight';
import { api, onMarketTick } from '../lib/ipc';
import type {
  AccountSummary,
  Candle,
  HoldingsSummary,
  PriceQuote,
  StockRow,
  TossExchange,
  WatchlistGroupRow,
  WatchlistRow,
} from '../lib/ipc';

const HOLDINGS_TAB_KEY = 'holdings';

const CANDLE_PAGE_SIZE = 200; // Toss API의 /candles는 한 번 요청에 최대 200개까지만 허용한다.

// antd Table size="small" 헤더 행의 실제 렌더링 높이(기본 테마 기준 고정값) — scroll.y를 계산할 때
// 측정된 컨테이너 높이에서 이만큼 빼서 헤더를 제외한 "행 영역"만큼만 스크롤 높이로 잡는다.
const TABLE_HEADER_HEIGHT_SM = 40;

const { Text } = Typography;

interface SelectedStock {
  symbol: string;
  name: string;
  market: TossExchange;
}

// 다른 탭(관심종목 그룹)과 같은 표 형식으로 보유종목을 보여주기 위한 행 — 마켓은 로컬
// 종목 캐시에서 조회해서 채워 넣으며, 캐시에 없으면 undefined(마켓 '-', 차트 클릭 불가).
interface HoldingWatchRow {
  symbol: string;
  name: string;
  market: TossExchange | undefined;
}

export default function MarketPage() {
  const { message } = App.useApp();
  const { query, setQuery, options } = useStockSearch(15);
  // 내 보유종목 탭의 테이블 높이 측정 — 그룹 탭들은 각자 WatchlistGroupPane 안에서 별도로 측정한다.
  const [holdingsTableWrapRef, holdingsTableWrapHeight] = useMeasuredHeight<HTMLDivElement>();
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

  // 관심종목 탭(그룹). "내 보유종목"은 DB에 저장되지 않는 고정 탭이라 groups에는 포함되지 않는다.
  const [groups, setGroups] = useState<WatchlistGroupRow[]>([]);
  const [activeTabKey, setActiveTabKey] = useState<string>(HOLDINGS_TAB_KEY);
  const [renameTarget, setRenameTarget] = useState<WatchlistGroupRow | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');

  const [accounts, setAccounts] = useState<AccountSummary[]>([]);
  const [holdingsSummary, setHoldingsSummary] = useState<HoldingsSummary | null>(null);
  const [holdingsLoading, setHoldingsLoading] = useState(false);
  // 보유종목 응답에는 정확한 거래소 코드(KOSPI/NASDAQ 등)가 없어, 차트를 열려면 로컬
  // 종목 캐시에서 심볼별 거래소를 따로 조회해야 한다. 캐시에 없는 심볼은 클릭해도 열리지 않는다.
  const [holdingMarkets, setHoldingMarkets] = useState<Record<string, TossExchange>>({});

  // 삭제 등으로 activeTabKey가 더 이상 존재하지 않는 그룹을 가리키게 되면, 첫 번째 관심종목
  // 탭으로(하나도 없으면 보유종목 탭으로) 대신 보여준다. state로 따로 저장하지 않고 렌더링마다
  // 파생시켜야 groups가 바뀔 때 setState를 또 호출하는 effect 연쇄가 생기지 않는다.
  const displayedTabKey =
    activeTabKey === HOLDINGS_TAB_KEY || groups.some((group) => String(group.id) === activeTabKey)
      ? activeTabKey
      : groups[0]
        ? String(groups[0].id)
        : HOLDINGS_TAB_KEY;

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
  // 드래그로 순서 변경 중인 종목 심볼 — HTML5 드래그 이벤트끼리 데이터를 주고받는 용도라
  // 리렌더링을 유발할 필요가 없으므로 상태가 아니라 ref로 둔다.
  const dragSymbolRef = useRef<string | null>(null);

  // 관심종목 탭과 보유종목 탭이 같은 심볼을 가리킬 수 있어(watchlistPrices/referencePrices를
  // 공유하므로) 항상 병합만 하고 통째로 갈아엎지 않는다 — 한쪽 로딩이 다른 쪽 데이터를 지우면 안 된다.
  const mergePricesAndReferences = useCallback((symbols: string[]) => {
    if (symbols.length === 0) return;

    api
      .getPrices(symbols)
      .then((prices) => {
        setWatchlistPrices((prev) => ({
          ...prev,
          ...Object.fromEntries(prices.map((quote) => [quote.symbol, quote])),
        }));
      })
      .catch(() => {});

    // 전일종가 = 일봉 2개 중 어제 것(최신순으로 오므로 index 1). 상장 첫날 등 1개뿐이면 등락 표시를 생략한다.
    Promise.all(
      symbols.map(async (symbol) => {
        try {
          const page = await api.getCandles({ symbol, interval: '1d', count: 2 });
          const ref = page.candles[1]?.closePrice;
          return ref ? ([symbol, Number(ref)] as const) : null;
        } catch {
          return null;
        }
      }),
    ).then((entries) => {
      setReferencePrices((prev) => ({
        ...prev,
        ...Object.fromEntries(entries.filter((entry): entry is readonly [string, number] => entry !== null)),
      }));
    });
  }, []);

  const loadWatchlist = useCallback(() => {
    api
      .listWatchlist()
      .then((rows) => {
        setWatchlist(rows);
        mergePricesAndReferences(rows.map((row) => row.symbol));
      })
      .catch(() => setWatchlist([]));
  }, [mergePricesAndReferences]);

  const loadGroups = useCallback(() => {
    api
      .listWatchlistGroups()
      .then((rows) => setGroups(rows))
      .catch(() => setGroups([]));
  }, []);

  const loadHoldings = useCallback(async () => {
    setHoldingsLoading(true);
    try {
      const accountList = await api.listAccounts();
      setAccounts(Array.isArray(accountList) ? accountList : []);
      if (Array.isArray(accountList) && accountList[0]) {
        const summary = await api.getHoldings(String(accountList[0].accountSeq));
        setHoldingsSummary(summary);
        const symbols = summary.items.map((item) => item.symbol);
        mergePricesAndReferences(symbols);
        if (symbols.length > 0) {
          api
            .getStocksBySymbols(symbols)
            .then((rows) =>
              setHoldingMarkets(Object.fromEntries(rows.map((row) => [row.symbol, row.market]))),
            )
            .catch(() => setHoldingMarkets({}));
        } else {
          setHoldingMarkets({});
        }
      } else {
        setHoldingsSummary(null);
        setHoldingMarkets({});
      }
    } catch {
      setHoldingsSummary(null);
    } finally {
      setHoldingsLoading(false);
    }
  }, [mergePricesAndReferences]);

  useEffect(() => {
    loadWatchlist();
    loadGroups();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 시 1회 초기 로딩(표준 fetch-on-mount 패턴)
    loadHoldings();
  }, [loadWatchlist, loadGroups, loadHoldings]);

  // 관심종목/보유종목/선택된 종목이 바뀔 때마다 main 프로세스에 구독 대상 전체를 다시
  // 선언한다(full-replace). 보유종목은 마켓이 해소된(로컬 종목 캐시에 있는) 심볼만 포함된다.
  useEffect(() => {
    const holdingEntries = Object.entries(holdingMarkets);

    watchlistSymbolsRef.current = new Set([
      ...watchlist.map((row) => row.symbol),
      ...holdingEntries.map(([symbol]) => symbol),
    ]);
    selectedSymbolRef.current = selected?.symbol ?? null;

    const symbols = [
      ...watchlist.map((row) => ({ symbol: row.symbol, market: row.market })),
      ...holdingEntries.map(([symbol, market]) => ({ symbol, market })),
    ];
    if (selected && !symbols.some((s) => s.symbol === selected.symbol)) {
      symbols.push({ symbol: selected.symbol, market: selected.market });
    }
    api.subscribeMarket(symbols);
  }, [watchlist, selected, holdingMarkets]);

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

  // 기준가(전일종가)가 아직 없으면(referencePrices 로딩 전/실패) 색상 없이 가격만 표시한다.
  const renderPriceBlock = useCallback(
    (quote: PriceQuote, alignRight = false) => {
      const lastPrice = Number(quote.lastPrice);
      const referencePrice = referencePrices[quote.symbol];
      const hasReference = referencePrice !== undefined && referencePrice !== 0;
      const change = hasReference ? lastPrice - referencePrice : undefined;
      const rate = hasReference ? change! / referencePrice : undefined;
      const color = change !== undefined ? profitColor(change) : undefined;
      const flashColor = change !== undefined ? profitFlashColor(change) : undefined;

      return (
        <PriceBlock
          currency={quote.currency}
          main={lastPrice.toLocaleString()}
          secondary={
            change !== undefined && rate !== undefined
              ? `${formatAmount(change)}(${formatRate(rate)})`
              : undefined
          }
          color={color}
          align={alignRight ? 'right' : undefined}
          flashColor={flashColor}
        />
      );
    },
    [referencePrices],
  );

  const loadSymbol = useCallback(
    async (stock: SelectedStock) => {
      setSelected(stock);
      setQuery('');
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
    [message, renderChart, setQuery],
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
    async (stock: StockRow, groupId: number) => {
      await loadSymbol(stock);
      try {
        await api.addToWatchlist({ groupId, symbol: stock.symbol, name: stock.name, market: stock.market });
        loadWatchlist();
      } catch {
        message.error('관심종목 저장에 실패했습니다.');
      }
    },
    [loadSymbol, loadWatchlist, message],
  );

  const handleRemove = useCallback(
    async (groupId: number, symbol: string) => {
      setWatchlistBusy(true);
      try {
        await api.removeFromWatchlist(groupId, symbol);
        loadWatchlist();
      } catch {
        message.error('관심종목 삭제에 실패했습니다.');
      } finally {
        setWatchlistBusy(false);
      }
    },
    [loadWatchlist, message],
  );

  // 드래그로 놓인 자리를 기준으로 그 탭(그룹) 안에서만 순서를 다시 계산해 낙관적으로 반영하고,
  // 서버에는 그 그룹의 최종 순서 전체를 보낸다. 실패하면 서버 상태로 되돌린다.
  const reorderGroup = useCallback(
    (groupId: number, draggedSymbol: string, targetSymbol: string) => {
      if (draggedSymbol === targetSymbol) return;
      const groupRows = watchlist.filter((row) => row.group_id === groupId);
      const fromIndex = groupRows.findIndex((row) => row.symbol === draggedSymbol);
      const toIndex = groupRows.findIndex((row) => row.symbol === targetSymbol);
      if (fromIndex === -1 || toIndex === -1) return;

      const reordered = [...groupRows];
      const [moved] = reordered.splice(fromIndex, 1);
      reordered.splice(toIndex, 0, moved);

      setWatchlist((prev) => [...prev.filter((row) => row.group_id !== groupId), ...reordered]);

      api
        .reorderWatchlist(
          groupId,
          reordered.map((row) => row.symbol),
        )
        .catch(() => {
          message.error('순서 변경에 실패했습니다.');
          loadWatchlist();
        });
    },
    [watchlist, loadWatchlist, message],
  );

  // 탭을 옮기면 그 탭의 첫 번째 종목 차트를 바로 연다(없으면 차트를 비운다).
  const openFirstSymbolOfTab = useCallback(
    (key: string) => {
      if (key === HOLDINGS_TAB_KEY) {
        const first = holdingsSummary?.items[0];
        const market = first ? holdingMarkets[first.symbol] : undefined;
        if (first && market) {
          loadSymbol({ symbol: first.symbol, name: first.name, market });
        } else {
          setSelected(null);
        }
        return;
      }
      // watchlist는 listWatchlist의 정렬(group_id, sort_order, created_at) 순서 그대로라
      // 같은 group_id를 가진 첫 항목이 곧 그 탭의 첫 번째 종목이다.
      const groupId = Number(key);
      const first = watchlist.find((row) => row.group_id === groupId);
      if (first) {
        loadSymbol(first);
      } else {
        setSelected(null);
      }
    },
    [holdingsSummary, holdingMarkets, watchlist, loadSymbol],
  );

  const handleTabChange = useCallback(
    (key: string) => {
      setActiveTabKey(key);
      openFirstSymbolOfTab(key);
    },
    [openFirstSymbolOfTab],
  );

  const submitAddGroup = useCallback(async () => {
    const name = newGroupName.trim();
    if (!name) return;
    try {
      const group = await api.createWatchlistGroup(name);
      setNewGroupName('');
      setCreatingGroup(false);
      loadGroups();
      handleTabChange(String(group.id));
    } catch {
      message.error('탭 생성에 실패했습니다.');
    }
  }, [newGroupName, loadGroups, handleTabChange, message]);

  const handleDeleteGroup = useCallback(
    (group: WatchlistGroupRow) => {
      Modal.confirm({
        title: `"${group.name}" 탭을 삭제할까요?`,
        content: '탭에 담긴 관심종목도 함께 삭제됩니다.',
        okText: '삭제',
        okButtonProps: { danger: true },
        cancelText: '취소',
        onOk: async () => {
          try {
            await api.deleteWatchlistGroup(group.id);
            loadGroups();
            loadWatchlist();
          } catch {
            message.error('탭 삭제에 실패했습니다.');
          }
        },
      });
    },
    [loadGroups, loadWatchlist, message],
  );

  const handleTabEdit: NonNullable<TabsProps['onEdit']> = useCallback(
    (targetKey, action) => {
      if (action === 'add') {
        setNewGroupName('');
        setCreatingGroup(true);
        return;
      }
      const group = groups.find((g) => String(g.id) === String(targetKey));
      if (group) handleDeleteGroup(group);
    },
    [groups, handleDeleteGroup],
  );

  const submitRenameGroup = useCallback(async () => {
    if (!renameTarget) return;
    const name = renameValue.trim();
    if (!name) return;
    try {
      await api.renameWatchlistGroup(renameTarget.id, name);
      setRenameTarget(null);
      loadGroups();
    } catch {
      message.error('탭 이름 변경에 실패했습니다.');
    }
  }, [renameTarget, renameValue, loadGroups, message]);

  return (
    <AppLayout title="시세/차트">
      <Head>
        <title>시세/차트 - 토스증권 알림</title>
      </Head>

      {/* 뷰포트 높이에 맞춰 채우고, 관심종목 카드는 그 안에서 넘치는 만큼만 내부 스크롤되게 한다
          (전체 창이 늘어나 문서 스크롤이 생기는 대신 카드 안에서만 스크롤). 창을 늘리면 Row의
          height:100%가 AppLayout Content의 남은 높이를 그대로 따라가 함께 늘어난다. */}
      <Row gutter={16} style={{ height: '100%' }}>
        <Col span={8} style={{ height: '100%' }}>
          <Card
            title="관심종목"
            style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
            styles={{
              body: { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
            }}
          >
            <Tabs
              className="watchlist-tabs"
              style={{ flex: 1, minHeight: 0 }}
              type="editable-card"
              hideAdd={false}
              activeKey={displayedTabKey}
              onChange={handleTabChange}
              onEdit={handleTabEdit}
              addIcon={<PlusOutlined />}
              items={[
                {
                  key: HOLDINGS_TAB_KEY,
                  label: '내 보유종목',
                  closable: false,
                  children: (
                    // 검색창이 없는 탭이라 테이블이 이 영역 전체를 쓴다 — measured 높이에서
                    // 테이블 헤더 높이만큼 뺀 값을 scroll.y로 줘서 헤더는 고정, 행만 스크롤되게 한다.
                    <div ref={holdingsTableWrapRef} style={{ height: '100%' }}>
                      <Table<HoldingWatchRow>
                        rowKey="symbol"
                        size="small"
                        loading={holdingsLoading}
                        scroll={{ y: Math.max(holdingsTableWrapHeight - TABLE_HEADER_HEIGHT_SM, 0) }}
                        dataSource={(holdingsSummary?.items ?? []).map((item) => ({
                          symbol: item.symbol,
                          name: item.name,
                          market: holdingMarkets[item.symbol],
                        }))}
                        pagination={false}
                        locale={{
                          emptyText: accounts.length
                            ? '보유 종목이 없습니다.'
                            : '계좌 정보를 불러오는 중이거나 연결된 계좌가 없습니다.',
                        }}
                        columns={[
                          {
                            title: '종목',
                            key: 'symbol',
                            render: (_value, record) => (
                              <a
                                onClick={() => {
                                  if (!record.market) {
                                    message.error(
                                      '종목 캐시에 없는 종목이라 차트를 열 수 없습니다. 설정에서 종목 캐시를 동기화하세요.',
                                    );
                                    return;
                                  }
                                  loadSymbol({
                                    symbol: record.symbol,
                                    name: record.name,
                                    market: record.market,
                                  });
                                }}
                              >
                                <StockCell name={record.name} symbol={record.symbol} market={record.market} />
                              </a>
                            ),
                          },
                          {
                            title: '현재가',
                            key: 'price',
                            align: 'right',
                            render: (_value, record) => {
                              const quote = watchlistPrices[record.symbol];
                              return quote ? renderPriceBlock(quote) : '-';
                            },
                          },
                        ]}
                      />
                    </div>
                  ),
                },
                ...groups.map((group) => ({
                  key: String(group.id),
                  label: (
                    <span>
                      {group.name}
                      <EditOutlined
                        style={{ marginLeft: 8 }}
                        onClick={(event) => {
                          event.stopPropagation();
                          setRenameTarget(group);
                          setRenameValue(group.name);
                        }}
                      />
                    </span>
                  ),
                  children: (
                    <WatchlistGroupPane
                      group={group}
                      isActive={displayedTabKey === String(group.id)}
                      query={query}
                      setQuery={setQuery}
                      options={options}
                      rows={watchlist.filter((row) => row.group_id === group.id)}
                      watchlistPrices={watchlistPrices}
                      renderPriceBlock={renderPriceBlock}
                      watchlistBusy={watchlistBusy}
                      dragSymbolRef={dragSymbolRef}
                      loadSymbol={loadSymbol}
                      handleSelectFromSearch={handleSelectFromSearch}
                      handleRemove={handleRemove}
                      reorderGroup={reorderGroup}
                    />
                  ),
                })),
              ]}
            />
          </Card>
        </Col>

        <Col span={16}>
          {!selected && (
            <Card style={{ marginBottom: 16 }}>
              <Empty description="종목을 검색해 선택하세요." />
            </Card>
          )}

          {/* 차트 컨테이너는 selected 여부와 무관하게 항상 마운트되어 있어야 한다.
              createChart는 마운트 시 한 번만 실행되므로, 이 div가 조건부로 사라졌다 나타나면
              최초 마운트 시점에 container가 null이라 차트가 영영 생성되지 않는다. */}
          <Card
            title={
              selected ? (
                <StockCell name={selected.name} symbol={selected.symbol} market={selected.market} />
              ) : undefined
            }
            extra={selected && price ? renderPriceBlock(price, true) : undefined}
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
        </Col>
      </Row>

      <Modal
        title="새 탭 추가"
        open={creatingGroup}
        onOk={submitAddGroup}
        onCancel={() => setCreatingGroup(false)}
        okText="추가"
        cancelText="취소"
      >
        <Input
          placeholder="탭 이름"
          value={newGroupName}
          onChange={(event) => setNewGroupName(event.target.value)}
          onPressEnter={submitAddGroup}
          autoFocus
        />
      </Modal>

      <Modal
        title="탭 이름 변경"
        open={renameTarget !== null}
        onOk={submitRenameGroup}
        onCancel={() => setRenameTarget(null)}
        okText="변경"
        cancelText="취소"
      >
        <Input
          placeholder="탭 이름"
          value={renameValue}
          onChange={(event) => setRenameValue(event.target.value)}
          onPressEnter={submitRenameGroup}
          autoFocus
        />
      </Modal>
    </AppLayout>
  );
}

interface WatchlistGroupPaneProps {
  group: WatchlistGroupRow;
  isActive: boolean;
  query: string;
  setQuery: (value: string) => void;
  options: StockRow[];
  rows: WatchlistRow[];
  watchlistPrices: Record<string, PriceQuote>;
  renderPriceBlock: (quote: PriceQuote, alignRight?: boolean) => ReactNode;
  watchlistBusy: boolean;
  dragSymbolRef: MutableRefObject<string | null>;
  loadSymbol: (stock: SelectedStock) => void;
  handleSelectFromSearch: (stock: StockRow, groupId: number) => void;
  handleRemove: (groupId: number, symbol: string) => void;
  reorderGroup: (groupId: number, draggedSymbol: string, targetSymbol: string) => void;
}

// 관심종목 그룹 탭 하나의 내용(검색창 + 종목 테이블). Tabs의 items는 MarketPage 렌더링 중
// groups.map()으로 만들어지므로, 그 콜백 안에서 useMeasuredHeight 같은 훅을 직접 호출할 수
// 없다(훅 호출 규칙 위반) — 그래서 별도 컴포넌트로 분리해 각 탭 인스턴스가 자기 몫의 훅을 가진다.
function WatchlistGroupPane({
  group,
  isActive,
  query,
  setQuery,
  options,
  rows,
  watchlistPrices,
  renderPriceBlock,
  watchlistBusy,
  dragSymbolRef,
  loadSymbol,
  handleSelectFromSearch,
  handleRemove,
  reorderGroup,
}: WatchlistGroupPaneProps) {
  const [tableWrapRef, tableWrapHeight] = useMeasuredHeight<HTMLDivElement>();

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 'none' }}>
        <AutoComplete
          style={{ width: 320, marginBottom: 12 }}
          placeholder="종목명 또는 코드 검색"
          value={isActive ? query : ''}
          onChange={setQuery}
          options={options.map((stock) => ({
            value: stock.symbol,
            label: `${stock.name} (${stock.symbol})`,
          }))}
          onSelect={(value: string) => {
            const stock = options.find((item) => item.symbol === value);
            if (stock) handleSelectFromSearch(stock, group.id);
          }}
        />
        {isActive && query.length > 0 && options.length === 0 && (
          <Text type="secondary" style={{ marginLeft: 12 }}>
            검색 결과가 없습니다. 설정 화면에서 종목 캐시 동기화 상태를 확인하세요.
          </Text>
        )}
      </div>
      {/* 검색창은 위에서 고정 높이로 빠지고, 테이블만 남은 공간을 측정해 scroll.y로 넘긴다
          (헤더 높이만큼 빼서 테이블 헤더는 고정, 행만 스크롤되게 한다). */}
      <div ref={tableWrapRef} style={{ flex: 1, minHeight: 0 }}>
        <Table<WatchlistRow>
          rowKey="id"
          size="small"
          scroll={{ y: Math.max(tableWrapHeight - TABLE_HEADER_HEIGHT_SM, 0) }}
          dataSource={rows}
          pagination={false}
          locale={{ emptyText: '종목을 검색해서 선택하면 이 탭에 저장됩니다.' }}
          onRow={(record) => ({
            draggable: true,
            onDragStart: () => {
              dragSymbolRef.current = record.symbol;
            },
            onDragOver: (event) => event.preventDefault(),
            onDrop: () => {
              if (dragSymbolRef.current) reorderGroup(group.id, dragSymbolRef.current, record.symbol);
              dragSymbolRef.current = null;
            },
            onDragEnd: () => {
              dragSymbolRef.current = null;
            },
          })}
          columns={[
            {
              title: '',
              key: 'drag',
              width: 32,
              render: () => <HolderOutlined style={{ cursor: 'grab', color: 'rgba(0,0,0,0.35)' }} />,
            },
            {
              title: '종목',
              key: 'symbol',
              render: (_value, record) => (
                <a onClick={() => loadSymbol(record)}>
                  <StockCell name={record.name} symbol={record.symbol} market={record.market} />
                </a>
              ),
            },
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
                  onConfirm={() => handleRemove(group.id, record.symbol)}
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
      </div>
    </div>
  );
}

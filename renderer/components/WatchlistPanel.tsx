import { memo, useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import {
  App,
  AutoComplete,
  Button,
  Card,
  Input,
  Modal,
  Popconfirm,
  Table,
  Tabs,
  Typography,
  type TabsProps,
} from 'antd';
import { DeleteOutlined, EditOutlined, HolderOutlined, PlusOutlined } from '@ant-design/icons';
import StockCell from './StockCell';
import QuotePriceBlock from './QuotePriceBlock';
import { useStockSearch } from '../hooks/useStockSearch';
import { TABLE_HEADER_HEIGHT_SM, useMeasuredHeight } from '../hooks/useMeasuredHeight';
import { useMarketSubscription } from '../hooks/useMarketSubscription';
import { fetchReferencePrices, resolveMarketsBySymbol } from '../lib/market-data';
import { stockCacheMissError } from '../lib/format';
import { api, onMarketTick } from '../lib/ipc';
import { useSelectedStockStore, type SelectedStock } from '../store/useSelectedStockStore';
import type {
  AccountSummary,
  HoldingsSummary,
  PriceQuote,
  StockRow,
  TossExchange,
  WatchlistGroupRow,
  WatchlistRow,
} from '../lib/ipc';

const HOLDINGS_TAB_KEY = 'holdings';

// 그룹에 종목이 하나도 없을 때 매 렌더마다 새 배열 리터럴을 만들지 않기 위한 고정 참조.
const EMPTY_ROWS: WatchlistRow[] = [];

const { Text } = Typography;

// 다른 탭(관심종목 그룹)과 같은 표 형식으로 보유종목을 보여주기 위한 행 — 마켓은 로컬
// 종목 캐시에서 조회해서 채워 넣으며, 캐시에 없으면 undefined(마켓 '-', 차트 클릭 불가).
interface HoldingWatchRow {
  symbol: string;
  name: string;
  market: TossExchange | undefined;
}

// 관심종목 탭 + 보유종목 탭 + 그룹 CRUD를 담당하는 좌측 사이드바. 차트(ChartCard)와는
// useSelectedStockStore를 통해서만 통신한다(어떤 종목을 골랐는지 알리는 select()/clear()).
export default function WatchlistPanel() {
  const { message } = App.useApp();
  const { query, setQuery, options } = useStockSearch(15);
  const selected = useSelectedStockStore((s) => s.selected);
  const select = useSelectedStockStore((s) => s.select);
  const clear = useSelectedStockStore((s) => s.clear);

  // 내 보유종목 탭의 테이블 높이 측정 — 그룹 탭들은 각자 WatchlistGroupPane 안에서 별도로 측정한다.
  const [holdingsTableWrapRef, holdingsTableWrapHeight] = useMeasuredHeight<HTMLDivElement>();
  const [watchlist, setWatchlist] = useState<WatchlistRow[]>([]);
  const [watchlistPrices, setWatchlistPrices] = useState<Record<string, PriceQuote>>({});
  // 종목별 전일종가 — 현재가 등락 색상/등락률 계산의 기준가로만 쓰인다(당일 중 바뀌지 않음).
  const [referencePrices, setReferencePrices] = useState<Record<string, number>>({});
  const [watchlistBusy, setWatchlistBusy] = useState(false);

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

  // 그룹별로 미리 나눠둔다 — watchlist가 안 바뀌었으면(예: 실시간 틱으로 인한 리렌더) 그룹별
  // rows 배열이 참조 그대로 유지되어, 아래 WatchlistGroupPane의 React.memo 비교가 먹힌다.
  const watchlistByGroup = useMemo(() => {
    const map = new Map<number, WatchlistRow[]>();
    for (const row of watchlist) {
      const rows = map.get(row.group_id);
      if (rows) rows.push(row);
      else map.set(row.group_id, [row]);
    }
    return map;
  }, [watchlist]);

  // 실시간 틱 리스너는 마운트 시 한 번만 등록되므로, 관심종목/보유종목 심볼 목록은 이 ref를
  // 통해 항상 최신 상태로 참조해야 한다(그렇지 않으면 최초 등록 시점의 stale 값을 계속 참조).
  const watchlistSymbolsRef = useRef<Set<string>>(new Set());
  // 드래그로 순서 변경 중인 종목 심볼 — HTML5 드래그 이벤트끼리 데이터를 주고받는 용도라
  // 리렌더링을 유발할 필요가 없으므로 상태가 아니라 ref로 둔다.
  const dragSymbolRef = useRef<string | null>(null);
  // 페이지 진입 시 보유종목 첫 종목 차트를 딱 한 번만 자동으로 열기 위한 가드.
  const autoOpenedHoldingRef = useRef(false);

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

    fetchReferencePrices(symbols).then((refs) => {
      setReferencePrices((prev) => ({ ...prev, ...refs }));
    });
  }, []);

  const loadWatchlist = useCallback(() => {
    api
      .listWatchlist()
      .then((rows) => {
        setWatchlist(rows);
        mergePricesAndReferences(rows.map((row) => row.symbol));
      })
      .catch(() => {
        setWatchlist([]);
        message.error('관심종목을 불러오지 못했습니다.');
      });
  }, [mergePricesAndReferences, message]);

  const loadGroups = useCallback(() => {
    api
      .listWatchlistGroups()
      .then((rows) => setGroups(rows))
      .catch(() => {
        setGroups([]);
        message.error('관심종목 탭을 불러오지 못했습니다.');
      });
  }, [message]);

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
        resolveMarketsBySymbol(symbols).then(setHoldingMarkets);
      } else {
        setHoldingsSummary(null);
        setHoldingMarkets({});
      }
    } catch {
      setHoldingsSummary(null);
      message.error('보유종목 정보를 불러오지 못했습니다.');
    } finally {
      setHoldingsLoading(false);
    }
  }, [mergePricesAndReferences, message]);

  useEffect(() => {
    loadWatchlist();
    loadGroups();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 시 1회 초기 로딩(표준 fetch-on-mount 패턴)
    loadHoldings();
  }, [loadWatchlist, loadGroups, loadHoldings]);

  // 관심종목/보유종목이 바뀔 때마다 심볼 집합을 갱신한다(틱 핸들러가 참조).
  useEffect(() => {
    const holdingEntries = Object.entries(holdingMarkets);
    watchlistSymbolsRef.current = new Set([
      ...watchlist.map((row) => row.symbol),
      ...holdingEntries.map(([symbol]) => symbol),
    ]);
  }, [watchlist, holdingMarkets]);

  // 실시간 구독 선언 — 차트(ChartCard)는 자기 심볼을 스스로 구독하므로, 여기서는 관심종목/
  // 보유종목 몫만 선언하면 된다(market-subscription-registry.ts가 둘을 합쳐서 하나로 선언).
  useMarketSubscription([
    ...watchlist.map((row) => ({ symbol: row.symbol, market: row.market })),
    ...Object.entries(holdingMarkets).map(([symbol, market]) => ({ symbol, market })),
  ]);

  useEffect(() => {
    return onMarketTick((tick) => {
      if (!watchlistSymbolsRef.current.has(tick.symbol)) return;
      setWatchlistPrices((prev) => ({
        ...prev,
        [tick.symbol]: {
          symbol: tick.symbol,
          lastPrice: tick.lastPrice,
          currency: tick.currency,
          timestamp: tick.timestamp,
        },
      }));
    });
  }, []);

  const handleSelectFromSearch = useCallback(
    async (stock: StockRow, groupId: number) => {
      select(stock);
      setQuery('');
      try {
        await api.addToWatchlist({ groupId, symbol: stock.symbol, name: stock.name, market: stock.market });
        loadWatchlist();
      } catch {
        message.error('관심종목 저장에 실패했습니다.');
      }
    },
    [select, setQuery, loadWatchlist, message],
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
          select({ symbol: first.symbol, name: first.name, market });
        } else {
          clear();
        }
        return;
      }
      // watchlist는 listWatchlist의 정렬(group_id, sort_order, created_at) 순서 그대로라
      // 같은 group_id를 가진 첫 항목이 곧 그 탭의 첫 번째 종목이다.
      const groupId = Number(key);
      const first = watchlist.find((row) => row.group_id === groupId);
      if (first) {
        select(first);
      } else {
        clear();
      }
    },
    [holdingsSummary, holdingMarkets, watchlist, select, clear],
  );

  // 페이지에 처음 들어왔을 때 "내 보유종목" 탭이 기본으로 활성화되어 있으니, 보유종목이 있으면
  // 그 첫 종목 차트를 자동으로 열어준다. holdingsSummary/holdingMarkets는 각각 비동기로
  // 채워지므로 둘 다 준비될 때까지 렌더마다 다시 시도하되, 성공(또는 사용자가 이미 다른 종목을
  // 선택)하면 다시는 끼어들지 않도록 한 번만 실행한다.
  useEffect(() => {
    if (autoOpenedHoldingRef.current || selected) return;
    const first = holdingsSummary?.items[0];
    const market = first ? holdingMarkets[first.symbol] : undefined;
    if (first && market) {
      autoOpenedHoldingRef.current = true;
      select({ symbol: first.symbol, name: first.name, market });
    }
  }, [holdingsSummary, holdingMarkets, selected, select]);

  const handleTabChange = useCallback(
    (key: string) => {
      setActiveTabKey(key);
      // 검색창 텍스트/결과는 탭마다 별개다 — 안 지우면 새로 활성화된 탭에 이전 탭에서
      // 검색하던 내용이 그대로(찰나) 보인다.
      setQuery('');
      openFirstSymbolOfTab(key);
    },
    [openFirstSymbolOfTab, setQuery],
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
    <>
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
                                message.error(stockCacheMissError('차트를 열 수 없습니다'));
                                return;
                              }
                              select({
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
                          return quote ? (
                            <QuotePriceBlock quote={quote} referencePrice={referencePrices[record.symbol]} />
                          ) : (
                            '-'
                          );
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
                  rows={watchlistByGroup.get(group.id) ?? EMPTY_ROWS}
                  watchlistPrices={watchlistPrices}
                  referencePrices={referencePrices}
                  watchlistBusy={watchlistBusy}
                  dragSymbolRef={dragSymbolRef}
                  loadSymbol={select}
                  handleSelectFromSearch={handleSelectFromSearch}
                  handleRemove={handleRemove}
                  reorderGroup={reorderGroup}
                />
              ),
            })),
          ]}
        />
      </Card>

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
    </>
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
  referencePrices: Record<string, number>;
  watchlistBusy: boolean;
  dragSymbolRef: RefObject<string | null>;
  loadSymbol: (stock: SelectedStock) => void;
  handleSelectFromSearch: (stock: StockRow, groupId: number) => void;
  handleRemove: (groupId: number, symbol: string) => void;
  reorderGroup: (groupId: number, draggedSymbol: string, targetSymbol: string) => void;
}

// 실시간 틱마다 watchlistPrices/referencePrices가 새 객체로 바뀌어(WatchlistPanel 전체가
// 리렌더) 이 컴포넌트도 매번 리렌더된다 — antd Tabs가 비활성 탭도 계속 마운트해두기 때문에
// 관심 없는 탭까지 매 틱 리렌더되는 걸 막기 위해, 이 그룹 소속 종목의 시세가 실제로 바뀐
// 경우에만 리렌더하도록 React.memo에 커스텀 비교 함수를 준다.
function arePropsEqual(prev: WatchlistGroupPaneProps, next: WatchlistGroupPaneProps): boolean {
  if (
    prev.group !== next.group ||
    prev.isActive !== next.isActive ||
    prev.query !== next.query ||
    prev.options !== next.options ||
    prev.rows !== next.rows ||
    prev.watchlistBusy !== next.watchlistBusy
  ) {
    return false;
  }
  return prev.rows.every(
    (row) =>
      prev.watchlistPrices[row.symbol] === next.watchlistPrices[row.symbol] &&
      prev.referencePrices[row.symbol] === next.referencePrices[row.symbol],
  );
}

// 관심종목 그룹 탭 하나의 내용(검색창 + 종목 테이블). Tabs의 items는 WatchlistPanel 렌더링 중
// groups.map()으로 만들어지므로, 그 콜백 안에서 useMeasuredHeight 같은 훅을 직접 호출할 수
// 없다(훅 호출 규칙 위반) — 그래서 별도 컴포넌트로 분리해 각 탭 인스턴스가 자기 몫의 훅을 가진다.
const WatchlistGroupPane = memo(function WatchlistGroupPane({
  group,
  isActive,
  query,
  setQuery,
  options,
  rows,
  watchlistPrices,
  referencePrices,
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
                return quote ? (
                  <QuotePriceBlock quote={quote} referencePrice={referencePrices[record.symbol]} />
                ) : (
                  '-'
                );
              },
            },
            {
              title: '',
              key: 'actions',
              width: 40,
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
}, arePropsEqual);

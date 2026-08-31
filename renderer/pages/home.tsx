import { useCallback, useEffect, useRef, useState } from 'react';
import Head from 'next/head';
import { Alert, App, Button, Card, Col, Dropdown, Row, Segmented, Table, type MenuProps } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import AppLayout from '../components/AppLayout';
import StockCell from '../components/StockCell';
import PriceBlock from '../components/PriceBlock';
import RankingCard, { type RankingCardHandle } from '../components/RankingCard';
import MarketIndicatorBar, { type MarketIndicatorBarHandle } from '../components/MarketIndicatorBar';
import { api, onStrategySignal } from '../lib/ipc';
import { formatAmount, formatRate, ipcErrorMessage, profitColor, stockCacheMissError } from '../lib/format';
import { resolveMarketsBySymbol } from '../lib/market-data';
import { MARKET_OPTIONS } from '../lib/options';
import { TABLE_HEADER_HEIGHT_SM, useMeasuredHeight } from '../hooks/useMeasuredHeight';
import type { AccountSummary, Holding, HoldingsSummary, Market, TossExchange } from '../lib/ipc';

const DASHBOARD_AUTO_REFRESH_INTERVAL_MS = 30_000;
// chart-indicators.ts의 KST_OFFSET_SECONDS와 같은 방식 — Toss API 타임스탬프가 아니라 "지금"을
// 다루는 것뿐, 사용자 OS 타임존과 무관하게 KST 벽시계 기준으로 판단해야 하므로 UTC epoch에 9시간을
// 더한 뒤 UTC 게터로 읽는다(한국은 DST가 없어 고정 오프셋으로 충분하다).
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

// 국내 증시가 열려 있을 가능성이 있는 평일 08~20시(KST)에만 자동 새로고침한다 — 장 시간 외에는
// 어차피 시세가 안 움직이니 폴링할 이유가 없다.
function isDashboardAutoRefreshWindow(): boolean {
  const kst = new Date(Date.now() + KST_OFFSET_MS);
  const day = kst.getUTCDay(); // 0=일 ... 6=토
  const hour = kst.getUTCHours();
  return day >= 1 && day <= 5 && hour >= 8 && hour < 20;
}

export default function HomePage() {
  const { notification, message } = App.useApp();
  const [error, setError] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<AccountSummary[]>([]);
  const [holdingsSummary, setHoldingsSummary] = useState<HoldingsSummary | null>(null);
  // 보유종목 응답에는 정확한 거래소 코드(KOSPI/NASDAQ 등)가 없어, 차트 창을 열려면 로컬
  // 종목 캐시에서 심볼별 거래소를 따로 조회해야 한다(WatchlistPanel의 보유종목 탭과 같은 방식).
  const [holdingMarkets, setHoldingMarkets] = useState<Record<string, TossExchange>>({});
  const [holdingsRefreshing, setHoldingsRefreshing] = useState(false);
  const [holdingsMarket, setHoldingsMarket] = useState<Market>('KR');
  const rankingCardRef = useRef<RankingCardHandle>(null);
  const marketIndicatorRef = useRef<MarketIndicatorBarHandle>(null);
  const [holdingsTableWrapRef, holdingsTableWrapHeight] = useMeasuredHeight<HTMLDivElement>();

  const loadHoldingMarkets = useCallback((summary: HoldingsSummary) => {
    resolveMarketsBySymbol(summary.items.map((item) => item.symbol)).then(setHoldingMarkets);
  }, []);

  const loadDashboard = useCallback(async () => {
    setError(null);
    try {
      const accountList = await api.listAccounts();
      setAccounts(Array.isArray(accountList) ? accountList : []);

      if (Array.isArray(accountList) && accountList[0]) {
        const summary = await api.getHoldings(String(accountList[0].accountSeq));
        setHoldingsSummary(summary);
        loadHoldingMarkets(summary);
      }
    } catch (err) {
      setError(ipcErrorMessage(err, '대시보드 정보를 불러오지 못했습니다.'));
    }
  }, [loadHoldingMarkets]);

  const refreshHoldings = useCallback(async () => {
    const account = accounts[0];
    if (!account) return;
    setHoldingsRefreshing(true);
    try {
      const summary = await api.getHoldings(String(account.accountSeq));
      setHoldingsSummary(summary);
      loadHoldingMarkets(summary);
      setError(null);
    } catch (err) {
      setError(ipcErrorMessage(err, '보유 종목 정보를 불러오지 못했습니다.'));
    } finally {
      setHoldingsRefreshing(false);
    }
  }, [accounts, loadHoldingMarkets]);

  // 보유 종목/주식 랭킹/지수 배너 중 어느 쪽 새로고침을 눌러도 셋 다 새로고침되도록 맞춘다.
  const handleHoldingsRefreshClick = useCallback(() => {
    refreshHoldings();
    rankingCardRef.current?.refresh();
    marketIndicatorRef.current?.refresh();
  }, [refreshHoldings]);

  // 주식 랭킹 카드는 자기 새로고침 버튼을 누르면 스스로(RankingCard.load)는 이미 다시 불러오므로,
  // 여기서는 나머지 둘(보유 종목/지수 배너)만 추가로 맞춰준다.
  const handleRankingRefreshClick = useCallback(() => {
    refreshHoldings();
    marketIndicatorRef.current?.refresh();
  }, [refreshHoldings]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 시 1회 초기 로딩(표준 fetch-on-mount 패턴)
    loadDashboard();
    const unsubscribe = onStrategySignal((payload) => {
      notification.info({
        message: `[${payload.signal}] ${payload.strategyName}`,
        description: payload.reason ?? payload.symbol,
      });
      loadDashboard();
    });
    return unsubscribe;
  }, [loadDashboard, notification]);

  // 새로고침 버튼과 동일한 동작(보유 종목/랭킹/지수 배너)을 국내장이 열려 있을 평일 08~20시(KST)
  // 동안 30초마다 자동으로 수행한다.
  useEffect(() => {
    const interval = setInterval(() => {
      if (isDashboardAutoRefreshWindow()) handleHoldingsRefreshClick();
    }, DASHBOARD_AUTO_REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [handleHoldingsRefreshClick]);

  const holdings = holdingsSummary?.items ?? [];

  const sortByProfitRateDesc = (list: Holding[]) =>
    [...list].sort((a, b) => Number(b.profitLoss.rate) - Number(a.profitLoss.rate));
  const krHoldings = sortByProfitRateDesc(holdings.filter((h) => h.marketCountry === 'KR'));
  const usHoldings = sortByProfitRateDesc(holdings.filter((h) => h.marketCountry === 'US'));

  const handleOpenHoldingChart = (holding: Holding) => {
    const market = holdingMarkets[holding.symbol];
    if (!market) {
      message.error(stockCacheMissError('차트를 열 수 없습니다'));
      return;
    }
    api.openChartWindow({ symbol: holding.symbol, name: holding.name, market });
  };

  const getOrderbookMenuItems = (holding: Holding): MenuProps['items'] => [
    {
      key: 'orderbook',
      label: '호가창으로 보기',
      onClick: () => {
        const market = holdingMarkets[holding.symbol];
        if (!market) {
          message.error(stockCacheMissError('호가창을 열 수 없습니다'));
          return;
        }
        api.openOrderbookWindow({ symbol: holding.symbol, name: holding.name, market });
      },
    },
  ];

  const holdingColumns: ColumnsType<Holding> = [
    {
      title: '종목',
      dataIndex: 'name',
      width: 170,
      render: (value: string, record) => (
        <Dropdown trigger={['contextMenu']} menu={{ items: getOrderbookMenuItems(record) }}>
          <a onClick={() => handleOpenHoldingChart(record)}>
            <StockCell name={value} symbol={record.symbol} />
          </a>
        </Dropdown>
      ),
    },
    {
      title: '수량',
      dataIndex: 'quantity',
      align: 'right',
      width: 70,
      render: (value: string) => Number(value).toLocaleString(undefined, { maximumFractionDigits: 4 }),
    },
    {
      title: '현재가',
      dataIndex: 'lastPrice',
      align: 'right',
      width: 100,
      render: (value: string, record) => {
        const quantity = Number(record.quantity);
        const dailyChangePerShare = quantity > 0 ? Number(record.dailyProfitLoss.amount) / quantity : 0;
        return (
          <PriceBlock
            currency={record.currency}
            main={Number(value).toLocaleString()}
            secondary={`${formatAmount(dailyChangePerShare, record.currency)}(${formatRate(record.dailyProfitLoss.rate)})`}
            color={profitColor(dailyChangePerShare)}
          />
        );
      },
    },
    {
      title: '평가손익',
      dataIndex: 'profitLoss',
      align: 'right',
      width: 100,
      render: (value: Holding['profitLoss'], record) => {
        const amount = Number(value.amount);
        return (
          <PriceBlock
            currency={record.currency}
            main={formatAmount(value.amount, record.currency)}
            secondary={formatRate(value.rate)}
            color={profitColor(amount)}
          />
        );
      },
    },
  ];

  return (
    <AppLayout>
      <Head>
        <title>대시보드 - 토스 트레이더</title>
      </Head>

      {/* 시세/차트 페이지의 관심종목 카드와 같은 패턴: 아래쪽 Row를 뷰포트 남은 높이에 맞춰 채우고,
          그 안의 두 카드는 각자 내부 테이블만 scroll.y로 스크롤되게 해서 페이지 전체가 늘어나
          문서 스크롤이 생기는 대신 카드 안에서만 스크롤되게 한다. */}
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        {error && (
          <Alert type="error" message={error} showIcon closable style={{ marginBottom: 16, flex: 'none' }} />
        )}

        <div style={{ marginBottom: 16, flex: 'none' }}>
          <MarketIndicatorBar ref={marketIndicatorRef} />
        </div>

        <Row gutter={[16, 16]} style={{ flex: 1, minHeight: 0 }}>
          <Col xs={24} xl={12} style={{ height: '100%' }}>
            <Card
              title="보유 종목"
              extra={
                <Button
                  type="text"
                  size="small"
                  icon={<ReloadOutlined spin={holdingsRefreshing} />}
                  onClick={handleHoldingsRefreshClick}
                  disabled={accounts.length === 0}
                />
              }
              style={{ height: '100%', minWidth: 450, display: 'flex', flexDirection: 'column' }}
              styles={{
                body: { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
              }}
            >
              <Segmented
                value={holdingsMarket}
                onChange={(value) => setHoldingsMarket(value as Market)}
                options={MARKET_OPTIONS}
                style={{ marginBottom: 12, flex: 'none', alignSelf: 'flex-start' }}
              />
              <div ref={holdingsTableWrapRef} style={{ flex: 1, minHeight: 0 }}>
                <Table<Holding>
                  size="small"
                  rowKey="symbol"
                  pagination={false}
                  tableLayout="fixed"
                  scroll={{ y: Math.max(holdingsTableWrapHeight - TABLE_HEADER_HEIGHT_SM, 0) }}
                  dataSource={holdingsMarket === 'KR' ? krHoldings : usHoldings}
                  locale={{
                    emptyText: accounts.length ? '보유 종목이 없습니다.' : '계좌 정보를 불러오는 중입니다.',
                  }}
                  columns={holdingColumns}
                />
              </div>
            </Card>
          </Col>

          <Col xs={24} xl={12} style={{ height: '100%' }}>
            <RankingCard ref={rankingCardRef} onRefresh={handleRankingRefreshClick} />
          </Col>
        </Row>
      </div>
    </AppLayout>
  );
}

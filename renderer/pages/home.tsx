import { useCallback, useEffect, useRef, useState } from 'react';
import Head from 'next/head';
import { Alert, App, Button, Card, Col, Row, Segmented, Statistic, Table } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import AppLayout from '../components/AppLayout';
import StockCell from '../components/StockCell';
import PriceBlock from '../components/PriceBlock';
import RankingCard, { type RankingCardHandle } from '../components/RankingCard';
import { api, onStrategySignal } from '../lib/ipc';
import { formatAmount, formatRate, profitColor } from '../lib/format';
import { TABLE_HEADER_HEIGHT_SM, useMeasuredHeight } from '../hooks/useMeasuredHeight';
import type {
  AccountSummary,
  Holding,
  HoldingsSummary,
  Market,
  StrategyRow,
  StrategySignalRow,
} from '../lib/ipc';

function formatKrw(value: string): string {
  return `${Math.round(Number(value)).toLocaleString()}원`;
}

export default function HomePage() {
  const { notification } = App.useApp();
  const [error, setError] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<AccountSummary[]>([]);
  const [holdingsSummary, setHoldingsSummary] = useState<HoldingsSummary | null>(null);
  const [strategies, setStrategies] = useState<StrategyRow[]>([]);
  const [signals, setSignals] = useState<StrategySignalRow[]>([]);
  const [holdingsRefreshing, setHoldingsRefreshing] = useState(false);
  const [holdingsMarket, setHoldingsMarket] = useState<Market>('KR');
  const rankingCardRef = useRef<RankingCardHandle>(null);
  const [holdingsTableWrapRef, holdingsTableWrapHeight] = useMeasuredHeight<HTMLDivElement>();

  const loadDashboard = useCallback(async () => {
    setError(null);
    try {
      const [accountList, strategyList, signalList] = await Promise.all([
        api.listAccounts(),
        api.listStrategies(),
        api.listSignals(10),
      ]);
      setAccounts(Array.isArray(accountList) ? accountList : []);
      setStrategies(Array.isArray(strategyList) ? strategyList : []);
      setSignals(Array.isArray(signalList) ? signalList : []);

      if (Array.isArray(accountList) && accountList[0]) {
        const summary = await api.getHoldings(String(accountList[0].accountSeq));
        setHoldingsSummary(summary);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '대시보드 정보를 불러오지 못했습니다.');
    }
  }, []);

  const refreshHoldings = useCallback(async () => {
    const account = accounts[0];
    if (!account) return;
    setHoldingsRefreshing(true);
    try {
      const summary = await api.getHoldings(String(account.accountSeq));
      setHoldingsSummary(summary);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '보유 종목 정보를 불러오지 못했습니다.');
    } finally {
      setHoldingsRefreshing(false);
    }
  }, [accounts]);

  // 보유 종목/주식 랭킹 중 어느 쪽 새로고침을 눌러도 둘 다 새로고침되도록 맞춘다.
  const handleHoldingsRefreshClick = useCallback(() => {
    refreshHoldings();
    rankingCardRef.current?.refresh();
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

  const activeStrategies = strategies.filter((s) => s.is_active);
  const holdings = holdingsSummary?.items ?? [];
  const profitLossKrw = holdingsSummary ? Number(holdingsSummary.profitLoss.amount.krw) : 0;

  const sortByProfitRateDesc = (list: Holding[]) =>
    [...list].sort((a, b) => Number(b.profitLoss.rate) - Number(a.profitLoss.rate));
  const krHoldings = sortByProfitRateDesc(holdings.filter((h) => h.marketCountry === 'KR'));
  const usHoldings = sortByProfitRateDesc(holdings.filter((h) => h.marketCountry === 'US'));

  const holdingColumns: ColumnsType<Holding> = [
    {
      title: '종목',
      dataIndex: 'name',
      width: 170,
      render: (value: string, record) => <StockCell name={value} symbol={record.symbol} />,
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

        <Row gutter={16} style={{ marginBottom: 16, flex: 'none' }}>
          <Col span={6}>
            <Card>
              <Statistic title="등록 계좌 수" value={accounts.length} suffix="개" />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic
                title="감시 중인 전략"
                value={activeStrategies.length}
                suffix={`/ ${strategies.length}개`}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic title="최근 알림" value={signals.length} suffix="건" />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic
                title="평가손익 (원화 보유분)"
                value={holdingsSummary ? formatKrw(holdingsSummary.profitLoss.amount.krw) : '-'}
                suffix={holdingsSummary ? formatRate(holdingsSummary.profitLoss.rate) : undefined}
                styles={{ content: { color: profitColor(profitLossKrw) } }}
              />
            </Card>
          </Col>
        </Row>

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
                options={[
                  { label: '국내', value: 'KR' },
                  { label: '해외', value: 'US' },
                ]}
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
            <RankingCard ref={rankingCardRef} onRefresh={refreshHoldings} />
          </Col>
        </Row>
      </div>
    </AppLayout>
  );
}

import { useCallback, useEffect, useState } from 'react';
import Head from 'next/head';
import { Alert, App, Badge, Button, Card, Col, Row, Statistic, Table, Tabs, Tag, Typography } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import AppLayout from '../components/AppLayout';
import StockLogo from '../components/StockLogo';
import { api, onStrategySignal } from '../lib/ipc';
import { currencySymbol, formatAmount, formatRate, profitColor } from '../lib/format';
import type { AccountSummary, Holding, HoldingsSummary, StrategyRow, StrategySignalRow } from '../lib/ipc';

const { Text } = Typography;

function signalColor(signal: string): string {
  if (signal === 'BUY') return 'green';
  if (signal === 'SELL') return 'red';
  return 'default';
}

function formatKrw(value: string): string {
  return `${Math.round(Number(value)).toLocaleString()}원`;
}

export default function HomePage() {
  const { notification } = App.useApp();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<AccountSummary[]>([]);
  const [holdingsSummary, setHoldingsSummary] = useState<HoldingsSummary | null>(null);
  const [strategies, setStrategies] = useState<StrategyRow[]>([]);
  const [signals, setSignals] = useState<StrategySignalRow[]>([]);
  const [holdingsRefreshing, setHoldingsRefreshing] = useState(false);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
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
    } finally {
      setLoading(false);
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
      render: (value: string, record) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <StockLogo symbol={record.symbol} />
          <div style={{ minWidth: 0 }}>
            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={value}>
              {value}
            </div>
            <Text type="secondary" style={{ fontSize: 12 }}>
              ({record.symbol})
            </Text>
          </div>
        </div>
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
          <div>
            <div style={{ color: profitColor(dailyChangePerShare) }}>
              {currencySymbol(record.currency)}
              {Number(value).toLocaleString()}
            </div>
            <Text style={{ color: profitColor(dailyChangePerShare) }}>
              {formatAmount(dailyChangePerShare)}({formatRate(record.dailyProfitLoss.rate)})
            </Text>
          </div>
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
          <div>
            <div style={{ color: profitColor(amount) }}>
              {currencySymbol(record.currency)}
              {formatAmount(value.amount)}
            </div>
            <Text style={{ color: profitColor(amount) }}>{formatRate(value.rate)}</Text>
          </div>
        );
      },
    },
  ];

  return (
    <AppLayout title="대시보드">
      <Head>
        <title>대시보드 - 토스증권 알림</title>
      </Head>

      {error && <Alert type="error" message={error} showIcon closable style={{ marginBottom: 16 }} />}

      <Row gutter={16} style={{ marginBottom: 16 }}>
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

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={12}>
          <Card
            title="보유 종목"
            extra={
              <Button
                type="text"
                size="small"
                icon={<ReloadOutlined spin={holdingsRefreshing} />}
                onClick={refreshHoldings}
                disabled={accounts.length === 0}
              />
            }
            style={{ marginBottom: 16, minWidth: 450 }}
          >
            <Tabs
              items={[
                {
                  key: 'kr',
                  label: '국내주식',
                  children: (
                    <Table<Holding>
                      size="small"
                      rowKey="symbol"
                      loading={loading}
                      pagination={false}
                      tableLayout="fixed"
                      dataSource={krHoldings}
                      locale={{
                        emptyText: accounts.length
                          ? '보유 종목이 없습니다.'
                          : '계좌 정보를 불러오는 중입니다.',
                      }}
                      columns={holdingColumns}
                    />
                  ),
                },
                {
                  key: 'us',
                  label: '해외주식',
                  children: (
                    <Table<Holding>
                      size="small"
                      rowKey="symbol"
                      loading={loading}
                      pagination={false}
                      tableLayout="fixed"
                      dataSource={usHoldings}
                      locale={{
                        emptyText: accounts.length
                          ? '보유 종목이 없습니다.'
                          : '계좌 정보를 불러오는 중입니다.',
                      }}
                      columns={holdingColumns}
                    />
                  ),
                },
              ]}
            />
          </Card>

          <Card title="감시 중인 전략">
            <Table<StrategyRow>
              size="small"
              rowKey="id"
              loading={loading}
              pagination={false}
              dataSource={activeStrategies}
              locale={{ emptyText: '등록된 전략이 없습니다. 전략 화면에서 추가하세요.' }}
              columns={[
                { title: '이름', dataIndex: 'name' },
                { title: '종목', dataIndex: 'symbol' },
                { title: '유형', dataIndex: 'strategy_type' },
                { title: '상태', render: () => <Badge status="processing" text="감시중" /> },
              ]}
            />
          </Card>
        </Col>

        <Col xs={24} xl={12}>
          <Card title="최근 알림">
            <Table<StrategySignalRow>
              size="small"
              rowKey="id"
              loading={loading}
              pagination={false}
              dataSource={signals}
              locale={{ emptyText: '아직 발생한 신호가 없습니다.' }}
              columns={[
                {
                  title: '시각',
                  dataIndex: 'created_at',
                  render: (value: string) => (
                    <Text type="secondary">{new Date(value).toLocaleString('ko-KR')}</Text>
                  ),
                },
                {
                  title: '신호',
                  dataIndex: 'signal',
                  render: (value: string) => <Tag color={signalColor(value)}>{value}</Tag>,
                },
                { title: '가격', dataIndex: 'price', align: 'right' },
                { title: '근거', dataIndex: 'reason', ellipsis: true },
              ]}
            />
          </Card>
        </Col>
      </Row>
    </AppLayout>
  );
}

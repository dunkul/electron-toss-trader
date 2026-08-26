import { useCallback, useEffect, useState } from 'react';
import Head from 'next/head';
import { Alert, App, Badge, Card, Col, Row, Statistic, Table, Tag, Typography } from 'antd';
import AppLayout from '../components/AppLayout';
import { api, onStrategySignal } from '../lib/ipc';
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

function formatRate(rate: string): string {
  return `${(Number(rate) * 100).toFixed(2)}%`;
}

export default function HomePage() {
  const { notification } = App.useApp();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<AccountSummary[]>([]);
  const [holdingsSummary, setHoldingsSummary] = useState<HoldingsSummary | null>(null);
  const [strategies, setStrategies] = useState<StrategyRow[]>([]);
  const [signals, setSignals] = useState<StrategySignalRow[]>([]);

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
              valueStyle={{ color: profitLossKrw >= 0 ? '#cf1322' : '#1b7a3d' }}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col span={12}>
          <Card title="보유 종목" style={{ marginBottom: 16 }}>
            <Table<Holding>
              size="small"
              rowKey="symbol"
              loading={loading}
              pagination={false}
              dataSource={holdings}
              locale={{
                emptyText: accounts.length ? '보유 종목이 없습니다.' : '계좌 정보를 불러오는 중입니다.',
              }}
              columns={[
                {
                  title: '종목',
                  dataIndex: 'name',
                  render: (value: string, record) => (
                    <span>
                      {value} <Text type="secondary">({record.symbol})</Text>
                    </span>
                  ),
                },
                {
                  title: '수량',
                  dataIndex: 'quantity',
                  align: 'right',
                  render: (value: string) =>
                    Number(value).toLocaleString(undefined, { maximumFractionDigits: 4 }),
                },
                {
                  title: '현재가',
                  dataIndex: 'lastPrice',
                  align: 'right',
                  render: (value: string, record) => `${Number(value).toLocaleString()} ${record.currency}`,
                },
                {
                  title: '평가손익률',
                  dataIndex: 'profitLoss',
                  align: 'right',
                  render: (value: Holding['profitLoss']) => {
                    const rate = Number(value.rate);
                    return <Text type={rate >= 0 ? 'danger' : 'success'}>{formatRate(value.rate)}</Text>;
                  },
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

        <Col span={12}>
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

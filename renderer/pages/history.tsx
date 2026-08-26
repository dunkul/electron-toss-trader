import { useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import { Button, Card, Segmented, Table, Tag, Typography } from 'antd';
import AppLayout from '../components/AppLayout';
import { api } from '../lib/ipc';
import type { StrategyRow, StrategySignalRow } from '../lib/ipc';

const { Text } = Typography;

function signalColor(signal: string): string {
  if (signal === 'BUY') return 'green';
  if (signal === 'SELL') return 'red';
  return 'default';
}

function toCsv(rows: StrategySignalRow[], strategyNameById: Map<number, string>): string {
  const header = ['시각', '전략', '신호', '가격', '알림여부', '근거'];
  const lines = rows.map((row) =>
    [
      row.created_at,
      strategyNameById.get(row.strategy_id) ?? row.strategy_id,
      row.signal,
      row.price ?? '',
      row.notified ? 'Y' : 'N',
      (row.reason ?? '').replaceAll(',', ' '),
    ].join(','),
  );
  return [header.join(','), ...lines].join('\n');
}

export default function HistoryPage() {
  const [signals, setSignals] = useState<StrategySignalRow[]>([]);
  const [strategies, setStrategies] = useState<StrategyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'ALL' | 'BUY' | 'SELL'>('ALL');

  useEffect(() => {
    (async () => {
      try {
        const [signalList, strategyList] = await Promise.all([api.listSignals(200), api.listStrategies()]);
        setSignals(signalList);
        setStrategies(strategyList);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const strategyNameById = useMemo(() => new Map(strategies.map((s) => [s.id, s.name])), [strategies]);

  const filtered = useMemo(
    () => (filter === 'ALL' ? signals : signals.filter((s) => s.signal === filter)),
    [signals, filter],
  );

  const handleExport = () => {
    const csv = toCsv(filtered, strategyNameById);
    const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `signals-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AppLayout title="알림 내역">
      <Head>
        <title>알림 내역 - 토스증권 알림</title>
      </Head>

      <Card
        style={{ marginBottom: 16 }}
        title={
          <Segmented
            value={filter}
            onChange={(value) => setFilter(value as typeof filter)}
            options={[
              { label: '전체', value: 'ALL' },
              { label: 'BUY', value: 'BUY' },
              { label: 'SELL', value: 'SELL' },
            ]}
          />
        }
        extra={
          <Button onClick={handleExport} disabled={filtered.length === 0}>
            CSV 내보내기
          </Button>
        }
      >
        <Table<StrategySignalRow>
          rowKey="id"
          loading={loading}
          dataSource={filtered}
          locale={{ emptyText: '아직 발생한 신호가 없습니다.' }}
          columns={[
            {
              title: '시각',
              dataIndex: 'created_at',
              render: (value: string) => new Date(value).toLocaleString('ko-KR'),
            },
            {
              title: '전략',
              dataIndex: 'strategy_id',
              render: (value: number) => strategyNameById.get(value) ?? `#${value}`,
            },
            {
              title: '신호',
              dataIndex: 'signal',
              render: (value: string) => <Tag color={signalColor(value)}>{value}</Tag>,
            },
            { title: '가격', dataIndex: 'price', align: 'right' },
            {
              title: '알림',
              dataIndex: 'notified',
              render: (value: 0 | 1) =>
                value ? <Text type="success">발송됨</Text> : <Text type="secondary">쿨다운 스킵</Text>,
            },
            { title: '근거', dataIndex: 'reason', ellipsis: true },
          ]}
        />
      </Card>
    </AppLayout>
  );
}

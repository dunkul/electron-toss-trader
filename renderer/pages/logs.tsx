import { useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import { Card, Select, Table, Tag } from 'antd';
import AppLayout from '../components/AppLayout';
import { api } from '../lib/ipc';
import type { SystemLogRow } from '../lib/ipc';

function levelColor(level: string): string {
  if (level === 'ERROR') return 'red';
  if (level === 'WARN') return 'orange';
  return 'blue';
}

export default function LogsPage() {
  const [logs, setLogs] = useState<SystemLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [levelFilter, setLevelFilter] = useState<string>('ALL');

  useEffect(() => {
    api
      .listLogs(200)
      .then(setLogs)
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(
    () => (levelFilter === 'ALL' ? logs : logs.filter((log) => log.level === levelFilter)),
    [logs, levelFilter],
  );

  return (
    <AppLayout>
      <Head>
        <title>로그 - 토스 트레이더</title>
      </Head>

      <Card
        title={
          <Select
            value={levelFilter}
            onChange={setLevelFilter}
            style={{ width: 160 }}
            options={[
              { value: 'ALL', label: '전체' },
              { value: 'ERROR', label: 'ERROR' },
              { value: 'WARN', label: 'WARN' },
              { value: 'INFO', label: 'INFO' },
            ]}
          />
        }
      >
        <Table<SystemLogRow>
          rowKey="id"
          loading={loading}
          dataSource={filtered}
          locale={{ emptyText: '로그가 없습니다.' }}
          columns={[
            {
              title: '시각',
              dataIndex: 'created_at',
              render: (value: string) => new Date(value).toLocaleString('ko-KR'),
            },
            {
              title: '레벨',
              dataIndex: 'level',
              render: (value: string) => <Tag color={levelColor(value)}>{value}</Tag>,
            },
            { title: '소스', dataIndex: 'source' },
            { title: '메시지', dataIndex: 'message' },
          ]}
        />
      </Card>
    </AppLayout>
  );
}

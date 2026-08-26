import { useState } from 'react';
import Head from 'next/head';
import { Alert, App, Button, Card, Descriptions, Space, Typography } from 'antd';
import AppLayout from '../components/AppLayout';
import { api } from '../lib/ipc';
import type { StocksStatus } from '../lib/ipc';

const { Paragraph, Text } = Typography;

export default function SettingsPage() {
  const { message } = App.useApp();
  const [testingApi, setTestingApi] = useState(false);
  const [apiStatus, setApiStatus] = useState<'idle' | 'ok' | 'error'>('idle');
  const [apiError, setApiError] = useState<string | null>(null);

  const [stocksStatus, setStocksStatus] = useState<StocksStatus | null>(null);
  const [loadingStocks, setLoadingStocks] = useState(false);

  const handleTestApi = async () => {
    setTestingApi(true);
    setApiError(null);
    try {
      const accounts = await api.listAccounts();
      setApiStatus('ok');
      message.success(`API 연결 성공 (계좌 ${accounts.length}개 조회됨)`);
    } catch (err) {
      setApiStatus('error');
      setApiError(err instanceof Error ? err.message : String(err));
    } finally {
      setTestingApi(false);
    }
  };

  const handleLoadStocksStatus = async () => {
    setLoadingStocks(true);
    try {
      setStocksStatus(await api.getStocksStatus());
    } finally {
      setLoadingStocks(false);
    }
  };

  const handleRefreshStocks = async () => {
    setLoadingStocks(true);
    try {
      setStocksStatus(await api.refreshStocks());
      message.success('종목 캐시를 새로 동기화했습니다.');
    } catch (err) {
      message.error(err instanceof Error ? err.message : '종목 캐시 동기화에 실패했습니다.');
    } finally {
      setLoadingStocks(false);
    }
  };

  const handleTestNotification = async () => {
    await api.testNotification();
    message.success('테스트 알림을 보냈습니다.');
  };

  return (
    <AppLayout title="설정">
      <Head>
        <title>설정 - 토스증권 알림</title>
      </Head>

      <Card title="Open API 연결" style={{ marginBottom: 16 }}>
        <Paragraph type="secondary">
          현재 <code>client_id</code>/<code>client_secret</code>는 프로젝트 루트의 <code>.env</code> 파일에서
          읽습니다. 앱 화면에서 직접 등록/암호화 저장하는 기능은 아직 제공되지 않습니다 — 값을 바꾼 뒤에는
          앱을 재시작하세요.
        </Paragraph>
        <Space>
          <Button onClick={handleTestApi} loading={testingApi}>
            API 연결 테스트
          </Button>
          {apiStatus === 'ok' && <Text type="success">정상</Text>}
        </Space>
        {apiError && <Alert style={{ marginTop: 12 }} type="error" showIcon message={apiError} />}
      </Card>

      <Card title="종목 캐시" style={{ marginBottom: 16 }}>
        <Paragraph type="secondary">
          전체 종목 목록은 하루 배치로만 갱신되는 데이터라, 앱이 하루 1회 자동으로 동기화해 종목 검색에
          사용합니다.
        </Paragraph>
        <Space style={{ marginBottom: 12 }}>
          <Button onClick={handleLoadStocksStatus} loading={loadingStocks}>
            상태 새로고침
          </Button>
          <Button onClick={handleRefreshStocks} loading={loadingStocks}>
            지금 다시 동기화
          </Button>
        </Space>
        {stocksStatus && (
          <Descriptions column={2} size="small">
            <Descriptions.Item label="캐시된 종목 수">
              {stocksStatus.count.toLocaleString()}개
            </Descriptions.Item>
            <Descriptions.Item label="마지막 동기화">
              {stocksStatus.lastSyncedAt
                ? new Date(stocksStatus.lastSyncedAt).toLocaleString('ko-KR')
                : '없음'}
            </Descriptions.Item>
          </Descriptions>
        )}
      </Card>

      <Card title="알림">
        <Button onClick={handleTestNotification}>테스트 알림 보내기</Button>
      </Card>
    </AppLayout>
  );
}

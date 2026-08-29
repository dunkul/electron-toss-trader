import { useEffect, useState } from 'react';
import Head from 'next/head';
import { Alert, App, Button, Card, Descriptions, Input, Space, Typography } from 'antd';
import AppLayout from '../components/AppLayout';
import { api } from '../lib/ipc';
import type { StocksStatus } from '../lib/ipc';

const { Paragraph, Text } = Typography;

// 전략엔진/시세 WS 클라이언트가 새 자격증명으로 깨끗하게 다시 초기화되도록 앱을 재시작하는데,
// 성공 메시지를 사용자가 읽을 시간을 준 뒤에 재시작한다.
const RELAUNCH_DELAY_MS = 1200;

export default function SettingsPage() {
  const { message } = App.useApp();

  const [configured, setConfigured] = useState<boolean | null>(null);
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [testingApi, setTestingApi] = useState(false);
  const [apiStatus, setApiStatus] = useState<'idle' | 'ok' | 'error'>('idle');
  const [apiError, setApiError] = useState<string | null>(null);

  const [stocksStatus, setStocksStatus] = useState<StocksStatus | null>(null);
  const [loadingStocks, setLoadingStocks] = useState(false);

  useEffect(() => {
    api.getCredentialsStatus().then((status) => setConfigured(status.configured));
  }, []);

  const handleSaveCredentials = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      await api.saveCredentials(clientId.trim(), clientSecret.trim());
      message.success('연결에 성공했습니다. 새 설정을 적용하기 위해 앱을 재시작합니다...');
      setClientId('');
      setClientSecret('');
      setTimeout(() => api.relaunchApp(), RELAUNCH_DELAY_MS);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

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
    <AppLayout>
      <Head>
        <title>설정 - 토스 트레이더</title>
      </Head>

      <Card title="Toss Open API 연결" style={{ marginBottom: 16 }}>
        {configured === false && (
          <Alert
            style={{ marginBottom: 16 }}
            type="warning"
            showIcon
            title="아직 Open API 연결이 설정되지 않았습니다"
            description="토스증권 WTS에서 발급받은 client_id/client_secret을 입력하고 연결 테스트를 통과해야 다른 탭을 사용할 수 있습니다."
          />
        )}
        {configured === true && (
          <Alert
            style={{ marginBottom: 16 }}
            type="success"
            showIcon
            title="Toss Open API 연결이 설정되어 있습니다"
            description="값을 변경하려면 아래에 새 client_id/client_secret을 입력하고 저장하세요."
          />
        )}

        <Space orientation="vertical" style={{ width: '100%', maxWidth: 420 }}>
          <div>
            <Text strong>Client ID</Text>
            <Input.Password
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder={configured ? '변경하려면 새 값을 입력하세요' : 'client_id 입력'}
              autoComplete="off"
            />
          </div>
          <div>
            <Text strong>Client Secret</Text>
            <Input.Password
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
              placeholder={configured ? '변경하려면 새 값을 입력하세요' : 'client_secret 입력'}
              autoComplete="off"
            />
          </div>
          <Button
            type="primary"
            onClick={handleSaveCredentials}
            loading={saving}
            disabled={!clientId.trim() || !clientSecret.trim()}
          >
            저장 및 연결 테스트
          </Button>
        </Space>
        {saveError && <Alert style={{ marginTop: 12 }} type="error" showIcon title={saveError} />}

        {configured === true && (
          <>
            <Paragraph type="secondary" style={{ marginTop: 24, marginBottom: 8 }}>
              현재 저장된 값으로 연결이 살아있는지 다시 확인합니다.
            </Paragraph>
            <Space>
              <Button onClick={handleTestApi} loading={testingApi}>
                저장된 연결 테스트
              </Button>
              {apiStatus === 'ok' && <Text type="success">정상</Text>}
            </Space>
            {apiError && <Alert style={{ marginTop: 12 }} type="error" showIcon title={apiError} />}
          </>
        )}
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

      <Card title="알림" style={{ marginBottom: 16 }}>
        <Button onClick={handleTestNotification}>테스트 알림 보내기</Button>
      </Card>

      <Card title="정보">
        <Paragraph>
          문의사항은{' '}
          <Text copyable strong>
            tom@xingxing.kr
          </Text>{' '}
          으로 보내주세요.
        </Paragraph>
        <Paragraph type="secondary">
          이 프로젝트는 개인적으로 만든 소프트웨어이며, 상업적 이용·재배포를 허용하지 않습니다.
        </Paragraph>
        <Paragraph type="secondary" style={{ marginBottom: 0 }}>
          이 프로그램을 사용하면서 발생하는 모든 일에 대한 책임은 사용자 본인에게 있습니다.
        </Paragraph>
      </Card>
    </AppLayout>
  );
}

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import {
  BellOutlined,
  DashboardOutlined,
  FileTextOutlined,
  LineChartOutlined,
  SettingOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { Layout, Menu } from 'antd';
import { api } from '../lib/ipc';

const { Sider, Content } = Layout;

const SETTINGS_KEY = '/settings';

// Next.js pages router에서는 탭을 옮길 때마다 이 컴포넌트가 통째로 다시 마운트된다 — 매번 IPC로
// 다시 물어보고 그 응답을 기다리는 동안 null(잠금) 상태를 거치면 탭을 누를 때마다 메뉴가 잠깐
// 비활성화됐다가 활성화되는 것처럼 깜빡인다. 모듈 스코프에 캐시해두고, 이미 확인된 값이 있으면
// 마운트 시점에 바로 그 값으로 시작해서 깜빡임 없이 렌더링한다.
let credentialsStatusCache: boolean | null = null;

const NAV_ITEMS = [
  { key: '/home', label: '대시보드', icon: <DashboardOutlined /> },
  { key: '/market', label: '시세/차트', icon: <LineChartOutlined /> },
  { key: '/strategies', label: '전략(알림 조건)', icon: <ThunderboltOutlined /> },
  { key: '/history', label: '알림 내역', icon: <BellOutlined /> },
  { key: '/logs', label: '로그', icon: <FileTextOutlined /> },
  { key: SETTINGS_KEY, label: '설정', icon: <SettingOutlined /> },
];

export default function AppLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  // null = 아직 확인 전. 확인 전/미설정 상태에서는 설정 탭 외 다른 탭을 막는다 — 처음 실행이거나
  // client_id/secret이 아직 저장되어 있지 않은 경우 바로 설정 탭으로 보낸다.
  const [configured, setConfigured] = useState<boolean | null>(credentialsStatusCache);

  useEffect(() => {
    if (credentialsStatusCache !== null) {
      if (!credentialsStatusCache && router.pathname !== SETTINGS_KEY) {
        router.replace(SETTINGS_KEY);
      }
      return;
    }

    let cancelled = false;
    api.getCredentialsStatus().then((status) => {
      credentialsStatusCache = status.configured;
      if (cancelled) return;
      setConfigured(status.configured);
      if (!status.configured && router.pathname !== SETTINGS_KEY) {
        router.replace(SETTINGS_KEY);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [router]);

  const locked = configured !== true;

  return (
    // height(고정)로 줘야 아래 Content가 뷰포트에 맞게 눌려서 overflow:auto가 실제로 작동한다
    // (minHeight였다면 내용이 넘칠 때 이 Layout 자체가 늘어나 버려 문서 전체가 스크롤된다).
    <Layout style={{ height: '100vh' }}>
      <Sider theme="light" width={220}>
        <div
          style={{
            height: 56,
            display: 'flex',
            alignItems: 'center',
            paddingLeft: 20,
            fontWeight: 700,
            fontSize: 15,
          }}
        >
          토스 트레이더
        </div>
        <Menu
          mode="inline"
          selectedKeys={[router.pathname]}
          items={NAV_ITEMS.map((item) => {
            const disabled = locked && item.key !== SETTINGS_KEY;
            return {
              key: item.key,
              icon: item.icon,
              disabled,
              label: disabled ? item.label : <Link href={item.key}>{item.label}</Link>,
            };
          })}
        />
      </Sider>
      <Layout>
        <Content style={{ padding: 24, overflow: 'auto' }}>{children}</Content>
      </Layout>
    </Layout>
  );
}

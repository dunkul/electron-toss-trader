import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import {
  BellOutlined,
  DashboardOutlined,
  DoubleLeftOutlined,
  DoubleRightOutlined,
  FileTextOutlined,
  LineChartOutlined,
  SettingOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { Button, Layout, Menu } from 'antd';
import { api } from '../lib/ipc';

const { Sider, Content } = Layout;

const SETTINGS_KEY = '/settings';

// Next.js pages router에서는 탭을 옮길 때마다 이 컴포넌트가 통째로 다시 마운트된다 — 매번 IPC로
// 다시 물어보고 그 응답을 기다리는 동안 null(잠금) 상태를 거치면 탭을 누를 때마다 메뉴가 잠깐
// 비활성화됐다가 활성화되는 것처럼 깜빡인다. 모듈 스코프에 캐시해두고, 이미 확인된 값이 있으면
// 마운트 시점에 바로 그 값으로 시작해서 깜빡임 없이 렌더링한다.
let credentialsStatusCache: boolean | null = null;

// 위와 같은 이유로 축소 상태도 모듈 스코프에 캐시한다 — 탭 이동 시 재마운트되면서 매번 펼쳐진
// 상태로 돌아가 버리는 것을 막는다. localStorage에도 반영해 앱을 껐다 켜도 유지되게 한다.
const SIDER_COLLAPSED_STORAGE_KEY = 'lnb-collapsed';
let collapsedCache: boolean | null = null;

function readInitialCollapsed(): boolean {
  if (collapsedCache !== null) return collapsedCache;
  collapsedCache = typeof window !== 'undefined' && window.localStorage.getItem(SIDER_COLLAPSED_STORAGE_KEY) === '1';
  return collapsedCache;
}

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
  const [collapsed, setCollapsed] = useState<boolean>(readInitialCollapsed);

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

  const handleCollapse = (next: boolean) => {
    collapsedCache = next;
    setCollapsed(next);
    window.localStorage.setItem(SIDER_COLLAPSED_STORAGE_KEY, next ? '1' : '0');
  };

  return (
    // height(고정)로 줘야 아래 Content가 뷰포트에 맞게 눌려서 overflow:auto가 실제로 작동한다
    // (minHeight였다면 내용이 넘칠 때 이 Layout 자체가 늘어나 버려 문서 전체가 스크롤된다).
    <Layout style={{ height: '100vh' }}>
      <Sider theme="light" width={220} collapsed={collapsed} trigger={null} style={{ position: 'relative' }}>
        <Button
          type="default"
          shape="circle"
          size="small"
          aria-label={collapsed ? '메뉴 펼치기' : '메뉴 접기'}
          onClick={() => handleCollapse(!collapsed)}
          icon={collapsed ? <DoubleRightOutlined style={{ fontSize: 11 }} /> : <DoubleLeftOutlined style={{ fontSize: 11 }} />}
          style={{
            position: 'absolute',
            top: 15,
            right: -13,
            zIndex: 10,
            boxShadow: '0 1px 4px rgba(0, 0, 0, 0.15)',
          }}
        />
        <div
          style={{
            height: 56,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            paddingLeft: 20,
            fontWeight: 700,
            fontSize: 15,
          }}
        >
          <img src="/images/toss-trader.png" alt="" width={34} height={34} style={{ borderRadius: 8 }} />
          <span
            style={{
              display: 'inline-block',
              overflow: 'hidden',
              whiteSpace: 'nowrap',
              maxWidth: collapsed ? 0 : 140,
              opacity: collapsed ? 0 : 1,
              transition: 'max-width 0.2s, opacity 0.2s',
            }}
          >
            토스 트레이더
          </span>
        </div>
        <Menu
          mode="inline"
          inlineCollapsed={collapsed}
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

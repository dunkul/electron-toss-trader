import type { ReactNode } from 'react';
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

const { Sider, Header, Content } = Layout;

const NAV_ITEMS = [
  { key: '/home', label: '대시보드', icon: <DashboardOutlined /> },
  { key: '/market', label: '시세/차트', icon: <LineChartOutlined /> },
  { key: '/strategies', label: '전략(알림 조건)', icon: <ThunderboltOutlined /> },
  { key: '/history', label: '알림 내역', icon: <BellOutlined /> },
  { key: '/logs', label: '로그', icon: <FileTextOutlined /> },
  { key: '/settings', label: '설정', icon: <SettingOutlined /> },
];

/** 모든 페이지의 공통 레이아웃(사이드바+헤더). `<AppLayout title="...">{내용}</AppLayout>` 형태로 감싸 쓴다. */
export default function AppLayout({ children, title }: { children: ReactNode; title: string }) {
  const router = useRouter();

  return (
    <Layout style={{ minHeight: '100vh' }}>
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
          토스증권 알림
        </div>
        <Menu
          mode="inline"
          selectedKeys={[router.pathname]}
          items={NAV_ITEMS.map((item) => ({
            key: item.key,
            icon: item.icon,
            label: <Link href={item.key}>{item.label}</Link>,
          }))}
        />
      </Sider>
      <Layout>
        <Header
          style={{
            background: '#fff',
            padding: '0 24px',
            display: 'flex',
            alignItems: 'center',
            borderBottom: '1px solid #f0f0f0',
          }}
        >
          <h1 style={{ fontSize: 16, margin: 0, fontWeight: 600 }}>{title}</h1>
        </Header>
        <Content style={{ padding: 24, overflow: 'auto' }}>{children}</Content>
      </Layout>
    </Layout>
  );
}

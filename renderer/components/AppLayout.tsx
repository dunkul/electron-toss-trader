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

const { Sider, Content } = Layout;

const NAV_ITEMS = [
  { key: '/home', label: '대시보드', icon: <DashboardOutlined /> },
  { key: '/market', label: '시세/차트', icon: <LineChartOutlined /> },
  { key: '/strategies', label: '전략(알림 조건)', icon: <ThunderboltOutlined /> },
  { key: '/history', label: '알림 내역', icon: <BellOutlined /> },
  { key: '/logs', label: '로그', icon: <FileTextOutlined /> },
  { key: '/settings', label: '설정', icon: <SettingOutlined /> },
];

export default function AppLayout({ children }: { children: ReactNode }) {
  const router = useRouter();

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
          items={NAV_ITEMS.map((item) => ({
            key: item.key,
            icon: item.icon,
            label: <Link href={item.key}>{item.label}</Link>,
          }))}
        />
      </Sider>
      <Layout>
        <Content style={{ padding: 24, overflow: 'auto' }}>{children}</Content>
      </Layout>
    </Layout>
  );
}

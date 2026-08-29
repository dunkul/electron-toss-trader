import type { ReactNode } from 'react';
import Head from 'next/head';
import { Empty } from 'antd';
import type { ChartWindowStock } from '../lib/ipc';

/**
 * 차트/일별시세 팝업 창(AppLayout 없이 창 전체를 채우는 단일 카드) 공통 뼈대. stock이 아직
 * 없으면(usePopupWindowStock이 쿼리스트링/갱신 이벤트 중 아무것도 못 받은 순간) 안내만 보여준다.
 */
export default function PopupWindowShell({
  stock,
  title,
  children,
}: {
  stock: ChartWindowStock | null;
  title: (stock: ChartWindowStock) => string;
  children: ReactNode;
}) {
  if (!stock) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Empty description="종목 정보를 불러오지 못했습니다." />
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>{title(stock)}</title>
      </Head>
      <div style={{ height: '100vh', padding: 16 }}>{children}</div>
    </>
  );
}

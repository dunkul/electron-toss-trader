import { useEffect, useRef, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { Empty } from 'antd';
import DailyPricesCard from '../components/DailyPricesCard';
import { onDailyPricesWindowUpdate } from '../lib/ipc';
import type { ChartWindowStock } from '../lib/ipc';

// 주식 랭킹 등의 우클릭 메뉴에서 "일별시세"를 고르면 main.ts가 이 페이지를 별도 BrowserWindow로
// 띄운다(symbol/name/market을 쿼리스트링으로 전달). chart-window.tsx와 동일한 구조 —
// AppLayout(사이드바) 없이 DailyPricesCard 하나만 창 전체를 채운다.
//
// 이 창이 이미 떠 있는 상태에서 다른 종목을 또 고르면 main.ts는 새 창을 띄우는 대신 이 창에
// WINDOW_DAILY_PRICES_UPDATE_EVENT를 보낸다 — chart-window.tsx와 같은 이유로, 최초 쿼리스트링
// 값과 이후 이벤트 사이의 순서를 stockSetRef로 보장한다.
export default function DailyPricesWindowPage() {
  const router = useRouter();
  const { symbol, name, market } = router.query;
  const [stock, setStock] = useState<ChartWindowStock | null>(null);
  const stockSetRef = useRef(false);

  useEffect(() => {
    if (stockSetRef.current) return;
    if (typeof symbol === 'string' && typeof name === 'string' && typeof market === 'string') {
      stockSetRef.current = true;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 최초 진입 시 쿼리스트링에서 1회 초기화
      setStock({ symbol, name, market: market as ChartWindowStock['market'] });
    }
  }, [symbol, name, market]);

  useEffect(
    () =>
      onDailyPricesWindowUpdate((next) => {
        stockSetRef.current = true;
        setStock(next);
      }),
    [],
  );

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
        <title>{stock.name} 일별시세 - 토스 트레이더</title>
      </Head>
      <div style={{ height: '100vh', padding: 16 }}>
        <DailyPricesCard stock={stock} />
      </div>
    </>
  );
}

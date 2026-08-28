import { useEffect, useRef, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { Empty } from 'antd';
import ChartCard from '../components/ChartCard';
import { onChartWindowUpdate, type ChartWindowStock } from '../lib/ipc';

// 대시보드 주식 랭킹 등에서 종목을 클릭하면 main.ts가 이 페이지를 별도 BrowserWindow로 띄운다
// (symbol/name/market을 쿼리스트링으로 전달). AppLayout(사이드바) 없이 ChartCard 하나만
// 창 전체를 채우며, 실시간 갱신은 ChartCard가 useMarketSubscription으로 스스로 구독한다.
//
// 이 창이 이미 떠 있는 상태에서 다른 종목을 또 클릭하면 main.ts는 새 창을 띄우는 대신 이
// 창에 WINDOW_CHART_UPDATE_EVENT를 보낸다 — 최초 진입 시의 쿼리스트링 값은 시작 종목일
// 뿐이라, 그 이후 표시할 종목은 별도 state로 들고 있다가 이 이벤트로 갈아끼운다.
export default function ChartWindowPage() {
  const router = useRouter();
  const { symbol, name, market } = router.query;
  const [stock, setStock] = useState<ChartWindowStock | null>(null);
  // 이 창은 같은 URL로 다시 내비게이션하지 않으므로 쿼리스트링은 항상 "최초 로드 종목" 그대로
  // 고정이다 — router.query가 언제 채워지는지와 WINDOW_CHART_UPDATE_EVENT(다른 종목)가
  // 언제 도착하는지 사이에 순서 보장이 없어서, 이벤트가 먼저 stock을 세팅한 뒤에 이 쿼리
  // 초기화 effect가 뒤늦게 실행되면 오래된 쿼리스트링 값으로 되돌려버릴 수 있다 — 그래서
  // "누가 먼저든 한 번 세팅되면 그 뒤로는 쿼리 effect가 절대 덮어쓰지 않는다"를 ref로 보장한다.
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
      onChartWindowUpdate((next) => {
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
        <title>{stock.name} - 토스 트레이더</title>
      </Head>
      <div style={{ height: '100vh', padding: 16 }}>
        <ChartCard stock={stock} />
      </div>
    </>
  );
}

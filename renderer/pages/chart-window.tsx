import ChartCard from '../components/ChartCard';
import PopupWindowShell from '../components/PopupWindowShell';
import { usePopupWindowStock } from '../hooks/usePopupWindowStock';
import { onChartWindowUpdate } from '../lib/ipc';

// 대시보드 주식 랭킹 등에서 종목을 클릭하면 main.ts가 이 페이지를 별도 BrowserWindow로 띄운다
// (symbol/name/market을 쿼리스트링으로 전달). AppLayout(사이드바) 없이 ChartCard 하나만
// 창 전체를 채우며, 실시간 갱신은 ChartCard가 useMarketSubscription으로 스스로 구독한다.
export default function ChartWindowPage() {
  const stock = usePopupWindowStock(onChartWindowUpdate);

  return (
    <PopupWindowShell stock={stock} title={(s) => `${s.name} - 토스 트레이더`}>
      {stock && <ChartCard stock={stock} />}
    </PopupWindowShell>
  );
}

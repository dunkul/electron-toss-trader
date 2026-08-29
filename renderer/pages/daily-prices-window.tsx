import DailyPricesCard from '../components/DailyPricesCard';
import PopupWindowShell from '../components/PopupWindowShell';
import { usePopupWindowStock } from '../hooks/usePopupWindowStock';
import { onDailyPricesWindowUpdate } from '../lib/ipc';

// 주식 랭킹 등의 우클릭 메뉴에서 "일별시세"를 고르면 main.ts가 이 페이지를 별도 BrowserWindow로
// 띄운다(symbol/name/market을 쿼리스트링으로 전달). chart-window.tsx와 동일한 구조 —
// AppLayout(사이드바) 없이 DailyPricesCard 하나만 창 전체를 채운다.
export default function DailyPricesWindowPage() {
  const stock = usePopupWindowStock(onDailyPricesWindowUpdate);

  return (
    <PopupWindowShell stock={stock} title={(s) => `${s.name} 일별시세 - 토스 트레이더`}>
      {stock && <DailyPricesCard stock={stock} />}
    </PopupWindowShell>
  );
}

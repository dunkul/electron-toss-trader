import OrderbookCard from '../components/OrderbookCard';
import PopupWindowShell from '../components/PopupWindowShell';
import { usePopupWindowStock } from '../hooks/usePopupWindowStock';
import { onOrderbookWindowUpdate } from '../lib/ipc';

// 우클릭 메뉴의 "호가창으로 보기" 등에서 main.ts가 이 페이지를 별도 BrowserWindow로 띄운다
// (symbol/name/market을 쿼리스트링으로 전달). chart-window.tsx와 같은 구조.
export default function OrderbookWindowPage() {
  const stock = usePopupWindowStock(onOrderbookWindowUpdate);

  return (
    <PopupWindowShell stock={stock} title={(s) => `${s.name} 호가 - 토스 트레이더`}>
      {stock && <OrderbookCard key={stock.symbol} stock={stock} />}
    </PopupWindowShell>
  );
}

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import type { ChartWindowStock } from '../lib/ipc';

/**
 * 팝업 창(차트/일별시세)의 종목 상태 부트스트랩. main.ts가 symbol/name/market을 쿼리스트링으로
 * 넘겨 새 BrowserWindow를 띄우므로 그 값으로 최초 상태를 채우고, 이 창이 이미 떠 있는 상태에서
 * 다른 종목을 또 열면(main.ts가 새 창 대신 이 창에 갱신 이벤트를 보냄) subscribeToUpdate로 갈아
 * 끼운다. router.query가 채워지는 시점과 갱신 이벤트가 도착하는 시점 사이에 순서 보장이 없어서,
 * "누가 먼저든 한 번 세팅되면 그 뒤로는 쿼리 effect가 절대 덮어쓰지 않는다"를 ref로 보장한다.
 */
export function usePopupWindowStock(
  subscribeToUpdate: (onUpdate: (next: ChartWindowStock) => void) => () => void,
): ChartWindowStock | null {
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
      subscribeToUpdate((next) => {
        stockSetRef.current = true;
        setStock(next);
      }),
    [subscribeToUpdate],
  );

  return stock;
}

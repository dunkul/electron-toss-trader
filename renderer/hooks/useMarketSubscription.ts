import { useEffect, useId } from 'react';
import {
  registerMarketSubscription,
  unregisterMarketSubscription,
} from '../lib/market-subscription-registry';
import type { WsSymbolRef } from '../lib/ipc';

function symbolsKey(symbols: WsSymbolRef[]): string {
  return symbols.map((s) => `${s.market}:${s.symbol}`).join(',');
}

// 이 훅을 쓰는 컴포넌트가 마운트되어 있는 동안 자신이 필요로 하는 심볼들을 구독
// 레지스트리에 등록하고, 언마운트되면 자동으로 해제한다(market-subscription-registry.ts 참고).
export function useMarketSubscription(symbols: WsSymbolRef[]): void {
  const id = useId();
  const key = symbolsKey(symbols);
  useEffect(() => {
    registerMarketSubscription(id, symbols);
    return () => unregisterMarketSubscription(id);
    // symbols의 "내용"은 key로 추적한다 — 배열은 매 렌더마다 새 참조라 그대로 deps에
    // 넣으면 내용이 같아도 매번 재구독(해제 후 재등록)이 일어난다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, key]);
}

import { api } from './ipc';
import type { WsSymbolRef } from './ipc';

// api.subscribeMarket()은 main 프로세스에 "지금 관심 있는 심볼 전체"를 매번 통째로
// 다시 선언하는 full-replace 호출이라(추가/부분 갱신이 아님), 서로 독립된 컴포넌트가
// 각자 자기 심볼만 선언하면 서로의 구독을 덮어써버린다. 그래서 컴포넌트별 관심 심볼을
// 여기 모아두고, 합쳐서(중복 제거) 하나로 선언한다. 렌더링에 쓰이는 상태가 아니라 이
// side effect 하나를 위한 것이라 zustand 스토어가 아니라 평범한 모듈로 둔다.
const registrations = new Map<string, WsSymbolRef[]>();

function pushDeclaration(): void {
  const merged = new Map<string, WsSymbolRef>();
  for (const refs of registrations.values()) {
    for (const ref of refs) merged.set(ref.symbol, ref);
  }
  api.subscribeMarket([...merged.values()]);
}

export function registerMarketSubscription(id: string, symbols: WsSymbolRef[]): void {
  registrations.set(id, symbols);
  pushDeclaration();
}

export function unregisterMarketSubscription(id: string): void {
  if (!registrations.delete(id)) return;
  pushDeclaration();
}

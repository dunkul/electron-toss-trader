import type { Kysely } from 'kysely';
import { WebSocket } from 'ws';
import type { Database, TossExchange } from '../db/schema';
import { logger } from '../logger';
import { getTossWsUrl } from './config';
import { getAccessToken } from './token-manager';

// 스펙 출처: https://openapi.tossinvest.com/openapi-docs/latest/asyncapi.json
// (60초 간격 PING 권장, 180초간 클라이언트 발신이 없으면 서버가 연결 종료)
const PING_INTERVAL_MS = 60_000;
const DECLARE_DEBOUNCE_MS = 300;
const MAX_RECONNECT_BACKOFF_MS = 30_000;

export interface MarketTick {
  symbol: string;
  lastPrice: string;
  // 이 체결 1건의 체결 수량(누적 거래량이 아니다) — register.ts가 flush 주기 안에서 같은 심볼의
  // 여러 틱을 합산해 renderer로 보내고, renderer는 그 값을 당일 누적 거래량에 더한다.
  volume: string;
  currency: string;
  timestamp: string;
}

export interface WsSymbolRef {
  symbol: string;
  market: TossExchange;
}

type MarketTickListener = (tick: MarketTick) => void;

interface RejectedSubscription {
  target: string;
  code: string;
  message: string;
}

function toWsMarket(market: TossExchange): 'kr' | 'us' {
  return market === 'KOSPI' || market === 'KOSDAQ' || market === 'KR_ETC' ? 'kr' : 'us';
}

// 시세 채널(trade)만 구독한다 — 호가(orderbook)/주문 이벤트는 이 화면에서 아직 쓰이지 않는다.
export class TossMarketWsClient {
  private ws: WebSocket | null = null;
  private desired = new Map<string, WsSymbolRef>();
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private declareTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private stopped = true;
  private readonly listeners = new Set<MarketTickListener>();

  constructor(private readonly db: Kysely<Database>) {}

  onTick(listener: MarketTickListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  setSymbols(symbols: WsSymbolRef[]): void {
    this.desired = new Map(symbols.map((ref) => [ref.symbol, ref]));
    this.scheduleDeclare();
  }

  async start(): Promise<void> {
    this.stopped = false;
    await this.connect();
  }

  stop(): void {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.declareTimer) clearTimeout(this.declareTimer);
    this.teardownSocket();
  }

  private teardownSocket(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws.terminate();
      this.ws = null;
    }
  }

  private async connect(): Promise<void> {
    // 재연결 전 이전 연결을 먼저 닫아야 한다 — 남겨두면 새로 연결할 때마다 이전 연결이 밀려나며 끊김이 반복된다.
    this.teardownSocket();

    let token: string;
    try {
      token = await getAccessToken(this.db);
    } catch (err) {
      logger.error({ err }, 'market ws: failed to obtain access token, will retry');
      this.scheduleReconnect();
      return;
    }

    const socket = new WebSocket(getTossWsUrl(), { headers: { Authorization: `Bearer ${token}` } });
    this.ws = socket;

    socket.on('open', () => {
      logger.info('market ws connected');
      this.reconnectAttempt = 0;
      this.pingTimer = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) socket.send('PING');
      }, PING_INTERVAL_MS);
      this.declareNow();
    });

    socket.on('message', (data) => this.handleMessage(data.toString()));

    socket.on('close', () => {
      logger.warn('market ws disconnected');
      this.scheduleReconnect();
    });

    socket.on('error', (err) => {
      logger.error({ err }, 'market ws error');
    });
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer) return;
    const backoff = Math.min(1000 * 2 ** this.reconnectAttempt, MAX_RECONNECT_BACKOFF_MS);
    const delay = backoff + Math.random() * 250;
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect().catch((err: unknown) => logger.error({ err }, 'market ws reconnect failed'));
    }, delay);
  }

  // 여러 setSymbols() 호출(관심종목/선택종목 변경)이 짧은 시간에 겹쳐도 선언(declare)은
  // 한 번만 보내도록 debounce한다 — 선언 빈도 제한(5회/초)에 대비.
  private scheduleDeclare(): void {
    if (this.declareTimer) clearTimeout(this.declareTimer);
    this.declareTimer = setTimeout(() => {
      this.declareTimer = null;
      this.declareNow();
    }, DECLARE_DEBOUNCE_MS);
  }

  private declareNow(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const codesByType = new Map<string, string[]>();
    for (const ref of this.desired.values()) {
      const type = `trade:${toWsMarket(ref.market)}`;
      const codes = codesByType.get(type) ?? [];
      codes.push(ref.symbol);
      codesByType.set(type, codes);
    }

    // 선언형 full-replace: 이 배열이 곧 현재 구독 전체이며, 빠진 항목은 자동 해제된다.
    const declaration = [...codesByType.entries()].map(([type, codes]) => ({ type, codes }));
    this.ws.send(JSON.stringify(declaration));
  }

  private handleMessage(raw: string): void {
    let frame: unknown;
    try {
      frame = JSON.parse(raw);
    } catch {
      return;
    }
    if (typeof frame !== 'object' || frame === null || !('type' in frame)) return;

    const { type } = frame as { type: unknown };

    if (type === 'message') {
      const { topic, data } = frame as {
        topic?: string;
        data?: { price?: string; volume?: string; currency?: string; timestamp?: string };
      };
      // topic 형식: trade:{kr|us}:{symbol}
      const symbol = topic?.split(':')[2];
      if (!symbol || !data?.price || !data.volume || !data.currency || !data.timestamp) return;
      const tick: MarketTick = {
        symbol,
        lastPrice: data.price,
        volume: data.volume,
        currency: data.currency,
        timestamp: data.timestamp,
      };
      for (const listener of this.listeners) listener(tick);
      return;
    }

    if (type === 'subscriptions') {
      const { rejected } = frame as { rejected?: RejectedSubscription[] };
      if (rejected && rejected.length > 0) {
        logger.warn({ rejected }, 'market ws: some subscriptions rejected');
      }
      return;
    }

    if (type === 'error') {
      const { error } = frame as { error?: { code?: string; message?: string } };
      logger.warn({ error }, 'market ws: error frame received');
    }
  }
}

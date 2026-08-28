import type { Kysely } from 'kysely';
import type { Database, StrategyRow } from '../db/schema';
import { insertSystemLog } from '../db/repositories/logs';
import { getLastSignalTimesByStrategyIds, recordSignal } from '../db/repositories/signals';
import { listActiveStrategies } from '../db/repositories/strategies';
import { logger } from '../logger';
import { notifySignal } from '../notify/notifier';
import { getPrices } from '../toss-api/endpoints/market';
import { STRATEGY_REGISTRY } from './strategies';

const TICK_INTERVAL_MS = 30_000;

export class StrategyEngine {
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly runningStrategyIds = new Set<number>();

  constructor(private readonly db: Kysely<Database>) {}

  start(): void {
    if (this.timer) return;
    logger.info({ intervalMs: TICK_INTERVAL_MS }, 'strategy engine started');
    this.timer = setInterval(() => {
      this.tick().catch((err: unknown) => logger.error({ err }, 'strategy engine tick failed'));
    }, TICK_INTERVAL_MS);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async tick(): Promise<void> {
    const strategies = await listActiveStrategies(this.db);
    if (strategies.length === 0) return;

    const symbols = [...new Set(strategies.map((s) => s.symbol))];
    const quotes = await getPrices(this.db, symbols);
    const priceBySymbol = new Map(quotes.map((quote) => [quote.symbol, Number(quote.lastPrice)]));
    const lastSignalTimes = await getLastSignalTimesByStrategyIds(
      this.db,
      strategies.map((s) => s.id),
    );

    for (const strategy of strategies) {
      // 동일 전략의 이전 tick이 아직 처리 중이면 skip한다.
      if (this.runningStrategyIds.has(strategy.id)) continue;

      const currentPrice = priceBySymbol.get(strategy.symbol);
      if (currentPrice === undefined) continue;

      this.runningStrategyIds.add(strategy.id);
      try {
        await this.evaluateStrategy(strategy, currentPrice, lastSignalTimes.get(strategy.id));
      } catch (err) {
        // 전략 하나(예: params_json이 깨진 경우)가 던진 예외가 이 for 루프를 통째로 중단시켜
        // 뒤 순서 전략들이 이번 tick에서 평가되지 않는 걸 막는다 — 그 전략만 건너뛴다.
        logger.error({ err, strategyId: strategy.id }, 'strategy evaluation failed, skipping for this tick');
      } finally {
        this.runningStrategyIds.delete(strategy.id);
      }
    }
  }

  private async evaluateStrategy(
    strategy: StrategyRow,
    currentPrice: number,
    lastSignalAt: string | undefined,
  ): Promise<void> {
    const strategyModule = STRATEGY_REGISTRY[strategy.strategy_type];
    if (!strategyModule) {
      logger.warn({ strategyType: strategy.strategy_type }, 'no strategy module registered, skipping');
      return;
    }

    const result = strategyModule.evaluate({ strategy, currentPrice });
    if (result.signal === 'HOLD') return;

    const shouldNotify = this.isCooldownElapsed(strategy, lastSignalAt);

    await recordSignal(this.db, {
      strategyId: strategy.id,
      signal: result.signal,
      reason: result.reason,
      price: currentPrice,
      notified: shouldNotify,
    });

    if (!shouldNotify) return;

    if (strategy.notify_desktop || strategy.notify_sound) {
      notifySignal({
        strategyName: strategy.name,
        symbol: strategy.symbol,
        market: strategy.market,
        signal: result.signal,
        price: currentPrice,
        reason: result.reason,
      });
    }

    await insertSystemLog(this.db, {
      level: 'INFO',
      source: 'engine',
      message: `${strategy.name}: ${result.signal} 신호 발생`,
      context: { strategyId: strategy.id, price: currentPrice, reason: result.reason },
    });
  }

  private isCooldownElapsed(strategy: StrategyRow, lastSignalAt: string | undefined): boolean {
    if (!lastSignalAt) return true;
    const elapsedSec = (Date.now() - new Date(lastSignalAt).getTime()) / 1000;
    return elapsedSec >= strategy.cooldown_sec;
  }
}

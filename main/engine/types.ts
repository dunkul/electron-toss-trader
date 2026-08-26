import type { Signal, StrategyRow } from '../db/schema';

export interface StrategyEvalContext {
  strategy: StrategyRow;
  currentPrice: number;
}

export interface StrategyEvalResult {
  signal: Signal;
  reason?: string;
}

export interface StrategyModule {
  evaluate(context: StrategyEvalContext): StrategyEvalResult;
}

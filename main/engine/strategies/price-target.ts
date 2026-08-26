import type { StrategyEvalContext, StrategyEvalResult, StrategyModule } from '../types';

export interface PriceTargetParams {
  direction: 'ABOVE' | 'BELOW';
  targetPrice: number;
}

export const priceTargetStrategy: StrategyModule = {
  evaluate({ strategy, currentPrice }: StrategyEvalContext): StrategyEvalResult {
    const params = JSON.parse(strategy.params_json) as PriceTargetParams;
    const hit =
      params.direction === 'ABOVE' ? currentPrice >= params.targetPrice : currentPrice <= params.targetPrice;

    if (!hit) return { signal: 'HOLD' };

    const directionLabel = params.direction === 'ABOVE' ? '이상으로 상승' : '이하로 하락';
    return {
      signal: params.direction === 'ABOVE' ? 'BUY' : 'SELL',
      reason: `현재가 ${currentPrice.toLocaleString()}원이 목표가 ${params.targetPrice.toLocaleString()}원 ${directionLabel}`,
    };
  },
};

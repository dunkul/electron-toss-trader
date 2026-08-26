import type { StrategyType } from '../../db/schema';
import type { StrategyModule } from '../types';
import { priceTargetStrategy } from './price-target';

// MA_CROSS / RSI / GRID는 아직 구현되지 않았다. 등록 전까지 스케줄러가 로그만 남기고 건너뛴다.
export const STRATEGY_REGISTRY: Partial<Record<StrategyType, StrategyModule>> = {
  PRICE_TARGET: priceTargetStrategy,
};

import { useEffect, useState } from 'react';
import { Card, Empty, Typography } from 'antd';
import StockCell from './StockCell';
import QuotePriceBlock from './QuotePriceBlock';
import TradingPanel from './TradingPanel';
import { useMarketSubscription } from '../hooks/useMarketSubscription';
import { fetchReferencePrices } from '../lib/market-data';
import { formatRate, profitColor } from '../lib/format';
import { marketCurrency } from '../lib/trading';
import { profitColors } from '../lib/theme';
import { api, onMarketTick, onOrderbookTick } from '../lib/ipc';
import type { ChartWindowStock, Orderbook, OrderbookEntry, PriceQuote } from '../lib/ipc';

const { Text } = Typography;

interface OrderbookCardProps {
  stock: ChartWindowStock;
}

// 호가창 팝업의 본체. 왼쪽 호가 래더는 항상 보여주고, 설정 > 매매지원이 켜져 있을 때만
// 오른쪽에 거래화면(TradingPanel)을 붙인다.
export default function OrderbookCard({ stock }: OrderbookCardProps) {
  const [orderbook, setOrderbook] = useState<Orderbook | null>(null);
  const [price, setPrice] = useState<PriceQuote | null>(null);
  const [referencePrice, setReferencePrice] = useState<number | undefined>(undefined);
  const [tradingSupportEnabled, setTradingSupportEnabled] = useState(false);
  const [orderPrice, setOrderPrice] = useState<number | undefined>(undefined);

  useEffect(() => {
    api.getTradingSupportStatus().then((status) => setTradingSupportEnabled(status.enabled));
  }, []);

  // 호가는 REST로 최초 스냅샷 1회만 받고, 이후 갱신은 WS realtime-orderbook 채널 push로
  // 받는다(구독 직후에는 스냅샷이 오지 않고 다음 갱신부터 push되는 스펙이라 REST 선조회가 필요).
  useEffect(() => {
    let cancelled = false;
    api
      .getOrderbook(stock.symbol)
      .then((ob) => {
        if (!cancelled) setOrderbook(ob);
      })
      .catch(() => {});

    api
      .getPrices([stock.symbol])
      .then(([quote]) => {
        if (!cancelled && quote) setPrice(quote);
      })
      .catch(() => {});
    fetchReferencePrices([stock.symbol]).then((refs) => {
      if (!cancelled) setReferencePrice(refs[stock.symbol]);
    });

    return () => {
      cancelled = true;
    };
  }, [stock.symbol]);

  useMarketSubscription([{ symbol: stock.symbol, market: stock.market }]);

  // 호가 구독은 창(sender) 하나가 한 종목만 보는 단일 소비자라 관심종목처럼 여러 컴포넌트의
  // 선언을 합칠 필요가 없어 useMarketSubscription 같은 병합 레지스트리 없이 직접 선언한다.
  useEffect(() => {
    api.subscribeOrderbook([{ symbol: stock.symbol, market: stock.market }]);
    return () => api.subscribeOrderbook([]);
  }, [stock.symbol, stock.market]);

  useEffect(() => {
    return onMarketTick((tick) => {
      if (tick.symbol !== stock.symbol) return;
      setPrice({
        symbol: tick.symbol,
        lastPrice: tick.lastPrice,
        currency: tick.currency,
        timestamp: tick.timestamp,
      });
    });
  }, [stock.symbol]);

  useEffect(() => {
    return onOrderbookTick((tick) => {
      if (tick.symbol !== stock.symbol) return;
      setOrderbook({ timestamp: tick.timestamp, currency: tick.currency, asks: tick.asks, bids: tick.bids });
    });
  }, [stock.symbol]);

  // 주문가격의 초기값은 현재가 — 이후로는 사용자가 호가를 클릭하거나 직접 입력한 값을 유지한다.
  useEffect(() => {
    if (orderPrice === undefined && price) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 현재가가 처음 로드된 시점에 1회 초기화
      setOrderPrice(Number(price.lastPrice));
    }
  }, [price, orderPrice]);

  const currency = price?.currency ?? marketCurrency(stock.market);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <StockCell name={stock.name} symbol={stock.symbol} market={stock.market} />
        {price && <QuotePriceBlock quote={price} referencePrice={referencePrice} alignRight />}
      </div>

      <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 16 }}>
        <div style={{ width: tradingSupportEnabled ? 340 : '100%', flex: 'none', minWidth: 0 }}>
          <OrderbookLadder
            orderbook={orderbook}
            currentPrice={price ? Number(price.lastPrice) : undefined}
            referencePrice={referencePrice}
            selectedPrice={orderPrice}
            onSelectPrice={tradingSupportEnabled ? setOrderPrice : undefined}
          />
        </div>

        {tradingSupportEnabled && (
          <div style={{ flex: 1, minWidth: 280 }}>
            <TradingPanel
              stock={stock}
              currency={currency}
              lastPrice={price ? Number(price.lastPrice) : undefined}
              orderPrice={orderPrice}
              onOrderPriceChange={setOrderPrice}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// 토스 호가창의 3열 레이아웃(매도잔량 | 호가 | 매수잔량)을 참고했다 — 한 행에는 매도/매수 중
// 한쪽 잔량만 채워지고, 가운데 호가 열은 항상 채워진다. 실제 체결가(현재가) 행은 매도호가
// 목록과 매수호가 목록 사이에 별도로 끼워 넣는다(호가 목록에는 없는, 우리가 아는 마지막 체결가).
const LADDER_COLUMNS = '1fr 1.3fr 1fr';

interface OrderbookLadderProps {
  orderbook: Orderbook | null;
  currentPrice: number | undefined;
  referencePrice: number | undefined;
  selectedPrice: number | undefined;
  onSelectPrice?: (price: number) => void;
}

function OrderbookLadder({
  orderbook,
  currentPrice,
  referencePrice,
  selectedPrice,
  onSelectPrice,
}: OrderbookLadderProps) {
  if (!orderbook || (orderbook.asks.length === 0 && orderbook.bids.length === 0)) {
    return (
      <Card size="small" style={{ height: '100%' }} styles={{ body: { height: '100%' } }}>
        <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Empty description="호가 정보를 불러올 수 없습니다." />
        </div>
      </Card>
    );
  }

  // asks는 낮은 가격순으로 내려오는데, 래더는 관례대로 높은 매도호가가 위쪽에 오게 뒤집는다.
  const asksDesc = [...orderbook.asks].reverse();
  const maxVolume = Math.max(
    1,
    ...orderbook.asks.map((a) => Number(a.volume)),
    ...orderbook.bids.map((b) => Number(b.volume)),
  );
  const totalAskVolume = orderbook.asks.reduce((sum, a) => sum + Number(a.volume), 0);
  const totalBidVolume = orderbook.bids.reduce((sum, b) => sum + Number(b.volume), 0);

  return (
    <Card
      size="small"
      style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
      styles={{ body: { padding: 0, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' } }}
    >
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {asksDesc.map((level) => (
          <LadderRow
            key={`ask-${level.price}`}
            side="ask"
            level={level}
            maxVolume={maxVolume}
            referencePrice={referencePrice}
            selected={selectedPrice === Number(level.price)}
            onClick={onSelectPrice ? () => onSelectPrice(Number(level.price)) : undefined}
          />
        ))}

        {currentPrice !== undefined && (
          <CurrentPriceRow price={currentPrice} referencePrice={referencePrice} />
        )}

        {orderbook.bids.map((level) => (
          <LadderRow
            key={`bid-${level.price}`}
            side="bid"
            level={level}
            maxVolume={maxVolume}
            referencePrice={referencePrice}
            selected={selectedPrice === Number(level.price)}
            onClick={onSelectPrice ? () => onSelectPrice(Number(level.price)) : undefined}
          />
        ))}
      </div>
      <LadderTotalsBar totalAskVolume={totalAskVolume} totalBidVolume={totalBidVolume} />
    </Card>
  );
}

// 매도/매수 잔량 합계를 막대 하나에 색으로 나눠 채워서, 숫자를 읽지 않아도 어느 쪽이 더
// 두꺼운지(우세한지) 한눈에 보이게 한다 — 캡처 이미지 하단의 판매대기/구매대기 바와 같은 역할.
function LadderTotalsBar({
  totalAskVolume,
  totalBidVolume,
}: {
  totalAskVolume: number;
  totalBidVolume: number;
}) {
  const total = Math.max(1, totalAskVolume + totalBidVolume);
  const askPct = (totalAskVolume / total) * 100;

  return (
    <div style={{ flex: 'none', borderTop: '1px solid rgba(0,0,0,0.08)', padding: '8px 10px' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginBottom: 4,
          fontSize: 12,
          fontWeight: 600,
        }}
      >
        <Text style={{ color: profitColors.down }}>판매대기 {totalAskVolume.toLocaleString()}</Text>
        <Text style={{ color: profitColors.up }}>구매대기 {totalBidVolume.toLocaleString()}</Text>
      </div>
      <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ width: `${askPct}%`, background: profitColors.down }} />
        <div style={{ width: `${100 - askPct}%`, background: profitColors.up }} />
      </div>
    </div>
  );
}

function CurrentPriceRow({ price, referencePrice }: { price: number; referencePrice: number | undefined }) {
  const hasReference = referencePrice !== undefined && referencePrice !== 0;
  const rate = hasReference ? (price - referencePrice!) / referencePrice! : undefined;
  const color = rate !== undefined ? profitColor(rate) : profitColors.neutral;

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: LADDER_COLUMNS,
        padding: '4px 0',
        background: 'rgba(0, 0, 0, 0.03)',
        borderTop: '1px solid rgba(0,0,0,0.08)',
        borderBottom: '1px solid rgba(0,0,0,0.08)',
      }}
    >
      <div />
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <div
          style={{
            border: `1px solid ${color}`,
            borderRadius: 6,
            padding: '2px 12px',
            textAlign: 'center',
            lineHeight: 1.3,
          }}
        >
          <Text strong style={{ color, fontSize: 14 }}>
            {price.toLocaleString()}
          </Text>
          {rate !== undefined && (
            <Text style={{ color, fontSize: 11, display: 'block' }}>{formatRate(rate)}</Text>
          )}
        </div>
      </div>
      <div />
    </div>
  );
}

interface LadderRowProps {
  side: 'ask' | 'bid';
  level: OrderbookEntry;
  maxVolume: number;
  referencePrice: number | undefined;
  selected: boolean;
  onClick?: () => void;
}

function LadderRow({ side, level, maxVolume, referencePrice, selected, onClick }: LadderRowProps) {
  const priceNum = Number(level.price);
  const volume = Number(level.volume);
  const barPct = Math.min(100, (volume / maxVolume) * 100);
  const hasReference = referencePrice !== undefined && referencePrice !== 0;
  const rate = hasReference ? (priceNum - referencePrice!) / referencePrice! : undefined;
  // 가격 텍스트는 전일종가 대비 등락(빨강/파랑)을, 잔량은 매도/매수 방향(항상 파랑/빨강)을 나타낸다
  // — 국내 증시 호가창 관례대로 두 색상의 의미가 다르다.
  const priceColor = rate !== undefined ? profitColor(rate) : profitColors.neutral;
  const volumeColor = side === 'ask' ? profitColors.down : profitColors.up;
  const barColor = side === 'ask' ? 'rgba(23, 101, 173, 0.12)' : 'rgba(207, 19, 34, 0.12)';

  return (
    <div
      onClick={onClick}
      style={{
        display: 'grid',
        gridTemplateColumns: LADDER_COLUMNS,
        alignItems: 'stretch',
        fontSize: 12,
        cursor: onClick ? 'pointer' : undefined,
        background: selected ? 'rgba(168, 102, 14, 0.14)' : undefined,
      }}
    >
      <div
        style={{
          position: 'relative',
          display: 'flex',
          justifyContent: 'flex-end',
          alignItems: 'center',
          padding: '3px 10px 3px 4px',
        }}
      >
        {side === 'ask' && (
          <>
            <div
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                right: 0,
                width: `${barPct}%`,
                background: barColor,
              }}
            />
            <Text style={{ position: 'relative', color: volumeColor }}>{volume.toLocaleString()}</Text>
          </>
        )}
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2px 0',
        }}
      >
        <Text style={{ color: priceColor }}>{priceNum.toLocaleString()}</Text>
        {rate !== undefined && (
          <Text type="secondary" style={{ fontSize: 10, color: priceColor, opacity: 0.8 }}>
            {formatRate(rate)}
          </Text>
        )}
      </div>

      <div
        style={{
          position: 'relative',
          display: 'flex',
          justifyContent: 'flex-start',
          alignItems: 'center',
          padding: '3px 4px 3px 10px',
        }}
      >
        {side === 'bid' && (
          <>
            <div
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: 0,
                width: `${barPct}%`,
                background: barColor,
              }}
            />
            <Text style={{ position: 'relative', color: volumeColor }}>{volume.toLocaleString()}</Text>
          </>
        )}
      </div>
    </div>
  );
}

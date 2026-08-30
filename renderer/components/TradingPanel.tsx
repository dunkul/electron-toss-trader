import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  App,
  Button,
  Drawer,
  Empty,
  InputNumber,
  Segmented,
  Select,
  Space,
  Spin,
  Tabs,
  Tooltip,
  Typography,
} from 'antd';
import { InfoCircleOutlined, MinusOutlined, PlusOutlined } from '@ant-design/icons';
import { currencySymbol, formatAmount, formatRate, ipcErrorMessage, profitColor } from '../lib/format';
import { profitColors } from '../lib/theme';
import { roundToTick, stepPrice } from '../lib/trading';
import { api } from '../lib/ipc';
import type { ChartWindowStock, Holding, OrderHistoryItem } from '../lib/ipc';

const { Text } = Typography;

type OrderSide = 'buy' | 'sell';
type TabKey = OrderSide | 'pending' | 'completed';
type PriceMode = 'limit' | 'market';

const QUANTITY_PERCENT_OPTIONS = [10, 25, 50, 100] as const;

// 방금 낸 주문의 응답을 못 받은 경우(네트워크 오류 등) 서버에는 이미 접수됐을 수 있다 —
// 사용자가 "실패했나?" 하고 재주문하면 중복 주문이 될 수 있어, 제출 직전 같은 조건의 대기
// 주문이 최근에 있었는지 확인해서 있으면 완전히 막는다. 이 시간 창을 넘어서는 대기 주문은
// (같은 조건이라도) 의도적인 재주문일 수 있어 대상에서 제외한다.
const DUPLICATE_ORDER_WINDOW_MS = 5 * 60 * 1000;

// "대기"/"완료" 탭 행의 날짜 열 — 고정폭 + tabular-nums로 숫자 자릿수가 바뀌어도 줄이 맞는다.
function formatMonthDay(iso: string): string {
  const date = new Date(iso);
  return `${date.getMonth() + 1}.${date.getDate()}`;
}

const ORDER_ROW_DATE_STYLE = {
  fontSize: 12,
  color: 'rgba(0,0,0,0.4)',
  width: 28,
  flexShrink: 0,
  fontVariantNumeric: 'tabular-nums',
} as const;

interface TradingPanelProps {
  stock: ChartWindowStock;
  currency: string;
  lastPrice: number | undefined;
  orderPrice: number | undefined;
  onOrderPriceChange: (price: number) => void;
}

// 매매지원이 켜졌을 때 호가창 오른쪽에 붙는 거래화면. "구매예약하기/판매예약하기"는 실제
// 주문 API(POST /orders)를 호출한다 — 토스증권 Open API는 모의투자가 없어 클릭 즉시 실계좌에
// 반영되므로, 제출 전 modal.confirm으로 주문 내용을 한 번 더 확인시킨다.
export default function TradingPanel({
  stock,
  currency,
  lastPrice,
  orderPrice,
  onOrderPriceChange,
}: TradingPanelProps) {
  const { message, modal } = App.useApp();
  const [activeTab, setActiveTab] = useState<TabKey>('buy');
  const [priceMode, setPriceMode] = useState<PriceMode>('limit');
  const [quantity, setQuantity] = useState(0);

  const [accountSeq, setAccountSeq] = useState<string | null>(null);
  const [buyingPower, setBuyingPower] = useState<number | null>(null);
  const [sellableQuantity, setSellableQuantity] = useState(0);
  const [holding, setHolding] = useState<Holding | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api
      .listAccounts()
      .then((accounts) => {
        const account = accounts[0];
        if (account) setAccountSeq(String(account.accountSeq));
      })
      .catch(() => {});
  }, []);

  // 주문 제출 직후 잔고/보유수량이 곧바로 바뀌므로(부분체결이라도 sellable은 즉시 줄어든다),
  // 성공 콜백에서도 다시 불러올 수 있게 effect 밖으로 뺐다.
  const loadAccountData = useCallback(() => {
    if (!accountSeq) return;
    const orderCurrency = currency === 'USD' ? 'USD' : 'KRW';
    api
      .getBuyingPower(accountSeq, orderCurrency)
      .then((result) => setBuyingPower(Number(result.cashBuyingPower)))
      .catch(() => setBuyingPower(null));
    api
      .getSellableQuantity(accountSeq, stock.symbol)
      .then((qty) => setSellableQuantity(Number(qty)))
      .catch(() => setSellableQuantity(0));
    api
      .getHoldings(accountSeq)
      .then((summary) => setHolding(summary.items.find((item) => item.symbol === stock.symbol) ?? null))
      .catch(() => setHolding(null));
  }, [accountSeq, stock.symbol, currency]);

  useEffect(() => {
    loadAccountData();
  }, [loadAccountData]);

  // 탭/종목이 바뀌면 이전 종목·반대 방향 기준으로 잡았던 수량이 그대로 남지 않게 초기화한다.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 탭/종목 전환 시 즉시 리셋 필요
    setQuantity(0);
  }, [activeTab, stock.symbol]);

  // 보유(판매 가능) 수량이 없는 종목은 판매 탭 자체를 막는다 — 종목 전환/보유 변동으로 판매
  // 탭에 있는 상태에서 보유가 0이 되면 자동으로 구매 탭으로 되돌린다.
  const sellDisabled = sellableQuantity <= 0;
  useEffect(() => {
    if (activeTab === 'sell' && sellDisabled) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 판매 탭이 막히면 즉시 전환 필요
      setActiveTab('buy');
    }
  }, [activeTab, sellDisabled]);

  const price = priceMode === 'limit' ? (orderPrice ?? lastPrice ?? 0) : (lastPrice ?? 0);
  const maxQuantity =
    activeTab === 'buy'
      ? buyingPower !== null && price > 0
        ? Math.floor(buyingPower / price)
        : 0
      : sellableQuantity;

  const applyPercent = (pct: number) => setQuantity(Math.max(0, Math.floor(maxQuantity * (pct / 100))));

  const existingQty = holding ? Number(holding.quantity) : 0;
  const existingAvg = holding ? Number(holding.averagePurchasePrice) : 0;
  const estimatedAvgAfter =
    activeTab === 'buy' && quantity > 0
      ? (existingQty * existingAvg + quantity * price) / (existingQty + quantity)
      : undefined;

  // 판매 가격 기준으로 (판매가 - 내 주식평균) * 수량. 수수료/세금은 반영하지 않은 단순 추정치.
  const estimatedSaleProfit =
    activeTab === 'sell' && quantity > 0 && existingAvg > 0 ? (price - existingAvg) * quantity : undefined;
  const estimatedSaleProfitRate = existingAvg > 0 ? (price - existingAvg) / existingAvg : undefined;

  const submitOrder = async (confirmHighValueOrder: boolean) => {
    if (!accountSeq) {
      message.error('계좌 정보를 불러오지 못했습니다.');
      return;
    }
    setSubmitting(true);
    try {
      const outcome = await api.createOrder(accountSeq, {
        symbol: stock.symbol,
        side: activeTab === 'buy' ? 'BUY' : 'SELL',
        orderType: priceMode === 'limit' ? 'LIMIT' : 'MARKET',
        quantity: String(quantity),
        price: priceMode === 'limit' ? String(price) : undefined,
        clientOrderId: crypto.randomUUID(),
        confirmHighValueOrder,
      });
      if (!outcome.ok) {
        // confirm-high-value-required — 1억원 이상 주문은 사용자가 금액을 인지했음을 한 번 더
        // 확인시킨 뒤에만 confirmHighValueOrder: true로 재요청한다.
        modal.confirm({
          title: '1억원 이상 주문 확인',
          content: outcome.message,
          okText: '주문 진행',
          cancelText: '취소',
          okButtonProps: { danger: activeTab === 'sell' },
          onOk: () => submitOrder(true),
        });
        return;
      }
      message.success(`주문이 접수되었습니다. (주문번호 ${outcome.orderId})`);
      setQuantity(0);
      loadAccountData();
    } catch (err) {
      message.error(ipcErrorMessage(err, '주문 접수에 실패했습니다.'));
    } finally {
      setSubmitting(false);
    }
  };

  const openOrderConfirm = () => {
    const sideLabel = activeTab === 'buy' ? '구매' : '판매';
    const priceText =
      priceMode === 'limit' ? `${currencySymbol(currency)}${formatAmount(price, currency)}` : '시장가';
    modal.confirm({
      title: `${sideLabel}를 진행할까요?`,
      content: (
        <div>
          <div>
            {stock.name} ({stock.symbol})
          </div>
          <div>
            {priceText} · {quantity.toLocaleString()}주
          </div>
          {priceMode === 'limit' && (
            <div>
              총 {currencySymbol(currency)}
              {formatAmount(quantity * price, currency)}
            </div>
          )}
        </div>
      ),
      okText: sideLabel,
      cancelText: '취소',
      okButtonProps: { danger: activeTab === 'sell' },
      onOk: () => submitOrder(false),
    });
  };

  const handleSubmit = async () => {
    const side = activeTab === 'buy' ? 'BUY' : 'SELL';
    const orderType = priceMode === 'limit' ? 'LIMIT' : 'MARKET';

    if (accountSeq) {
      setSubmitting(true);
      try {
        const page = await api.listOrderHistory(accountSeq, { status: 'OPEN', symbol: stock.symbol });
        const duplicate = page.orders.find((order) => {
          if (order.side !== side || order.orderType !== orderType) return false;
          if (Number(order.quantity) !== quantity) return false;
          if (orderType === 'LIMIT' && Number(order.price) !== price) return false;
          const ageMs = Date.now() - new Date(order.orderedAt).getTime();
          return ageMs >= 0 && ageMs < DUPLICATE_ORDER_WINDOW_MS;
        });
        if (duplicate) {
          const minutesAgo = Math.max(
            0,
            Math.round((Date.now() - new Date(duplicate.orderedAt).getTime()) / 60000),
          );
          modal.warning({
            title: '이미 동일한 대기 주문이 있습니다',
            content: (
              <div>
                {minutesAgo}분 전 {duplicate.side === 'BUY' ? '구매' : '판매'}{' '}
                {Number(duplicate.quantity).toLocaleString()}주
                {duplicate.price !== null && (
                  <>
                    {' '}
                    · 주당 {currencySymbol(duplicate.currency)}
                    {formatAmount(duplicate.price, duplicate.currency)}
                  </>
                )}{' '}
                주문(주문번호 {duplicate.orderId})이 대기 중입니다. 직전 주문이 실제로는 접수됐을 수
                있어 중복 주문을 막았습니다 — &ldquo;대기&rdquo; 탭에서 확인해주세요.
              </div>
            ),
            okText: '확인',
          });
          return;
        }
      } catch {
        // 중복 확인 자체가 실패해도(네트워크 오류 등) 주문 제출까지 막지는 않는다 — 부가적인
        // 안전장치일 뿐, 이 조회 실패를 이유로 정상 주문을 가로막으면 안 된다.
      } finally {
        setSubmitting(false);
      }
    }

    openOrderConfirm();
  };

  if (activeTab === 'pending') {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <OrderSideTabs activeTab={activeTab} sellDisabled={sellDisabled} onChange={setActiveTab} />
        <PendingOrdersList accountSeq={accountSeq} symbol={stock.symbol} />
      </div>
    );
  }

  if (activeTab === 'completed') {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <OrderSideTabs activeTab={activeTab} sellDisabled={sellDisabled} onChange={setActiveTab} />
        <CompletedOrdersList accountSeq={accountSeq} symbol={stock.symbol} />
      </div>
    );
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <OrderSideTabs activeTab={activeTab} sellDisabled={sellDisabled} onChange={setActiveTab} />

      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        <Field label="주문 유형">
          <Select
            value="reserved"
            disabled
            style={{ width: '100%' }}
            options={[{ value: 'reserved', label: '정규장 주문' }]}
          />
        </Field>

        <Field label={activeTab === 'buy' ? '구매 가격' : '판매 가격'}>
          <Segmented
            block
            value={priceMode}
            onChange={(value) => setPriceMode(value as PriceMode)}
            options={[
              { label: '지정가', value: 'limit' },
              { label: '시장가', value: 'market' },
            ]}
          />
          {priceMode === 'limit' && (
            <Space.Compact style={{ width: '100%', marginTop: 8 }}>
              <Button
                icon={<MinusOutlined />}
                onClick={() => onOrderPriceChange(stepPrice(price, currency, -1))}
              />
              <InputNumber
                style={{ flex: 1, textAlign: 'center' }}
                min={0}
                value={price}
                controls={false}
                formatter={(value) => Number(value ?? 0).toLocaleString()}
                parser={(value) => Number((value ?? '0').replace(/[^0-9.]/g, ''))}
                onChange={(value) => onOrderPriceChange(roundToTick(Number(value ?? 0), currency))}
              />
              <Button
                icon={<PlusOutlined />}
                onClick={() => onOrderPriceChange(stepPrice(price, currency, 1))}
              />
            </Space.Compact>
          )}
        </Field>

        <Field label={`수량 (최대 ${maxQuantity.toLocaleString()}주 가능)`}>
          <InputNumber
            style={{ width: '100%' }}
            min={0}
            max={maxQuantity}
            precision={0}
            value={quantity}
            onChange={(value) => setQuantity(Number(value ?? 0))}
          />
          <Space style={{ marginTop: 8 }}>
            {QUANTITY_PERCENT_OPTIONS.map((pct) => (
              <Button key={pct} size="small" onClick={() => applyPercent(pct)}>
                {pct === 100 ? '최대' : `${pct}%`}
              </Button>
            ))}
          </Space>
        </Field>

        <Field label="총 주문 금액">
          <InputNumber
            style={{ width: '100%' }}
            min={0}
            value={quantity * price}
            disabled={priceMode === 'market'}
            formatter={(value) => Number(value ?? 0).toLocaleString()}
            parser={(value) => Number((value ?? '0').replace(/[^0-9.]/g, ''))}
            onChange={(value) => {
              if (price > 0) setQuantity(Math.max(0, Math.floor(Number(value ?? 0) / price)));
            }}
          />
        </Field>

        <div
          style={{
            borderTop: '1px solid rgba(0,0,0,0.08)',
            paddingTop: 8,
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          {activeTab === 'buy' ? (
            <SummaryRow
              label="주문 가능 금액"
              value={
                buyingPower !== null
                  ? `${currencySymbol(currency)}${formatAmount(buyingPower, currency)}`
                  : '-'
              }
            />
          ) : (
            <SummaryRow label="판매 가능 수량" value={`${sellableQuantity.toLocaleString()}주`} />
          )}
          <SummaryRow
            label="내 주식평균"
            value={
              existingAvg > 0 ? `${currencySymbol(currency)}${formatAmount(existingAvg, currency)}` : '-'
            }
          />
          {activeTab === 'buy' && (
            <SummaryRow
              label="구매 후 예상평균"
              value={
                estimatedAvgAfter !== undefined
                  ? `${currencySymbol(currency)}${formatAmount(estimatedAvgAfter, currency)}`
                  : '-'
              }
            />
          )}
          <SummaryRow
            label="현재 수익"
            value={
              holding
                ? `${formatAmount(holding.profitLoss.amount, currency)} (${formatRate(holding.profitLoss.rate)})`
                : '-'
            }
            color={holding ? profitColor(Number(holding.profitLoss.amount)) : undefined}
          />
          {activeTab === 'sell' && (
            <SummaryRow
              label="예상 판매 수익"
              tooltip="판매 가격 기준 (판매 가격 - 내 주식평균) × 수량. 수수료/세금은 반영하지 않은 추정치입니다."
              value={
                estimatedSaleProfit !== undefined && estimatedSaleProfitRate !== undefined
                  ? `${formatAmount(estimatedSaleProfit, currency)} (${formatRate(estimatedSaleProfitRate)})`
                  : '-'
              }
              color={estimatedSaleProfit !== undefined ? profitColor(estimatedSaleProfit) : undefined}
            />
          )}
        </div>

        <Button
          type="primary"
          danger={activeTab === 'sell'}
          block
          loading={submitting}
          disabled={quantity <= 0 || (priceMode === 'limit' && price <= 0)}
          onClick={handleSubmit}
        >
          {activeTab === 'buy' ? '구매예약하기' : '판매예약하기'}
        </Button>
      </div>
    </div>
  );
}

function OrderSideTabs({
  activeTab,
  sellDisabled,
  onChange,
}: {
  activeTab: TabKey;
  sellDisabled: boolean;
  onChange: (key: TabKey) => void;
}) {
  return (
    <Tabs
      size="small"
      activeKey={activeTab}
      onChange={(key) => onChange(key as TabKey)}
      items={[
        { key: 'buy', label: '구매' },
        {
          key: 'sell',
          disabled: sellDisabled,
          label: sellDisabled ? (
            <Tooltip title="보유 중인 종목이 없어 판매할 수 없습니다.">판매</Tooltip>
          ) : (
            '판매'
          ),
        },
        { key: 'pending', label: '대기' },
        { key: 'completed', label: '완료' },
      ]}
    />
  );
}

// "대기" 탭 — Order History API(GET /orders?status=OPEN)로 이 종목의 대기 중 주문을 보여주고,
// 행마다 정정/취소를 붙인다. 정정은 지정가 주문에만 의미가 있어(시장가는 가격도 없고 KR/US 모두
// quantity 규칙이 얽혀 복잡해진다) 시장가 주문은 정정 버튼을 비활성화한다.
function PendingOrdersList({
  accountSeq,
  symbol,
}: {
  accountSeq: string | null;
  symbol: string;
}) {
  const { message, modal } = App.useApp();
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<OrderHistoryItem[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [modifyTarget, setModifyTarget] = useState<OrderHistoryItem | null>(null);
  const [cancelingOrderId, setCancelingOrderId] = useState<string | null>(null);

  const loadOrders = useCallback(() => {
    if (!accountSeq) return;
    setLoadError(false);
    api
      .listOrderHistory(accountSeq, { status: 'OPEN', symbol })
      .then((page) => setOrders(page.orders))
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, [accountSeq, symbol]);

  useEffect(() => {
    if (!accountSeq) return;
    // 종목/계좌가 바뀌면 이전 종목의 목록이 화면에 남지 않도록 즉시 로딩 상태로 되돌린다.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 위 이유로 동기 리셋이 필요
    setLoading(true);
    loadOrders();
  }, [accountSeq, loadOrders]);

  const handleCancel = (order: OrderHistoryItem) => {
    modal.confirm({
      title: '주문을 취소할까요?',
      content: (
        <div>
          {order.side === 'BUY' ? '구매' : '판매'} {Number(order.quantity).toLocaleString()}주
          {order.price !== null && (
            <>
              {' '}
              · 주당 {currencySymbol(order.currency)}
              {formatAmount(order.price, order.currency)}
            </>
          )}
        </div>
      ),
      okText: '주문 취소',
      okButtonProps: { danger: true },
      cancelText: '닫기',
      onOk: async () => {
        if (!accountSeq) return;
        setCancelingOrderId(order.orderId);
        try {
          await api.cancelOrder(accountSeq, order.orderId);
          message.success('주문을 취소했습니다.');
          loadOrders();
        } catch (err) {
          message.error(ipcErrorMessage(err, '주문 취소에 실패했습니다.'));
        } finally {
          setCancelingOrderId(null);
        }
      },
    });
  };

  if (loading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spin />
      </div>
    );
  }

  // 조회 실패를 "대기 주문 없음"과 같은 화면으로 보여주면, 실제로는 대기 중인 주문이 있는데도
  // 없는 것처럼 보여 사용자가 중복 주문을 낼 위험이 있다 — 반드시 구분해서 보여준다.
  if (loadError) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Empty description="대기 주문을 불러오지 못했습니다.">
          <Button size="small" onClick={loadOrders}>
            다시 시도
          </Button>
        </Empty>
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Empty description="대기 중인 주문이 없습니다." />
      </div>
    );
  }

  return (
    <>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '2px 4px' }}>
        {orders.map((order, index) => {
          const sideLabel = order.side === 'BUY' ? '구매' : '판매';
          const sideColor = order.side === 'BUY' ? profitColors.up : profitColors.down;
          const canModify = order.orderType === 'LIMIT';

          return (
            <div
              key={order.orderId}
              style={{
                padding: '10px 2px',
                borderTop: index === 0 ? undefined : '1px solid rgba(0,0,0,0.04)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <Text style={ORDER_ROW_DATE_STYLE}>{formatMonthDay(order.orderedAt)}</Text>
                <Text style={{ fontSize: 13, flex: 1 }}>
                  <span style={{ color: sideColor, fontWeight: 600 }}>{sideLabel}</span>{' '}
                  {Number(order.quantity).toLocaleString()}주
                </Text>
                {order.price !== null && (
                  <Text style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                    {currencySymbol(order.currency)}
                    {formatAmount(order.price, order.currency)}
                  </Text>
                )}
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 14, marginTop: 4 }}>
                <Tooltip title={canModify ? undefined : '시장가 주문은 정정할 수 없습니다.'}>
                  <span>
                    <Button
                      size="small"
                      type="text"
                      disabled={!canModify}
                      style={{ fontSize: 12, height: 'auto', padding: '2px 4px', color: 'rgba(0,0,0,0.45)' }}
                      onClick={() => setModifyTarget(order)}
                    >
                      정정
                    </Button>
                  </span>
                </Tooltip>
                <Button
                  size="small"
                  type="text"
                  danger
                  loading={cancelingOrderId === order.orderId}
                  style={{ fontSize: 12, height: 'auto', padding: '2px 4px' }}
                  onClick={() => handleCancel(order)}
                >
                  취소
                </Button>
              </div>
            </div>
          );
        })}
      </div>
      {modifyTarget && accountSeq && (
        <ModifyOrderSheet
          accountSeq={accountSeq}
          order={modifyTarget}
          onClose={() => setModifyTarget(null)}
          onModified={() => {
            setModifyTarget(null);
            loadOrders();
          }}
        />
      )}
    </>
  );
}

// 정정 바텀시트. KR은 가격+수량(수량 필수), US는 가격만 — API 규칙이 시장별로 달라 UI도 그에
// 맞춘다(원주문이 LIMIT일 때만 열리므로 orderType은 항상 'LIMIT'로 재요청한다). 통화는 화면에
// 표시 중인 종목의 currency가 아니라 이 주문 자체의 order.currency로 판단한다 — 항상 같겠지만,
// 정정 대상 여부(quantity 전달 가능 여부)를 가르는 값이라 더 근거 있는 쪽을 쓴다.
function ModifyOrderSheet({
  accountSeq,
  order,
  onClose,
  onModified,
}: {
  accountSeq: string;
  order: OrderHistoryItem;
  onClose: () => void;
  onModified: () => void;
}) {
  const { message, modal } = App.useApp();
  const isUs = order.currency === 'USD';
  const [price, setPrice] = useState(Number(order.price ?? 0));
  // TODO(미검증 — 실거래로 확인 필요): order.quantity는 원주문 "총 수량"이다(이미 체결된 몫
  // 포함, execution.filledQuantity는 별도 필드). 부분체결(PARTIAL_FILLED)된 주문을 정정할 때
  // OrderModifyRequest.quantity를 API가 "새 총수량"으로 해석하는지 "남은 미체결수량"으로
  // 해석하는지 문서(OrderModifyRequest 스키마, openapi.json)만으로는 확정할 수 없다 — 지금은
  // "새 총수량" 가정 하에 원주문 quantity를 그대로 기본값으로 채운다. 실거래로 소액 부분체결을
  // 만든 뒤 가격만 바꿔 정정해보고 실제 체결/잔량이 어떻게 되는지 확인되면, 그 결과에 맞게 이
  // 기본값 로직(및 필요하면 "남은 수량"만 보여주는 UI로) 수정할 것.
  const [quantity, setQuantity] = useState(Number(order.quantity));
  const [submitting, setSubmitting] = useState(false);

  const submit = async (confirmHighValueOrder: boolean) => {
    setSubmitting(true);
    try {
      const outcome = await api.modifyOrder(accountSeq, order.orderId, {
        orderType: 'LIMIT',
        price: String(price),
        quantity: isUs ? undefined : String(quantity),
        confirmHighValueOrder,
      });
      if (!outcome.ok) {
        modal.confirm({
          title: '1억원 이상 주문 확인',
          content: outcome.message,
          okText: '정정 진행',
          cancelText: '취소',
          onOk: () => submit(true),
        });
        return;
      }
      message.success('주문을 정정했습니다.');
      onModified();
    } catch (err) {
      message.error(ipcErrorMessage(err, '주문 정정에 실패했습니다.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Drawer
      open
      placement="bottom"
      height={isUs ? 200 : 260}
      onClose={onClose}
      title={`${order.symbol} 주문 정정`}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Field label="가격">
          <InputNumber
            style={{ width: '100%' }}
            min={0}
            value={price}
            controls={false}
            formatter={(value) => Number(value ?? 0).toLocaleString()}
            parser={(value) => Number((value ?? '0').replace(/[^0-9.]/g, ''))}
            onChange={(value) => setPrice(roundToTick(Number(value ?? 0), order.currency))}
          />
        </Field>
        {!isUs && (
          <Field label="수량">
            <InputNumber
              style={{ width: '100%' }}
              min={1}
              precision={0}
              value={quantity}
              onChange={(value) => setQuantity(Number(value ?? 0))}
            />
          </Field>
        )}
        <Button
          type="primary"
          block
          loading={submitting}
          disabled={price <= 0 || (!isUs && quantity <= 0)}
          onClick={() => submit(false)}
        >
          정정하기
        </Button>
      </div>
    </Drawer>
  );
}

// "완료" 탭 — Order History API(GET /orders?status=CLOSED)로 이 종목의 체결완료/취소/거부된
// 주문을 최신순으로 보여준다. 취소/거부성 상태(CANCELED/REJECTED/CANCEL_REJECTED/
// REPLACE_REJECTED — 마지막 둘은 취소·정정 "시도 자체"가 거부된 레코드)는 흐리게 + 취소선으로
// 구분하고, 정정으로 대체된 원주문(REPLACED)은 실패가 아니라 "정정됨" 라벨만 붙인다.
const VOIDED_ORDER_STATUSES = new Set(['CANCELED', 'REJECTED', 'CANCEL_REJECTED', 'REPLACE_REJECTED']);

function CompletedOrdersList({
  accountSeq,
  symbol,
}: {
  accountSeq: string | null;
  symbol: string;
}) {
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<OrderHistoryItem[]>([]);
  const [loadError, setLoadError] = useState(false);

  const loadOrders = useCallback(() => {
    if (!accountSeq) return;
    setLoadError(false);
    api
      .listOrderHistory(accountSeq, { status: 'CLOSED', symbol, limit: 50 })
      .then((page) => setOrders(page.orders))
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, [accountSeq, symbol]);

  useEffect(() => {
    if (!accountSeq) return;
    // 종목/계좌가 바뀌면 이전 종목의 목록이 화면에 남지 않도록 즉시 로딩 상태로 되돌린다.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 위 이유로 동기 리셋이 필요
    setLoading(true);
    loadOrders();
  }, [accountSeq, loadOrders]);

  if (loading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spin />
      </div>
    );
  }

  if (loadError) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Empty description="매매기록을 불러오지 못했습니다.">
          <Button size="small" onClick={loadOrders}>
            다시 시도
          </Button>
        </Empty>
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Empty description="매매기록이 없습니다." />
      </div>
    );
  }

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '2px 4px' }}>
      {orders.map((order, index) => {
        const year = String(new Date(order.orderedAt).getFullYear());
        // 같은 해 안에서는 헤더를 반복하지 않고, 이전 항목과 연도가 다를 때만 새로 보여준다.
        const prevYear = index > 0 ? String(new Date(orders[index - 1].orderedAt).getFullYear()) : null;
        const showYearHeader = year !== prevYear;
        const isVoided = VOIDED_ORDER_STATUSES.has(order.status);
        const isReplaced = order.status === 'REPLACED';
        const sideLabel = order.side === 'BUY' ? '구매' : '판매';
        const sideColor = order.side === 'BUY' ? profitColors.up : profitColors.down;
        // 취소·거부된 주문은 체결가가 없거나 무의미해서(토스 앱과 동일하게) 금액 자체를 숨긴다.
        const displayPrice = isVoided ? null : (order.price ?? order.execution.averageFilledPrice);

        return (
          <div key={order.orderId}>
            {showYearHeader && (
              <Text
                style={{
                  display: 'block',
                  fontSize: 12,
                  fontWeight: 600,
                  color: 'rgba(0,0,0,0.4)',
                  letterSpacing: 0.2,
                  marginTop: index === 0 ? 0 : 18,
                  marginBottom: 2,
                }}
              >
                {year}
              </Text>
            )}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '7px 0' }}>
              <Text style={ORDER_ROW_DATE_STYLE}>{formatMonthDay(order.orderedAt)}</Text>
              <Text
                style={{
                  fontSize: 13,
                  flex: 1,
                  opacity: isVoided ? 0.45 : 1,
                  textDecoration: isVoided ? 'line-through' : undefined,
                }}
              >
                <span style={{ color: sideColor, fontWeight: 600 }}>{sideLabel}</span>{' '}
                {Number(order.quantity).toLocaleString()}주
              </Text>
              {isReplaced && (
                <Text style={{ fontSize: 11, color: 'rgba(0,0,0,0.4)', whiteSpace: 'nowrap' }}>정정됨</Text>
              )}
              {displayPrice !== null && (
                <Text style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                  {currencySymbol(order.currency)}
                  {formatAmount(displayPrice, order.currency)}
                </Text>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
        {label}
      </Text>
      {children}
    </div>
  );
}

function SummaryRow({
  label,
  value,
  color,
  tooltip,
}: {
  label: string;
  value: string;
  color?: string;
  tooltip?: string;
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
      <Text type="secondary">
        {label}
        {tooltip && (
          <Tooltip title={tooltip}>
            <InfoCircleOutlined style={{ marginLeft: 4 }} />
          </Tooltip>
        )}
      </Text>
      <Text style={{ color }}>{value}</Text>
    </div>
  );
}

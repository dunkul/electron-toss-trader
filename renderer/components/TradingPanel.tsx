import { useEffect, useState, type ReactNode } from 'react';
import { App, Button, Empty, InputNumber, Segmented, Select, Space, Switch, Tabs, Typography } from 'antd';
import { MinusOutlined, PlusOutlined } from '@ant-design/icons';
import { currencySymbol, formatAmount, formatRate, profitColor } from '../lib/format';
import { roundToTick, stepPrice } from '../lib/trading';
import { api } from '../lib/ipc';
import type { ChartWindowStock, Holding } from '../lib/ipc';

const { Text } = Typography;

type OrderSide = 'buy' | 'sell';
type PriceMode = 'limit' | 'market';

const QUANTITY_PERCENT_OPTIONS = [10, 25, 50, 100] as const;

interface TradingPanelProps {
  stock: ChartWindowStock;
  currency: string;
  lastPrice: number | undefined;
  orderPrice: number | undefined;
  onOrderPriceChange: (price: number) => void;
}

// 매매지원이 켜졌을 때 호가창 오른쪽에 붙는 거래화면. buying-power/sellable-quantity/holdings는
// 실제 계좌 값을 그대로 보여주지만, 이 화면의 "구매예약하기/판매예약하기"는 아직 실제 주문
// API(POST /orders)에 연동돼 있지 않다 — 토스증권 Open API는 모의투자가 없어 주문 연동 시
// 즉시 실계좌에 반영되므로, 그 연동은 별도로 설계/확인 후 진행한다.
export default function TradingPanel({
  stock,
  currency,
  lastPrice,
  orderPrice,
  onOrderPriceChange,
}: TradingPanelProps) {
  const { message } = App.useApp();
  const [activeTab, setActiveTab] = useState<OrderSide | 'pending'>('buy');
  const [priceMode, setPriceMode] = useState<PriceMode>('limit');
  const [quantity, setQuantity] = useState(0);

  const [accountSeq, setAccountSeq] = useState<string | null>(null);
  const [buyingPower, setBuyingPower] = useState<number | null>(null);
  const [sellableQuantity, setSellableQuantity] = useState(0);
  const [holding, setHolding] = useState<Holding | null>(null);

  useEffect(() => {
    api
      .listAccounts()
      .then((accounts) => {
        const account = accounts[0];
        if (account) setAccountSeq(String(account.accountSeq));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
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

  // 탭/종목이 바뀌면 이전 종목·반대 방향 기준으로 잡았던 수량이 그대로 남지 않게 초기화한다.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 탭/종목 전환 시 즉시 리셋 필요
    setQuantity(0);
  }, [activeTab, stock.symbol]);

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

  const handleSubmit = () => {
    message.info('실제 매매 API 연동은 아직 준비 중입니다. 이 화면은 미리보기입니다.');
  };

  if (activeTab === 'pending') {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <OrderSideTabs activeTab={activeTab} onChange={setActiveTab} />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Empty description="주문 대기 내역 조회 기능은 준비 중입니다." />
        </div>
      </div>
    );
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <OrderSideTabs activeTab={activeTab} onChange={setActiveTab} />

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
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            미수거래 (지원 예정)
          </Text>
          <Switch checked={false} disabled />
        </div>

        <Button
          type="primary"
          danger={activeTab === 'sell'}
          block
          disabled={quantity <= 0}
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
  onChange,
}: {
  activeTab: OrderSide | 'pending';
  onChange: (key: OrderSide | 'pending') => void;
}) {
  return (
    <Tabs
      size="small"
      activeKey={activeTab}
      onChange={(key) => onChange(key as OrderSide | 'pending')}
      items={[
        { key: 'buy', label: '구매' },
        { key: 'sell', label: '판매' },
        { key: 'pending', label: '대기' },
      ]}
    />
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

function SummaryRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
      <Text type="secondary">{label}</Text>
      <Text style={{ color }}>{value}</Text>
    </div>
  );
}

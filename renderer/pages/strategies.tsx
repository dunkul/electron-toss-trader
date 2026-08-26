import { useCallback, useEffect, useState } from 'react';
import Head from 'next/head';
import {
  App,
  AutoComplete,
  Button,
  Form,
  InputNumber,
  Modal,
  Popconfirm,
  Radio,
  Select,
  Space,
  Switch,
  Table,
  Tag,
} from 'antd';
import AppLayout from '../components/AppLayout';
import { api } from '../lib/ipc';
import type { Market, StockRow, StrategyRow } from '../lib/ipc';

interface PriceTargetFormValues {
  name: string;
  symbol: string;
  market: Market;
  direction: 'ABOVE' | 'BELOW';
  targetPrice: number;
  cooldownSec: number;
  notifyDesktop: boolean;
  notifySound: boolean;
}

export default function StrategiesPage() {
  const { message } = App.useApp();
  const [form] = Form.useForm<PriceTargetFormValues>();
  const [strategies, setStrategies] = useState<StrategyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [symbolOptions, setSymbolOptions] = useState<StockRow[]>([]);
  const [symbolQuery, setSymbolQuery] = useState('');

  const loadStrategies = useCallback(async () => {
    setLoading(true);
    try {
      setStrategies(await api.listStrategies());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 시 1회 초기 로딩(표준 fetch-on-mount 패턴)
    loadStrategies();
  }, [loadStrategies]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (symbolQuery.length === 0) {
        setSymbolOptions([]);
        return;
      }
      api
        .searchStocks(symbolQuery, 15)
        .then(setSymbolOptions)
        .catch(() => setSymbolOptions([]));
    }, 250);
    return () => clearTimeout(timer);
  }, [symbolQuery]);

  const openCreateModal = () => {
    form.resetFields();
    form.setFieldsValue({
      market: 'KR',
      direction: 'ABOVE',
      cooldownSec: 300,
      notifyDesktop: true,
      notifySound: true,
    });
    setModalOpen(true);
  };

  const handleCreate = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await api.createStrategy({
        name: values.name,
        symbol: values.symbol,
        market: values.market,
        strategyType: 'PRICE_TARGET',
        params: { direction: values.direction, targetPrice: values.targetPrice },
        cooldownSec: values.cooldownSec,
        notifyDesktop: values.notifyDesktop,
        notifySound: values.notifySound,
      });
      message.success('전략을 등록했습니다.');
      setModalOpen(false);
      loadStrategies();
    } catch (err) {
      if (err instanceof Error) message.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (strategy: StrategyRow, isActive: boolean) => {
    await api.toggleStrategy(strategy.id, isActive);
    loadStrategies();
  };

  const handleDelete = async (strategy: StrategyRow) => {
    await api.deleteStrategy(strategy.id);
    message.success(`"${strategy.name}" 전략을 삭제했습니다.`);
    loadStrategies();
  };

  return (
    <AppLayout title="전략 (알림 조건)">
      <Head>
        <title>전략 - 토스증권 알림</title>
      </Head>

      <Space style={{ marginBottom: 16 }}>
        <Button type="primary" onClick={openCreateModal}>
          새 전략 만들기
        </Button>
      </Space>

      <Table<StrategyRow>
        rowKey="id"
        loading={loading}
        dataSource={strategies}
        locale={{ emptyText: '등록된 전략이 없습니다.' }}
        columns={[
          { title: '이름', dataIndex: 'name' },
          { title: '종목', dataIndex: 'symbol' },
          { title: '마켓', dataIndex: 'market' },
          {
            title: '유형',
            dataIndex: 'strategy_type',
            render: (value: string) => <Tag>{value}</Tag>,
          },
          { title: '쿨다운(초)', dataIndex: 'cooldown_sec', align: 'right' },
          {
            title: '감시 상태',
            dataIndex: 'is_active',
            render: (value: 0 | 1, record) => (
              <Switch checked={value === 1} onChange={(checked) => handleToggle(record, checked)} />
            ),
          },
          {
            title: '',
            key: 'actions',
            render: (_value, record) => (
              <Popconfirm
                title={`"${record.name}" 전략을 삭제할까요?`}
                onConfirm={() => handleDelete(record)}
                okText="삭제"
                cancelText="취소"
              >
                <Button size="small" danger>
                  삭제
                </Button>
              </Popconfirm>
            ),
          },
        ]}
      />

      <Modal
        title="새 전략 (목표가 알림)"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleCreate}
        confirmLoading={saving}
        okText="등록"
        cancelText="취소"
      >
        <Form<PriceTargetFormValues> form={form} layout="vertical">
          <Form.Item
            name="name"
            label="전략 이름"
            rules={[{ required: true, message: '이름을 입력하세요.' }]}
          >
            <input className="ant-input" placeholder="예: 삼성전자 7만원 돌파 알림" />
          </Form.Item>

          <Form.Item
            name="symbol"
            label="종목 코드"
            rules={[{ required: true, message: '종목을 선택하세요.' }]}
          >
            <AutoComplete
              placeholder="종목명 또는 코드 검색"
              value={symbolQuery}
              onSearch={setSymbolQuery}
              onSelect={(value: string) => form.setFieldValue('symbol', value)}
              onChange={(value: string) => {
                setSymbolQuery(value);
                form.setFieldValue('symbol', value);
              }}
              options={symbolOptions.map((stock) => ({
                value: stock.symbol,
                label: `${stock.name} (${stock.symbol})`,
              }))}
            />
          </Form.Item>

          <Form.Item name="market" label="마켓" rules={[{ required: true }]}>
            <Select
              options={[
                { value: 'KR', label: '국내' },
                { value: 'US', label: '해외' },
              ]}
            />
          </Form.Item>

          <Form.Item name="direction" label="조건" rules={[{ required: true }]}>
            <Radio.Group
              options={[
                { value: 'ABOVE', label: '목표가 이상으로 상승' },
                { value: 'BELOW', label: '목표가 이하로 하락' },
              ]}
              optionType="button"
            />
          </Form.Item>

          <Form.Item
            name="targetPrice"
            label="목표가"
            rules={[{ required: true, message: '목표가를 입력하세요.' }]}
          >
            <InputNumber style={{ width: '100%' }} min={0} step={100} />
          </Form.Item>

          <Form.Item
            name="cooldownSec"
            label="중복 알림 방지 간격(초)"
            rules={[{ required: true }]}
            tooltip="같은 조건이 계속 충족돼도 이 시간 동안은 재알림하지 않습니다."
          >
            <InputNumber style={{ width: '100%' }} min={30} step={30} />
          </Form.Item>

          <Space size="large">
            <Form.Item name="notifyDesktop" label="데스크톱 알림" valuePropName="checked">
              <Switch />
            </Form.Item>
            <Form.Item name="notifySound" label="사운드" valuePropName="checked">
              <Switch />
            </Form.Item>
          </Space>
        </Form>
      </Modal>
    </AppLayout>
  );
}

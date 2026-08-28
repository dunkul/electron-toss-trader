import Head from 'next/head';
import { Card, Col, Empty, Row } from 'antd';
import AppLayout from '../components/AppLayout';
import ChartCard from '../components/ChartCard';
import WatchlistPanel from '../components/WatchlistPanel';
import { useSelectedStockStore } from '../store/useSelectedStockStore';

export default function MarketPage() {
  const selected = useSelectedStockStore((s) => s.selected);

  return (
    <AppLayout>
      <Head>
        <title>시세/차트 - 토스 트레이더</title>
      </Head>

      {/* 뷰포트 높이에 맞춰 채우고, 관심종목 카드는 그 안에서 넘치는 만큼만 내부 스크롤되게 한다
          (전체 창이 늘어나 문서 스크롤이 생기는 대신 카드 안에서만 스크롤). 창을 늘리면 Row의
          height:100%가 AppLayout Content의 남은 높이를 그대로 따라가 함께 늘어난다. */}
      <Row gutter={16} style={{ height: '100%' }}>
        <Col span={8} style={{ height: '100%' }}>
          <WatchlistPanel />
        </Col>

        <Col span={16}>
          {selected ? (
            <ChartCard stock={selected} />
          ) : (
            <Card style={{ marginBottom: 16 }}>
              <Empty description="종목을 선택하세요." />
            </Card>
          )}
        </Col>
      </Row>
    </AppLayout>
  );
}

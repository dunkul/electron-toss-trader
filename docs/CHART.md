# 차트 고도화 기획서

> 작성일: 2026-08-27
> 대상: `renderer/pages/market.tsx`의 시세/차트 카드 (lightweight-charts v5 기반)
> 참고: 토스증권 웹의 종목 차트 캡처(사용자 제공) — 같은 라이브러리(TradingView `lightweight-charts`) 기반으로 추정됨

---

## 1. 목표

토스증권 웹 차트를 기준선으로 삼아, 현재 캔들+거래량만 있는 기본 차트에 실사용에 필요한 기능을
하나씩 붙여나간다. 한 번에 다 만들지 않고 **항목별로 작게 잘라서 순서대로 구현**한다(우선순위는
4장 순서).

**P0/P1은 나중에 다시 시작할 때 설계 의사결정 없이 바로 구현만 하면 되도록, 색상/함수 시그니처/
파일 위치/기준값까지 구체적으로 확정해서 적어둔다.** P2는 아직 착수 시점이 멀어서 기존 수준의
개요만 유지한다.

---

## 2. 현재 상태 (구현 완료)

| 항목               | 비고                                                                                |
| ------------------ | ------------------------------------------------------------------------------------- |
| 캔들스틱(일봉)      | `getCandles({ interval: '1d' })`, 최대 200개씩 커서 페이지네이션                       |
| 무한 스크롤(과거)   | 왼쪽 끝 10봉 이내로 드래그하면 자동으로 이전 페이지 로드                              |
| 실시간 갱신         | WS 틱으로 오늘 봉의 고가/저가/종가만 갱신(거래량은 갱신 안 됨 — 틱에 거래량 필드 없음) |
| 거래량 서브패널     | 캔들 패인 아래 별도 패인(4:1 비율), 상승/하락 색상은 `profitColor`와 동일 규칙 적용    |
| 크로스헤어 날짜 포맷 | `yyyy년 MM월 dd일`로 한국식 순서 고정                                                 |
| 반응형 리사이즈     | `window` resize 이벤트 + 카드가 보일 때 컨테이너 폭 재계산                            |

## 3. API 제약 및 범위 결정

- `GET /api/v1/candles`의 `interval`은 `docs/openapi.json` 기준 **`1m`, `1d` 두 가지만** 지원한다.
- **결정: 이 두 값만 쓴다.** 주/월/년봉(일봉 집계)이나 5분/15분봉(1분봉 리샘플링)처럼 API에 없는
  간격을 클라이언트에서 만들어내는 건 이번 로드맵에서 하지 않는다. 캡처 화면의 "일 주 월 년",
  "1분 ▾" UI는 참고만 하고 그대로 재현하지 않는다 — 봉 단위 전환 UI는 **일봉 ↔ 1분봉 두 개짜리
  토글**로 축소한다 (4장 P0-3 참고).
- 하우스키핑: `main/toss-api/endpoints/market.ts`의 `CandleInterval` 타입이 현재
  `'1m' | '5m' | '1d'`로 선언되어 있는데, `5m`은 실제 API에 없는 값이다(OpenAPI enum에는
  `["1m", "1d"]`뿐). P0-3 작업 시 `'1m' | '1d'`로 좁혀서 타입이 실제 계약과 맞도록 고친다.
- 이동평균선(가격/거래량)은 API가 주는 값이 아니라 클라이언트에서 캔들 데이터로 직접 계산한다
  (단순이동평균, SMA).
- 결론: 이번 로드맵의 상당수는 "새 API 연동"이 아니라 **이미 받아온 캔들 데이터를 가공/시각화**하는
  작업이다.

---

## 4. 기능 상세 설계

### P0-1. 이동평균선(MA) 오버레이

**목적**: 캔들 위에 5/20/60/120봉 단순이동평균선을 겹쳐 그린다(캡처 화면 좌상단 "이동평균선 5 20 60 120").

**계산 함수** — 새 파일 `renderer/lib/chart-indicators.ts`에 추가:

```ts
export interface ChartPoint {
  time: UTCTimestamp;
  value: number;
}

/** 단순이동평균(SMA). points는 시간 오름차순이어야 하며, period개 미만인 앞부분은 결과에서 제외된다. */
export function computeSMA(points: ChartPoint[], period: number): ChartPoint[] {
  const result: ChartPoint[] = [];
  let windowSum = 0;
  for (let i = 0; i < points.length; i += 1) {
    windowSum += points[i].value;
    if (i >= period) windowSum -= points[i - period].value;
    if (i >= period - 1) result.push({ time: points[i].time, value: windowSum / period });
  }
  return result;
}
```

(`UTCTimestamp`는 `lightweight-charts`에서 import. `market.tsx`가 캔들→`{time, value}` 변환 후 이 함수에 넘긴다 — 이 함수 자체는 캔들/lightweight-charts 타입을 몰라도 되게 순수하게 유지.)

**상수 및 색상** — `market.tsx` 상단(다른 상수들 옆)에 추가:

```ts
const MA_PERIODS = [5, 20, 60, 120] as const;
const MA_COLORS: Record<(typeof MA_PERIODS)[number], string> = {
  5: '#2e7d32', // 녹색
  20: '#f2994a', // 주황
  60: '#c0392b', // 적갈색
  120: '#8e44ad', // 보라
};
```

**시리즈 생성** (차트 생성 effect, `paneIndex` 생략 = 캔들과 같은 메인 패인):

```ts
const maSeriesRefs = useRef<Record<number, ISeriesApi<'Line'>>>({});
// ...차트 생성 effect 안:
MA_PERIODS.forEach((period) => {
  maSeriesRefs.current[period] = chart.addSeries(LineSeries, {
    color: MA_COLORS[period],
    lineWidth: 1,
    priceLineVisible: false,
    lastValueVisible: false, // 우측 축에 MA 마지막 값 라벨은 안 띄움(가격 라벨과 겹쳐 지저분해짐)
    crosshairMarkerVisible: false,
  });
});
```

**데이터 반영** — 기존 `renderChart(candlesDesc)` 안, 캔들/거래량 `setData` 다음에 추가:

```ts
const closePoints = ascendingCandles.map((c) => ({
  time: Math.floor(new Date(c.timestamp).getTime() / 1000) as UTCTimestamp,
  value: Number(c.closePrice),
}));
MA_PERIODS.forEach((period) => {
  maSeriesRefs.current[period]?.setData(computeSMA(closePoints, period));
});
```

**실시간 갱신** — 기존 tick 핸들러(`onMarketTick` 구독, `todayCandle.closePrice = tick.lastPrice`로
갱신하는 부분) 바로 다음에 추가. `candlesRef.current`는 최신순(내림차순)이므로 인덱스 0이 오늘봉:

```ts
MA_PERIODS.forEach((period) => {
  if (candlesRef.current.length < period) return; // 로드된 봉이 기간보다 적으면 스킵
  const sum = candlesRef.current.slice(0, period).reduce((acc, c) => acc + Number(c.closePrice), 0);
  maSeriesRefs.current[period]?.update({ time: todayTime, value: sum / period });
});
```

(`todayTime`은 기존 tick 핸들러에서 이미 계산 중인 `Math.floor(new Date(todayCandle.timestamp).getTime() / 1000)` 값을 재사용.)

**on/off 체크박스**:

- state: `const [visibleMaPeriods, setVisibleMaPeriods] = useState<Set<number>>(new Set(MA_PERIODS));`
- 토글 시 `setData`/`update`를 다시 하지 않고 `series.applyOptions({ visible: nextVisible })`만 호출(데이터는 유지, 렌더링만 껐다 켬).
- UI: 차트 컨테이너 우상단(캔들 패인 안쪽, `position: absolute; top: 8px; right: 12px;`) 텍스트 버튼 4개, 각 기간 숫자를 `MA_COLORS[period]`로 색칠. 클릭할 때마다 켜짐/꺼짐 토글, 꺼진 상태는 `opacity: 0.35`.

**엣지케이스**: 종목 전환/재조회(`loadSymbol`) 시 `candlesRef.current`가 통째로 교체되므로
`renderChart`가 다시 불리면서 MA도 자동으로 다시 계산됨 — 별도 리셋 로직 불필요.

---

### P0-2. OHLC 상단 레전드

**목적**: 캡처 화면 좌상단 "시가 고가 저가 종가"처럼, 마우스를 캔들 위에 올리면 그 시점의
OHLC와 등락(그 캔들의 종가-시가 기준)을 차트 위에 텍스트로 보여준다. 마우스가 없을 때는
가장 최근 봉(오늘봉, 실시간 갱신됨) 값을 기본 표시한다.

**등락 기준 (확정)**: 레전드에 표시하는 등락은 **그 캔들 자체의 종가 − 시가**다. 관심종목
목록의 등락(전일종가 대비)과는 별개 기준이니 헷갈리지 않게 주석으로 명시할 것. 전일종가 대비로
하려면 `candlesRef.current`에서 인덱스+1(하루 전 봉)을 찾아야 해서 굳이 복잡하게 가지 않기로
결정.

**state**:

```ts
interface LegendOhlc {
  time: UTCTimestamp;
  open: number;
  high: number;
  low: number;
  close: number;
}
const [hoveredOhlc, setHoveredOhlc] = useState<LegendOhlc | null>(null);
const [liveTodayOhlc, setLiveTodayOhlc] = useState<LegendOhlc | null>(null);
```

- `liveTodayOhlc`는 (a) `renderChart` 호출 시 `ascendingCandles`의 마지막 원소로 초기화, (b) tick
  핸들러에서 `todayCandle` 갱신하는 바로 그 지점에 같이 `setState`(리렌더 트리거용 — 기존
  `candlesRef`는 ref라 그 자체로는 리렌더를 안 일으킴).
- 화면에는 `hoveredOhlc ?? liveTodayOhlc`를 표시.

**hover 구독** — 차트 생성 effect 안에 추가:

```ts
const handleCrosshairMove = (param: MouseEventParams<Time>) => {
  if (!param.time || !seriesRef.current) {
    setHoveredOhlc(null);
    return;
  }
  const bar = param.seriesData.get(seriesRef.current) as CandlestickData<Time> | undefined;
  if (!bar) {
    setHoveredOhlc(null);
    return;
  }
  setHoveredOhlc({
    time: param.time as UTCTimestamp,
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
  });
};
chart.subscribeCrosshairMove(handleCrosshairMove);
// cleanup에 chart.unsubscribeCrosshairMove(handleCrosshairMove) 추가
```

**UI**: 차트 컨테이너(`position: relative`로 이미 감싸져 있음) 좌상단에 절대 위치 오버레이:

```tsx
{(hoveredOhlc ?? liveTodayOhlc) && (
  <div style={{ position: 'absolute', top: 8, left: 12, fontSize: 12, zIndex: 1, pointerEvents: 'none' }}>
    {(() => {
      const o = hoveredOhlc ?? liveTodayOhlc!;
      const color = profitColor(o.close - o.open);
      return (
        <span style={{ color }}>
          시가 {o.open.toLocaleString()} 고가 {o.high.toLocaleString()} 저가 {o.low.toLocaleString()} 종가{' '}
          {o.close.toLocaleString()}
        </span>
      );
    })()}
  </div>
)}
```

MA 레전드(P0-1의 켜기/끄기 버튼 행)를 이 아래 줄에 같이 배치해서 캡처 화면과 같은 2줄 레이아웃을
만든다(`top: 28px`쯤).

**타입 import 추가**: `market.tsx` 상단 lightweight-charts import에 `type CandlestickData`,
`type MouseEventParams`, `type Time` 추가.

---

### P0-3. 봉 단위 전환 UI (일봉 ↔ 1분봉)

**목적**: 캡처 화면의 "일 주 월 년" 탭을 흉내내되, 3장에서 결정한 대로 **일봉/1분봉 두 개만**
전환한다.

**타입 수정** — `main/toss-api/endpoints/market.ts`: `CandleInterval`을 `'1m' | '1d'`로 좁힌다
(현재 `'5m'` 포함되어 있는데 실제 API 계약과 안 맞음). 이 타입을 쓰는 곳(`main/ipc/register.ts`,
`renderer/lib/ipc.ts`의 재수출 등)은 구조적 타이핑이라 값 좁히기만으로는 별도 수정 불필요 — 빌드
에러 나는 곳 있으면 그때 같이 고침.

**state** (`market.tsx`):

```ts
const [candleInterval, setCandleInterval] = useState<CandleInterval>('1d');
```

**데이터 재조회**: 기존 `loadSymbol(stock)`이 `api.getCandles({ symbol, interval: '1d', count: CANDLE_PAGE_SIZE })`를
호출하는 부분을 `interval: candleInterval`로 바꾼다. 인터벌 전환 시에는 새 종목을 고르는 것과
동일하게 캔들을 처음부터 다시 불러와야 하므로, `handleIntervalChange`를 새로 만들어 `loadSymbol`의
캔들 재조회 로직을 재사용(간단히는 `if (selected) loadSymbol(selected)` 호출로 충분 — `loadSymbol`이
이미 `candlesRef`/`nextBefore`/차트를 전부 초기화해서 다시 그려주는 함수이므로 그대로 재사용 가능,
단 `interval`을 state에서 읽도록 내부에서 `candleInterval`을 참조하게 수정 필요).

```ts
const handleIntervalChange = useCallback(
  (interval: CandleInterval) => {
    setCandleInterval(interval);
    if (selected) loadSymbol(selected); // loadSymbol 내부에서 candleInterval을 참조하도록 수정
  },
  [selected, loadSymbol],
);
```

**차트 옵션 전환** (분봉일 때 x축에 시:분 표시): `candleInterval`이 바뀔 때
`chartApiRef.current?.applyOptions({ timeScale: { timeVisible: candleInterval === '1m', secondsVisible: false } })`
호출. `timeVisible: true`면 tick mark/crosshair 라벨에 시:분까지 자동으로 붙는지 lightweight-charts
기본 동작으로 확인만 하면 됨(별도 `tickMarkFormatter` 커스터마이즈는 필요해 보이면 그때 추가 —
지금은 필요 없다고 가정하고 시작).

**UI**: 차트 `Card`의 `extra`(현재 `renderPriceBlock(price, true)`만 있는 자리)를 `Space`로 감싸서
`Segmented` 추가:

```tsx
extra={
  selected && (
    <Space>
      <Segmented
        size="small"
        value={candleInterval}
        onChange={(value) => handleIntervalChange(value as CandleInterval)}
        options={[{ label: '일봉', value: '1d' }, { label: '1분봉', value: '1m' }]}
      />
      {price && renderPriceBlock(price, true)}
    </Space>
  )
}
```

**확인 필요(구현 시 실제 API 호출로 검증)**:

- 1분봉의 조회 가능 범위(`before` 페이지네이션이 며칠 전까지 되는지, 아니면 당일 장중만 되는지) —
  안 되면 무한 스크롤(P0 기존 기능)이 1분봉에서는 자연히 "더 이상 이전 데이터 없음" 상태로 일찍
  멈출 뿐이니 별도 방어 코드는 필요 없을 가능성이 높음. `getCandles`가 빈 배열/같은 `nextBefore`를
  반환하는 경우 `handleLoadMore`가 무한루프 안 도는지만 확인.
- 장 시간 외 구간의 갭 — 캔들이 실제 데이터 포인트 단위(ordinal x축)라 자연히 문제없을 것으로
  예상되나 1분봉으로 실제 렌더링해서 눈으로 한 번 확인.

---

### P1-4. 거래량 이동평균선(20)

**목적**: 거래량 서브패널에도 캡처 화면처럼 20기간 이동평균선을 추가.

**시리즈 생성** (거래량 히스토그램과 같은 `paneIndex: 1`):

```ts
const volumeMaSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
// 차트 생성 effect 안, volumeSeries 추가 직후:
volumeMaSeriesRef.current = chart.addSeries(
  LineSeries,
  { color: '#2f80ed', lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false },
  1,
);
```

**데이터 반영** (`renderChart` 안, 거래량 `setData` 다음):

```ts
const volumePoints = ascendingCandles.map((c) => ({
  time: Math.floor(new Date(c.timestamp).getTime() / 1000) as UTCTimestamp,
  value: Number(c.volume),
}));
volumeMaSeriesRef.current?.setData(computeSMA(volumePoints, 20));
```

- P0-1과 달리 **켜기/끄기 토글 없음**(캡처 화면에도 없음) — 거래량 패널이 보이는 동안 항상 표시.
- 실시간 틱에는 거래량이 안 실려 오므로(2장 참고) 오늘봉 거래량 MA는 살아있는 동안 갱신 안 됨 —
  기존 거래량 막대와 동일한 한계라 별도 처리 안 함.

---

### P1-5. 고점/저점 자동 마커

**목적**: 캡처 화면의 "418,149원 (-58.51%, 26.06.22)"(고점, 빨강), "54,719원 (+216.98%, 26.03.30)"
(저점, 파랑)처럼 현재 로드된 캔들 범위의 최고가/최저가 지점에 라벨을 자동으로 붙인다.

**기준 확정** (캡처 화면 수치 역산으로 검증됨):

- 대상 범위: **`candlesRef.current`에 현재 로드되어 있는 전체 캔들**(무한 스크롤로 더 불러오면
  범위가 넓어지고, 그에 따라 고점/저점이 바뀔 수 있음 — 의도된 동작).
- 고점 = 그 범위의 `high` 최댓값, 저점 = `low` 최솟값.
- 표시하는 퍼센트 = **(현재가 − 그 지점 가격) / 그 지점 가격 × 100**, 즉 "그때 대비 지금 몇%
  변했는지"다. 검증: 캡처 화면 고점 418,149 → 현재가 173,448 → (173448-418149)/418149 ≈ −58.5%
  (캡처의 −58.51%와 일치). 저점 54,719 → 173,448 → +217.0%(캡처의 +216.98%와 일치).
- 색상은 등락 부호가 아니라 **고점=빨강(`profitColors.up`), 저점=파랑(`profitColors.down`) 고정**
  (고점 라벨의 −58.51%가 하락값인데도 캡처 화면에서 빨간 글씨인 것으로 확인됨 — 즉 "그 지점이
  고점이었다/저점이었다"를 색으로 표시하는 것이지 등락 부호를 표시하는 게 아님).

**구현 방식**: lightweight-charts에는 이 캡처처럼 "가격+퍼센트+날짜 3줄 텍스트를 정확한 좌표에"
그려주는 내장 기능이 없다. `createSeriesMarkers`(마커 점 찍기)와 **React DOM 오버레이 텍스트**를
조합한다(P0-2 OHLC 레전드와 같은 패턴 — 캔들 컨테이너는 이미 `position: relative`).

1. 고점/저점 탐색 함수 — `renderer/lib/chart-indicators.ts`에 추가:

   ```ts
   export interface ExtremePoint {
     time: UTCTimestamp;
     price: number;
   }

   export function findHighLow(candlesAscending: { timestamp: string; highPrice: string; lowPrice: string }[]): {
     high: ExtremePoint;
     low: ExtremePoint;
   } | null {
     if (candlesAscending.length === 0) return null;
     let high = { time: 0 as UTCTimestamp, price: -Infinity };
     let low = { time: 0 as UTCTimestamp, price: Infinity };
     for (const candle of candlesAscending) {
       const time = Math.floor(new Date(candle.timestamp).getTime() / 1000) as UTCTimestamp;
       const h = Number(candle.highPrice);
       const l = Number(candle.lowPrice);
       if (h > high.price) high = { time, price: h };
       if (l < low.price) low = { time, price: l };
     }
     return { high, low };
   }
   ```

2. 마커 점 — `renderChart` 안, `findHighLow(ascendingCandles)` 호출 후:

   ```ts
   import { createSeriesMarkers } from 'lightweight-charts';
   // ref로 보관: const markersPluginRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
   const extremes = findHighLow(ascendingCandles);
   if (extremes && seriesRef.current) {
     if (!markersPluginRef.current) markersPluginRef.current = createSeriesMarkers(seriesRef.current, []);
     markersPluginRef.current.setMarkers([
       { time: extremes.high.time, position: 'aboveBar', color: profitColors.up, shape: 'circle' },
       { time: extremes.low.time, position: 'belowBar', color: profitColors.down, shape: 'circle' },
     ]);
   }
   ```

3. 텍스트 라벨 좌표 — 마커 점과는 별개로, 매 렌더/줌/스크롤마다 좌표를 다시 계산해야 한다.
   기존에 무한 스크롤용으로 이미 구독 중인
   `chart.timeScale().subscribeVisibleLogicalRangeChange(...)` 핸들러 안에 좌표 재계산을 얹는다
   (새 구독을 또 만들지 않음):

   ```ts
   interface ExtremeLabelPos {
     x: number;
     y: number;
     price: number;
     dateLabel: string;
   }
   const [highLabelPos, setHighLabelPos] = useState<ExtremeLabelPos | null>(null);
   const [lowLabelPos, setLowLabelPos] = useState<ExtremeLabelPos | null>(null);

   const updateExtremeLabelPositions = useCallback(() => {
     const extremes = extremesRef.current; // renderChart에서 findHighLow 결과를 ref에도 저장해둠
     const chart = chartApiRef.current;
     const series = seriesRef.current;
     if (!extremes || !chart || !series) return;
     const toPos = (point: ExtremePoint): ExtremeLabelPos | null => {
       const x = chart.timeScale().timeToCoordinate(point.time);
       const y = series.priceToCoordinate(point.price);
       if (x === null || y === null) return null; // 현재 보이는 범위 밖 → 라벨 숨김
       return { x, y, price: point.price, dateLabel: formatExtremeDate(point.time) };
     };
     setHighLabelPos(toPos(extremes.high));
     setLowLabelPos(toPos(extremes.low));
   }, []);
   ```

   `handleVisibleLogicalRangeChange` 맨 앞에서 `updateExtremeLabelPositions()`를 호출하고,
   `renderChart` 끝에서도 한 번 호출(초기 렌더 시 좌표가 비어있지 않도록).

4. 오버레이 렌더링(퍼센트는 렌더링 시점에 `price`(현재가, 이미 있는 state) 기준으로 계산 — 별도
   저장 안 하고 그때그때 계산):

   ```tsx
   {highLabelPos && price && (
     <div
       style={{
         position: 'absolute',
         left: highLabelPos.x,
         top: highLabelPos.y - 32,
         transform: 'translateX(-50%)',
         fontSize: 11,
         color: profitColors.up,
         textAlign: 'center',
         pointerEvents: 'none',
         whiteSpace: 'nowrap',
       }}
     >
       {highLabelPos.price.toLocaleString()}원 ({formatRate((Number(price.lastPrice) - highLabelPos.price) / highLabelPos.price)}, {highLabelPos.dateLabel})
     </div>
   )}
   {/* lowLabelPos도 동일하게, color만 profitColors.down, top: lowLabelPos.y + 8 (막대 아래쪽) */}
   ```

   `formatExtremeDate(time: UTCTimestamp): string`은 `26.06.22`처럼 `YY.MM.DD` 포맷 — 새로
   `chart-indicators.ts`나 `lib/format.ts`에 작은 헬퍼로 추가.

**이 항목이 P1 중 가장 손이 많이 감** — 새 좌표계산 로직 + 리사이즈/줌/스크롤마다 재계산이라
정확도(라벨이 캔들에서 살짝씩 밀리는 문제 등)는 실제로 붙여보면서 조정 필요.

---

### P1-7. 차트 크게보기(확대)

**목적**: 카드 우측 상단에 "차트 크게보기" 버튼 — 클릭 시 현재 차트를 더 큰 화면(모달)으로 확대.

**결정: DOM 재사용(re-parent) 안 함.** 기존 차트 인스턴스를 모달로 옮기는 대신, 모달 오픈 시
같은 데이터로 **새 차트 인스턴스를 모달 안에 별도로 생성**한다. 이유: lightweight-charts 캔버스를
React 트리 밖(Modal은 포탈)으로 리페어런팅하면 언마운트/리마운트 타이밍에 깨질 여지가 있어,
"닫으면 없어지는 일회성 인스턴스"로 단순하게 간다.

**결정: 모달이 열려있는 동안 실시간 틱 반영은 하지 않는다.** 메인 차트와 모달 차트 두 개를 동시에
tick으로 갱신하려면 시리즈 refs를 배열로 관리해야 해서(현재 단일 ref 구조 전면 수정) 비용 대비
효과가 낮다고 판단 — 모달은 "지금 로드된 데이터를 크게 보는" 스냅샷으로 취급. 닫았다 다시 열면
그 시점 최신 데이터로 다시 그려짐.

**구현**:

1. 차트 생성 로직을 함수로 추출: `buildChart(container: HTMLElement, candlesDesc: Candle[], interval: CandleInterval): IChartApi` — 지금 차트 생성 effect 안에 있는 `createChart` + 캔들/거래량/MA 시리즈 생성 + `setData`까지를 그대로 옮긴 헬퍼. 메인 차트 effect와 모달 둘 다 이 함수를 호출.
2. `const [chartModalOpen, setChartModalOpen] = useState(false);`
3. 모달:
   ```tsx
   <Modal open={chartModalOpen} onCancel={() => setChartModalOpen(false)} footer={null} width="90vw" styles={{ body: { height: '85vh' } }} destroyOnHidden>
     <ExpandedChart candles={candlesRef.current} interval={candleInterval} />
   </Modal>
   ```
   `ExpandedChart`는 새 컴포넌트(`renderer/components/ExpandedChart.tsx` 또는 `market.tsx` 파일
   하단): 컨테이너 ref 하나 두고 `useEffect`에서 `buildChart(container, candles, interval)` 호출,
   언마운트 시 `chart.remove()`. `destroyOnHidden`(antd Modal prop)으로 닫힐 때 자동 언마운트되게
   해서 별도 정리 코드가 간단해짐.
4. 버튼: 차트 `Card`의 `extra` 영역(P0-3의 `Segmented` 옆)에 `<Button icon={<ExpandOutlined />} onClick={() => setChartModalOpen(true)} />` 추가.

---

## 5. P2 — 나중 (범위가 크거나 우선순위 낮음, 상세 설계는 착수 시점에)

1. **보조지표 추가 메뉴** (RSI, MACD, 볼린저밴드 등) — 캡처 화면 우상단 "+ 보조지표". 지표별로
   계산 로직 + 표시 방식(오버레이 vs 서브패널)이 다 달라서 사실상 지표 하나하나가 별도 작업
   단위. `chart-indicators.ts`(P0-1에서 만듦)에 계속 추가해나가는 방향.
2. **그리기 도구** (추세선, 채널, 피보나치 되돌림 등) — lightweight-charts v5 커스텀 프리미티브
   플러그인으로 구현 가능하지만 마우스 인터랙션(드래그로 선 긋기, 앵커 이동)을 직접 만들어야 해서
   이 문서 전체에서 가장 공수가 큰 항목.
3. **종목비교** (다른 종목을 정규화해서 같은 차트에 오버레이) — 비교 종목 일봉을 추가로 fetch →
   기준 시점 대비 %로 정규화한 `LineSeries`를 오버레이.
4. **차트 설정** (배경/그리드/캔들 색상 커스터마이징) — 지금은 다크/라이트 테마 대응조차 없어서
   우선순위 낮음.
5. **거래량 값 축약 표시** ("1.79M"처럼) — `lib/format.ts`의 `formatCompactAmount`를 거래량
   시리즈의 `priceFormat`(커스텀 `priceFormatter`)에 연결. 작업량이 작아서 다른 항목 진행하다
   곁다리로 끝내도 됨.

---

## 6. 참고 — 캡처 화면에서 확인했지만 이 로드맵에 안 넣은 것

- 좌상단 인터벌 드롭다운 옆 아이콘들(파형/휴지통) — 각각 지표 보기 전환, 그리기 초기화로
  추정되며 P2-1/P2-2에 종속되는 하위 UI라 별도 항목으로 안 뺐음.
- 우측 가격축의 현재가 점선+라벨 — lightweight-charts 캔들 시리즈 기본 옵션(`priceLineVisible`,
  `lastValueVisible`)으로 이미 켜져 있을 가능성이 높다. P0 착수 시 제일 먼저 눈으로 확인하고,
  안 보이면 옵션만 켜면 되는 수준이라 별도 항목으로 안 뺐음.

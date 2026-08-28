import type { UTCTimestamp } from 'lightweight-charts';

const KST_OFFSET_SECONDS = 9 * 60 * 60;

/**
 * Toss API의 timestamp는 항상 KST(+09:00)로 온다. `new Date(...).getTime()`은 그 순간의
 * 올바른 epoch를 주지만, lightweight-charts는 UTCTimestamp를 항상 UTC 달력/시계로 읽어서
 * 라벨을 그리므로 그대로 넘기면 시:분이 9시간 뒤로 밀려 보인다(예: 09:32 KST 봉이 00:32로
 * 표시됨 — 일봉은 날짜만 보여서 눈에 안 띄지만 1분봉에서는 바로 드러난다). KST 오프셋만큼
 * 더해서 "UTC로 읽었을 때" 실제 KST 벽시계 값이 나오도록 보정한다.
 */
export function toChartTime(timestamp: string): UTCTimestamp {
  return (Math.floor(new Date(timestamp).getTime() / 1000) + KST_OFFSET_SECONDS) as UTCTimestamp;
}

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

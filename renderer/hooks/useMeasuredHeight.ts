import { useEffect, useRef, useState, type RefObject } from 'react';

// antd Table size="small" 헤더 행의 실제 렌더링 높이(기본 테마 기준 고정값) — scroll.y를 계산할 때
// 측정된 컨테이너 높이에서 이만큼 빼서 헤더를 제외한 "행 영역"만큼만 스크롤 높이로 잡는다.
export const TABLE_HEADER_HEIGHT_SM = 40;

/**
 * ResizeObserver로 엘리먼트의 실제 렌더링 높이(px)를 추적한다. antd Table의 scroll.y는 px
 * 숫자만 받으므로, flex 레이아웃에서 "남은 공간만큼만" 스크롤 영역을 잡아야 하는 테이블에
 * 이 값을 그대로 넘겨 쓴다(market.tsx 관심종목 테이블).
 */
export function useMeasuredHeight<T extends HTMLElement>(): [RefObject<T | null>, number] {
  const ref = useRef<T | null>(null);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setHeight(entry.contentRect.height);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return [ref, height];
}

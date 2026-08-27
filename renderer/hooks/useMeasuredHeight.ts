import { useEffect, useRef, useState, type RefObject } from 'react';

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

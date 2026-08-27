import type { ThemeConfig } from 'antd';

// 매매 시그널 "알림"이라는 주제와 맞춘 브라스/앰버 포인트 컬러.
export const appTheme: ThemeConfig = {
  token: {
    colorPrimary: '#a8660e',
    borderRadius: 6,
  },
};

// 국내 증시 관례에 맞춰 상승은 빨강, 하락은 파랑, 보합(변동 없음)은 검정으로 표시한다.
export const profitColors = {
  up: '#cf1322',
  down: '#1765ad',
  neutral: '#000000',
} as const;

// 관심종목 실시간 틱 반짝임 이펙트용 — profitColors를 옅게 탄 배경색. CSS 애니메이션이
// 이 색에서 투명으로 서서히 사라지게 만든다.
export const profitFlashColors = {
  up: 'rgba(207, 19, 34, 0.28)',
  down: 'rgba(23, 101, 173, 0.28)',
  neutral: 'rgba(0, 0, 0, 0.16)',
} as const;

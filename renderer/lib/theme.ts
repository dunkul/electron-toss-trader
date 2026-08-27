import type { ThemeConfig } from 'antd';

// 매매 시그널 "알림"이라는 주제와 맞춘 브라스/앰버 포인트 컬러.
export const appTheme: ThemeConfig = {
  token: {
    colorPrimary: '#a8660e',
    borderRadius: 6,
  },
};

// 국내 증시 관례에 맞춰 상승은 빨강, 하락은 파랑으로 표시한다.
export const profitColors = {
  up: '#cf1322',
  down: '#1765ad',
} as const;

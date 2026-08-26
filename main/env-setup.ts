import { app } from 'electron';

const isProd = process.env.NODE_ENV === 'production';

// logger.ts 등이 app.getPath('userData')를 모듈 로드 시점에 읽으므로,
// dev용 경로 분리는 다른 모듈을 import하기 전에 반드시 먼저 적용되어야 한다.
if (!isProd) {
  app.setPath('userData', `${app.getPath('userData')} (development)`);
}

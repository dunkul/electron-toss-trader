import type { AppProps } from 'next/app';
import { App as AntdApp, ConfigProvider } from 'antd';
import koKR from 'antd/locale/ko_KR';
import { appTheme } from '../lib/theme';
import '../styles/globals.scss';

export default function App({ Component, pageProps }: AppProps) {
  return (
    <ConfigProvider theme={appTheme} locale={koKR}>
      <AntdApp>
        <Component {...pageProps} />
      </AntdApp>
    </ConfigProvider>
  );
}

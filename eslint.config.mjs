import tseslint from 'typescript-eslint';
import nextConfig from 'eslint-config-next';
import prettierConfig from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: ['**/node_modules/**', '**/.next/**', 'app/**', 'dist/**', '**/next-env.d.ts'],
  },
  ...nextConfig,
  ...tseslint.configs.recommended,
  prettierConfig,
  {
    name: 'local-overrides',
    // Electron 데스크톱 앱이라 next/image의 LCP/대역폭 최적화가 적용되지 않는다 — 이 룰은 의미가 없다.
    rules: { '@next/next/no-img-element': 'off' },
  },
);

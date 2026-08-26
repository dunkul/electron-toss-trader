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
);

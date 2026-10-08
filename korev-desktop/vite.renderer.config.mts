import { defineConfig, type Plugin } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const SHARED_CSP = [
  "default-src 'none'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https://avatars.githubusercontent.com",
  "font-src 'self' data:",
  "base-uri 'none'",
  "form-action 'none'",
];
const BUILD_CSP = [...SHARED_CSP, "script-src 'self'", "connect-src 'none'"];
const DEV_SERVER_CSP = [
  ...SHARED_CSP,
  "script-src 'self' 'unsafe-inline'",
  "connect-src 'self' ws://localhost:*",
];

function contentSecurityPolicy(): Plugin {
  let directives = BUILD_CSP;
  return {
    name: 'korev:content-security-policy',
    configResolved(config) {
      directives = config.command === 'serve' ? DEV_SERVER_CSP : BUILD_CSP;
    },
    transformIndexHtml: () => [
      {
        tag: 'meta',
        attrs: {
          'http-equiv': 'Content-Security-Policy',
          content: directives.join('; '),
        },
        injectTo: 'head-prepend',
      },
    ],
  };
}

// https://vitejs.dev/config
export default defineConfig({
  plugins: [react(), tailwindcss(), contentSecurityPolicy()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/test-setup.ts'],
  },
});

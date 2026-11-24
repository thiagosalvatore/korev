import { defineConfig } from 'vite';

export default defineConfig({
  ssr: { noExternal: true },
  build: {
    ssr: 'src/headless.ts',
    outDir: '.vite/build',
    emptyOutDir: false,
    rollupOptions: {
      external: ['node-pty'],
      output: { format: 'cjs', entryFileNames: 'headless.cjs' },
    },
  },
});

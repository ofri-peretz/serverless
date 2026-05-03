import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import { resolve } from 'node:path';

export default defineConfig({
  build: {
    lib: {
      entry: {
        index: resolve(__dirname, 'src/index.ts'),
        'compat/index': resolve(__dirname, 'src/compat/index.ts'),
        functions: resolve(__dirname, 'src/functions.ts'),
      },
      formats: ['es', 'cjs'],
    },
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      external: ['serverless'],
    },
  },
  plugins: [
    dts({
      rollupTypes: false,
    }),
  ],
});

import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import { resolve } from 'node:path';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      formats: ['es', 'cjs'],
      fileName: 'index',
    },
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      external: ['serverless'],
      output: {
        // CRITICAL for Serverless Framework v4 plugin loading.
        //
        // v4's PluginManager resolves the plugin entry via `createRequire().resolve()`
        // (→ `dist/index.cjs`), then `await import()`s it. Node's CJS↔ESM interop
        // wraps `module.exports` as `namespace.default`. The framework then does
        // `Plugin = Plugin.default || Plugin` to unwrap.
        //
        // For that unwrap to land on the plugin constructor (not a wrapper object),
        // the CJS output MUST be `module.exports = PluginClass` (NOT
        // `exports.default = PluginClass`). `output.exports: 'default'` produces
        // the former. The named `InterlaceCachingPlugin` export is attached to the
        // class as a static property in `src/index.ts` so TS named imports still
        // resolve to the same constructor.
        exports: 'default',
      },
    },
  },
  plugins: [
    dts({
      rollupTypes: false,
    }),
  ],
});

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
        // CRITICAL for Serverless Framework v3 AND v4 plugin loading.
        //
        // Both versions resolve the plugin entry via `createRequire().resolve()`
        // → `dist/index.cjs`, then `await import()` it. Node CJS↔ESM interop
        // wraps `module.exports` as `namespace.default`. The framework then does
        // `Plugin = Plugin.default || Plugin` to unwrap.
        //
        // For that unwrap to land on the plugin constructor, the CJS output
        // must be `module.exports = PluginClass`. `output.exports: 'default'`
        // produces that form. Named exports (e.g., `InterlaceIamRolesPlugin`)
        // are attached as static properties on the class in `src/index.ts`.
        exports: 'default',
      },
    },
  },
  plugins: [dts({ rollupTypes: false })],
});

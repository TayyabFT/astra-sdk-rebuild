import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import dts from 'vite-plugin-dts'

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  const isLibBuild = mode === 'lib' || command === 'build' && process.env.BUILD_LIB === 'true';
  
  if (isLibBuild) {
    // Library build configuration
    return {
      plugins: [
        react(),
        dts({
          include: ['src/sdk/**/*.ts'],
          outDir: 'dist',
          rollupTypes: true,
          tsconfigPath: './tsconfig.sdk.json',
          exclude: ['src/**/*.test.ts', 'src/**/*.spec.ts', 'vite.config.ts'],
        }),
      ],
      build: {
        lib: {
          entry: resolve(__dirname, 'src/sdk/index.ts'),
          name: 'AstraSDK',
          fileName: (format) => `astra-sdk.${format}.js`,
          formats: ['es', 'cjs', 'umd'],
        },
        rollupOptions: {
          external: [],
          output: {
            globals: {},
            exports: 'named',
          },
        },
        sourcemap: true,
        minify: 'terser',
      },
    };
  }
  
  // Development and app build configuration
  return {
    plugins: [react()],
  };
})

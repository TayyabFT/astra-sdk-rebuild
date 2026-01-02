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
          include: ['src/sdk/**/*.ts', 'src/components/**/*.tsx', 'src/contexts/**/*.tsx', 'src/services/kycApiService.ts'],
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
          external: ['react', 'react-dom', 'react-router-dom', '@mediapipe/face_mesh', '@mediapipe/camera_utils', '@mediapipe/drawing_utils', 'qrcode.react'],
          output: {
            globals: {
              'react': 'React',
              'react-dom': 'ReactDOM',
              'react-router-dom': 'ReactRouterDOM',
            },
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
    build: {
      outDir: 'dist',
      assetsDir: 'assets',
      sourcemap: false,
      rollupOptions: {
        output: {
          manualChunks: undefined,
        },
      },
    },
    // Ensure proper base path for deployment
    base: '/',
  };
})

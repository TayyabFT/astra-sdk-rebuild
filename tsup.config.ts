// To fix the error, install tsup with: yarn add -D tsup
import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    "astra-sdk": "src/sdk/index.ts",
    "components": "src/components/index.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  sourcemap: true,
  treeshake: true,
  minify: false,
  target: "es2022",
  outDir: "dist",
  splitting: false,
  tsconfig: "./tsconfig.sdk.json",
  external: [
    "react",
    "react-dom",
    "react/jsx-runtime",
    "react-router-dom",
    "@mediapipe/face_mesh",
    "@mediapipe/camera_utils",
    "@mediapipe/drawing_utils",
    "@mediapipe/face_detection",
    "qrcode.react",
  ],
  esbuildOptions(options) {
    options.jsx = "automatic";
  },
  outExtension({ format }) {
    return {
      js: format === "cjs" ? ".cjs.js" : ".es.js",
    };
  },
});

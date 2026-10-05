import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  target: "es2021",
  external: ["react", "@sweberdev/logarithm"],
  banner: { js: '"use client";' },
});

import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/postgres.ts", "src/sqlite.ts"],
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  target: "es2021",
});

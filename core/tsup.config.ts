import { defineConfig } from "tsup";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/ai/*.ts",
    "src/tools/*.ts",
    "src/data/*.ts",
    "src/scheduler/*.ts",
    "src/policy/*.ts",
    "src/mcp/*.ts",
    "src/config/*.ts",
    "src/utils/*.ts"
  ],
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: false,
  clean: true,
  target: "es2021",
  outDir: "dist",
  shims: false,
  treeshake: true,
  skipNodeModulesBundle: true
});
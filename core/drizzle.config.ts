import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/data/schema.ts",
  out: "./migrations",
  dialect: "sqlite",
  dbCredentials: {
    url: "../data/pro-assist.db"
  }
});

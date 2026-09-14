import { defineConfig } from "astro/config";

export default defineConfig({
  site: process.env.SITE_URL || "https://www.sovereig.app",
  output: "static"
});

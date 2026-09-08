import { defineConfig } from "astro/config";

export default defineConfig({
  site: process.env.SITE_URL || "https://sovereign-journal.vercel.app",
  output: "static"
});

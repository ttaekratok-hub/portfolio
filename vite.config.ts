import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The app lives in site/ (index.html, src/, public/). `npm run build` writes
// the static site to dist/, which the Docker image serves with nginx.
export default defineConfig({
  root: "site",
  plugins: [react()],
  build: {
    outDir: "../dist",
    emptyOutDir: true,
  },
});

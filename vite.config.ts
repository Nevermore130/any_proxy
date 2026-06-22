import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  root: "src/client",
  publicDir: false,
  build: {
    emptyOutDir: true,
    outDir: "../../dist/public"
  }
});

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // Resolves the @contract/* tsconfig path alias at Vite's module-resolution
    // layer. Without this plugin, tsc accepts the alias but the Vite bundler
    // fails at runtime because Vite does not read tsconfig paths on its own.
    tsconfigPaths()
  ],
  server: {
    port: 5173,
    strictPort: true
  }
});

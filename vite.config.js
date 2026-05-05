import { defineConfig } from "vite";
import path from "path";
import cesium from "vite-plugin-cesium";
import { viteStaticCopy } from "vite-plugin-static-copy";

export default defineConfig({
  plugins: [
    cesium(),
    viteStaticCopy({
      targets: [
        { src: "node_modules/cesium/Build/Cesium/Assets",     dest: "cesium" },
        { src: "node_modules/cesium/Build/Cesium/Widgets",    dest: "cesium" },
        { src: "node_modules/cesium/Build/Cesium/ThirdParty", dest: "cesium" },
      ],
    }),
  ],
  resolve: {
    alias: {
      cesium: path.resolve(__dirname, "node_modules/cesium"),
    },
  },
  define: {
    CESIUM_BASE_URL: JSON.stringify("/cesium"),
  },
  server: {
    port: 3000,          // Vite dev server
    strictPort: true,
    fs: { allow: ["."] },
    proxy: {
      "/api": {
        target: "http://localhost:5055", // your Node/Express backend
        changeOrigin: true,
        secure: false,
        rewrite: (p) => p.replace(/^\/api/, ""),
      },
    },
  },
  build: {
    rollupOptions: {
      output: { manualChunks: undefined },
      input: {
        main: path.resolve(__dirname, "index.html"),
        draw: path.resolve(__dirname, "src/dev/draw.html"), // keep as in your current setup
      },
    },
  },
});

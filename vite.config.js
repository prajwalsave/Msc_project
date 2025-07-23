// vite.config.js
import { defineConfig } from "vite";
import path from "path";
import cesium from "vite-plugin-cesium";
import { viteStaticCopy } from "vite-plugin-static-copy";

export default defineConfig({
  plugins: [
    cesium(),
    viteStaticCopy({
      targets: [
        {
          src: "node_modules/cesium/Build/Cesium/Assets",
          dest: "cesium",
        },
        {
          src: "node_modules/cesium/Build/Cesium/Widgets",
          dest: "cesium",
        },
        {
          src: "node_modules/cesium/Build/Cesium/ThirdParty",
          dest: "cesium",
        },
      ],
    }),
  ],
  resolve: {
    alias: {
      // ✅ Alias for Cesium modules
      cesium: path.resolve(__dirname, "node_modules/cesium"),
    },
  },
  define: {
    // ✅ Used to locate Cesium assets
    CESIUM_BASE_URL: JSON.stringify("/cesium"),
  },
  server: {
    port: 3000,
    fs: {
      allow: ["."], // ✅ Allows access to entire project filesystem
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: undefined,
      },
      input: {
        // ✅ Entry for your main app
        main: path.resolve(__dirname, "index.html"),

        // ✅ Entry for your drawing tool in /src/dev
        draw: path.resolve(__dirname, "src/dev/draw.html"),
      },
    },
  },
});

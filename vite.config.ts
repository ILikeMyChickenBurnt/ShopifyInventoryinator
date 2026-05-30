import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    vue({
      // Enable template type checking in .vue files when using vue-tsc later
      script: {
        defineModel: true,
        propsDestructure: true,
      },
    }),
  ],

  // Renderer source lives under src/renderer.
  root: 'src/renderer',

  // Use relative base so the built files work when loaded via file:// in Electron
  base: './',

  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },

  build: {
    // Output compiled renderer assets next to the main process output
    outDir: '../../dist/renderer',
    emptyOutDir: true,
    rollupOptions: {
      // Vite uses src/renderer/index.html as the renderer entry point.
    },
  },
  define: {
    // No extra defines needed yet
  },

  // Useful for Electron dev (we can expand later with server config if needed)
  server: {
    port: 5173,
  },
});

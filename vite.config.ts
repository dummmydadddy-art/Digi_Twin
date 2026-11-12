import {fileURLToPath} from 'node:url';
import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/postcss';
const path=(relative:string)=>fileURLToPath(new URL(relative,import.meta.url));
export default defineConfig({
  root: path('./web'),
  publicDir: path('./public'),
  plugins: [react()],
  resolve: {
    alias: { '@': path('./') }
  },
  css: {
    postcss: { plugins: [tailwindcss()] }
  },
  server: {
    watch: { usePolling: true }
  },
  build: {
    outDir: path('./dist'),
    emptyOutDir: true,
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three')) return 'vendor-three';
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) return 'vendor-react';
          if (id.includes('node_modules/lucide-react')) return 'vendor-icons';
        }
      }
    }
  }
});

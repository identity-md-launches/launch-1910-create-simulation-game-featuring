import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// base "./" keeps every asset URL relative so the export works from an IPFS
// gateway subpath or an ENS name without a server rewrite.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
  },
})

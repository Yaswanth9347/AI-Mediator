import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react({
      // Ensure Fast Refresh works correctly
      fastRefresh: true,
      // Include all jsx/tsx files
      include: "**/*.{jsx,tsx}",
    }),
  ],
  server: {
    port: 5173,
    strictPort: true,
  },
  optimizeDeps: {
    // Force re-optimization of these dependencies
    include: ['react', 'react-dom', 'socket.io-client'],
  },
  esbuild: {
    // Ensure JSX is handled correctly
    jsx: 'automatic',
  },
})

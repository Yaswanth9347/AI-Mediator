import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { sentryVitePlugin } from '@sentry/vite-plugin'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const enableSentry = !!(process.env.SENTRY_AUTH_TOKEN && process.env.SENTRY_ORG && process.env.SENTRY_PROJECT);
  const plugins = [
    react({
      fastRefresh: true,
      include: "**/*.{jsx,tsx}",
    })
  ];

  if (enableSentry) {
    plugins.push(
      sentryVitePlugin({
        org: process.env.SENTRY_ORG,
        project: process.env.SENTRY_PROJECT,
        authToken: process.env.SENTRY_AUTH_TOKEN,
        release: process.env.VITE_SENTRY_RELEASE,
      })
    );
  }

  return {
    plugins,
    server: {
      port: 5173,
      strictPort: true,
    },
    optimizeDeps: {
      include: ['react', 'react-dom', 'socket.io-client'],
    },
    esbuild: {
      jsx: 'automatic',
    },
    build: {
      sourcemap: true,
    }
  }
})

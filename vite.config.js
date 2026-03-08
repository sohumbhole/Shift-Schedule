import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function printDevUrl() {
  return {
    name: 'print-dev-url',
    configureServer(server) {
      server.httpServer?.once('listening', () => {
        const port = server.config.server.port
        const url = `http://localhost:${port}`
        console.log('\n  \x1b[32mLocal:\x1b[0m   ' + url + '\n')
      })
    },
  }
}

export default defineConfig({
  base: '/',
  logLevel: 'error',
  plugins: [react(), printDevUrl()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
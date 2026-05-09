import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [
    tanstackStart(),
    tsconfigPaths(),
  ],
  build: {
    target: 'esnext',
    commonjsOptions: {
      include: [/node_modules/],
      exclude: [/node_modules\/@tanstack/],
    }
  }
})

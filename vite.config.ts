import { defineConfig } from 'vite'

export default defineConfig(({ command, isPreview }) => ({
  base: command === 'build' || isPreview ? '/cahier-echecs/' : '/',
  build: {
    target: 'es2022',
    outDir: 'dist',
  },
}))

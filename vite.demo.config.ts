import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

// Build della demo interattiva: stessa app, ma "supabase" è sostituito da una versione in memoria.
const fake = path.resolve('demo/supabase.ts')
const swap: Plugin = {
  name: 'fake-supabase',
  enforce: 'pre',
  resolveId(source, importer) {
    if (importer && /[/\\]src[/\\]/.test(importer) && /(^|\/)supabase$/.test(source) && !source.startsWith('@')) return fake
    return null
  },
}

export default defineConfig({
  root: 'demo',
  base: './',
  publicDir: path.resolve('public'),
  plugins: [swap, react()],
  build: { outDir: path.resolve('dist-demo'), emptyOutDir: true },
})

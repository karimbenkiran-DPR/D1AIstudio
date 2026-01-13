import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  preview: {
    allowedHosts: true, // Cette ligne autorise votre URL Google Cloud
    port: 8080,
    host: '0.0.0.0'
  }
})

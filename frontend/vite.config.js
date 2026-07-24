import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { readFileSync, writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import process from 'node:process'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Ersetzt Platzhalter in public/firebase-messaging-sw.js durch die echten
// VITE_FIREBASE_*-Werte - aber erst im generierten dist/-Ordner, NICHT in der
// im (oeffentlichen!) Git-Repo eingecheckten Quelldatei. So landet der Firebase
// API-Key nicht im Klartext im Repo, sondern nur im Deployment-Output.
function injectServiceWorkerConfig(env) {
  return {
    name: 'inject-sw-config',
    closeBundle() {
      const swPath = resolve(__dirname, 'dist/firebase-messaging-sw.js')
      let content = readFileSync(swPath, 'utf-8')
      const replacements = {
        __VITE_FIREBASE_API_KEY__: env.VITE_FIREBASE_API_KEY || '',
        __VITE_FIREBASE_AUTH_DOMAIN__: env.VITE_FIREBASE_AUTH_DOMAIN || '',
        __VITE_FIREBASE_PROJECT_ID__: env.VITE_FIREBASE_PROJECT_ID || '',
        __VITE_FIREBASE_STORAGE_BUCKET__: env.VITE_FIREBASE_STORAGE_BUCKET || '',
        __VITE_FIREBASE_MESSAGING_SENDER_ID__: env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
        __VITE_FIREBASE_APP_ID__: env.VITE_FIREBASE_APP_ID || ''
      }
      for (const [placeholder, value] of Object.entries(replacements)) {
        content = content.split(placeholder).join(value)
      }
      writeFileSync(swPath, content)
    }
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), tailwindcss(), injectServiceWorkerConfig(env)],
  }
})

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { applyUiShape } from './ui/shapeTheme.js'

applyUiShape()

// Wenn nach einem frischen Vercel-Deployment eine bereits geoeffnete PWA
// versucht, einen alten Lazy-Chunk-Hash nachzuladen, fängt Vite das ueber
// `vite:preloadError` ab -> einmal sauber neu laden statt Blackscreen.
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault()
  try {
    const key = 'kb_chunk_reload_ts'
    const last = Number(window.sessionStorage.getItem(key) || 0)
    if (Date.now() - last > 15000) {
      window.sessionStorage.setItem(key, String(Date.now()))
      window.location.reload()
    }
  } catch {
    window.location.reload()
  }
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

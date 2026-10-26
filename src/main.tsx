import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { App } from './App'
import { APP_DISPLAY_NAME } from '@/lib/formatters'

document.title = APP_DISPLAY_NAME

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('Root element #root not found in document.')
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

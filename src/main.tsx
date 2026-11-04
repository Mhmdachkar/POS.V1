import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { App } from './App'
import { APP_DISPLAY_NAME } from '@/lib/formatters'
import { bootEnd, bootLog, bootMark } from '@/lib/bootTiming'

bootMark('js.main-module')
bootLog('main module evaluating')

document.title = APP_DISPLAY_NAME

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('Root element #root not found in document.')
}

bootMark('react.render')
createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
bootEnd('js.main-module')
bootEnd('react.render')

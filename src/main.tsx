import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import '@/i18n'
import App from './App.tsx'
import { registerServiceWorker } from '@/lib/sw'
import { autoConfigureSync } from '@/lib/sync/autoConfig'

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('Root element not found')

createRoot(rootElement).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)

void registerServiceWorker()
void autoConfigureSync()

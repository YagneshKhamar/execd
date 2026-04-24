import './assets/main.css'
import React from 'react'
import ReactDOM from 'react-dom/client'
import i18next from 'i18next'
import { HashRouter } from 'react-router-dom'
import App from './App'
import { ToastProvider } from './components/Toast'
import i18n from './i18n/index'

async function initApp(): Promise<void> {
  try {
    const profile = await window.api.business.get()
    if (profile?.language && profile.language !== 'en' && profile.language !== i18next.language) {
      await i18n.changeLanguage(profile.language)
    }
  } catch {
    // default to English on error
  }

  ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
    <React.StrictMode>
      <HashRouter>
        <ToastProvider>
          <App />
        </ToastProvider>
      </HashRouter>
    </React.StrictMode>,
  )
}

initApp()

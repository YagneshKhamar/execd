import './assets/main.css'
import React from 'react'
import ReactDOM from 'react-dom/client'
import Overlay from './overlay/Overlay'

ReactDOM.createRoot(document.getElementById('overlay-root') as HTMLElement).render(
  <React.StrictMode>
    <Overlay />
  </React.StrictMode>,
)

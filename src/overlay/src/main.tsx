import '../../renderer/src/assets/main.css'
import React from 'react'
import ReactDOM from 'react-dom/client'
import Overlay from './Overlay'

document.body.classList.add('overlay-window')

ReactDOM.createRoot(document.getElementById('overlay-root') as HTMLElement).render(
  <React.StrictMode>
    <Overlay />
  </React.StrictMode>,
)

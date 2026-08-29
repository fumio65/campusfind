import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './shared/lib/operations/index.js'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
)
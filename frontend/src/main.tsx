import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom' // Importăm router-ul
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* BrowserRouter trebuie să fie părintele lui App pentru ca rutele să funcționeze */}
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
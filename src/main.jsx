import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import Admin from './Admin.jsx'
import App from './App.jsx'

const isAdmin = window.location.pathname.replace(/\/+$/, '') === '/admin'

createRoot(document.getElementById('root')).render(<StrictMode>{isAdmin ? <Admin /> : <App />}</StrictMode>)

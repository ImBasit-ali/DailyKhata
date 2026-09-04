import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Toaster } from 'react-hot-toast'
import App from './App.jsx'
import './index.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
    <Toaster
      position="top-right"
      toastOptions={{
        duration: 3000,
        style: {
          background: '#1e293b',
          color: '#f8fafc',
          fontSize: '14px',
          borderRadius: '10px',
          padding: '12px 16px',
        },
        success: {
          iconTheme: {
            primary: '#10b981',
            secondary: '#f8fafc',
          },
        },
        error: {
          iconTheme: {
            primary: '#f43f5e',
            secondary: '#f8fafc',
          },
        },
      }}
    />
  </StrictMode>,
)

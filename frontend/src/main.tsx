import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { useProductsStore } from './store/useProductsStore'

// Zustand 无需 Provider — 在应用挂载前触发产品目录初始化
useProductsStore.getState().init()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { SurveyPage } from './pages/SurveyPage.tsx'

const isSurveyRoute = window.location.pathname.startsWith('/survey')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isSurveyRoute ? <SurveyPage /> : <App />}
  </StrictMode>,
)

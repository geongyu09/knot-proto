import './assets/main.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { LocaleProvider } from '@renderer/shared/provider/context/localeContext'
import { reportRendererErrors } from '@renderer/shared/utils/rendererErrorReporter'
import App from './App'

// 창이 살아 있는 동안 계속 듣는다. 앱이 한 번 뜨고 내려가지 않으므로 해제하지 않는다
reportRendererErrors()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LocaleProvider>
      <App />
    </LocaleProvider>
  </StrictMode>
)

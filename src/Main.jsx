import React, { Suspense } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom'
import App from './App.jsx'
import './App.css'

const IwsdkImmersive = React.lazy(() => import('./pages/IwsdkImmersive.jsx'))
import { initRemoteLogClient } from './library/remoteLogClient.js'
import { initNativeFaceBridge } from './library/nativeFaceBridge.js'
import { initNativeFaceRelayFromUrl } from './library/nativeFaceRelay.js'
import { initNativeFacePlaybackFromUrl } from './library/nativeFacePlayback.js'

// Remote logging (opt-in):
// - Set env: VITE_REMOTE_LOG=1
// - OR open with: ?remoteLog=1
// - OR set: localStorage.remoteLogEnabled = '1'
try {
  initNativeFaceBridge()
  initNativeFaceRelayFromUrl()
  initNativeFacePlaybackFromUrl()
} catch (error) {
  if (typeof console !== 'undefined' && console.warn) {
    console.warn('Native face bridge init failed (non-critical):', error?.message || error)
  }
}

try {
  const nativeFaceRelayOn =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('nativeFaceRelay') === '1';
  if (
    import.meta.env.DEV &&
    typeof window !== 'undefined' &&
    (window.location.pathname.startsWith('/xr') || nativeFaceRelayOn)
  ) {
    try {
      localStorage.setItem('remoteLogEnabled', '1')
    } catch {
      /* ignore */
    }
  }
  initRemoteLogClient()
} catch (error) {
  // Silently fail if remote log client initialization fails
  // This prevents errors from breaking the app
  if (typeof console !== 'undefined' && console.warn) {
    console.warn('Remote log client initialization failed (non-critical):', error?.message || error)
  }
}

/** IWSDK Playwright agent tab: land on /xr automatically (dev only). */
function IwsdkAgentRedirect() {
  const navigate = useNavigate()
  const location = useLocation()

  React.useEffect(() => {
    if (
      import.meta.env.DEV &&
      typeof window !== 'undefined' &&
      window.__IWER_MCP_MANAGED &&
      location.pathname !== '/xr'
    ) {
      navigate('/xr', { replace: true })
    }
  }, [location.pathname, navigate])

  return null
}

const rootElement = document.getElementById('root')
const appTree = (
  <React.StrictMode>
    <BrowserRouter>
      <IwsdkAgentRedirect />
      <Routes>
        <Route
          path="/xr"
          element={
            <Suspense fallback={<div style={{ padding: 16, color: '#ccc' }}>Loading XR Lab…</div>}>
              <IwsdkImmersive />
            </Suspense>
          }
        />
        <Route path="/*" element={<App />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
)

// Vite HMR re-executes this module; re-createRoot breaks SceneProvider on device.
if (!window.__CS_REACT_ROOT__) {
  window.__CS_REACT_ROOT__ = ReactDOM.createRoot(rootElement)
}
window.__CS_REACT_ROOT__.render(appTree)
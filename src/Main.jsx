import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './App.css'
import { initRemoteLogClient } from './library/remoteLogClient.js'
import { initNativeFaceBridge } from './library/nativeFaceBridge.js'
import { initNativeFaceRelayFromUrl } from './library/nativeFaceRelay.js'

// Remote logging (opt-in):
// - Set env: VITE_REMOTE_LOG=1
// - OR open with: ?remoteLog=1
// - OR set: localStorage.remoteLogEnabled = '1'
try {
  initNativeFaceBridge()
  initNativeFaceRelayFromUrl()
} catch (error) {
  if (typeof console !== 'undefined' && console.warn) {
    console.warn('Native face bridge init failed (non-critical):', error?.message || error)
  }
}

try {
  initRemoteLogClient()
} catch (error) {
  // Silently fail if remote log client initialization fails
  // This prevents errors from breaking the app
  if (typeof console !== 'undefined' && console.warn) {
    console.warn('Remote log client initialization failed (non-critical):', error?.message || error)
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
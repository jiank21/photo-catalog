import React, { useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import LoginPage from './components/LoginPage.jsx'
import { isAuthenticated, initDefaultPin } from './lib/auth.js'
import './index.css'

function Root() {
  const [authed, setAuthed] = useState(() => isAuthenticated())

  // Ensure a default PIN exists in the DB on first load.
  useEffect(() => {
    initDefaultPin()
  }, [])

  if (!authed) {
    return <LoginPage onSuccess={() => setAuthed(true)} />
  }
  return <App onLogout={() => setAuthed(false)} />
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
)

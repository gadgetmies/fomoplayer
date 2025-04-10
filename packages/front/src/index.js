import React from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { unregister } from './registerServiceWorker'

const domNode = document.getElementById('root')
const root = createRoot(domNode)
root.render(<App />)

unregister()

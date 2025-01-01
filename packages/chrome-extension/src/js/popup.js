import '../css/popup.css'
import '../css/shared.css'
import React from 'react'
import Root from './popup/Root.jsx'
import 'typeface-lato'
import { createRoot } from 'react-dom/client'

const domNode = document.getElementById('popup-container')
const root = createRoot(domNode)
root.render(<Root />)

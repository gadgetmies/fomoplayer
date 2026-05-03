import '../css/popup.css'
import '../css/shared.css'
import React from 'react'
import { render } from 'react-dom'
import Root from './popup/Root.jsx'
import 'typeface-lato'

render(React.createElement(Root, {}), window.document.getElementById('popup-container'))

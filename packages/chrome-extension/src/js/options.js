import '../css/options.css'
import '../css/shared.css'
import React from 'react'
import { render } from 'react-dom'
import Root from './options/Root.jsx'
import 'typeface-lato'

render(React.createElement(Root, {}), window.document.getElementById('options-container'))

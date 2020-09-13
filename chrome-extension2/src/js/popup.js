import "../css/popup.css";
import React from "react";
import { render } from "react-dom";
import Popup from './popup/Popup.jsx'
import 'typeface-lato'

render(
  React.createElement(Popup, {}),
  window.document.getElementById("app-container")
)

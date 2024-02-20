import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import React from 'react'
import FullScreenPopup from './FullScreenPopup'

export default props => (
  <FullScreenPopup title="Keyboard shortcuts" {...props}>
    <h2 style={{ marginTop: 0 }}>Shortcuts</h2>
    <table>
      <tbody>
        <tr>
          <td colSpan="2">
            <span className="keyboard-shortcut">
              <FontAwesomeIcon icon="forward" />
            </span>
          </td>
          <td>Seek forward</td>
        </tr>
        <tr>
          <td>
            <span className="keyboard-shortcut">
              <FontAwesomeIcon icon="forward" />
            </span>
          </td>
          <td>x2</td>
          <td>Next</td>
        </tr>
        <tr>
          <td colSpan="2">
            <span className="keyboard-shortcut">
              <FontAwesomeIcon icon="backward" />
            </span>
          </td>
          <td>Seek backward</td>
        </tr>
        <tr>
          <td>
            <span className="keyboard-shortcut">
              <FontAwesomeIcon icon="backward" />
            </span>
          </td>
          <td>x2</td>
          <td>Previous</td>
        </tr>
        <tr>
          <td colSpan="2">
            <span className="keyboard-shortcut">
              <FontAwesomeIcon icon="play" />
            </span>
          </td>
          <td>Toggle playback</td>
        </tr>
        <tr>
          <td>
            <span className="keyboard-shortcut">
              <FontAwesomeIcon icon="play" />
            </span>
          </td>
          <td>x2</td>
          <td>Add current to default cart</td>
        </tr>
        <tr>
          <td colSpan="2">
            <span className="keyboard-shortcut">Q</span>
          </td>
          <td>Previous</td>
        </tr>
        <tr>
          <td colSpan="2">
            <span className="keyboard-shortcut">W</span>
          </td>
          <td>Toggle playback</td>
        </tr>
        <tr>
          <td colSpan="2">
            <span className="keyboard-shortcut">E</span>
          </td>
          <td>Next</td>
        </tr>
        <tr>
          <td colSpan="2">
            <span className="keyboard-shortcut">R</span>
          </td>
          <td>Next new</td>
        </tr>
        <tr>
          <td colSpan="2">
            <span className="keyboard-shortcut">A</span>
          </td>
          <td>Scan forward</td>
        </tr>
        <tr>
          <td colSpan="2">
            <span className="keyboard-shortcut">D</span>
          </td>
          <td>Scan backward</td>
        </tr>
        {props.mode === 'app' ? (
          <tr>
            <td colSpan="2">
              <span className="keyboard-shortcut">P</span>
            </td>
            <td>Add / remove current track to / from cart</td>
          </tr>
        ) : null}
      </tbody>
    </table>
  </FullScreenPopup>
)

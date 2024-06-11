import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import SpinnerButton from './SpinnerButton'
import React, { Component } from 'react'

class ImportPlaylistButton extends Component {
  constructor(props) {
    super(props)
  }

  render() {
    const { id, name, storeName, type, url, img, disabled, loading, onClick, ...rest } = this.props
    return (
      <div
        style={{ margin: 4, padding: 4, background: 'black', borderRadius: 4, textAlign: 'center' }}
        onClick={onClick}
        {...rest}
      >
        <a
          href={url}
          target="_blank"
          onClick={(e) => e.stopPropagation()}
          title={'Check details from store'}
          style={{ position: 'relative', height: 100, width: 100, display: 'block', margin: 'auto' }}
        >
          <img src={img} style={{ height: '100%', width: '100%', objectFit: 'cover' }} />
          <FontAwesomeIcon icon="external-link-alt" style={{ position: 'absolute', right: 5, bottom: 5 }} />
        </a>
        <div
          style={{
            margin: '2px 4px 6px 4px',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            width: 100,
            overflow: 'hidden',
          }}
        >
          {name}
        </div>
        <SpinnerButton
          className="button button-push_button-small button-push_button-primary"
          loading={loading}
          disabled={disabled}
        >
          <span aria-hidden="true" className={`store-icon store-icon-${storeName}`} /> Import
        </SpinnerButton>
      </div>
    )
  }
}

export default ImportPlaylistButton

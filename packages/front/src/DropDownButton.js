import './DropDownButton.css'
import SpinnerButton from './SpinnerButton'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import React from 'react'
import DropDown from './DropDown'
import './buttons.css'

const DropDownButton = (props) => {
  const {
    className,
    buttonClassName,
    icon,
    popupAbove,
    label,
    loading = false,
    loadingLabel,
    disabled = false,
    children,
    size = 'small',
    style = {},
    buttonStyle,
    onClick,
    popupClassName,
    popupStyle,
    open,
    openOnHover,
    ...rest
  } = props

  return (
    <span className={`${className || ''}`} style={{ display: 'flex', ...style }}>
      <SpinnerButton
        className={`button-drop_down-left ${buttonClassName}`}
        {...{ loading, loadingLabel, disabled, size, style: buttonStyle, icon }}
        {...rest}
        disabled={disabled}
        onClick={(e) => {
          onClick && onClick(e)
        }}
      >
        <span className={'button-push_button_label'}>{label}</span>
      </SpinnerButton>
      <DropDown
        open={open}
        openOnHover={openOnHover}
        disabled={disabled}
        anchor={
          <button
            disabled={disabled || loading}
            className={`button button-push_button button-push_button-${size} button-push_button-primary button-drop_down-right`}
            style={{
              borderTopLeftRadius: 0,
              borderBottomLeftRadius: 0,
              position: 'relative',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <FontAwesomeIcon icon="caret-down" />
          </button>
        }
        popupStyle={{ ...popupStyle }}
        popupClassName={`${popupClassName}`}
        popupAbove={popupAbove}
      >
        {children}
      </DropDown>
    </span>
  )
}

export default DropDownButton

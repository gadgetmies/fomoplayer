import './TabSelector.css'
import React from 'react'

// A row of tabs of which one is selected, on a dark background: the app's select-button row as one component.
// `options` are `{ key, label, count, suffix, testId, title, className }`; `label` may be any content, `count` is
// shown small after it and `suffix` after the count.
const TabSelector = ({ name, label, options, selected, onSelect, disabled = false, className = '' }) => (
  <div
    className={`select-button select-button--container state-select-button--container noselect tab-selector ${className}`}
    role="radiogroup"
    aria-label={label}
  >
    {options.map(({ key, label: optionLabel, count, suffix, testId, title, className: tabClassName = '' }) => {
      const id = `${name}-${key}`
      return (
        <React.Fragment key={key}>
          <input
            type="radio"
            id={id}
            name={name}
            checked={selected === key}
            disabled={disabled}
            onChange={() => onSelect(key)}
          />
          <label
            className={`select_button-button select_button-button__small tab-selector-tab ${tabClassName}`}
            htmlFor={id}
            data-testid={testId || id}
            title={title}
          >
            {optionLabel}
            {count !== undefined && count !== null && <small>{count}</small>}
            {suffix}
          </label>
        </React.Fragment>
      )
    })}
  </div>
)

export default TabSelector

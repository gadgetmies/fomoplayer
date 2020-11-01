import React from 'react'

export default function Progress({ percent, height, barColor, bgColor, ...props }) {
  return (
    <div
      {...props}
      style={{ height: '0.5em', padding: 1, background: bgColor, borderRadius: '0.25em', ...props.style }}
    >
      <span
        style={{
          width: `${percent}%`,
          height: '100%',
          borderRadius: '0.25em',
          display: 'block',
          backgroundColor: barColor,
          transition: 'width 1s'
        }}
      />
    </div>
  )
}

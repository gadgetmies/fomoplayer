import React from 'react'

export default function Progress({ percent, height, barColor, bgColor, ...props }) {
  return (
    <span
      {...props}
      style={{
        height: '0.5em',
        width: '100%',
        padding: 1,
        background: bgColor,
        borderRadius: '0.25em',
        display: 'block',
        ...props.style,
      }}
    >
      <span
        style={{
          width: `${percent}%`,
          height: '100%',
          borderRadius: '0.25em',
          display: 'block',
          backgroundColor: barColor,
          transition: 'width 1s',
        }}
      />
    </span>
  )
}

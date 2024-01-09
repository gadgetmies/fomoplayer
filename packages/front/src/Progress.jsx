import React from 'react'

export default function({ percent, height, barColor, bgColor, vertical, ...props }) {
  return (
    <div
      {...props}
      style={{
        height: vertical ? '2em' : undefined,
        width: vertical ? undefined : '2em',
        padding: 1,
        background: bgColor,
        borderRadius: '1vh',
        display: 'flex',
        flexDirection: vertical ? 'row' : 'column-reverse',
        ...props.style
      }}
    >
      <div
        style={{
          width: vertical ? `${percent}%` : '100%',
          height: vertical ? '100%' : `${percent}%`,
          borderRadius: '1vh',
          backgroundColor: barColor,
          transition: 'width 0.2s'
        }}
      />
    </div>
  )
}

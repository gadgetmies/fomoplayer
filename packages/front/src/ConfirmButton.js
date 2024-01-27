import React from 'react'
import SpinnerButton from './SpinnerButton'

const ConfirmButton = ({ onClick, label, confirmLabel, processingLabel, ...props }) => {
  const [confirming, setConfirming] = React.useState(false)
  const [processing, setProcessing] = React.useState(false)
  return (
    <SpinnerButton
      onClick={async () => {
        if (confirming) {
          setProcessing(true)
          await onClick()
          setProcessing(false)
        } else {
          setConfirming(true)
          setTimeout(() => setConfirming(false), 5000)
        }
      }}
      {...props}
    >
      {processing ? processingLabel : confirming ? confirmLabel : label}
    </SpinnerButton>
  )
}

export default ConfirmButton

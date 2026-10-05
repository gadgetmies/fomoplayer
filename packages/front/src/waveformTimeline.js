// Maps playback positions onto the waveform. A stored store waveform spans the full track, so the preview is drawn
// at its offset within it. A waveform generated from the preview file (generatedWaveformDuration set) only spans
// the preview clip, so positions must not be offset by the preview's start within the track.
export const getWaveformTimeline = ({ previewDetails, trackDuration, generatedWaveformDuration, shouldSkip }) => {
  if (!previewDetails) {
    return { totalDuration: 0, startOffset: 0, endPosition: 0, toPositionPercent: () => 0 }
  }

  const timelineStart = generatedWaveformDuration ? previewDetails.start_ms || 0 : 0
  const totalDuration = generatedWaveformDuration || trackDuration
  const startOffset = (previewDetails.start_ms || 0) - timelineStart
  const endPosition = previewDetails.end_ms ? previewDetails.end_ms - timelineStart : generatedWaveformDuration

  return {
    totalDuration,
    startOffset,
    endPosition,
    toPositionPercent: (currentPosition) => ((currentPosition + (shouldSkip ? 0 : startOffset)) / totalDuration) * 100,
  }
}

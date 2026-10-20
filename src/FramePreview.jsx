import { useEffect, useState } from 'react'
import { CANVAS_HEIGHT, CANVAS_WIDTH, getPhotoSlots } from './collage.js'

const slotStyle = (slot) => ({
  left: `${(slot.x / CANVAS_WIDTH) * 100}%`,
  top: `${(slot.y / CANVAS_HEIGHT) * 100}%`,
  width: `${(slot.width / CANVAS_WIDTH) * 100}%`,
  height: `${(slot.height / CANVAS_HEIGHT) * 100}%`,
})

function FramePreview({ frame }) {
  const [slots, setSlots] = useState([])

  useEffect(() => {
    let isCurrent = true
    getPhotoSlots(frame.url)
      .then((result) => isCurrent && setSlots(result.slots))
      .catch(() => isCurrent && setSlots([]))
    return () => {
      isCurrent = false
    }
  }, [frame.url])

  return (
    <span className="frame-preview">
      {slots.map((slot) => (
        <span key={`${slot.x}-${slot.y}`} className="frame-preview-slot" style={slotStyle(slot)} />
      ))}
      <img src={frame.url} alt="" className="frame-preview-art" />
    </span>
  )
}

export default FramePreview

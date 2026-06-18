import React, { useContext, useState, useEffect, useRef } from "react"
import { AudioContext } from "../context/AudioContext"
import styles from './GlobalAudioControl.module.css'

export default function GlobalAudioControl() {
  const {isMute, enableAudio, disableAudio, setVolume, volume} = useContext(AudioContext)
  const [localVolume, setLocalVolume] = useState(volume)
  const sliderRef = useRef(null)

  // Update volume percentage for visual feedback immediately
  const handleVolumeChange = (e) => {
    const newVolume = parseFloat(e.target.value)
    setLocalVolume(newVolume)
    setVolume(newVolume)
    if (sliderRef.current) {
      sliderRef.current.style.setProperty('--volume-percentage', `${newVolume * 100}%`)
    }
  }

  // Keep local volume in sync with context volume
  useEffect(() => {
    setLocalVolume(volume)
    if (sliderRef.current) {
      sliderRef.current.style.setProperty('--volume-percentage', `${volume * 100}%`)
    }
  }, [volume])

  return (
    <div className={styles.container}>
      <button 
        className={`${styles.audioButton} ${isMute ? styles.muted : styles.unmuted}`}
        onClick={() => {
          if (isMute) enableAudio()
          else disableAudio()
        }}
      >
        {isMute ? "🔇" : "🔊"}
      </button>
      <div className={styles.volumeControl}>
        <input
          ref={sliderRef}
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={localVolume}
          onChange={handleVolumeChange}
          className={styles.volumeSlider}
        />
      </div>
    </div>
  )
}

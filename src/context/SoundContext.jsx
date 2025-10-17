import React, { createContext, useEffect, useState } from "react"
import * as THREE from "three"

export const SoundContext = createContext()

export const SoundProvider = (props) => {
  // Simplified sound provider without use-sound to avoid conflicts
  const playSound = (name, delay = 0) => {
    // Placeholder sound function - can be implemented later
    console.log(`Playing sound: ${name}`);
  }

  return (
    <SoundContext.Provider
      value={{
        playSound
      }}
    >
      {props.children}
    </SoundContext.Provider>
  )
}
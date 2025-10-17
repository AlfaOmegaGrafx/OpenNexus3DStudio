import React, { createContext } from "react"

export const LanguageContext = createContext()

export const LanguageProvider = (props) => {
  // Simplified language provider without react-i18next to avoid conflicts
  const t = (key) => key; // Simple translation function that returns the key

  return (
    <LanguageContext.Provider
      value={{
        t,
      }}
    >
      {props.children}
    </LanguageContext.Provider>
  )
}

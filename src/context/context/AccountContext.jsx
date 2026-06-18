import React, { createContext, useState, useEffect } from "react"
export const AccountContext = createContext()

export const AccountProvider = (props) => {
  const [walletAddress, setWalletAddress] = useState(null)
  const [ensName, setEnsName] = useState(null)
  const [connected, setConnected] = useState(false)
  const [OTTokens, setOTTokens] = useState([])
  const [walletType, setWalletType] = useState(null) // 'metamask', 'thirdweb-smart', 'thirdweb-inapp', 'phantom'
  const [chain, setChain] = useState(null) // 'ethereum', 'polygon', 'base', 'solana'
  const [x402Enabled, setX402Enabled] = useState(false)
  const [smartWalletFeatures, setSmartWalletFeatures] = useState({
    gasSponsored: false,
    batchTransactions: false,
    sessionKeys: false
  })

  // Initialize x402 payment handler when wallet is connected
  useEffect(() => {
    if (connected && walletAddress && (chain === 'base' || chain === 'ethereum' || chain === 'polygon')) {
      // x402 is available for EVM chains
      setX402Enabled(true);
    } else {
      setX402Enabled(false);
    }
  }, [connected, walletAddress, chain]);

  return (
    <AccountContext.Provider
      value={{
        walletAddress,
        setWalletAddress,
        ensName,
        setEnsName,
        connected,
        setConnected,
        OTTokens,
        setOTTokens,
        walletType,
        setWalletType,
        chain,
        setChain,
        x402Enabled,
        setX402Enabled,
        smartWalletFeatures,
        setSmartWalletFeatures
      }}
    >
      {props.children}
    </AccountContext.Provider>
  )
}

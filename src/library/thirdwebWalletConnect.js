/**
 * Thirdweb wallet connect — MetaMask + enterprise smart / in-app paths.
 * Prefer this over raw window.ethereum so onboarding can grow into branded wallets.
 */

import { createThirdwebClient } from 'thirdweb'
import { createWallet } from 'thirdweb/wallets'
import { base, ethereum, polygon } from 'thirdweb/chains'
import { ethers6Adapter } from 'thirdweb/adapters/ethers6'

/** @typedef {'metamask' | 'thirdweb-smart' | 'thirdweb-inapp'} ThirdwebWalletKind */

const CHAIN_BY_NETWORK = {
  ethereum,
  polygon,
  base,
}

/**
 * @param {string} [network]
 */
export function resolveThirdwebChain(network = 'polygon') {
  const key = String(network || 'polygon').toLowerCase()
  return CHAIN_BY_NETWORK[key] || polygon
}

/**
 * @returns {import('thirdweb').ThirdwebClient}
 */
export function createOpenNexusThirdwebClient() {
  const clientId = import.meta.env.VITE_THIRDWEB_CLIENT_ID
  if (!clientId) {
    throw new Error('VITE_THIRDWEB_CLIENT_ID is not set')
  }
  return createThirdwebClient({ clientId })
}

/**
 * Connect via Thirdweb.
 * @param {object} [options]
 * @param {ThirdwebWalletKind} [options.walletKind] - default metamask (io.metamask)
 * @param {string} [options.network] - ethereum | polygon | base
 * @returns {Promise<{
 *   address: string,
 *   account: object,
 *   wallet: object | null,
 *   client: object,
 *   chain: object,
 *   provider: import('ethers').Provider,
 *   walletType: ThirdwebWalletKind,
 * }>}
 */
export async function connectWithThirdweb(options = {}) {
  const walletKind = options.walletKind || 'metamask'
  const network = options.network || 'polygon'
  const chain = resolveThirdwebChain(network)
  const client = createOpenNexusThirdwebClient()

  if (walletKind === 'thirdweb-smart') {
    const { ThirdwebSmartWalletManager } = await import('./thirdwebSmartWallet.js')
    const mgr = new ThirdwebSmartWalletManager({ chain: network })
    const address = await mgr.connectSmartWallet({ sponsorGas: true })
    const provider = ethers6Adapter.provider.toEthers({ client, chain })
    return {
      address,
      account: mgr.account,
      wallet: mgr.wallet,
      client,
      chain,
      provider,
      walletType: 'thirdweb-smart',
    }
  }

  if (walletKind === 'thirdweb-inapp') {
    const { ThirdwebInAppWalletManager } = await import('./thirdwebInAppWallet.js')
    const mgr = new ThirdwebInAppWalletManager({ chain: network })
    const address = await mgr.showConnectionModal()
    const provider = ethers6Adapter.provider.toEthers({ client, chain })
    return {
      address,
      account: mgr.account,
      wallet: mgr.wallet,
      client,
      chain,
      provider,
      walletType: 'thirdweb-inapp',
    }
  }

  // MetaMask (and compatible injected) through Thirdweb — not raw eth_requestAccounts
  const wallet = createWallet('io.metamask')
  const account = await wallet.connect({ client, chain })
  const provider = ethers6Adapter.provider.toEthers({ client, chain })

  return {
    address: account.address,
    account,
    wallet,
    client,
    chain,
    provider,
    walletType: 'metamask',
  }
}

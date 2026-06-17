# Thirdweb: what we have vs what we can add

Sources: [thirdweb.com](https://thirdweb.com/), [API reference](https://portal.thirdweb.com/reference), [x402](https://portal.thirdweb.com/x402), [Sign in with Ethereum](https://portal.thirdweb.com/wallets/auth), [Connect Button playground](https://playground.thirdweb.com/wallets/sign-in/button?tab=code), [v5 migration](https://portal.thirdweb.com/react/v5/migrate).

## Environment

| Variable | Purpose |
|----------|---------|
| `VITE_THIRDWEB_CLIENT_ID` | Frontend (ConnectButton, in-app wallets). Set in `.env`. |
| `THIRDWEB_SECRET_KEY` | **Server/MCP only** — x402 facilitator, MCP. Never `VITE_` prefix (would ship to the browser). |

## Current state in Character Studio

| Layer | Status | Notes |
|-------|--------|-------|
| SDK v5 (`thirdweb` package) | Installed | `thirdweb@5.x`, `ethers@6` |
| Library managers | Code exists, **not wired to UI** | `thirdwebSmartWallet.js`, `thirdwebInAppWallet.js`, `thirdwebX402Manager.js`, `x402PaymentHandler.js` |
| `mint-utils.connectWallet()` | Partial | Thirdweb paths only run if caller passes `walletType` `'thirdweb-smart'` / `'thirdweb-inapp'` |
| Landing / Wallet UI | **No Thirdweb UI** | Wallet button on Landing is commented out; `Wallet.jsx` does not call `connectWallet()` |
| `ThirdwebProvider` / `ConnectButton` | **Not used** | Official modal UX lives here |
| `AccountContext` | Exists | Ready to store `walletAddress`, `walletType`, `chain`, x402 flags — nothing sets them from Thirdweb yet |

**Bottom line:** dependencies + backend-style helpers are in the repo; **users cannot connect via Thirdweb in the app today** until we add UI (recommended: `ConnectButton`).

---

## Thirdweb platform benefits (beyond what we use today)

From [thirdweb.com](https://thirdweb.com/) and docs — mapped to Character Studio use cases:

| Product | Benefit for this app | We have it? |
|---------|----------------------|------------|
| **Connect Button + in-app wallet** | Email / Google / passkey / phone + MetaMask etc. in one modal; no custom auth UI | Library only — **add `ConnectButton`** |
| **Account abstraction (gas sponsorship)** | Users mint / pay for AI without holding ETH for gas | Partial in `thirdwebSmartWallet.js` — not exposed in UI |
| **x402 payments** | Micropay for 3DAIGC API calls (`402 Payment Required`) on 170+ EVM chains | `thirdwebX402Manager.js` + `x402PaymentHandler.js` — needs secret key + UI hook |
| **`useFetchWithPayment`** | Auto wallet modal + pay when API returns 402 | Not integrated — replaces hand-rolled x402 client flow |
| **Sign in with Ethereum (SIWE)** | Passwordless login tied to wallet; backend session | Not integrated — needs server endpoints + `ConnectButton` `auth` prop |
| **Bridge / swap** | Fund wallets in-app before mint or x402 | Not used |
| **Insight / RPC** | Managed infra instead of public RPCs | Not used (we use public Base RPC in smart wallet helper) |
| **Token / contract deploy** | Launch ERC721 for avatar collections | Mint flows exist elsewhere; not via Thirdweb deploy APIs |
| **Nexus / AI agent wallets** | Future: agents that pay for API autonomously | Roadmap only |

---

## Recommended integration (minimal, don’t break existing flows)

### 1. Connect modal (highest value, lowest risk)

Use official **`ConnectButton`** from `thirdweb/react` ([playground](https://playground.thirdweb.com/wallets/sign-in/button?tab=code)):

```jsx
import { ThirdwebProvider, ConnectButton } from "thirdweb/react";
import { createThirdwebClient } from "thirdweb";
import { inAppWallet, createWallet } from "thirdweb/wallets";
import { base } from "thirdweb/chains";

const client = createThirdwebClient({
  clientId: import.meta.env.VITE_THIRDWEB_CLIENT_ID,
});

const wallets = [
  inAppWallet({
    auth: { options: ["google", "email", "passkey", "phone"] },
  }),
  createWallet("io.metamask"),
  createWallet("com.coinbase.wallet"),
];

// Wrap app (e.g. Main.jsx or App.jsx):
// <ThirdwebProvider><ConnectButton client={client} wallets={wallets} chain={base} /></ThirdwebProvider>
```

On connect, sync `AccountContext` (`walletAddress`, `walletType`, `chain`) via `useActiveAccount()` / `useActiveWallet()`.

**Note:** `thirdwebInAppWallet.showConnectionModal()` is **not** the same as the playground modal — it calls `wallet.connect()` programmatically. For the polished Thirdweb UI, use **`ConnectButton`** (or `ConnectEmbed`).

### 2. x402 for paid 3DAIGC API (when backend supports 402)

- Client: [`useFetchWithPayment`](https://portal.thirdweb.com/x402) — handles connect + pay modals automatically.
- Server: `settlePayment` + `facilitator` with `THIRDWEB_SECRET_KEY` on your API or a small proxy.
- Today: custom `thirdwebX402Manager` can stay until backend is x402-ready.

### 3. SIWE (optional, later)

[`ConnectButton` + `auth` callbacks](https://portal.thirdweb.com/wallets/auth) — `getLoginPayload`, `doLogin`, `isLoggedIn`, `doLogout` — only if you need server-side sessions (profiles, saved avatars per user).

### 4. Gas sponsorship (optional)

Enable **sponsor gas** on `ConnectButton` / smart wallet config when minting on Base — aligns with `thirdwebSmartWallet` account abstraction.

---

## What not to do yet

- Do **not** re-add `@thirdweb-dev/react` v4 — project is on unified `thirdweb` v5 only.
- Do **not** use `VITE_THIRDWEB_SECRET_KEY` — Vite exposes `VITE_*` to the browser bundle.
- Do **not** run `npm audit fix --force` on wallet deps without testing connect + mint.

---

## Next implementation task (when you want it)

1. Add `src/library/thirdwebClient.js` — single `createThirdwebClient` export.
2. Wrap router in `ThirdwebProvider` (`Main.jsx`).
3. Add `ConnectWalletButton.jsx` — `ConnectButton` + sync to `AccountContext`.
4. Place button on Landing (uncomment wallet flow) or header in `App.jsx`.
5. Test: in-app email login, MetaMask, Base chain, then Wallet / mint pages.

Estimated scope: small UI PR, no change to IWSDK/XR paths.

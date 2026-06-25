# Approach: Wallet-Owned Assets → Programmatic Avatar & Wearables

This document outlines how to implement **reading owned assets from a connected wallet to configure avatars and wearables programmatically** in OpenNexus3DStudio, as described in [Create an Avatar — Configure programmatically](docs/General/create-an-avatar.md#configure-programmatically). It incorporates [RMRK EVM](https://evm.rmrk.app/) modular NFT standards and assumes **Thirdweb** (and Thirdweb MCP) for wallet and chain connectivity.

**Alignment with [README](../README.md)**: This approach adheres to the project’s stated **avatar structure** and **roadmap**. OpenNexus3DStudio’s **base body** VRM avatar is **soulbound** (non-transferable; [Modder getting-started](docs/Modders/getting-started.md)—base body is layer 0). Clothing, hair, and accessories are **equippable** layers. Wallet-driven assembly fills those equippable traits from owned assets; the base body remains the fixed, soulbound foundation. The [README Roadmap Alignment](../README.md#-roadmap-alignment) and [History & Roadmap](docs/history.md#roadmap) (connect wallet to load profiles or mint files) are the source of record for goals.

---

## 1. Goal (from create-an-avatar.md)

- **Current**: OpenNexus3DStudio can assemble and export VRMs from a JSON file (traits); this is custom for batch Anata VRMs and not general-purpose yet.
- **Target**: Configure avatars and wearables **from owned wallet assets** (e.g. POAPs, whitelisted collections as [badges/pins](https://sketchfab.com/3d-models/3d-skill-role-badges-and-pins-e3329ed59b874aad98586657a5f11630)).
- **Scope**: Use connected wallet + owned NFTs (including RMRK-style composable/equippable NFTs) to drive trait selection and optional "equipped" wearables/badges when assembling the avatar.

---

## 2. Why RMRK EVM is Relevant

[RMRK EVM](https://evm.rmrk.app/) provides **modular NFT standards** that map well to "avatar + wearables":

| Concept | RMRK EVM | OpenNexus3DStudio |
|--------|----------|-------------------|
| Avatar / base character | **Multi-Asset** NFT (ERC-5773) with a "main" composable asset | **Base body** VRM = **soulbound** (non-transferable, layer 0 per [Modder getting-started](docs/Modders/getting-started.md)) |
| Wearables / items | **Equippable** NFTs (ERC-6220) that go into **slots** | **Equippable** trait slots (clothing, hair, accessories, head, hands, badges) |
| Slot definitions | **Catalog** + slot parts + equippable group IDs | Manifest trait groups + optional slot metadata |
| Nested items (e.g. "brain" / skills) | **Nestable** (ERC-7401) + **Soulbound** (ERC-6454) | Optional: non-transferable traits / skills |
| Attributes (level, stats) | **Token Attributes** (ERC-7508) | Optional: drive which assets are valid (e.g. level-gating) |

Relevant RMRK docs (all under [evm.rmrk.app](https://evm.rmrk.app/)):

- [Character Progression](https://evm.rmrk.app/use-cases/character-progression) — avatar as multi-asset NFT, items/skills as equippable/nestable/soulbound.
- [Modules Overview](https://evm.rmrk.app/modules-overview) — MultiAsset, Nestable, Composable & Equippable, Soulbound, Attributes.
- [Composable & Equippable (ERC-6220)](https://evm.rmrk.app/composable-equippable) — slots, catalogs, composing vs equipping.
- [Configuring Equippability](https://evm.rmrk.app/basic-usage/configuring-equippability) — add equippable assets, equip/unequip, valid parent/slot.
- [Asset Management](https://evm.rmrk.app/basic-usage/asset-management) — active/pending assets, priorities, metadata.
- [Quick Start](https://evm.rmrk.app/quick-start) — Singular, Mintaur, Wizard, Remix, EVM template.

So the "best approach" is to treat **wallet-owned assets** as either:

1. **Simple NFTs** (ERC-721): whitelisted collections → map to traits or "badge" slots (POAP-style).
2. **RMRK-style NFTs** (MultiAsset + Equippable): use **active assets**, **equipment** (which child is in which slot), and **catalogs** to know which token can go in which slot; then map that to OpenNexus3DStudio trait/slot model.

---

## 3. High-Level Architecture

- **Wallet & chains**: Thirdweb (existing in project) + Thirdweb MCP for connection, switching chains, and reading contracts.
- **Owned assets**:
  - For **ERC-721**: use existing or Thirdweb-based "get owned NFTs by collection."
  - For **RMRK EVM**: use contract reads (or indexer if available) for:
    - `getActiveAssets(tokenId)`, `getAssetMetadata(tokenId, assetId)`, `getEquipment(contract, tokenId, catalogAddress, slotId)`, and catalog/slot configuration.
- **Mapping layer**: Config (or manifest extension) that maps:
  - **Collection address** (and optional tokenId/assetId) → OpenNexus3DStudio **trait group** or **"badge" slot**.
  - For RMRK: **Catalog + slot** → one trait group or slot in our model.
- **Assembly**: Existing OpenNexus3DStudio pipeline (manifest + trait IDs) driven by:
  - **Trait IDs** from manifest, **or**
  - **Resolved asset URIs** from wallet (metadata → thumbnail/VRM/GLB URL) for that slot.

End-to-end flow:

1. User connects wallet (Thirdweb).
2. App resolves **owned NFTs** (by whitelisted collections and/or RMRK contracts).
3. For each "avatar" token (or default avatar), resolve **equipped** and **active** assets (if RMRK).
4. Map those to **trait groups / slots** and **asset URIs** (from metadata).
5. Feed result into existing **manifest-based or JSON-based** assembly and render/export VRM.

---

## 4. Phased Implementation Plan

### Phase 1: Whitelisted ERC-721 → traits/badges (no RMRK)

- **Goal**: One or more whitelisted collections; owned token IDs → drive which traits or "badge" slots are filled.
- **Thirdweb**: Use Thirdweb (or existing `fetchOwnedNFTs`/wallet helpers) to get owned NFTs per collection.
- **Config**:
  - `walletCollections` or manifest extension: list of `{ chainId, contractAddress, traitGroupOrSlotId }`.
  - Optional: tokenId → specific asset URL (from tokenURI) for that slot.
- **Assembly**:
  - Map "owned token in collection X" → set trait or slot in the same way current JSON/manifest sets traits.
  - If metadata has `image` or `animation_url`, use as texture or 3D badge; otherwise use placeholder or icon.
- **Deliverable**: User connects wallet → sees owned collections → selecting an "avatar" or "outfit" from owned NFTs pre-fills traits/badges and assembles VRM.

### Phase 2: RMRK-aware reads (MultiAsset + Equippable)

- **Goal**: Support RMRK-style contracts so that "active asset" and "equipped children" define what the avatar looks like.
- **Contract reads** (via Thirdweb MCP or ethers/viem):
  - Implement or reuse helpers for:
    - `getActiveAssets(tokenId)`, `getPendingAssets(tokenId)`.
    - `getAssetMetadata(tokenId, assetId)` → metadata URI → fetch JSON → get media URLs.
    - `getEquipment(contract, tokenId, catalogAddress, slotId)` (or equivalent) to know which child is in which slot.
  - Catalog/slot configuration (which collections can go in which slot) can be read from catalog contract or from your own config.
- **Mapping**:
  - Define "avatar collection" + "wearable/badge collections" in config.
  - Map RMRK "slot" (catalog + part/slot id) → OpenNexus3DStudio trait group or badge slot.
  - Resolve child token's active asset metadata → thumbnail/VRM/GLB for that slot.
- **Assembly**: Same as Phase 1, but source of "what's in each slot" comes from RMRK equipment + active assets instead of only "owned token in collection."
- **Docs to implement against**: [Configuring Equippability](https://evm.rmrk.app/basic-usage/configuring-equippability), [Asset Management](https://evm.rmrk.app/basic-usage/asset-management), [Composable & Equippable](https://evm.rmrk.app/composable-equippable).

### Phase 3: Full RMRK character progression (optional)

- **Goal**: Support level/attributes (ERC-7508) and soulbound/nestable (e.g. "brain" / skills) so that only certain items are equippable depending on state.
- **Reads**: Token attributes, nested children, soulbound flags.
- **Mapping**: Use attributes (e.g. "level") to filter which assets are valid for assembly (e.g. level 2 sword only for level 2 avatar), mirroring [Character Progression](https://evm.rmrk.app/use-cases/character-progression).
- **UI**: Show "locked" vs "unlocked" slots or traits based on owned assets and attributes.

---

## 5. Thirdweb MCP Usage

- **Wallet**: Use MCP for connect/disconnect, chain switch, and current address (reuse existing AccountContext/wallet state where possible).
- **Read contracts**: For ERC-721 (ownerOf, tokenURI, balanceOf) and for RMRK (getActiveAssets, getEquipment, getAssetMetadata), use MCP to call contract read methods on the appropriate chain.
- **Abi**: For RMRK, use official [EVM package](https://evm.rmrk.app/evm-package) ABIs (MultiAsset, Nestable, Equippable, Catalog) so that Thirdweb MCP or your SDK can encode/decode calls.
- **Caching**: Cache "owned NFTs per collection" and "equipment per token" to avoid repeated RPC calls; invalidate on wallet or chain change.

---

## 6. Mapping: RMRK → OpenNexus3DStudio Concepts

| RMRK | OpenNexus3DStudio |
|------|-------------------|
| Parent NFT (e.g. "avatar" token) | One "character" instance; **base body** is soulbound (layer 0), fixed per user/avatar. |
| Active asset on parent | Which "skin" or "base" is active → map to manifest base or single trait group (base body remains soulbound). |
| Catalog + slot (e.g. "head", "left_hand") | **Equippable** trait group or slot (e.g. `badge_1`, `headwear`, clothing, hair). |
| Child NFT equipped in slot | One trait or "wearable" in that slot; metadata → thumbnail or 3D URL. |
| Collection whitelist for slot | Our config: which contract addresses can fill which trait group or slot. |
| Token attributes (ERC-7508) | Optional: e.g. "level" → which assets are allowed (level-gating). |

Config shape (example):

```json
{
  "walletDrivenTraits": {
    "collections": [
      {
        "chainId": 137,
        "address": "0x...",
        "type": "erc721",
        "traitGroupId": "badges"
      },
      {
        "chainId": 137,
        "address": "0x...",
        "type": "rmrk-equippable",
        "catalogAddress": "0x...",
        "slots": [
          { "slotId": "head", "traitGroupId": "headwear" },
          { "slotId": "left_hand", "traitGroupId": "left_hand" }
        ]
      }
    ]
  }
}
```

---

## 7. Existing Code to Reuse

- **Wallet / NFTs**: `src/library/mint-utils.js` (`fetchOwnedNFTs`, `connectWallet`), `src/library/walletCollections.js` (`getNftsFromCollection`, `getSolanaPurchasedAssets`), `AccountContext`.
- **Assembly**: Manifest + trait IDs → `CharacterManager`, `manifestDataManager`, and existing VRM assembly/export.
- **Bridge**: `OpenNexus3DStudioBridge` for GLB→OpenNexus3DStudio; keep same pipeline, but **trait/slot source** = wallet + mapping config instead of (or in addition to) static JSON.

---

## 8. RMRK EVM Doc Map (evm.rmrk.app)

Use this as a checklist when implementing RMRK support:

- **Getting started**: [Welcome](https://evm.rmrk.app/) | [Quick Start](https://evm.rmrk.app/quick-start) | [Wizard](https://evm.rmrk.app/quick-start/wizard) | [Remix](https://evm.rmrk.app/quick-start/remix) | [EVM Template](https://evm.rmrk.app/quick-start/evm-template) | [Add to Singular](https://evm.rmrk.app/quick-start/add-to-singular)
- **Use cases**: [Character Progression](https://evm.rmrk.app/use-cases/character-progression) | Backups | Cross-game skins | Evolution | Museums | etc.
- **Tutorials**: [MultiAsset Journey P1](https://evm.rmrk.app/tutorials/multiasset-journey/part-1) / [P2](https://evm.rmrk.app/tutorials/multiasset-journey/part-2) | Nestable | Equippable | [Token Attributes](https://evm.rmrk.app/tutorials/token-attributes/basic-usage)
- **How-to**: [Asset Management](https://evm.rmrk.app/basic-usage/asset-management) | [Child Management](https://evm.rmrk.app/basic-usage/child-management) | [Catalog](https://evm.rmrk.app/basic-usage/catalog) | [Configuring Equippability](https://evm.rmrk.app/basic-usage/configuring-equippability)
- **Modules**: [Overview](https://evm.rmrk.app/modules-overview) | [MultiAsset](https://evm.rmrk.app/multiasset) | [Nestable](https://evm.rmrk.app/nestable) | [Composable & Equippable](https://evm.rmrk.app/composable-equippable) | [Emotable](https://evm.rmrk.app/emotable) | [Soulbound](https://evm.rmrk.app/soulbound) | [Attributes](https://evm.rmrk.app/attributes) | [ERC20-Holder](https://evm.rmrk.app/erc20holder)
- **References**: [Implementations](https://evm.rmrk.app/implementations) | [Metadata](https://evm.rmrk.app/metadata) | [EVM Package](https://evm.rmrk.app/evm-package) (core, ready-to-use contracts)
- **More**: [FAQ](https://evm.rmrk.app/faq) | [Glossary](https://evm.rmrk.app/glossary) | [Support](https://t.me/rmrkimpl)

---

## 9. Success Criteria

- User connects wallet (Thirdweb); app shows owned collections (and optionally RMRK avatar token).
- For a chosen "avatar" (or default), app shows which traits/slots are filled from owned assets (and from RMRK equipment if Phase 2).
- Assembled VRM reflects wallet-owned assets (traits + optional 3D badges from metadata).
- Design is extensible: more collections and more RMRK slots can be added via config without hard-coding.

---

## 10. Next Steps

1. **Lock config format**: Finalize `walletDrivenTraits` (or equivalent) in manifest/docs.
2. **Phase 1**: Implement whitelisted ERC-721 → trait/slot mapping and plug into existing assembly; test with one collection (e.g. POAP-style).
3. **Phase 2**: Add RMRK contract reads (getActiveAssets, getEquipment, getAssetMetadata) via Thirdweb MCP or SDK; add catalog/slot → trait group mapping; test with one RMRK collection.
4. **Phase 3** (optional): Add attributes and soulbound/nestable for progression-style gating and UX.

This keeps the "configure programmatically" vision from create-an-avatar.md, aligns with RMRK EVM for composable/equippable wearables, and uses Thirdweb MCP for wallet and chain-agnostic contract reads.

**See also (README adherence)**:
- [README](../README.md) — Project overview; **Goals & structure** and **Roadmap Alignment** state soulbound base body + equippable wearables and link to this doc.
- [README § OpenNexus3DStudio Features](../README.md#opennexus3dstudio-features) — Avatar Structure (soulbound base body, layer 0), Wallet-Driven Assembly (planned).
- [README § Roadmap Alignment](../README.md#-roadmap-alignment) — History & Roadmap, this approach doc, Technical Roadmap RPM Migration.
- [Modder getting-started](docs/Modders/getting-started.md) — Base body = layer 0; clothing/accessories = higher layers.

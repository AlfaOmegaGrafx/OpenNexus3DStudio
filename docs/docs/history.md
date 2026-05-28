---
sidebar_position: 2
---


# History


This project stands on the shoulders of giants with years of history from open source hackers and web3 enthusiasts.

**V1: Atlas Foundation lays the groundwork**

> An open, collaborative and evolving character creator project for the open metaverse. https://github.com/AtlasFoundation/AvatarCreator

![](/img/97bDPrd.png)

![](/img/uXmtEPX.gif)

**V2: Webaverse ships! and then forgets?**

> 3D Avatar Creator for Everyone https://github.com/webaverse-studios/CharacterCreator

![image](/img/rJ80Rwpja.png)

![image](/img/BJ4CkO6ip.png)

![](/img/H1qoTjToa.jpg)



Some more development screenshots featuring additional character classes, the AI personality generator, and mint functionality from a livestream recorded in January 2023:

|  [![Screenshot_2024-02-16_18-22-15](/img/S1Oaao6iT.jpg)](/img/S1Oaao6iT.jpg) |   [![Screenshot_2024-02-16_22-56-01](/img/HJRyjhpia.jpg)](/img/HJRyjhpia.jpg)  |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| [![Screenshot_2024-02-16_18-22-01](/img/H19p6jaoa.jpg)](/img/H19p6jaoa.jpg) | [![Screenshot_2024-02-16_18-21-46](/img/BJfR6i6oa.jpg)](/img/BJfR6i6oa.jpg) |



**V3: M3 carries the torch with Anata**

![](/img/S1pGC3aj6.jpg)

![Screenshot from 2023-12-30 15-53-13](/img/rJzD026jp.png)

![Screenshot from 2023-11-18 23-09-15](/img/rJN4AnpoT.png)



## Roadmap

- **Immersive XR (in repo)**: Main app **WebXR** via `SceneManager` (VR/AR, floor anchoring); **IWSDK lab** at `/xr` for locomotion/grab experiments ([`docs/IWSDK_INTEGRATION.md`](../IWSDK_INTEGRATION.md)); **Galaxy XR** + optional [**CS XR Face** APK](../../native/android-xr-face-bridge/README.md) for blend-shape relay when Chrome lacks expression-tracking ([`docs/OPENXR_FACE_TRACKING_ANDROID_XR.md`](../OPENXR_FACE_TRACKING_ANDROID_XR.md))
- AI features: Create/Load personality and talk to your VRM (**companion runtime**, parallel apps — **not** merged): **[moeChat](https://github.com/moeru-ai/chat)** ([demo](https://chat.moeru.ai/)) **default** for WebXR + VRM + voice + AI model settings; **optional [AIRI](https://github.com/AlfaOmegaGrafx/airi)** for extended companion depth — export/handoff/shared config from Character Studio only
- Connect wallet to load profiles or mint files
- Support loading profiles and AI personality from user‑controlled personal data exports (e.g. local personal server / data connectors) while keeping credentials on the user’s device
- Use an on‑prem or self‑hosted 3D AIGC backend (e.g. 3DAIGC‑API on DGX‑class hardware) as the primary inference engine, including optional profile/personality context for personalized text/image‑to‑3D and editing workflows
- Integrate with external 3D launchpads (e.g. Solana/Arweave‑based VRM/GLB minting) so avatars and wearables minted there can be assembled from wallet‑owned assets inside Character Studio

Product and revenue detail for the above (x402, tiers, NFT commissions, §11 personalized AI pathway): see [`MONETIZATION_ROADMAP.md`](../../MONETIZATION_ROADMAP.md) at the repository root.

# Character Studio Docs

This website is built using [Docusaurus](https://docusaurus.io/), a modern static website generator.

**Related (repo root):** [Monetization roadmap](../MONETIZATION_ROADMAP.md) — **§11** personalized AI; **[moeChat](https://github.com/moeru-ai/chat)** default companion ([demo](https://chat.moeru.ai/)); optional **[AIRI](https://github.com/AlfaOmegaGrafx/airi)** (v3.2.8+, May 27, 2026 — IWSDK `/xr` lab + native face relay).

**Android XR face (Chrome WebXR relay):** [OPENXR_FACE_TRACKING_ANDROID_XR.md](./OPENXR_FACE_TRACKING_ANDROID_XR.md) · [ANDROID_STUDIO_AI_BRIEF.md](./ANDROID_STUDIO_AI_BRIEF.md) · [`native/android-xr-face-bridge/README.md`](../native/android-xr-face-bridge/README.md)

**IWSDK immersive lab (`/xr`):** [IWSDK_INTEGRATION.md](./IWSDK_INTEGRATION.md) — Meta Immersive Web SDK; Galaxy XR primary, optional PC emulator for smoke tests.

### Installation

```
$ yarn
```

### Local Development

```
$ yarn start
```

This command starts a local development server and opens up a browser window. Most changes are reflected live without having to restart the server.

### Build

```
$ yarn build
```

This command generates static content into the `build` directory and can be served using any static contents hosting service.

### Deployment

Using SSH:

```
$ USE_SSH=true yarn deploy
```

Not using SSH:

```
$ GIT_USER=<Your GitHub username> yarn deploy
```

If you are using GitHub pages for hosting, this command is a convenient way to build the website and push to the `gh-pages` branch.

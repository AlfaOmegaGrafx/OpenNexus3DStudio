# Local IWSDK fork (AlfaOmegaGrafx/immersive-web-sdk)

OpenNexus3DStudio consumes **local builds** from a sibling clone of your IWSDK fork instead of npm `@iwsdk/*` ^0.4.2.

## Layout

```
/home/sifr/
  immersive-web-sdk/          # git clone AlfaOmegaGrafx/immersive-web-sdk
  OpenNexus3DStudio/        # file:../immersive-web-sdk/packages/*/iwsdk-*.tgz
```

On Surface: clone `immersive-web-sdk` next to `OpenNexus3DStudio` the same way.

## Link / refresh

```bash
cd OpenNexus3DStudio
npm run iwsdk:link-local              # build tgz if missing + npm install
npm run iwsdk:link-local:rebuild      # force rebuild fork + reinstall
```

Or manually:

```bash
cd ../immersive-web-sdk
pnpm install && npm run build:tgz:skip-reference-assets
cd ../OpenNexus3DStudio && npm install
```

## Packages wired

| Package | Role |
|---------|------|
| `@iwsdk/core` | World, ECS, grab, locomotion |
| `@iwsdk/locomotor` | EnvironmentType, locomotion |
| `@iwsdk/xr-input` | Galaxy XR controllers / hands |
| `@iwsdk/vite-plugin-dev` | XR emulation in Vite |
| `@iwsdk/cli` | `dev:iwsdk`, adapter sync |
| `@iwsdk/reference` | Reference assets for CLI |

## Revert to npm

In `package.json`, restore `^0.4.2` ranges and run `npm install`.

## Docs

- Fork: https://github.com/AlfaOmegaGrafx/immersive-web-sdk
- Upstream: https://iwsdk.dev

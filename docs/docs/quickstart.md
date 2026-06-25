# Quickstart


- Main repo: https://github.com/AlfaOmegaGrafx/OpenNexus3DStudio
- Upstream attribution: https://github.com/M3-org/CharacterStudio (M3-org avatar-trait foundation)


```bash
# Clone the repo and change directory into it
git clone https://github.com/AlfaOmegaGrafx/OpenNexus3DStudio
cd OpenNexus3DStudio

# Install dependencies with legacy peer deps flag to ignore React errors
npm install --legacy-peer-deps
npm run dev

# Or use yarn
yarn install
yarn run dev
```

## Troubleshooting

This project has been mainly tested with node v16, it's recommended to install nvm to easily switch: https://github.com/nvm-sh/nvm

Copy custom asset packs to the `public/` folder. For modding / reskinning you'll mainly only need to touch files there.

If assets aren't showing up doublecheck the `.env` file, you can either point to a remote host (can use github pages) like https://m3-org.github.io/loot-assets/loot/ or a path in public directory such as `VITE_ASSET_PATH=./loot-assets`.

If you change the project name you need to also edit

- `vite.config.js`
- `package.json`

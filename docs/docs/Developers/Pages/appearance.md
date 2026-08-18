# Appearance

To Access this menu, go to `Create Character` menu button, then select any option displayed there.

***Important:*** if no option is present in this menu, you need to setup `VITE_ASSET_PATH` in the `.env` file, to point to `character manifest.json` location, and point were to fetch manifest options.

**Summary**

The `Appearance` page, allows you to load and select different character traits (models), animations, and textures, as well as entering debug mode and fine tune details on your avatar. It provides buttons based on a pre-defined `character-manifest` to dress-up and customize your character.

**Logic**

For this component, we want the user to be able to access the `characterManager` functions by providing ui buttons to select trait models or textures, play animations, and set culling layers for selected character.

**Select character functions**

- `randomize`: From loaded manifest, load a set of random traits (the traits that will be randomized are defined in the loaded manifest)

- `handleColorChange` `handleChangeComplete`: Change the color of current selected trait

- `clickDebugMode`: Display debug mode in the main window

- `selectTrait`: Select a trait from the displayed options and load it into the character

- `removeTrait`: Remove the current selected trait.

- `randomTrait`: Get a Random trait from current selected trait.

- `selectTraitGroup`: Change currently displayed trait options to selected trait group.

**Drag and drop functions**

- `handleFilesDrop` User dropped a file, detect what type it was:

- `handleAnimationDrop`: User dropped an animation, play it on the current character traits

- `handleImageDrop`: User dropped an image, apply it to the current selected Trait (works only if there is currently a selected trait)

- `handleVRMDrop`: User dropped a vrm file, load it as custom on current selected Trait (works only if there is currently a selected trait)

- `handleJsonDrop`: User dropped a json file, consider it as an nft json specification file and load all traits included in this file.

- `uploadTrait`: Actually load the vrm file that was drag and dropped by the user.

**Studio composable clothing**

OpenNexus Studio template **Body+Cloth** (`krea_composable_avatar_body`) generates garments into Appearance slots using API `rig_mode: appearance_component` on the shared `appearance_base.vrm`. Equipping uses `characterManager.loadCustomTrait` / `equipAppearanceComponentTrait` — same path as custom VRM drops, keyed by slot (`Legs`, `Chest`, `Shoes`, `Body`, …). See `src/library/appearanceClothing.js` and `docs/AVATAR_PIPELINE.md`.

### Culling layers (0 / 1 / 2)

Studio clothing follows the same culling integers as Modder manifests ([getting-started — Culling Layers](../../Modders/getting-started.md#culling-layers), [character-traits — defaultCullingLayer](../../Modders/manifest-files/character-traits.md#defaultcullinglayer)):

| Layer | Meaning | Studio Appearance slots |
|------:|---------|-------------------------|
| **0** | Base body (soulbound) | Manifest body mesh — not generated from the clothing textarea |
| **1** | Clothing | `Chest`, `Legs`, `Waist`, `Shoes`, and **`Body`** when used for full-body garments (pajamas, onesie, jumpsuit, romper, coveralls) |
| **2+** | Accessories | `Hands`, `Head`, `Neck` (gloves, watches, bracelets, hats, glasses, earrings, jewelry) |
| **−1** | No cull | Hair / pieces that must not remove faces underneath |

`parseClothingAccessoryLines` attaches `culling_layer` from `APPEARANCE_SLOT_CULLING_LAYER`. Note: slot id **`Body`** for a pajama/jumpsuit means “full-body garment bone fit” and uses **layer 1**, not the layer-0 soulbound base body.

### Smart layering

`applySmartClothingLayering` (also run inside parse + randomize) enforces:

1. **Full-body clothing** — if any line is a full-body garment (`Body` slot or pajama/onesie/jumpsuit/…), drop `Chest`, `Legs`, and `Waist` (they would double-cover the same layer-1 region). Shoes and accessories may remain.
2. **Covering gloves vs wristwear** — if Hands includes boxing gloves / gauntlets / mittens, drop bracelets, wristbands, and wrist watches on Hands (gloves already cover the wrists).
3. **Same-slot smart segmentation** — `Head`, `Hands`, and `Neck` can hold **multiple** accessories when they attach to different sub-regions:
   - **Head:** hat/cap + eyewear + earrings (e.g. baseball cap + glasses + studs) — each is its own Krea→TRELLIS line, still `appearance_slot: Head` for bone fit
   - **Conflicts:** helmet replaces hat/glasses/earrings; mask conflicts with eyewear/hat; covering gloves conflict with wristwear
   - **Equip:** `equipAppearanceComponentTrait` tries segmented trait ids first (`Head_Eyewear`, `Hat`, `Earrings`, …) so co-worn pieces do not overwrite each other when the character manifest defines those groups; otherwise falls back to `Head` / `Hands` / `Neck`

Randomize (~22% chance) picks a `Body:` full-body outfit instead of separate top/pants/belt, lightly biases slippers with pajamas, and often stacks Head segments (cap + glasses).

**Legs vs Shoes:** Legs / Body Krea subjects use bare-foot stance cues (`NO shoes`). Footwear language is reserved for the `Shoes` slot so pants/joggers do not bake boots into the same mesh.

**Hands bind:** Hands prompts force T-pose bone bind — palms down, thumbs forward (not palms-forward / thumbs-up). Mittens keep a thumb-pouch topology instead of five separate fingers.

**Utils functions**

- `back`: Go back to manifest selection page.

- `next`: Go to download page.
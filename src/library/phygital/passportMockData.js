/**
 * Mock Digital Twin Passports — remove reliance when API + NFC supplier are live.
 * @see docs/PHYGITAL_NFC_APPAREL_ROADMAP.md
 */
import {
  PHYGITAL_MOCK_CHIP_MODEL,
  PHYGITAL_NFC_VENDOR_TBD,
} from './passportSchema.js';

/** @type {import('./passportSchema.js').PhygitalPassport} */
const MOCK_PASSPORT_OG = {
  serialId: 'ST-OG-001-9842',
  sku: 'ST-OG-001',
  edition: 'Genesis Drop',
  status: 'authentic',
  brand: 'Space-Time',
  mock: true,
  nfc: {
    vendor: PHYGITAL_NFC_VENDOR_TBD,
    chipModel: PHYGITAL_MOCK_CHIP_MODEL,
    programmingBatch: null,
  },
  digitalTwin: {
    studioProjectId: null,
    exportHash: null,
    thumbnailUrl: null,
    assets: [
      {
        format: 'glb',
        label: 'Web / Blender',
        url: null,
        status: 'planned',
        mimeType: 'model/gltf-binary',
      },
      {
        format: 'vrm',
        label: 'VRChat / VRM',
        url: null,
        status: 'planned',
        mimeType: 'model/vrm',
      },
      {
        format: 'usdz',
        label: 'Apple AR (Quick Look)',
        url: null,
        status: 'planned',
        mimeType: 'model/vnd.usdz+zip',
      },
    ],
  },
  provenance: {
    manufacturedAt: '2026-06-01T12:00:00Z',
    fulfillmentRegion: 'US',
    notes: 'Mock passport — digital twin files will link to studio exports when manufacturing pipeline is live.',
  },
  onChain: {
    status: 'planned',
    chainId: null,
    contractAddress: null,
    tokenId: null,
  },
  tapStats: {
    totalTaps: 0,
    lastTapAt: null,
  },
};

/** @type {import('./passportSchema.js').PhygitalPassport} */
const MOCK_PASSPORT_DEMO = {
  ...MOCK_PASSPORT_OG,
  serialId: 'ST-DEMO-0001',
  sku: 'ST-DEMO',
  edition: 'Internal demo',
  provenance: {
    ...MOCK_PASSPORT_OG.provenance,
    notes: 'Demo serial for UX and API contract testing.',
  },
};

/** @type {Record<string, import('./passportSchema.js').PhygitalPassport>} */
export const MOCK_PASSPORTS_BY_SERIAL = {
  [MOCK_PASSPORT_OG.serialId]: MOCK_PASSPORT_OG,
  [MOCK_PASSPORT_DEMO.serialId]: MOCK_PASSPORT_DEMO,
};

/**
 * @param {string} serialId
 * @returns {import('./passportSchema.js').PhygitalPassport|null}
 */
export function getMockPassport(serialId) {
  const key = String(serialId || '').trim();
  if (!key) return null;
  return MOCK_PASSPORTS_BY_SERIAL[key] ?? null;
}

export const MOCK_SERIAL_IDS = Object.keys(MOCK_PASSPORTS_BY_SERIAL);

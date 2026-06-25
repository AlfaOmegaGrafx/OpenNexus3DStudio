/**
 * Digital Twin Passport — shared field names (mock + future API).
 * @see docs/PHYGITAL_PASSPORT_API.md
 */

/** @typedef {'authentic'|'revoked'|'unknown'} PassportStatus */

/** @typedef {'glb'|'vrm'|'fbx'|'usdz'|'gltf'} TwinFormat */

/**
 * @typedef {Object} TwinAsset
 * @property {TwinFormat} format
 * @property {string} label
 * @property {string|null} url
 * @property {string} [mimeType]
 * @property {'ready'|'planned'|'unavailable'} [status]
 */

/**
 * @typedef {Object} PhygitalPassport
 * @property {string} serialId
 * @property {string} sku
 * @property {string} edition
 * @property {PassportStatus} status
 * @property {string} brand
 * @property {{ vendor: string, chipModel: string, programmingBatch?: string|null }} nfc
 * @property {{ studioProjectId?: string|null, exportHash?: string|null, thumbnailUrl?: string|null, assets: TwinAsset[] }} digitalTwin
 * @property {{ manufacturedAt?: string|null, fulfillmentRegion?: string|null, notes?: string|null }} provenance
 * @property {{ status: string, chainId?: number|null, contractAddress?: string|null, tokenId?: string|null }} onChain
 * @property {{ totalTaps?: number, lastTapAt?: string|null }} [tapStats]
 * @property {boolean} [mock]
 */

export const PHYGITAL_NFC_VENDOR_TBD = 'TBD_NFC_VENDOR';

export const PHYGITAL_MOCK_CHIP_MODEL = 'NTAG424 DNA (planned — supplier TBD)';

/** @param {unknown} value @returns {value is PhygitalPassport} */
export function isPhygitalPassport(value) {
  return (
    value != null &&
    typeof value === 'object' &&
    typeof /** @type {PhygitalPassport} */ (value).serialId === 'string' &&
    Array.isArray(/** @type {PhygitalPassport} */ (value).digitalTwin?.assets)
  );
}

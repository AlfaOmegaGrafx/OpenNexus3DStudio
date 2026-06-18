import axios from 'axios';
import { get3daigcAuthHeaders } from './taskManager.js';

/**
 * Fetch per-model advanced parameters from 3DAIGC-API (Open3DStudio v1.1+).
 * GET /api/v1/system/models/{model_id}/parameters
 */
export async function fetchModelParameters(apiEndpoint, modelId) {
  if (!apiEndpoint || !modelId) return null;

  const base = apiEndpoint.replace(/\/$/, '');
  const url = `${base}/api/v1/system/models/${encodeURIComponent(modelId)}/parameters`;

  try {
    const response = await axios.get(url, {
      headers: { ...get3daigcAuthHeaders() },
      timeout: 15000,
    });
    return response.data?.parameters || response.data || null;
  } catch (err) {
    if (err.response?.status === 404) return null;
    throw err;
  }
}

/** Flatten API parameter schema into default values for requests. */
export function buildDefaultModelParameters(schema) {
  if (!schema || typeof schema !== 'object') return {};

  const out = {};
  for (const [key, def] of Object.entries(schema)) {
    if (def && typeof def === 'object' && 'default' in def) {
      out[key] = def.default;
    }
  }
  return out;
}

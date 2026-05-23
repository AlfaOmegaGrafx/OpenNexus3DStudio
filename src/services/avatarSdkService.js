const AVATARSDK_BASE_URL = 'https://api.avatarsdk.com';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getEnv(name, fallback = '') {
  const value = import.meta.env[name];
  return typeof value === 'string' ? value.trim() : fallback;
}

function parseCode(input) {
  if (!input || typeof input !== 'string') return '';
  const trimmed = input.trim();
  if (!trimmed) return '';
  if (/^[0-9a-fA-F-]{16,}$/.test(trimmed)) return trimmed;
  const match = trimmed.match(/\/([0-9a-fA-F-]{16,})\/?$/);
  return match ? match[1] : trimmed;
}

class AvatarSdkService {
  constructor() {
    this.baseUrl = AVATARSDK_BASE_URL;
    this.token = '';
    this.tokenExpiresAt = 0;
    this.playerUid = '';
    this.playerReadyPromise = null;
  }

  getOrCreatePlayerUid() {
    const fromEnv = getEnv('VITE_AVATARSDK_PLAYER_UID');
    if (fromEnv) {
      this.playerUid = fromEnv;
      return this.playerUid;
    }

    if (this.playerUid) {
      return this.playerUid;
    }

    try {
      const key = 'avatarsdk_player_uid';
      const existing = window.localStorage.getItem(key);
      if (existing && existing.trim()) {
        this.playerUid = existing.trim();
        return this.playerUid;
      }

      const generated = crypto.randomUUID();
      window.localStorage.setItem(key, generated);
      this.playerUid = generated;
      return this.playerUid;
    } catch {
      // Fallback if localStorage is unavailable.
      this.playerUid = crypto.randomUUID();
      return this.playerUid;
    }
  }

  async getAccessToken(forceRefresh = false) {
    const now = Date.now();
    if (!forceRefresh && this.token && now < this.tokenExpiresAt - 15_000) {
      return this.token;
    }

    const clientId = getEnv('VITE_AVATARSDK_CLIENT_ID');
    const clientSecret = getEnv('VITE_AVATARSDK_CLIENT_SECRET');
    if (!clientId || !clientSecret) {
      throw new Error('AvatarSDK credentials are missing. Set VITE_AVATARSDK_CLIENT_ID and VITE_AVATARSDK_CLIENT_SECRET.');
    }

    const body = new URLSearchParams();
    body.set('grant_type', 'client_credentials');
    body.set('client_id', clientId);
    body.set('client_secret', clientSecret);

    const response = await fetch(`${this.baseUrl}/o/token/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json'
      },
      body: body.toString()
    });

    if (!response.ok) {
      let detail = '';
      try {
        const errJson = await response.json();
        detail = errJson?.detail || errJson?.error_description || errJson?.error || errJson?.message || '';
      } catch {
        detail = '';
      }
      throw new Error(
        `AvatarSDK auth failed: ${response.status} ${response.statusText}${detail ? `: ${detail}` : ''}. ` +
        'Verify AvatarSDK client_id/client_secret and active plan access for the selected pipeline.'
      );
    }

    const data = await response.json();
    if (!data?.access_token) {
      throw new Error('AvatarSDK auth failed: access_token missing in response.');
    }

    this.token = data.access_token;
    const expiresInSec = Number(data.expires_in) || 3600;
    this.tokenExpiresAt = now + expiresInSec * 1000;
    return this.token;
  }

  async request(path, { method = 'GET', headers = {}, body } = {}) {
    const token = await this.getAccessToken();
    const playerUid = await this.ensurePlayerUid();
    const finalHeaders = {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      ...headers
    };

    // Client access mode expects PlayerUID on each request.
    finalHeaders['X-PlayerUID'] = playerUid;

    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: finalHeaders,
      body
    });

    if (!response.ok) {
      let detail = '';
      try {
        const errJson = await response.json();
        detail = errJson?.detail || errJson?.message || '';
      } catch {
        detail = '';
      }
      throw new Error(`AvatarSDK request failed (${response.status} ${response.statusText})${detail ? `: ${detail}` : ''}`);
    }

    return response.json();
  }

  async requestWithoutPlayer(path, { method = 'GET', headers = {}, body } = {}) {
    const token = await this.getAccessToken();
    const finalHeaders = {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      ...headers
    };

    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: finalHeaders,
      body
    });

    if (!response.ok) {
      let detail = '';
      try {
        const text = await response.text();
        detail = text || '';
      } catch {
        detail = '';
      }
      throw new Error(`AvatarSDK request failed (${response.status} ${response.statusText})${detail ? `: ${detail}` : ''}`);
    }

    return response.json();
  }

  async ensurePlayerUid() {
    const fromEnv = getEnv('VITE_AVATARSDK_PLAYER_UID');
    if (fromEnv) {
      this.playerUid = fromEnv;
      return this.playerUid;
    }

    if (this.playerUid) {
      return this.playerUid;
    }

    if (this.playerReadyPromise) {
      return this.playerReadyPromise;
    }

    this.playerReadyPromise = (async () => {
      // Reuse stored player if available.
      try {
        const key = 'avatarsdk_player_uid';
        const existing = window.localStorage.getItem(key);
        if (existing && existing.trim()) {
          this.playerUid = existing.trim();
          return this.playerUid;
        }
      } catch {
        // ignore
      }

      // Register a player once and persist it.
      const createdPlayer = await this.requestWithoutPlayer('/players/', {
        method: 'POST'
      });
      const code = (createdPlayer?.code || '').trim();
      if (!code) {
        throw new Error('AvatarSDK player registration failed: missing player code.');
      }

      this.playerUid = code;
      try {
        window.localStorage.setItem('avatarsdk_player_uid', code);
      } catch {
        // ignore
      }
      return code;
    })();

    try {
      return await this.playerReadyPromise;
    } finally {
      this.playerReadyPromise = null;
    }
  }

  async createAvatar({ imageFile, name, description, pipeline, pipelineSubtype, parameters, exportParameters }) {
    const resolvedPipeline = pipeline || getEnv('VITE_AVATARSDK_PIPELINE', 'head_1.2');
    const resolvedSubtype =
      pipelineSubtype ||
      getEnv(
        'VITE_AVATARSDK_PIPELINE_SUBTYPE',
        resolvedPipeline === 'head_1.2' ? 'base/static' : 'male'
      );

    const form = new FormData();
    form.append('photo', imageFile);
    form.append('name', name || `Avatar ${new Date().toISOString()}`);
    form.append('description', description || '');
    form.append('pipeline', resolvedPipeline);
    form.append('pipeline_subtype', resolvedSubtype);

    if (parameters) {
      form.append('parameters', JSON.stringify(parameters));
    }
    if (exportParameters) {
      form.append('export_parameters', JSON.stringify(exportParameters));
    }

    return this.request('/avatars/', {
      method: 'POST',
      body: form
    });
  }

  async getAvatar(avatarCode) {
    return this.request(`/avatars/${avatarCode}/`);
  }

  async listExports(avatarCode) {
    return this.request(`/avatars/${avatarCode}/exports/`);
  }

  async waitForAvatarCompletion(avatarCode, { onProgress, maxAttempts = 120, intervalMs = 3000 } = {}) {
    for (let i = 0; i < maxAttempts; i += 1) {
      const avatar = await this.getAvatar(avatarCode);
      const status = String(avatar?.status || '').toLowerCase();
      const progress = Number(avatar?.progress ?? 0);
      if (onProgress) onProgress(status, progress, avatar);

      if (status === 'completed') return avatar;
      if (status === 'failed' || status === 'timed out' || status === 'timed_out') {
        const verbose = avatar?.status_verbose?.message || avatar?.status_verbose?.code || 'Avatar generation failed';
        throw new Error(`AvatarSDK avatar job failed: ${verbose}`);
      }
      await sleep(intervalMs);
    }
    throw new Error('AvatarSDK avatar generation timed out.');
  }

  async waitForExportCompletion(avatarCode, { onProgress, maxAttempts = 120, intervalMs = 3000 } = {}) {
    for (let i = 0; i < maxAttempts; i += 1) {
      const exportsList = await this.listExports(avatarCode);
      const latest = Array.isArray(exportsList) && exportsList.length > 0 ? exportsList[0] : null;
      const status = String(latest?.status || '').toLowerCase();
      if (onProgress) onProgress(status, latest);

      if (status === 'completed') return latest;
      if (status === 'failed') {
        throw new Error('AvatarSDK export failed.');
      }
      await sleep(intervalMs);
    }
    throw new Error('AvatarSDK export timed out.');
  }

  async checkMetaPersonAvailability() {
    try {
      await this.request('/parameters/available/metaperson_2.0/');
      return { ok: true, message: 'MetaPerson 2.0 access is available for current credentials.' };
    } catch (error) {
      return {
        ok: false,
        message: error?.message || 'MetaPerson 2.0 access check failed.'
      };
    }
  }

  async generateAvatarFromPhoto({
    imageFile,
    name,
    description,
    pipeline,
    pipelineSubtype,
    onProgress
  }) {
    const defaultExportParameters = {
      format: 'glb',
      embed: true
    };

    const createdSafe = await this.createAvatar({
      imageFile,
      name,
      description,
      pipeline,
      pipelineSubtype,
      parameters: {},
      exportParameters: defaultExportParameters
    });

    const avatarCode = parseCode(createdSafe?.code || createdSafe?.url || '');
    if (!avatarCode) {
      throw new Error('AvatarSDK did not return a valid avatar code.');
    }

    await this.waitForAvatarCompletion(avatarCode, {
      onProgress: (status, progress, avatar) => {
        if (onProgress) onProgress({ stage: 'avatar', status, progress, avatar });
      }
    });

    const completedExport = await this.waitForExportCompletion(avatarCode, {
      onProgress: (status, exportData) => {
        if (onProgress) onProgress({ stage: 'export', status, progress: status === 'completed' ? 100 : 95, exportData });
      }
    });

    const files = Array.isArray(completedExport?.files) ? completedExport.files : [];
    const primaryFile = files.find((f) => f?.identity === 'avatar') || files[0] || null;

    return {
      provider: 'avatarsdk',
      avatarCode,
      avatarUrl: createdSafe?.url || `${this.baseUrl}/avatars/${avatarCode}/`,
      exportCode: completedExport?.code || '',
      exportStatus: completedExport?.status || 'Completed',
      modelUrl: primaryFile?.file || null,
      downloadUrl: primaryFile?.file || null,
      files
    };
  }
}

const avatarSdkService = new AvatarSdkService();
export default avatarSdkService;

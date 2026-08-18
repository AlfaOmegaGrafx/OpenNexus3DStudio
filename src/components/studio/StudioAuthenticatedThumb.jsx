import React, { useEffect, useState } from 'react';
import { resolveTaskModelUrl } from '../../library/taskModelUrl.js';
import { get3daigcAuthHeaders } from '../../library/taskManager.js';

/** Auth-fetch image thumb for Studio galleries. */
export default function StudioAuthenticatedThumb({ imageUrl, apiEndpoint, label }) {
  const [src, setSrc] = useState(null);

  useEffect(() => {
    let revoked = false;
    let objectUrl = null;
    if (!imageUrl) {
      setSrc(null);
      return undefined;
    }
    const absolute = resolveTaskModelUrl(imageUrl, apiEndpoint) || imageUrl;
    (async () => {
      try {
        const response = await fetch(absolute, { headers: get3daigcAuthHeaders() });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const blob = await response.blob();
        if (revoked) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      } catch {
        if (!revoked) setSrc(null);
      }
    })();
    return () => {
      revoked = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [imageUrl, apiEndpoint]);

  return (
    <figure className="studio-view-thumb">
      {src ? (
        <img src={src} alt={label || 'view'} />
      ) : (
        <div className="studio-image-preview-loading">…</div>
      )}
      {label ? <figcaption>{label}</figcaption> : null}
    </figure>
  );
}

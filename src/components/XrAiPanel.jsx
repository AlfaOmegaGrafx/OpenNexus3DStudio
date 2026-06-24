import React, { useRef, useState } from 'react';
import { buildXrHubEmbedUrl, getXrHubEmbedUrl } from '../library/xrHubConfig.js';
import './XrAiPanel.css';

/**
 * Left-sidebar XR voice client (NVIDIA xr-ai hub on DGX).
 * Jobs started here adopt into Task Manager via postMessage handoff.
 */
export default function XrAiPanel({ isApiConnected }) {
  const hubUrl = getXrHubEmbedUrl();
  const hubIframeUrl = buildXrHubEmbedUrl(hubUrl);
  const [expanded, setExpanded] = useState(false);
  const cardHeaderRef = useRef(null);

  if (!hubUrl) return null;

  const toggleExpanded = () => {
    const next = !expanded;
    setExpanded(next);
    if (next && cardHeaderRef.current) {
      setTimeout(() => {
        cardHeaderRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
          inline: 'nearest',
        });
      }, 0);
    }
  };

  return (
    <div className="xr-ai-panel" data-testid="xr-ai-panel">
      <div className="card">
        <div className="card-header xr-ai-panel-header" ref={cardHeaderRef}>
          <button
            type="button"
            className="expand-icon-button"
            onClick={toggleExpanded}
            title={expanded ? 'Collapse XR Voice' : 'Expand XR Voice'}
            aria-expanded={expanded}
          >
            {expanded ? '▼' : '▶'}
          </button>
          <h3 className="card-title">
            <span className="xr-ai-panel-icon" aria-hidden>🎙️</span>
            XR Voice
          </h3>
          <div className="xr-ai-panel-actions">
            <span
              className={`xr-ai-status-badge ${isApiConnected ? 'online' : 'offline'}`}
              title={isApiConnected ? 'DGX API connected' : 'DGX API not connected'}
            >
              {isApiConnected ? 'DGX' : 'Offline'}
            </span>
            <a
              className="header-btn xr-ai-panel-popout"
              href={hubUrl}
              target="_blank"
              rel="noopener noreferrer"
              title="Open voice hub in new tab (recommended on Galaxy XR)"
            >
              ↗
            </a>
          </div>
        </div>

        {!isApiConnected && (
          <p className="xr-ai-panel-message xr-ai-panel-message-warn">
            Connect to DGX API below for task progress and auto-load.
          </p>
        )}

        {expanded ? (
          <div className="xr-ai-panel-body">
            <div className="xr-ai-panel-frame-host">
              <iframe
                className="xr-ai-panel-frame"
                src={hubIframeUrl}
                title="NVIDIA XR AI Voice Hub"
                allow="camera; microphone; autoplay; fullscreen"
                referrerPolicy="no-referrer"
              />
            </div>
          </div>
        ) : (
          <p className="xr-ai-panel-message">
            Expand to connect mic and camera. Say &ldquo;Hey agent, make a 3D model of this.&rdquo;
            Jobs appear in Tasks as <span className="xr-ai-panel-tag">XR · DGX</span>.
          </p>
        )}
      </div>
    </div>
  );
}

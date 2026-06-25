import React, { useEffect, useRef, useState } from 'react';
import {
  buildXrHubEmbedUrl,
  getXrHubEmbedUrl,
  isXrVoicePublicDemo,
  OPEN_XR_AI_PANEL_EVENT,
  useXrHubLiveEmbed,
} from '../library/xrHubConfig.js';
import './XrAiPanel.css';

function XrVoiceDemoPreview() {
  return (
    <div className="xr-ai-demo-preview" data-testid="xr-ai-demo-preview">
      <div className="xr-ai-demo-hero">
        <span className="xr-ai-demo-mic" aria-hidden>
          🎙️
        </span>
        <p className="xr-ai-demo-title">NVIDIA XR AI + 3DAIGC</p>
        <p className="xr-ai-demo-subtitle">Voice-driven mesh generation preview</p>
      </div>
      <div className="xr-ai-demo-chat">
        <div className="xr-ai-demo-bubble xr-ai-demo-bubble-user">
          &ldquo;Hey agent, make a 3D model of this.&rdquo;
        </div>
        <div className="xr-ai-demo-bubble xr-ai-demo-bubble-agent">
          Camera frame → VLM → 3DAIGC mesh job → GLB in viewport
        </div>
      </div>
      <p className="xr-ai-demo-footnote">
        Public demo — run OpenNexus locally with DGX Spark for live mic, camera, and task handoff.
      </p>
    </div>
  );
}

/**
 * Left-sidebar XR voice client (NVIDIA xr-ai hub on DGX).
 * Vercel public demo shows a static preview; local dev embeds the Spark hub iframe.
 */
export default function XrAiPanel({ isApiConnected }) {
  const publicDemo = isXrVoicePublicDemo();
  const liveEmbed = useXrHubLiveEmbed();
  const hubUrl = liveEmbed ? getXrHubEmbedUrl() : '';
  const hubIframeUrl = liveEmbed ? buildXrHubEmbedUrl(hubUrl) : '';
  const [expanded, setExpanded] = useState(() => publicDemo);
  const cardHeaderRef = useRef(null);

  useEffect(() => {
    const onOpen = () => {
      setExpanded(true);
      if (cardHeaderRef.current) {
        setTimeout(() => {
          cardHeaderRef.current?.scrollIntoView({
            behavior: 'smooth',
            block: 'start',
            inline: 'nearest',
          });
        }, 0);
      }
    };
    window.addEventListener(OPEN_XR_AI_PANEL_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_XR_AI_PANEL_EVENT, onOpen);
  }, []);

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
            <span className="xr-ai-panel-icon" aria-hidden>
              🎙️
            </span>
            XR Voice
          </h3>
          <div className="xr-ai-panel-actions">
            <span
              className={`xr-ai-status-badge ${publicDemo ? 'demo' : isApiConnected ? 'online' : 'offline'}`}
              title={
                publicDemo
                  ? 'Public demo preview'
                  : isApiConnected
                    ? 'DGX API connected'
                    : 'DGX API not connected'
              }
            >
              {publicDemo ? 'Demo' : isApiConnected ? 'DGX' : 'Offline'}
            </span>
            {liveEmbed && hubUrl ? (
              <a
                className="header-btn xr-ai-panel-popout"
                href={hubUrl}
                target="_blank"
                rel="noopener noreferrer"
                title="Open voice hub in new tab (recommended on Galaxy XR)"
              >
                ↗
              </a>
            ) : null}
          </div>
        </div>

        {!publicDemo && !isApiConnected && (
          <p className="xr-ai-panel-message xr-ai-panel-message-warn">
            Connect to DGX API below for task progress and auto-load.
          </p>
        )}

        {expanded ? (
          <div className="xr-ai-panel-body">
            {liveEmbed && hubIframeUrl ? (
              <div className="xr-ai-panel-frame-host">
                <iframe
                  className="xr-ai-panel-frame"
                  src={hubIframeUrl}
                  title="NVIDIA XR AI Voice Hub"
                  allow="camera; microphone; autoplay; fullscreen"
                  referrerPolicy="no-referrer"
                />
              </div>
            ) : (
              <XrVoiceDemoPreview />
            )}
          </div>
        ) : (
          <p className="xr-ai-panel-message">
            {publicDemo ? (
              <>
                Voice + camera mesh generation on Galaxy XR and DGX Spark. Expand for the integration
                preview.
              </>
            ) : (
              <>
                Expand to connect mic and camera. Say &ldquo;Hey agent, make a 3D model of this.&rdquo;
                Jobs appear in Tasks as <span className="xr-ai-panel-tag">XR · DGX</span>.
              </>
            )}
          </p>
        )}
      </div>
    </div>
  );
}

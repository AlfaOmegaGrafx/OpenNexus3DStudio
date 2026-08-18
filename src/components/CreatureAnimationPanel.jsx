/**
 * Left-sidebar Animation card: Mesh2Motion creature clips, grouped by catalog.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useScene } from '../context/SceneContext';
import {
  creatureAnimationPlayer,
  getCreatureTemplateIdFromModel,
  loadCreatureAnimationBundle,
} from '../library/creatureAnimations.js';
import './CreatureAnimationPanel.css';

const CreatureAnimationPanel = () => {
  const { currentModel, sceneManager } = useScene();
  const [isExpanded, setIsExpanded] = useState(false);
  const [catalog, setCatalog] = useState(null);
  const [clips, setClips] = useState([]);
  const [sourceRest, setSourceRest] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeClip, setActiveClip] = useState('');
  const cardHeaderRef = useRef(null);

  const templateId = getCreatureTemplateIdFromModel(currentModel);
  const isCreature = Boolean(templateId);

  useEffect(() => {
    let cancelled = false;
    if (!isCreature || !templateId) {
      setCatalog(null);
      setClips([]);
      setSourceRest(null);
      setActiveClip('');
      creatureAnimationPlayer.dispose();
      return undefined;
    }

    setLoading(true);
    setError('');
    loadCreatureAnimationBundle(templateId)
      .then((bundle) => {
        if (cancelled) return;
        setCatalog(bundle.catalog);
        setClips(bundle.clips);
        setSourceRest(bundle.sourceRest);
        creatureAnimationPlayer.bind(currentModel, bundle.clips, bundle.sourceRest);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err?.message || String(err));
        setCatalog(null);
        setClips([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [currentModel, isCreature, templateId]);

  useEffect(() => {
    const onCleared = () => {
      creatureAnimationPlayer.dispose();
      setActiveClip('');
    };
    sceneManager?.on?.('modelCleared', onCleared);
    return () => {
      sceneManager?.off?.('modelCleared', onCleared);
      creatureAnimationPlayer.dispose();
    };
  }, [sceneManager]);

  const playClip = useCallback((name) => {
    if (!currentModel || !clips.length) return;
    if (creatureAnimationPlayer.root !== currentModel) {
      creatureAnimationPlayer.bind(currentModel, clips, sourceRest);
    }
    if (creatureAnimationPlayer.play(name)) {
      setActiveClip(name);
    }
  }, [clips, currentModel, sourceRest]);

  const stopClip = useCallback(() => {
    creatureAnimationPlayer.stop();
    setActiveClip('');
  }, []);

  const groups = catalog?.groups || [];
  const clipNames = new Set(clips.map((c) => c.name));

  return (
    <div className="creature-animation-panel">
      <div className="card">
        <div className="card-header" ref={cardHeaderRef}>
          <button
            type="button"
            onClick={() => {
              const next = !isExpanded;
              setIsExpanded(next);
              if (next && cardHeaderRef.current) {
                setTimeout(() => {
                  cardHeaderRef.current?.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start',
                    inline: 'nearest',
                  });
                }, 0);
              }
            }}
            className="expand-icon-button"
            title={isExpanded ? 'Collapse Animation' : 'Expand Animation'}
          >
            {isExpanded ? '▼' : '▶'}
          </button>
          <h3 className="card-title">Animation</h3>
          {isCreature && (
            <span className="creature-anim-badge" title="Mesh2Motion creature clips">
              M2M
            </span>
          )}
        </div>

        {isExpanded && (
          <div className="creature-anim-content">
            {!currentModel && (
              <p className="creature-anim-hint">Load a model to play animations.</p>
            )}
            {currentModel && !isCreature && (
              <p className="creature-anim-hint">
                Mesh2Motion clips apply to creature template rigs (e.g. fox). Humanoid Mixamo
                clips stay on the bottom animation bar.
              </p>
            )}
            {isCreature && loading && (
              <p className="creature-anim-hint">Loading Mesh2Motion clips…</p>
            )}
            {isCreature && error && (
              <p className="creature-anim-error">{error}</p>
            )}
            {isCreature && !loading && !error && (
              <>
                <div className="creature-anim-toolbar">
                  <span className="creature-anim-source">
                    {catalog?.source || 'Mesh2Motion'} · {templateId}
                  </span>
                  <button
                    type="button"
                    className="creature-anim-stop"
                    onClick={stopClip}
                    disabled={!activeClip}
                  >
                    Stop
                  </button>
                </div>
                {groups.map((group) => (
                  <div key={group.id} className="creature-anim-group">
                    <h4 className="creature-anim-group-title">{group.label}</h4>
                    <div className="creature-anim-clip-grid">
                      {(group.clips || []).map((name) => {
                        const available = clipNames.has(name);
                        return (
                          <button
                            key={name}
                            type="button"
                            className={`creature-anim-clip${activeClip === name ? ' active' : ''}`}
                            disabled={!available}
                            title={available ? `Play ${name}` : `${name} missing from bundle`}
                            onClick={() => playClip(name)}
                          >
                            {name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default CreatureAnimationPanel;

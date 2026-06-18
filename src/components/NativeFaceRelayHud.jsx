import React, { useCallback, useEffect, useState } from 'react';
import { useScene } from '../context/SceneContext';
import {
  getNativeFaceRelayStatus,
  isNativeFaceRelayEnabledInUrl,
  startNativeFaceRecording,
  stopNativeFaceRecording,
} from '../library/nativeFaceRelay.js';
import {
  getLastNativeFaceSource,
  getNativeFaceWeightsIfFresh,
} from '../library/nativeFaceBridge.js';
import {
  getNativeFacePlaybackStatus,
  isNativeFacePlaybackEnabledInUrl,
} from '../library/nativeFacePlayback.js';
import {
  startFaceRecordingAudio,
  stopFaceRecordingAudio,
  isFaceRecordingAudioActive,
} from '../library/nativeFaceRecordingAudio.js';
import styles from './NativeFaceRelayHud.module.css';

/**
 * Dev-only overlay shown with `?nativeFaceRelay=1` or `?nativeFacePlayback=<id>`.
 * Mirrors [CS-NATIVE-FACE-DIAG] without reading log files, and exposes a one-tap
 * recorder so you can capture a relay session and replay it inside Chrome WebXR.
 */
export default function NativeFaceRelayHud() {
  const { sceneManager } = useScene();
  const [snapshot, setSnapshot] = useState(null);
  const [recording, setRecording] = useState(false);
  const [recId, setRecId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [hasAudio, setHasAudio] = useState(false);

  const relayOn = isNativeFaceRelayEnabledInUrl();
  const playbackOn = isNativeFacePlaybackEnabledInUrl();

  useEffect(() => {
    if (!import.meta.env.DEV || (!relayOn && !playbackOn)) return undefined;

    const tick = () => {
      const relay = getNativeFaceRelayStatus();
      const presenting = !!sceneManager?.renderer?.xr?.isPresenting;
      const weights = getNativeFaceWeightsIfFresh(undefined, presenting);
      const nk = weights ? Object.keys(weights).length : 0;
      const pushAge =
        relay.lastPushAgeMs != null && relay.lastPushAgeMs < (presenting ? 30_000 : 5000)
          ? `${relay.lastPushAgeMs}ms`
          : 'stale';
      const playback = getNativeFacePlaybackStatus();
      setSnapshot({
        mode: relay.mode,
        pushAge,
        nativeKeys: nk,
        faceSrc: getLastNativeFaceSource(),
        xrPresenting: presenting,
        playing: playback.playing,
        playbackId: playback.id,
        playbackAudio: playback.hasAudio,
      });
    };

    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [sceneManager, relayOn, playbackOn]);

  const toggleRecording = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (recording) {
        const audioResult = await stopFaceRecordingAudio(true);
        const r = await stopNativeFaceRecording();
        setRecording(false);
        setRecId(r?.id || null);
        setHasAudio(!!audioResult?.uploaded);
      } else {
        const r = await startNativeFaceRecording();
        setRecording(true);
        setRecId(r?.id || null);
        setHasAudio(false);
        if (r?.id) await startFaceRecordingAudio(r.id);
      }
    } catch (e) {
      console.warn('[NativeFaceRelayHud] recording toggle failed:', e?.message || e);
    } finally {
      setBusy(false);
    }
  }, [busy, recording]);

  if (!import.meta.env.DEV || (!relayOn && !playbackOn) || !snapshot) {
    return null;
  }

  const ok = snapshot.playing
    ? true
    : snapshot.nativeKeys > 25 && snapshot.pushAge !== 'stale';

  return (
    <div
      className={`${styles.hud} ${ok ? styles.hudOk : styles.hudWarn}`}
      data-viewport-anchored="true"
      role="status"
      aria-live="polite"
    >
      <div className={styles.title}>Face relay (dev)</div>
      <div>keys: {snapshot.nativeKeys}</div>
      <div>
        relay: {snapshot.mode}/{snapshot.pushAge}
      </div>
      <div>src: {snapshot.faceSrc}</div>
      <div>xr: {snapshot.xrPresenting ? 'yes' : 'no'}</div>
      {snapshot.playing && (
        <div>
          playback: {snapshot.playbackId || 'on'} ▶
          {snapshot.playbackAudio ? ' + audio' : ''}
        </div>
      )}
      {relayOn && (
        <button
          type="button"
          className={`${styles.recBtn} ${recording ? styles.recBtnActive : ''}`}
          onClick={toggleRecording}
          disabled={busy}
        >
          {recording
            ? `■ Stop${isFaceRecordingAudioActive() ? ' (mic)' : ''}`
            : '● Record face+mic'}
        </button>
      )}
      {!recording && recId && (
        <div className={styles.recId}>
          saved: {recId}
          {hasAudio ? ' + audio' : ' (face only)'}
        </div>
      )}
    </div>
  );
}

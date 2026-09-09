/**
 * Public template_wrap client stub (OSS / Vercel).
 * Full param builder: gitignored src/moat/wrap/buildWrapModelParameters.js
 */
import {
  AUTO_RIG_MODES,
  HEAD_TRACK,
  headTrackIsNone,
  normalizeHeadTrack,
} from './avatarPipelineCatalog.js';

/**
 * OSS path: send head_track + demographics only. Server moat applies likeness defaults.
 */
export function buildTemplateWrapClientOptions({
  promptOpts,
  template,
  current,
  faceSelfieFile,
}) {
  const gender = promptOpts?.character_gender || '';
  const ethnicity = promptOpts?.character_ethnicity || '';
  const wrapHeadTrack = normalizeHeadTrack(promptOpts?.head_track);

  if (headTrackIsNone(wrapHeadTrack)) {
    return {
      rigMode: AUTO_RIG_MODES.TEMPLATE,
      model_parameters: { head_track: HEAD_TRACK.NONE },
      statusSuffix: 'template bones-only — head track none',
    };
  }

  const composableBody =
    current?.templateId === 'krea_composable_avatar_body' ||
    template?.id === 'krea_composable_avatar_body';
  const expectHeadless = composableBody || Boolean(promptOpts?.headless_body);

  const model_parameters = {
    head_track: wrapHeadTrack,
    expect_headless_body: expectHeadless ? true : undefined,
    ...(gender ? { character_gender: gender } : {}),
    ...(ethnicity ? { character_ethnicity: ethnicity } : {}),
  };

  const out = { model_parameters };
  if (faceSelfieFile) {
    out.likeness_image_file = faceSelfieFile;
  }
  return out;
}

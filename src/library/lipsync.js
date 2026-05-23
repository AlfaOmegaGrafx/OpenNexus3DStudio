import { VRMExpressionPresetName } from "@pixiv/three-vrm";
import {
  setXRDriverLipSyncVisemeOverride,
  clearXRDriverLipSyncVisemeOverride,
  isFaceExpressionDriverFresh,
} from "./xrExpressionTrackingDriver.js";

const BoundingFrequencyMasc = [0, 400, 560, 2400, 4800]
const BoundingFrequencyFem = [0, 500, 700, 3000, 6000]
const IndicesFrequencyFemale= []
const IndicesFrequencyMale = []
const FFT_SIZE = 1024
const samplingFrequency = 44100

/** Vowel viseme slugs driven from FFT (canonical slug → expression names on this VRM). */
const VOWEL_KEYS = ["aa", "ih", "ee", "oh", "ou"];
const VOWEL_NAME_ALIASES = {
  aa: ["aa", "ah", "a", "Aa", "AA", "A", "Viseme_aa", "Viseme_AA", "v_aa", "vrc.v_aa", "FCL_PHN_aa"],
  ee: ["ee", "e", "E", "Viseme_ee", "Viseme_E", "Viseme_EE", "v_ee", "v_e", "vrc.v_ee", "vrc.v_e", "FCL_PHN_ee", "FCL_PHN_e"],
  ih: ["ih", "i", "Ih", "IH", "I", "Viseme_ih", "Viseme_I", "v_ih", "vrc.v_ih", "FCL_PHN_ih"],
  oh: ["oh", "o", "Oh", "OH", "O", "Viseme_oh", "Viseme_O", "v_oh", "vrc.v_oh", "FCL_PHN_oh"],
  ou: [
    "ou",
    "u",
    "Ou",
    "OU",
    "U",
    "oo",
    "OO",
    "uu",
    "UU",
    "uw",
    "Uw",
    "UW",
    "Viseme_ou",
    "Viseme_U",
    "Viseme_Oo",
    "Viseme_UU",
    "v_ou",
    "v_u",
    "v_oo",
    "vrc.v_ou",
    "vrc.v_u",
    "vrc.v_oo",
    "FCL_PHN_ou",
    "FCL_PHN_u",
  ],
};
/** Common naming conventions for consonant viseme expressions on VRMs. */
const CONSONANT_NAME_ALIASES = {
  sil: ["sil", "Sil", "SIL", "v_sil", "V_Sil", "Viseme_sil", "vrc.v_sil", "FCL_PHN_sil"],
  pp:  ["pp",  "PP", "v_pp",  "V_PP",  "Viseme_PP",  "vrc.v_pp",  "FCL_PHN_PP",  "PP_PB_M"],
  ff:  ["ff",  "FF", "v_ff",  "V_FF",  "Viseme_FF",  "vrc.v_ff",  "FCL_PHN_FF",  "F_V"],
  th:  ["th",  "TH", "v_th",  "V_TH",  "Viseme_TH",  "vrc.v_th",  "FCL_PHN_TH"],
  dd:  ["dd",  "DD", "v_dd",  "V_DD",  "Viseme_DD",  "vrc.v_dd",  "FCL_PHN_DD",  "D_T"],
  kk:  ["kk",  "KK", "v_kk",  "V_KK",  "Viseme_KK",  "vrc.v_kk",  "FCL_PHN_KK",  "K_G"],
  ch:  ["ch",  "CH", "v_ch",  "V_CH",  "Viseme_CH",  "vrc.v_ch",  "FCL_PHN_CH",  "CH_SH_J"],
  ss:  ["ss",  "SS", "v_ss",  "V_SS",  "Viseme_SS",  "vrc.v_ss",  "FCL_PHN_SS",  "S_Z"],
  nn:  ["nn",  "NN", "v_nn",  "V_NN",  "Viseme_NN",  "vrc.v_nn",  "FCL_PHN_NN",  "N_NG"],
  rr:  ["rr",  "RR", "v_rr",  "V_RR",  "Viseme_RR",  "vrc.v_rr",  "FCL_PHN_RR"],
};

/** OVR-style consonant slugs we attempt to drive from spectral audio cues. */
const CONSONANT_KEYS = ["sil", "pp", "ff", "th", "dd", "kk", "ch", "ss", "nn", "rr"];

/** Approximate Hz boundary above which sibilants (s, sh, ch) dominate human speech. */
const SIBILANCE_HZ_LOW = 4800;
const SIBILANCE_HZ_HIGH = 9000;
/** Below this Hz the spectrum is mostly vowel formants; used to score non-sibilance noise. */
const VOWEL_FORMANT_HZ_HIGH = 2200;

function clamp01(x) {
  const n = typeof x === "number" ? x : Number(x);
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

for (let m = 0; m < BoundingFrequencyMasc.length; m++) {
    IndicesFrequencyMale[m] = Math.round(((2 * FFT_SIZE) / samplingFrequency) * BoundingFrequencyMasc[m])
  }

  for (let m = 0; m < BoundingFrequencyFem.length; m++) {
    IndicesFrequencyFemale[m] = Math.round(((2 * FFT_SIZE) / samplingFrequency) * BoundingFrequencyFem[m])
  }

export class LipSync {
  constructor(vrm) {
    this.vrm = vrm
    this._micStream = null

    const update = (deltaTime, elapsedTime) => {
      requestAnimationFrame(update)
      this.update(deltaTime, elapsedTime)
    }

    update()

  }

  /**
   * @param {MediaStream} stream - Mic stream (`getUserMedia({ audio: true })`).
   */
  start(stream) {
    this._micStream = stream
    if (!this.audioContext) this.audioContext = new AudioContext()

    if (!this.userSpeechAnalyzer) {
      this.userSpeechAnalyzer = this.audioContext.createAnalyser()
      this.userSpeechAnalyzer.smoothingTimeConstant = 0.5
      this.userSpeechAnalyzer.fftSize = FFT_SIZE
    }

    if (this.mediaStreamSource) {
      try {
        this.mediaStreamSource.disconnect()
      } catch (_) {
        /* noop */
      }
      this.mediaStreamSource = null
    }

    this.mediaStreamSource = this.audioContext.createMediaStreamSource(stream)
    this.mediaStreamSource.connect(this.userSpeechAnalyzer)
    this.meter = LipSync.createAudioMeter(this.audioContext)
    this.mediaStreamSource.connect(this.meter)
    if (this.audioContext.state === "suspended") {
      void this.audioContext.resume().catch(() => {});
    }
  }

  startFromAudioFile(file) {
    if(!this.audioContext) this.audioContext = new AudioContext()


    if(!this.userSpeechAnalyzer)
        this.userSpeechAnalyzer = this.audioContext.createAnalyser()
    this.userSpeechAnalyzer.smoothingTimeConstant = 0.5
    this.userSpeechAnalyzer.fftSize = FFT_SIZE

    if (this.mediaStreamSource) {
      try {
        if (typeof this.mediaStreamSource.stop === "function") {
          this.mediaStreamSource.stop()
        }
      } catch (_) {
        /* BufferSource may already stop */
      }
      try {
        this.mediaStreamSource.disconnect()
      } catch (_) {
        /* noop */
      }
      this.mediaStreamSource = null
    }

    this.audioContext.decodeAudioData(file).then((buffer) => {
        this.mediaStreamSource = this.audioContext.createBufferSource()
        this.mediaStreamSource.buffer = buffer
        this.meter = LipSync.createAudioMeter(this.audioContext)
        this.mediaStreamSource.connect(this.meter)
        this.mediaStreamSource.connect(this.audioContext.destination)
        this.mediaStreamSource.start()

        // connect the output of mediaStreamSource to the input of userSpeechAnalyzer
        this.mediaStreamSource.connect(this.userSpeechAnalyzer)
    })

    }




  destroy() {
    if (this._micStream) {
      this._micStream.getTracks().forEach((t) => t.stop())
      this._micStream = null
    }
    this.meter?.shutdown()
    this.meter = null
    try {
      this.mediaStreamSource?.disconnect()
    } catch (_) {
      /* noop */
    }
    this.mediaStreamSource = null
    this.userSpeechAnalyzer = null
    return this.audioContext?.close().catch(() => {}) || Promise.resolve()
  }

  update(deltaTime) {
    if (this.meter) {
      const { volume } = this.meter;
      const em = this.vrm?.expressionManager;
      if (!em) return;

      const vowelNameCache = this._getVowelNameCache(em);
      const consonantNameCache = this._getConsonantNameCache(em);

      let shouldUpdateEm = false;
      if (volume < 0.01) {
        // Audio silent: hand the mouth back to face tracking / the rest pose. Drive `sil`
        // toward 1 (if the VRM has a sil blend) so closed-mouth rigs settle on it.
        setXRDriverLipSyncVisemeOverride(this.vrm, {
          aa: 0, ah: 0, ee: 0, ih: 0, oh: 0, ou: 0,
          sil: 1, pp: 0, ff: 0, th: 0, dd: 0, kk: 0, ch: 0, ss: 0, nn: 0, rr: 0,
          strength: 0.4,
        });
        if (!isFaceExpressionDriverFresh()) {
          for (const slug of VOWEL_KEYS) {
            this._setVowel(em, vowelNameCache, slug, 0);
          }
          this._setConsonant(em, consonantNameCache, "sil", 1);
          for (const k of ["pp", "ff", "th", "dd", "kk", "ch", "ss", "nn", "rr"]) {
            this._setConsonant(em, consonantNameCache, k, 0);
          }
          shouldUpdateEm = true;
        }
        // Audio-driven sil only lingers briefly so face tracking can re-take the mouth.
        clearXRDriverLipSyncVisemeOverride(this.vrm);
      } else {
        const { ah, oh, ee, ou, sibilance, midNoise } = this.update2();
        const strength = Math.min(1, volume * 10);
        const ih = clamp01(ee * 0.48 + ah * 0.12);

        const vowelEnergy = Math.max(ah, ee, oh, ih, ou);
        // Sibilance band (s / sh / ch) — high frequency noise out-runs vowel formants.
        const ss = Math.min(1, Math.max(0, sibilance * 1.55 - vowelEnergy * 0.35));
        const ch = Math.min(1, Math.max(0, sibilance * 0.55 + oh * 0.25 - ee * 0.2));
        // Labiodental / dental noise (f / v / th) — mid-band noise without a dominant vowel formant.
        const ffth = Math.min(1, Math.max(0, midNoise * 1.25 - vowelEnergy * 0.55));
        const ff = ffth * 0.65;
        const th = ffth * 0.55;
        // Closures (p / b / m / d / t / k / g / n) cannot really be heard while sustained; only
        // tag them lightly when overall energy is low but not silent so they bias the mouth shut.
        const closureBias = Math.min(1, Math.max(0, 0.18 - vowelEnergy * 1.1)) * Math.min(1, strength * 1.4);
        const pp = closureBias * 0.7;
        const dd = closureBias * 0.4;
        const kk = closureBias * 0.35;
        const nn = closureBias * 0.45;
        const rr = Math.min(1, Math.max(0, oh * 0.45 - sibilance * 0.4));

        setXRDriverLipSyncVisemeOverride(this.vrm, {
          aa: ah,
          ah,
          ee,
          ih,
          oh,
          ou,
          sil: 0,
          pp,
          ff,
          th,
          dd,
          kk,
          ch,
          ss,
          nn,
          rr,
          strength,
        });
        /** When the mic clearly carries vowels, drive blendshapes here too so browser + webcam still show mouth (XR merge can be crushed by resting bilabial seal). */
        const micDirectVisemes =
          strength >= 0.055 && vowelEnergy >= 0.035;
        if (!isFaceExpressionDriverFresh() || micDirectVisemes) {
          this._setVowel(em, vowelNameCache, "aa", ah);
          this._setVowel(em, vowelNameCache, "ee", ee);
          this._setVowel(em, vowelNameCache, "ih", ih);
          this._setVowel(em, vowelNameCache, "oh", oh);
          this._setVowel(em, vowelNameCache, "ou", ou);
          this._setConsonant(em, consonantNameCache, "sil", 0);
          this._setConsonant(em, consonantNameCache, "pp", pp);
          this._setConsonant(em, consonantNameCache, "ff", ff);
          this._setConsonant(em, consonantNameCache, "th", th);
          this._setConsonant(em, consonantNameCache, "dd", dd);
          this._setConsonant(em, consonantNameCache, "kk", kk);
          this._setConsonant(em, consonantNameCache, "ch", ch);
          this._setConsonant(em, consonantNameCache, "ss", ss);
          this._setConsonant(em, consonantNameCache, "nn", nn);
          this._setConsonant(em, consonantNameCache, "rr", rr);
          shouldUpdateEm = true;
        }
      }
      if (shouldUpdateEm) {
        try {
          em.update(deltaTime);
        } catch (_) {
          /* ignore */
        }
      }
    }
  }

  /**
   * Resolve & cache expression names for vowels **aa / ih / ee / oh / ou** (including **E**, **AA**, Viseme_*, vrc.v_*).
   */
  _getVowelNameCache(em) {
    if (this._vowelNameCacheFor === em && this._vowelNameCache) {
      return this._vowelNameCache;
    }
    const cache = {};
    const expressionMap = em?.expressionMap;
    const knownNames =
      expressionMap && typeof expressionMap === "object" ? new Set(Object.keys(expressionMap)) : null;

    const tryResolve = (aliases) => {
      for (const alias of aliases) {
        if (alias == null || alias === "") continue;
        if (knownNames?.has(alias)) return alias;
        try {
          if (typeof em.getExpression === "function" && em.getExpression(alias)) return alias;
        } catch (_) {
          /* keep looking */
        }
      }
      return null;
    };

    const ahPreset = /** @type {any} */ (VRMExpressionPresetName).Ah;
    cache.aa = tryResolve([
      VRMExpressionPresetName.Aa,
      ...(typeof ahPreset === "string" ? [ahPreset] : []),
      ...(VOWEL_NAME_ALIASES.aa || []),
    ]);
    cache.ee = tryResolve([VRMExpressionPresetName.Ee, ...(VOWEL_NAME_ALIASES.ee || [])]);
    cache.ih = tryResolve([VRMExpressionPresetName.Ih, ...(VOWEL_NAME_ALIASES.ih || [])]);
    cache.oh = tryResolve([VRMExpressionPresetName.Oh, ...(VOWEL_NAME_ALIASES.oh || [])]);
    cache.ou = tryResolve([VRMExpressionPresetName.Ou, ...(VOWEL_NAME_ALIASES.ou || [])]);

    this._vowelNameCacheFor = em;
    this._vowelNameCache = cache;
    return cache;
  }

  _setVowel(em, cache, slug, value) {
    const name = cache && cache[slug];
    if (!name) return;
    try {
      if (typeof em.setValue === "function") {
        em.setValue(name, Math.max(0, Math.min(1, Number(value) || 0)));
      }
    } catch (_) {
      /* missing */
    }
  }

  /**
   * Resolve & cache the VRM expression name for each OVR-style consonant slug.
   * Returns a map { slug → canonical expression name } including only slugs the model
   * actually defines. Cached per expressionManager so we do not rescan every frame.
   */
  _getConsonantNameCache(em) {
    if (this._consonantNameCacheFor === em && this._consonantNameCache) {
      return this._consonantNameCache;
    }
    const cache = {};
    const expressionMap = em?.expressionMap;
    const knownNames = expressionMap && typeof expressionMap === "object"
      ? new Set(Object.keys(expressionMap))
      : null;
    for (const slug of CONSONANT_KEYS) {
      const aliases = CONSONANT_NAME_ALIASES[slug] || [slug];
      for (const alias of aliases) {
        if (knownNames) {
          if (knownNames.has(alias)) { cache[slug] = alias; break; }
        } else {
          try {
            if (typeof em.getExpression === "function" && em.getExpression(alias)) {
              cache[slug] = alias;
              break;
            }
          } catch (_) {
            /* keep looking */
          }
        }
      }
    }
    this._consonantNameCacheFor = em;
    this._consonantNameCache = cache;
    return cache;
  }

  _setConsonant(em, cache, slug, value) {
    const name = cache && cache[slug];
    if (!name) return;
    try {
      if (typeof em.setValue === "function") {
        em.setValue(name, Math.max(0, Math.min(1, Number(value) || 0)));
      }
    } catch (_) {
      /* missing */
    }
  }

  update2() {      
      function getSensitivityMap(spectrum) {
        const sensitivity_threshold = 0.5
        const stPSD = new Float32Array(spectrum.length)
        for (let i = 0; i < spectrum.length; i++) {
          stPSD[i] = sensitivity_threshold + (spectrum[i] + 20) / 140
        }
        return stPSD
      }

    if (!this.userSpeechAnalyzer) {
      return { oh: 0, ee: 0, ah: 0, ou: 0, sibilance: 0, midNoise: 0 }
    }

    const spectrum = new Float32Array(this.userSpeechAnalyzer.frequencyBinCount)
    // Populate frequency data for computing frequency intensities
    this.userSpeechAnalyzer.getFloatFrequencyData(spectrum) // getByteTimeDomainData gets volumes over the sample time
    // Populate time domain for calculating RMS
    // userSpeechAnalyzer.getFloatTimeDomainData(spectrum);
    // RMS (root mean square) is a better approximation of current input level than peak (just sampling this frame)
    // spectrumRMS = getRMS(spectrum);

    const sensitivityPerPole = getSensitivityMap(spectrum)

    // Lower and higher voices have different frequency domains, so we'll separate and max them
    const EnergyBinMasc = new Float32Array(BoundingFrequencyMasc.length)
    const EnergyBinFem = new Float32Array(BoundingFrequencyFem.length)

    // Masc energy bins (groups of frequency-depending energy)
    for (let m = 0; m < BoundingFrequencyMasc.length - 1; m++) {
      for (let j = IndicesFrequencyMale[m]; j <= IndicesFrequencyMale[m + 1]; j++)
        if (sensitivityPerPole[j] > 0) EnergyBinMasc[m] += sensitivityPerPole[j]
      EnergyBinMasc[m] /= IndicesFrequencyMale[m + 1] - IndicesFrequencyMale[m]
    }

    // Fem energy bins (own FFT index ranges; do not overwrite masc bins).
    for (let m = 0; m < BoundingFrequencyFem.length - 1; m++) {
      let sumF = 0
      const j0 = IndicesFrequencyFemale[m]
      const j1 = IndicesFrequencyFemale[m + 1]
      for (let j = j0; j <= j1; j++) {
        if (sensitivityPerPole[j] > 0) sumF += sensitivityPerPole[j]
      }
      const spanF = Math.max(1, j1 - j0)
      EnergyBinFem[m] = sumF / spanF
    }
    const oh = clamp01(
      Math.max(EnergyBinFem[1], EnergyBinMasc[1]) > 0.2
        ? 1 - 2 * Math.max(EnergyBinMasc[2], EnergyBinFem[2])
        : (1 - 2 * Math.max(EnergyBinMasc[2], EnergyBinFem[2])) * 5 * Math.max(EnergyBinMasc[1], EnergyBinFem[1])
    )

    const ah = clamp01(3 * Math.max(EnergyBinMasc[3], EnergyBinFem[3]))
    const ee = clamp01(
      Math.max(0, 0.8 * (Math.max(EnergyBinMasc[1], EnergyBinFem[1]) - Math.max(EnergyBinMasc[3], EnergyBinFem[3])))
    )

    // Spectral bands beyond the masc/fem vowel formants → consonant cues.
    const hzToBin = (hz) => Math.round(((2 * FFT_SIZE) / samplingFrequency) * hz)
    const sibLow = hzToBin(SIBILANCE_HZ_LOW)
    const sibHigh = Math.min(sensitivityPerPole.length - 1, hzToBin(SIBILANCE_HZ_HIGH))
    let sibSum = 0
    let sibCount = 0
    for (let j = sibLow; j <= sibHigh; j++) {
      if (sensitivityPerPole[j] > 0) sibSum += sensitivityPerPole[j]
      sibCount++
    }
    const sibilance = sibCount > 0 ? Math.max(0, Math.min(1, (sibSum / sibCount) * 0.85)) : 0

    const midLow = hzToBin(VOWEL_FORMANT_HZ_HIGH)
    const midHigh = Math.max(midLow, sibLow - 1)
    let midSum = 0
    let midCount = 0
    for (let j = midLow; j <= midHigh; j++) {
      if (sensitivityPerPole[j] > 0) midSum += sensitivityPerPole[j]
      midCount++
    }
    const midNoise = midCount > 0 ? Math.max(0, Math.min(1, (midSum / midCount) * 0.7)) : 0

    /** /u/ ~ /oo/: strong low–mid “lip tube” back vowel; down-weight wide-open (aa) and sharp-front (ee). */
    const b0 = Math.max(EnergyBinMasc[0], EnergyBinFem[0])
    const b1 = Math.max(EnergyBinMasc[1], EnergyBinFem[1])
    const b2 = Math.max(EnergyBinMasc[2], EnergyBinFem[2])
    const b3 = Math.max(EnergyBinMasc[3], EnergyBinFem[3])
    const backRounded = Math.max(0, Math.min(1, b1 * 2.35 + b0 * 0.95 - b2 * 0.32 - b3 * 0.48))
    const notAa = Math.max(0, Math.min(1, 1 - ah * 0.52))
    const notEe = Math.max(0, Math.min(1, 1 - ee * 0.58))
    const ouBlend = Math.max(0, Math.min(1, backRounded * notAa * notEe * 1.22 + oh * 0.36))
    const ou = Math.max(0, Math.min(1, Math.max(ouBlend, oh * 0.22 + ee * 0.06)))

    return { oh, ee, ah, ou, sibilance, midNoise }

  }

  static createAudioMeter(audioContext) {
    const processor = audioContext.createScriptProcessor(512)
    processor.onaudioprocess = (event) => {
      const buf = event.inputBuffer.getChannelData(0)
      const bufLength = buf.length
      let sum = 0
      let x

      // eslint-disable-next-line no-plusplus
      for (let i = 0; i < bufLength; i++) {
        x = buf[i]
        if (Math.abs(x) >= processor.clipLevel) {
          processor.clipping = true
          processor.lastClip = window.performance.now()
        }
        sum += x * x
      }
      const rms = Math.sqrt(sum / bufLength)
      processor.volume = Math.max(rms, processor.volume * processor.averaging)
    }
    processor.clipping = false
    processor.lastClip = 0
    processor.volume = 0
    processor.clipLevel = 0.98
    processor.averaging = 0.95
    processor.clipLag = 750

    processor.connect(audioContext.destination)

    processor.checkClipping = () => {
      if (!processor.clipping) {
        return false
      }
      if (processor.lastClip + processor.clipLag < window.performance.now()) {
        processor.clipping = false
      }
      return processor.clipping
    }

    processor.shutdown = () => {
      processor.disconnect()
      processor.onaudioprocess = null
    }

    return processor
  }
}
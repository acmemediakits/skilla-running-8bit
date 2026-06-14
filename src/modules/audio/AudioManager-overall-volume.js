export const moduleName = "AudioManager";

const SOUND_ENABLED_SESSION_KEY = "jsmii:soundEnabled";

const isAudioMuted = () => {
  if (typeof window === "undefined") {
    return false;
  }

  return Boolean(window.__JSMII_AUDIO_MUTED__);
};

const writeStoredSoundEnabled = (enabled = true) => {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage?.setItem(SOUND_ENABLED_SESSION_KEY, enabled ? "true" : "false");
  } catch {
    // Session storage can be unavailable in embedded/private contexts.
  }
};

const ensureStoredSoundEnabled = () => {
  if (typeof window === "undefined") {
    return;
  }

  try {
    if (window.sessionStorage?.getItem(SOUND_ENABLED_SESSION_KEY) == null) {
      writeStoredSoundEnabled(!isAudioMuted());
    }
  } catch {
    // Keep audio state in memory if session storage is blocked.
  }
};

const clampVolume = (value, fallback = 1) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.max(0, Math.min(1, numeric));
};

const normalizeThemeId = (themeId = "") => String(themeId || "").trim().toLowerCase();

export default class AudioManager {
  constructor(context) {
    this.context = context;
    this.themeAudio = null;
    this.themeCache = new Map();
    this.sfxBufferCache = new Map();
    this.fallbackSfxCache = new Map();
    this.audioContext = null;
    this.themeSource = "";
    this.themeId = "";
    this.themeScreenVolume = null;
    this.pendingThemeId = "";
    this.pendingThemeOptions = {};
    this.sfxNodes = new Set();
    this.overallVolume = this.getConfiguredOverallVolume();
    this.themeVolume = this.overallVolume;
    this.sfxVolume = this.overallVolume;
    this.boundHandleAudioGesture = this.handleAudioGesture.bind(this);
  }

  start() {
    ensureStoredSoundEnabled();
    this.context.events?.on?.("db:changed", ({ path }) => {
      if (path === "audio" || String(path || "").startsWith("audio.")) {
        this.syncVolumeFromConfig();
        this.stopTheme();
        this.themeCache.clear();
        this.sfxBufferCache.clear();
        this.fallbackSfxCache.clear();
        this.preloadThemes();
      }
    });
    document.addEventListener("pointerdown", this.boundHandleAudioGesture, { passive: true });
    document.addEventListener("click", this.boundHandleAudioGesture, { passive: true });
    this.preloadThemes();
    this.syncDocumentMutedState();
  }

  getConfiguredOverallVolume() {
    const dbAudio = this.context.db?.get?.("audio", {}) || {};
    const runtimeAudio = this.context.runtimeSettings?.audio || {};
    return clampVolume(
      dbAudio.overallVolume
        ?? dbAudio.themeVolume
        ?? runtimeAudio.overallVolume
        ?? runtimeAudio.themeVolume
        ?? 0.72,
      0.72
    );
  }

  syncVolumeFromConfig() {
    this.setOverallVolume(this.getConfiguredOverallVolume());
  }

  syncDocumentMutedState() {
    if (typeof document === "undefined") {
      return;
    }
    document.documentElement.dataset.jsmiiAudioMuted = isAudioMuted() ? "true" : "false";
  }

  setOverallVolume(value) {
    this.overallVolume = clampVolume(value, this.overallVolume);
    this.themeVolume = this.overallVolume;
    this.sfxVolume = this.overallVolume;
    if (this.themeAudio) {
      this.themeAudio.volume = this.themeScreenVolume ?? this.overallVolume;
    }
    this.sfxNodes.forEach((audioNode) => {
      if ("volume" in audioNode) {
        audioNode.volume = this.overallVolume;
      }
      if (audioNode.gain?.gain) {
        audioNode.gain.gain.value = this.overallVolume;
      }
    });
  }

  setMuted(muted = true, options = {}) {
    if (typeof window !== "undefined") {
      window.__JSMII_AUDIO_MUTED__ = Boolean(muted);
    }
    writeStoredSoundEnabled(!Boolean(muted));
    this.syncDocumentMutedState();
    if (muted) {
      this.stopSfx();
      this.stopTheme();
    } else {
      this.preloadThemes();
      const themeId = options.themeId || options.resumeThemeId || this.pendingThemeId || this.themeId || "";
      if (themeId) {
        this.playTheme(themeId, options);
      }
    }
    this.context.events?.emit?.("audio:muted", { muted: Boolean(muted) });
    return Boolean(muted);
  }

  toggleMuted(options = {}) {
    return this.setMuted(!isAudioMuted(), options);
  }

  isMuted() {
    return isAudioMuted();
  }

  getTheme(themeId = "") {
    const themes = this.context.db?.get?.("audio.theme", []) || [];
    if (!Array.isArray(themes) || !themes.length) {
      return null;
    }

    const normalized = normalizeThemeId(themeId);
    const match = themes.find((theme) => {
      if (!theme || theme.enabled === false || !theme.path) {
        return false;
      }
      return normalizeThemeId(theme.id) === normalized || normalizeThemeId(theme.slot) === normalized;
    });
    if (match || normalized) {
      return match || null;
    }

    return themes.find((theme) => theme?.enabled !== false && theme?.path) || null;
  }

  resolveAudioPath(path = "") {
    return this.context.assets?.resolveRaw ? this.context.assets.resolveRaw(path) : path;
  }

  getAudioContext() {
    if (this.audioContext || typeof window === "undefined") {
      return this.audioContext;
    }

    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) {
      return null;
    }

    try {
      this.audioContext = new AudioContextCtor();
    } catch {
      this.audioContext = null;
    }
    return this.audioContext;
  }

  resumeAudioContext() {
    const context = this.getAudioContext();
    if (context?.state === "suspended") {
      context.resume().catch?.(() => {});
    }
  }

  handleAudioGesture() {
    this.resumeAudioContext();
    this.resumePendingTheme();
  }

  createThemeAudio(source = "") {
    if (!source || typeof Audio !== "function") {
      return null;
    }

    let audio = this.themeCache.get(source);
    if (!audio) {
      audio = new Audio(source);
      audio.preload = "auto";
      audio.loop = true;
      audio.load();
      this.themeCache.set(source, audio);
    }
    return audio;
  }

  preloadThemes() {
    if (isAudioMuted()) {
      return;
    }

    const themes = this.context.db?.get?.("audio.theme", []) || [];
    if (!Array.isArray(themes)) {
      return;
    }

    themes.forEach((theme) => {
      if (theme?.enabled === false || !theme?.path) {
        return;
      }
      this.createThemeAudio(this.resolveAudioPath(theme.path));
    });
  }

  getThemePlaybackVolume(theme = {}, options = {}) {
    const configured = options.volume ?? theme.volume;
    if (configured == null || configured === "") {
      return null;
    }
    return clampVolume(configured, this.overallVolume);
  }

  playTheme(themeId = "", options = {}) {
    if (isAudioMuted()) {
      this.stopTheme();
      return;
    }

    this.pendingThemeId = themeId;
    this.pendingThemeOptions = { ...options };
    const theme = this.getTheme(themeId);
    if (!theme?.path || typeof Audio !== "function") {
      return;
    }

    const source = this.resolveAudioPath(theme.path);
    if (!source) {
      return;
    }

    if (!this.themeAudio || this.themeSource !== source) {
      this.stopTheme();
      this.pendingThemeId = themeId;
      this.themeAudio = this.createThemeAudio(source);
      this.themeSource = source;
    }

    if (!this.themeAudio) {
      return;
    }

    this.themeId = theme.id || theme.slot || themeId;
    this.themeScreenVolume = this.getThemePlaybackVolume(theme, options);
    this.themeAudio.volume = this.themeScreenVolume ?? this.overallVolume;
    this.themeAudio.play()
      .then(() => {
        if (this.pendingThemeId === themeId) {
          this.pendingThemeId = "";
          this.pendingThemeOptions = {};
        }
      })
      .catch(() => {});
  }

  resumePendingTheme() {
    if (!this.pendingThemeId || isAudioMuted()) {
      return;
    }

    const themeId = this.pendingThemeId;
    this.playTheme(themeId, this.pendingThemeOptions);
  }

  stopTheme() {
    if (!this.themeAudio) {
      return;
    }

    this.themeAudio.pause();
    this.themeAudio.currentTime = 0;
    this.themeAudio = null;
    this.themeSource = "";
    this.themeId = "";
    this.themeScreenVolume = null;
    this.pendingThemeId = "";
    this.pendingThemeOptions = {};
  }

  registerSfx(audioNode) {
    if (!audioNode) {
      return audioNode;
    }
    this.sfxNodes.add(audioNode);
    audioNode.volume = this.overallVolume;
    audioNode.addEventListener?.("ended", () => this.sfxNodes.delete(audioNode), { once: true });
    return audioNode;
  }

  primeFallbackSfxSource(source = "") {
    if (!source || typeof Audio !== "function") {
      return null;
    }

    let audio = this.fallbackSfxCache.get(source);
    if (!audio) {
      audio = new Audio(source);
      audio.preload = "auto";
      audio.load();
      this.fallbackSfxCache.set(source, audio);
    }
    return audio;
  }

  primeSfxSource(source = "") {
    if (!source || isAudioMuted()) {
      return null;
    }

    this.primeFallbackSfxSource(source);
    const context = this.getAudioContext();
    if (!context || typeof fetch !== "function") {
      return null;
    }

    if (this.sfxBufferCache.has(source)) {
      return this.sfxBufferCache.get(source);
    }

    const pending = fetch(source)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`SFX preload failed: ${response.status}`);
        }
        return response.arrayBuffer();
      })
      .then((buffer) => context.decodeAudioData(buffer.slice(0)))
      .catch(() => null);
    this.sfxBufferCache.set(source, pending);
    pending.then((decoded) => {
      if (decoded) {
        this.sfxBufferCache.set(source, decoded);
      } else if (this.sfxBufferCache.get(source) === pending) {
        this.sfxBufferCache.delete(source);
      }
    });
    return pending;
  }

  playFallbackSfxSource(source = "") {
    const cached = this.primeFallbackSfxSource(source);
    if (!cached) {
      return null;
    }

    const audio = cached.cloneNode(true);
    audio.preload = "auto";
    audio.volume = this.overallVolume;
    this.registerSfx(audio);
    audio.play().catch(() => {});
    return audio;
  }

  playSfxSource(source = "") {
    if (!source || isAudioMuted()) {
      return null;
    }

    this.resumeAudioContext();
    const context = this.getAudioContext();
    const cached = this.sfxBufferCache.get(source) || this.primeSfxSource(source);
    if (context && cached && typeof cached.then !== "function") {
      const node = context.createBufferSource();
      const gain = context.createGain();
      gain.gain.value = this.overallVolume;
      node.gain = gain;
      node.buffer = cached;
      node.connect(gain);
      gain.connect(context.destination);
      node.start(0);
      this.sfxNodes.add(node);
      node.addEventListener?.("ended", () => this.sfxNodes.delete(node), { once: true });
      return node;
    }

    return this.playFallbackSfxSource(source);
  }

  stopSfx() {
    this.sfxNodes.forEach((audioNode) => {
      audioNode.pause?.();
      audioNode.stop?.();
      try {
        audioNode.currentTime = 0;
      } catch {
        // Some browsers can throw while resetting unloaded audio.
      }
    });
    this.sfxNodes.clear();
  }
}

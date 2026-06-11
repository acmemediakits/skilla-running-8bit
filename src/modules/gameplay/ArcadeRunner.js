import {
  createSeededRandom,
  createInfiniteRunnerPaintSeed,
  levelSpeedForViewport,
  normalizeIrgContract,
  paintInfiniteRunnerWorld
} from "./InfiniteRunnerWorld.js?v=1.1.3-20260610193052";

export const moduleName = "ArcadeRunner";

const DEFAULT_STATE = {
  status: "idle",
  score: 0,
  bonusScore: 0,
  lives: 3,
  elapsed: 0,
  distancePx: 0
};

const KIND_DIMENSIONS = {
  textBonus: { width: 160, height: 44 },
  bonus: { width: 44, height: 44 },
  hollow: { width: 128, height: 88 },
  obstacle: { width: 56, height: 72 },
  hazard: { width: 58, height: 70 },
  platform: { width: 112, height: 32 },
  object: { width: 56, height: 64 }
};

const RUNNER_CANVAS_SIZE = {
  desktop: { width: 1024, height: 768, aspect: "4 / 3" },
  mobile: { width: 390, height: 624, aspect: "10 / 16" }
};
const RUNNER_SCALE_REFERENCE_SIZE = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 430, height: 764 }
};
const CHARACTER_DEPTH = 0.78;
const PREVIEW_TILE_OVERLAP_PX = 1;
const PREVIEW_SEQUENCE_MIN_TILE_COUNT = 5;
const PREVIEW_SEQUENCE_MAX_TILE_COUNT = 161;
const DEFAULT_MAX_JUMP_ELEVATION = 1.5;
const TEXT_BONUS_KEY = "spawn/bonus/text-bonus";
const TEXT_BONUS_STYLE_ID = "textBonus";
const DEFAULT_TEXT_BONUS_WORDS = ["BONUS"];
const TEXT_BONUS_STYLE_DEFAULT = {
  fontFamily: "",
  fontKey: "fontHud",
  size: 18,
  weight: "900",
  color: "accentColor",
  transform: "uppercase",
  effect: "pixel-shadow",
  shadowColor: "shadowColor"
};
const GAMEPLAY_LIVES_SESSION_KEY = "session.gameplayLives";
const GAMEPLAY_LIVES_STORAGE_KEY = "jsmii:gameplayLives";
const THEME_COLOR_FALLBACKS = {
  primaryColor: "#00a778",
  secondaryColor: "#ef4b8f",
  accentColor: "#ffce4f",
  textColor: "#e7f3ff",
  backgroundFrom: "#142535",
  backgroundTo: "#071017",
  shadowColor: "#05080d"
};
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const cloneValue = (value) => {
  if (value == null) {
    return value;
  }
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value));
};

const escapeHtml = (value = "") => String(value)
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#39;");

const cssUrl = (value = "") => String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'");

const hashString = (value = "") => {
  let hash = 0;
  const text = String(value || "");
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) - hash) + text.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
};

const parseWordListText = (text = "") => String(text || "")
  .split(/[\n,;]+/)
  .map((word) => word.trim())
  .filter(Boolean);

const shuffleWithRandom = (items = [], random = Math.random) => {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]];
  }
  return shuffled;
};

const isTextBonusSource = (source = "", config = {}) => {
  const normalized = String(source || "").replace(/^\/+/, "").toLowerCase();
  return config?.textBonus === true
    || normalized === TEXT_BONUS_KEY
    || normalized.endsWith("/text-bonus")
    || normalized === "text-bonus";
};

const getCssFontFamily = (fontFamily = "inherit") => {
  const value = String(fontFamily || "inherit").trim();
  if (!value || value === "inherit") {
    return "inherit";
  }
  if (value.includes(",") || /^["'].*["']$/.test(value) || ["serif", "sans-serif", "monospace", "system-ui"].includes(value)) {
    return value;
  }
  return `"${value.replace(/"/g, '\\"')}", system-ui, sans-serif`;
};

const normalizeViewportName = (value = "desktop") => {
  const normalized = String(value || "desktop").toLowerCase();
  return normalized === "mobile" ? "mobile" : "desktop";
};

const isAudioMuted = () => {
  if (typeof window === "undefined") {
    return false;
  }

  return Boolean(window.__JSMII_AUDIO_MUTED__);
};

const formatHudSeconds = (seconds = 0) => `${Math.max(0, Math.ceil(Number(seconds) || 0))}s`;

const inferSpawnKindFromText = (value = "", fallback = "object") => {
  const text = String(value || "").toLowerCase();
  if (/(^|[-_/\s])(hollow|gap|hole|buco|fossa)([-_/\s.]|$)/.test(text)) {
    return "hollow";
  }
  if (/(^|[-_/\s])(bonus|coin|moneta|pickup|collectible|cuore|heart|life)([-_/\s.]|$)/.test(text)) {
    return "bonus";
  }
  if (/(^|[-_/\s])(hazard|danger|danno)([-_/\s.]|$)/.test(text)) {
    return "hazard";
  }
  if (/(^|[-_/\s])(obstacle|ostacolo|bidone|distributore|transenna|barrier|trash|bin)([-_/\s.]|$)/.test(text)) {
    return "obstacle";
  }
  if (/(^|[-_/\s])(platform|piattaforma)([-_/\s.]|$)/.test(text)) {
    return "platform";
  }
  return fallback;
};

const getSpawnKindFromSource = (source = "", fallback = "object", hint = "") => {
  const parts = String(source || "").split("/").filter(Boolean);
  const spawnIndex = parts.lastIndexOf("spawn");
  if (spawnIndex >= 0) {
    return parts[spawnIndex + 1] || fallback;
  }
  return inferSpawnKindFromText(`${source} ${hint}`, fallback);
};

const resolveViewportConfig = (config = {}, viewport = "desktop") => {
  const viewports = config.viewports && typeof config.viewports === "object" ? config.viewports : {};
  const viewportConfig = viewports[viewport] || {};
  return {
    ...config,
    ...viewportConfig,
    boundingBox: {
      ...(config.boundingBox || {}),
      ...(viewportConfig.boundingBox || {})
    }
  };
};

const normalizeLayerPattern = (value = "none") => {
  const normalized = String(value || "none").toLowerCase();
  return ["horizontal", "vertical", "both", "none"].includes(normalized) ? normalized : "none";
};

const getOddTileCount = (value) => {
  const rounded = Math.ceil(Number(value) || PREVIEW_SEQUENCE_MIN_TILE_COUNT);
  return rounded % 2 === 0 ? rounded + 1 : rounded;
};

const getPreviewTileIndexes = (count = PREVIEW_SEQUENCE_MIN_TILE_COUNT) => {
  const safeCount = Math.max(1, Number(count) || PREVIEW_SEQUENCE_MIN_TILE_COUNT);
  const centerIndex = Math.floor(safeCount / 2);
  return Array.from({ length: safeCount }, (_, index) => index - centerIndex);
};

const getPreviewRunnerTileIndexes = (count = PREVIEW_SEQUENCE_MIN_TILE_COUNT) => {
  const safeCount = Math.max(PREVIEW_SEQUENCE_MIN_TILE_COUNT, Number(count) || PREVIEW_SEQUENCE_MIN_TILE_COUNT);
  return Array.from({ length: safeCount }, (_, index) => index - 2);
};

const getPreviewSequenceTileCount = (previewWidth, tileStride, assetRelativeX = 0, worldWidth = previewWidth) => {
  const safeStride = Math.max(1, Number(tileStride || previewWidth || 1));
  const placementTravel = Math.abs(Number(assetRelativeX || 0)) * 2;
  const coverageWidth = Math.max(1, Number(previewWidth || 1), Number(worldWidth || 1)) + placementTravel + (safeStride * 2);
  const proportionalCount = Math.ceil(coverageWidth / safeStride) + 4;
  return clamp(getOddTileCount(proportionalCount), PREVIEW_SEQUENCE_MIN_TILE_COUNT, PREVIEW_SEQUENCE_MAX_TILE_COUNT);
};

const getSceneBoundScale = (authoredScale = 1, canvasScale = 1, { min = 0, max = 6 } = {}) => {
  const safeScale = Number.isFinite(Number(authoredScale)) ? Number(authoredScale) : 1;
  const safeCanvasScale = Number.isFinite(Number(canvasScale)) ? Number(canvasScale) : 1;
  return Number((clamp(safeScale, min, max) * clamp(safeCanvasScale, 0.01, 1)).toFixed(4));
};

const readEffectScore = (effects = []) => {
  const scoreEffect = effects.find((effect) => effect?.type === "score");
  return Math.max(0, Number(scoreEffect?.amount ?? 1) || 0);
};

const rectsOverlap = (left, right) => {
  if (!left || !right) {
    return false;
  }
  return left.right > right.left
    && left.left < right.right
    && left.bottom > right.top
    && left.top < right.bottom;
};

export default class ArcadeRunner {
  constructor(context) {
    this.context = context;
    this.mountNode = null;
    this.state = { ...DEFAULT_STATE };
    this.config = {};
    this.worldPlan = null;
    this.runSeed = "";
    this.collectedSpawnIds = new Set();
    this.resolvedSpawnIds = new Set();
    this.player = {
      x: 84,
      y: 0,
      vy: 0,
      grounded: true,
      actionId: "idle",
      frame: 0,
      frameElapsed: 0,
      jumpElapsed: 0,
      jumpDuration: 0,
      jumpHeight: 0
    };
    this.loopId = null;
    this.hudTimerId = null;
    this.deathSequence = null;
    this.lastTime = 0;
    this.audioCache = new Map();
    this.assetSizeCache = new Map();
    this.assetSizeLoading = new Set();
    this.assetSizePromises = new Map();
    this.wordListCache = new Map();
    this.wordListLoading = new Set();
    this.wordListOrderCache = new Map();
    this.textBonusOverlays = [];
    this.textBonusOverlayIndex = 0;
    this.presentedOutcomeStatus = "";
    this.boundScreenMounted = this.handleScreenMounted.bind(this);
    this.boundKeyDown = this.handleKeyDown.bind(this);
    this.boundPointerDown = this.handlePointerDown.bind(this);
    this.boundSuppressLongTap = this.suppressLongTap.bind(this);
    this.boundRunnerControlClick = this.handleRunnerControlClick.bind(this);
    this.boundRunnerControlDelegate = this.handleRunnerControlDelegate.bind(this);
    this.boundStartClick = this.boundRunnerControlClick;
    this.previewCanvasRuntime = null;
    this.previewCanvasRuntimePromise = null;
    this.previewCanvasMountToken = 0;
    this.startToken = 0;
    this.jumpInputSuspended = false;
    this.jumpInputUnlockTimer = 0;
  }

  startModule() {
    this.config = this.readConfig();
    this.preloadSfx();
    this.preloadVisualAssets();
    this.context.events.on("screen:mounted", this.boundScreenMounted);
    document.addEventListener("keydown", this.boundKeyDown);
    document.addEventListener("click", this.boundRunnerControlDelegate);
  }

  async start(options = {}) {
    if (!this.mountNode || this.state.status === "running") {
      return false;
    }

    const token = this.startToken + 1;
    this.startToken = token;
    const resetLives = options.resetLives !== false;
    const maxLives = this.getMaxLives();
    const nextLives = resetLives
      ? maxLives
      : clamp(Math.round(Number(this.state.lives || 0)), 1, maxLives);

    this.config = this.readConfig();
    this.preloadSfx();
    this.preloadVisualAssets();
    this.runSeed = createInfiniteRunnerPaintSeed(this.context.screens?.currentScreenId || "runtime");
    this.wordListOrderCache.clear();
    this.textBonusOverlays = [];
    this.textBonusOverlayIndex = 0;
    this.presentedOutcomeStatus = "";
    this.preloadCleared = false;
    this.worldPlan = this.paintWorld(this.runSeed);
    this.collectedSpawnIds.clear();
    this.resolvedSpawnIds.clear();
    this.deathSequence = null;
    this.player.x = this.getPlayerBaseX();
    this.player.y = 0;
    this.player.vy = 0;
    this.player.grounded = true;
    this.player.jumpElapsed = 0;
    this.player.jumpDuration = 0;
    this.player.jumpHeight = 0;
    this.player.actionId = "run";
    this.player.frame = 0;
    this.player.frameElapsed = 0;
    this.resumeJumpInput();
    this.state = {
      ...DEFAULT_STATE,
      status: "idle",
      lives: nextLives
    };
    this.mountNode?.closest?.(".screen")?.classList.add("preload");
    await this.preloadVisualAssets();
    if (token !== this.startToken || !this.mountNode || this.state.status === "running") {
      return false;
    }
    this.state.status = "running";
    this.lastTime = performance.now();
    this.context.audio?.playTheme?.("gameplay");
    this.playSfx("run-sfx");
    this.render();
    this.startRuntimeHudTimer();
    this.loopId = window.requestAnimationFrame((time) => this.tick(time));
    return true;
  }

  stop() {
    this.previewCanvasRuntime?.unmount?.();
    this.previewCanvasRuntime = null;
    this.previewCanvasRuntimePromise = null;
    this.startToken += 1;
    if (this.loopId) {
      window.cancelAnimationFrame(this.loopId);
      this.loopId = null;
    }
    this.stopRuntimeHudTimer();
    this.resumeJumpInput();
  }

  addLongTapSuppression() {
    if (!this.mountNode) {
      return;
    }

    this.mountNode.addEventListener("contextmenu", this.boundSuppressLongTap);
    this.mountNode.addEventListener("selectstart", this.boundSuppressLongTap);
    this.mountNode.addEventListener("dragstart", this.boundSuppressLongTap);
  }

  removeLongTapSuppression() {
    this.mountNode?.removeEventListener("contextmenu", this.boundSuppressLongTap);
    this.mountNode?.removeEventListener("selectstart", this.boundSuppressLongTap);
    this.mountNode?.removeEventListener("dragstart", this.boundSuppressLongTap);
  }

  allowsNativeTouch(target) {
    return Boolean(target?.closest?.([
      "a[href]",
      "button",
      "input",
      "select",
      "textarea",
      "[contenteditable='true']",
      "[data-runner-control]",
      "[data-runner-start]"
    ].join(",")));
  }

  suppressLongTap(event) {
    if (!this.mountNode?.contains?.(event.target) || this.allowsNativeTouch(event.target)) {
      return;
    }

    event.preventDefault();
  }

  usePreviewCanvasRenderer() {
    const params = new URLSearchParams(window.location.search || "");
    return Boolean(this.getPreviewCanvasExportMode(params));
  }

  getPreviewCanvasExportMode(params = new URLSearchParams(window.location.search || "")) {
    const hasPreviewMode = params.has("previewCanvas") || params.get("renderer") === "preview";
    const rawMode = params.get("previewCanvas") || (params.get("renderer") === "preview" ? "current" : "");
    const mode = String(rawMode || "").toLowerCase();
    if (!hasPreviewMode) {
      return "current";
    }
    if (["0", "false", "no", "off", "dom", "native"].includes(mode)) {
      return "";
    }
    if (["1", "true", "yes", "current"].includes(mode)) {
      return "current";
    }
    if (["desktop", "mobile", "both"].includes(mode)) {
      return mode;
    }
    return "";
  }

  readConfig() {
    return {
      location: cloneValue(this.context.db?.get("location", {}) || {}),
      gameplay: cloneValue(this.context.db?.get("gameplay", {}) || {}),
      character: cloneValue(this.context.character?.getConfig?.() || this.context.db?.get("character", {}) || {}),
      physics: cloneValue(this.context.physics?.getConfig?.() || this.context.db?.get("physics", {}) || {}),
      audio: cloneValue(this.context.db?.get("audio", {}) || {}),
      assets: cloneValue(this.context.db?.get("assets", {}) || {}),
      design: cloneValue(this.context.db?.get("authoring.design", {}) || {})
    };
  }

  handleScreenMounted({ screenId, mountNode }) {
    this.stop();
    this.mountNode?.removeEventListener("pointerdown", this.boundPointerDown);
    this.removeLongTapSuppression();
    this.mountNode = mountNode?.querySelector("[data-gameplay-runner]") || null;
    if (!this.mountNode) {
      return;
    }

    this.config = this.readConfig();
    this.preloadSfx();
    this.preloadVisualAssets();
    this.mountNode.addEventListener("pointerdown", this.boundPointerDown);
    this.addLongTapSuppression();
    const storedLives = this.getStoredGameplayLives();
    this.state = {
      ...DEFAULT_STATE,
      lives: storedLives ?? this.getMaxLives()
    };
    this.player.x = this.getPlayerBaseX();
    this.player.y = 0;
    this.player.vy = 0;
    this.player.grounded = true;
    this.player.jumpElapsed = 0;
    this.player.jumpDuration = 0;
    this.player.jumpHeight = 0;
    this.player.actionId = this.config.character?.defaultActionId || "idle";
    if (this.usePreviewCanvasRenderer()) {
      this.mountPreviewCanvasRuntime();
      this.context.events.emit("gameplay:ready", { screenId, worldPlan: null, renderer: "preview-canvas" });
      return;
    }
    this.start({ resetLives: false }).then((started) => {
      if (!started) {
        return;
      }
      this.context.events.emit("gameplay:ready", { screenId, worldPlan: this.worldPlan });
    });
  }

  async getPreviewCanvasRuntime() {
    if (this.previewCanvasRuntime) {
      return this.previewCanvasRuntime;
    }
    if (!this.previewCanvasRuntimePromise) {
      const runtimeSettings = this.context.runtimeSettings || {};
      const version = runtimeSettings.build?.version || "dev";
      const queryKey = runtimeSettings.assets?.queryKey || "v";
      const url = new URL("./PreviewCanvasRuntime.js", import.meta.url);
      url.searchParams.set(queryKey, version);
      this.previewCanvasRuntimePromise = import(url.toString()).then((module) => {
        const RuntimeClass = module.default || module.PreviewCanvasRuntime || Object.values(module)[0];
        this.previewCanvasRuntime = new RuntimeClass(this.context);
        return this.previewCanvasRuntime;
      });
    }

    return this.previewCanvasRuntimePromise;
  }

  async mountPreviewCanvasRuntime() {
    const token = this.previewCanvasMountToken + 1;
    this.previewCanvasMountToken = token;
    const mode = this.getPreviewCanvasExportMode() || "current";
    const screenNode = this.mountNode?.closest(".screen");
    if (screenNode) {
      screenNode.dataset.runnerRenderer = "preview-canvas";
    }
    this.mountNode.innerHTML = `<div class="runner-preview-export-set" data-preview-canvas-export="${escapeHtml(mode)}"></div>`;
    const runtime = await this.getPreviewCanvasRuntime();
    if (token !== this.previewCanvasMountToken || !this.mountNode || !this.usePreviewCanvasRenderer()) {
      return;
    }
    runtime.mount(this.mountNode, { mode, screenId: this.getCurrentLevelScreenId() });
  }

  handleRunnerControlClick(event) {
    const control = event.currentTarget || event.target?.closest?.("[data-runner-control]");
    event.preventDefault();
    event.stopPropagation();
    this.handleRunnerControl(control);
  }

  handleRunnerControlDelegate(event) {
    const control = event.target?.closest?.("[data-runner-control], [data-runner-start]");
    if (!control) {
      return;
    }

    const action = control.dataset.runnerControl || (control.matches?.("[data-runner-start]") ? "start" : "retry");
    if (!["retry", "restart", "start"].includes(action)) {
      return;
    }

    if (this.usePreviewCanvasRenderer()) {
      if (this.previewCanvasRuntime?.handleExternalRunnerControl?.(control)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
    this.handleRunnerControl(control);
  }

  handleRunnerControl(control) {
    if (!control) {
      return;
    }

    const action = control.dataset.runnerControl || "retry";
    this.context.screens?.clearPresentation?.();
    this.start({ resetLives: action === "restart" || this.state.lives <= 0 });
  }

  handleExternalRunnerControl(control) {
    if (!control) {
      return false;
    }

    if (this.usePreviewCanvasRenderer()) {
      return Boolean(this.previewCanvasRuntime?.handleExternalRunnerControl?.(control));
    }

    const action = control.dataset.runnerControl || "retry";
    if (!["retry", "restart", "start"].includes(action)) {
      return false;
    }

    this.handleRunnerControl(control);
    return true;
  }

  handleKeyDown(event) {
    if (!this.mountNode || this.state.status !== "running") {
      return;
    }

    if (!this.isJumpKey(event) || this.jumpInputSuspended) {
      return;
    }

    event.preventDefault();
    this.jump();
  }

  handlePointerDown(event) {
    if (!this.mountNode) {
      return;
    }

    if (this.allowsNativeTouch(event.target)) {
      return;
    }

    event.preventDefault();
    if (this.state.status === "running" && !this.jumpInputSuspended && this.isJumpPointerGestureEnabled()) {
      this.jump();
    }
  }

  isJumpKey(event = {}) {
    const action = this.getAction("jump");
    if (action?.enabled === false) {
      return false;
    }
    const configuredKey = String(action?.key || "");
    return (configuredKey && (event.code === configuredKey || event.key === configuredKey))
      || event.code === "Space"
      || event.code === "ArrowUp";
  }

  isJumpPointerGestureEnabled() {
    const action = this.getAction("jump");
    if (action?.enabled === false) {
      return false;
    }
    return String(action?.mouseGesture || "click").toLowerCase() !== "none";
  }

  suspendJumpInput(durationMs = 0) {
    window.clearTimeout(this.jumpInputUnlockTimer);
    this.jumpInputUnlockTimer = 0;
    this.jumpInputSuspended = true;
    document.removeEventListener("keydown", this.boundKeyDown);
    this.mountNode?.removeEventListener("pointerdown", this.boundPointerDown);

    const safeDuration = Math.max(120, Number(durationMs || 0));
    this.jumpInputUnlockTimer = window.setTimeout(() => {
      this.resumeJumpInput();
    }, safeDuration);
  }

  resumeJumpInput() {
    window.clearTimeout(this.jumpInputUnlockTimer);
    this.jumpInputUnlockTimer = 0;
    this.jumpInputSuspended = false;
    document.addEventListener("keydown", this.boundKeyDown);
    if (this.mountNode) {
      this.mountNode.addEventListener("pointerdown", this.boundPointerDown);
    }
  }

  getJumpInputLockDurationMs() {
    return Math.max(120, this.getPlayerJumpDuration() * 1000);
  }

  tick(time) {
    if (!this.isGameplayTicking()) {
      this.stop();
      return;
    }

    const delta = Math.min(0.04, Math.max(0, (time - this.lastTime) / 1000));
    this.lastTime = time;
    this.update(delta);
    this.clearScreenPreload();
    this.render();
    if (this.isGameplayTicking()) {
      this.loopId = window.requestAnimationFrame((nextTime) => this.tick(nextTime));
    } else {
      this.stop();
    }
  }

  update(delta) {
    if (this.state.status === "dying") {
      this.updateDeathSequence(delta);
      return;
    }

    const plan = this.getWorldPlan();
    const sceneSpeed = Math.max(1, Number(plan?.sceneSpeed || this.config.physics?.worldScrollSpeed || 420));

    this.state.elapsed += delta;
    this.state.distancePx = Number((this.state.elapsed * sceneSpeed).toFixed(3));
    this.state.score = Math.floor((this.state.distancePx / 32) + this.state.bonusScore);

    if (!this.player.grounded && this.player.actionId === "jump") {
      this.player.jumpElapsed += delta;
      const duration = Math.max(0.001, Number(this.player.jumpDuration || this.getPlayerJumpDuration()));
      const progress = clamp(this.player.jumpElapsed / duration, 0, 1);
      this.player.y = Math.sin(progress * Math.PI) * Math.max(0, Number(this.player.jumpHeight || this.getPlayerJumpHeight()));
      if (progress >= 1) {
        this.player.y = 0;
        this.player.jumpElapsed = 0;
        this.player.jumpDuration = 0;
        this.player.jumpHeight = 0;
        this.player.vy = 0;
        this.player.grounded = true;
        this.player.actionId = "run";
        this.player.frame = 0;
        this.player.frameElapsed = 0;
        this.resumeJumpInput();
      }
    } else if (this.player.y <= 0) {
      this.player.y = 0;
      this.player.vy = 0;
      this.player.grounded = true;
    }

    this.resolveSpawnCollisions();
    this.advanceFrame(delta);

    if (this.state.status === "running" && this.state.distancePx >= Number(plan?.world?.worldWidthPx || 0)) {
      this.completeRun();
    }
  }

  isGameplayTicking() {
    return this.state.status === "running" || this.state.status === "dying";
  }

  isWorldRenderingActive() {
    return this.state.status === "running" || this.state.status === "dying";
  }

  jump() {
    if (!this.player.grounded || this.state.status !== "running") {
      return false;
    }

    this.player.grounded = false;
    this.player.actionId = "jump";
    this.player.frame = 0;
    this.player.frameElapsed = 0;
    this.player.jumpElapsed = 0;
    this.player.jumpDuration = this.getPlayerJumpDuration();
    this.player.jumpHeight = this.getPlayerJumpHeight();
    this.player.vy = 0;
    this.playSfx(this.getActionSoundId("jump") || "jump-sfx");
    this.suspendJumpInput(this.getJumpInputLockDurationMs());
    return true;
  }

  clearScreenPreload() {
    if (this.preloadCleared || !this.shouldClearScreenPreload()) {
      return;
    }
    this.preloadCleared = true;
    this.mountNode?.closest?.(".screen")?.classList.remove("preload");
  }

  shouldClearScreenPreload() {
    if (this.state.status !== "running") {
      return false;
    }
    return this.getHudTiming().phase === "game";
  }

  resolveSpawnCollisions() {
    const plan = this.getWorldPlan();
    if (!plan?.entries?.length) {
      return;
    }

    const playerRect = this.getPlayerRect();
    const visibleEntries = this.getVisibleEntries(120)
      .sort((left, right) => {
        const leftBonus = left.kind === "bonus" ? 1 : 0;
        const rightBonus = right.kind === "bonus" ? 1 : 0;
        const leftTextBonus = this.isTextBonusEntry(left) ? 1 : 0;
        const rightTextBonus = this.isTextBonusEntry(right) ? 1 : 0;
        return (rightBonus - leftBonus) || (rightTextBonus - leftTextBonus);
      });
    for (const entry of visibleEntries) {
      if (this.resolvedSpawnIds.has(entry.id) || this.collectedSpawnIds.has(entry.id)) {
        continue;
      }

      if (entry.kind === "hollow") {
        if (this.isFallingIntoHollow(entry, playerRect)) {
          this.resolvedSpawnIds.add(entry.id);
          this.handleHit(entry);
          return;
        }
        continue;
      }

      const spawnRect = this.getSpawnRect(entry);
      if (!rectsOverlap(playerRect, spawnRect)) {
        continue;
      }

      if (entry.kind === "bonus") {
        this.collectBonus(entry);
        continue;
      }

      if (["obstacle", "hazard"].includes(entry.kind) || entry.trigger?.action === "death" || entry.trigger?.action === "damage") {
        this.resolvedSpawnIds.add(entry.id);
        this.handleHit(entry);
        return;
      }
    }
  }

  collectBonus(entry) {
    this.collectedSpawnIds.add(entry.id);
    const effects = Array.isArray(entry.effects) ? entry.effects : [];
    this.state.bonusScore += readEffectScore(effects);
    effects.forEach((effect) => {
      if (effect?.type === "emitAction" && effect.action) {
        this.context.events.emit("gameplay:effect", {
          action: effect.action,
          entry,
          score: Math.floor(this.state.score)
        });
      }
    });
    this.showTextBonusOverlay(entry);
    this.playSfx(entry.config?.soundId || entry.soundId || "coin-up-sfx");
  }

  handleHit(entry = {}) {
    if (this.state.status !== "running") {
      return;
    }

    const trigger = entry.trigger || {};
    const action = trigger.action || (entry.kind === "hollow" ? "death" : "damage");
    const nextActionId = action === "damage" ? this.getDamageActionId() : this.getDeathActionId();
    this.state.lives = Math.max(0, Math.round(Number(this.state.lives || 0)) - 1);
    this.resumeJumpInput();
    this.setStoredGameplayLives(this.state.lives);
    this.state.status = "dying";
    this.deathSequence = {
      trigger,
      entry,
      elapsed: 0,
      duration: this.getActionDuration(nextActionId)
    };
    this.playSfx(this.getActionSoundId(nextActionId) || this.getActionSoundId(action) || "hurt-sfx");
    this.context.audio?.playTheme?.("death");
    this.player.actionId = nextActionId;
    this.player.frame = 0;
    this.player.frameElapsed = 0;
  }

  updateDeathSequence(delta) {
    if (!this.deathSequence) {
      this.state.status = this.state.lives <= 0 ? "gameover" : "life-lost";
      this.presentOutcomeScreen(this.state.status, {});
      return;
    }

    this.deathSequence.elapsed += delta;
    this.advanceFrame(delta);

    if (this.deathSequence.elapsed < this.deathSequence.duration) {
      return;
    }

    const trigger = this.deathSequence.trigger || {};
    this.state.status = this.state.lives <= 0 ? "gameover" : "life-lost";
    this.deathSequence = null;
    this.presentOutcomeScreen(this.state.status, { trigger });

    if (this.state.status === "gameover") {
      this.context.events.emit("gameplay:ended", {
        outcome: "fail",
        trigger,
        score: Math.floor(this.state.score),
        worldPlan: this.worldPlan
      });
    }
  }

  completeRun() {
    this.state.status = "complete";
    this.resumeJumpInput();
    this.setStoredGameplayLives(this.state.lives);
    this.context.audio?.playTheme?.("success");
    this.player.actionId = this.config.character?.defaultActionId || "idle";
    this.stop();
    this.render();
    this.presentOutcomeScreen("complete", {});
    this.context.events.emit("gameplay:ended", {
      outcome: "success",
      score: Math.floor(this.state.score),
      worldPlan: this.worldPlan
    });
  }

  advanceFrame(delta) {
    const action = this.getAction(this.player.actionId);
    const fps = Math.max(1, Number(action?.fps || 10));
    const frameCount = Math.max(1, Number(action?.frameCount || 1));
    const frameDuration = 1 / fps;
    this.player.frameElapsed += delta;

    if (this.player.frameElapsed < frameDuration) {
      return;
    }

    while (this.player.frameElapsed >= frameDuration) {
      this.player.frameElapsed -= frameDuration;
      this.player.frame += 1;
      if (this.player.frame < frameCount) {
        continue;
      }
      if (action?.loop === false) {
        this.player.frame = frameCount - 1;
        this.player.frameElapsed = 0;
        break;
      }
      this.player.frame = 0;
    }
  }

  getActionDuration(actionId = "") {
    const action = this.getAction(actionId);
    const frameCount = Math.max(1, Number(action?.frameCount || 1));
    const fps = Math.max(1, Number(action?.fps || 1));
    return Math.max(0.1, Number((frameCount / fps).toFixed(4)));
  }

  resolveAssetSource(source = "") {
    return this.context.assets?.resolveRaw ? this.context.assets.resolveRaw(source) : source;
  }

  getCanvasSpec(viewport = this.getViewportName()) {
    return RUNNER_CANVAS_SIZE[normalizeViewportName(viewport)] || RUNNER_CANVAS_SIZE.desktop;
  }

  getRawStageRect() {
    return this.mountNode?.querySelector("[data-runner-stage]")?.getBoundingClientRect?.()
      || this.mountNode?.getBoundingClientRect?.()
      || null;
  }

  getViewportName() {
    const previewMode = this.getPreviewCanvasExportMode();
    if (previewMode === "desktop" || previewMode === "mobile") {
      return previewMode;
    }

    const rect = this.getRawStageRect();
    const width = Number(rect?.width || 0);
    const height = Number(rect?.height || 0);
    if (width > 0 && height > 0) {
      return width <= 540 || height / width >= 1.25 ? "mobile" : "desktop";
    }
    return normalizeViewportName(this.config.location?.scene?.viewport || "desktop");
  }

  getCanvasSize() {
    const viewport = this.getViewportName();
    const spec = this.getCanvasSpec(viewport);
    const stageRect = this.mountNode?.querySelector("[data-runner-stage]")?.getBoundingClientRect?.();
    if (stageRect?.width && stageRect?.height) {
      return {
        width: Number(stageRect.width),
        height: Number(stageRect.height)
      };
    }

    const rect = this.mountNode?.getBoundingClientRect?.();
    const containerWidth = Math.max(1, Number(rect?.width || spec.width));
    const containerHeight = Math.max(1, Number(rect?.height || spec.height));
    const ratio = spec.width / spec.height;
    let width = Math.min(containerWidth, containerHeight * ratio);
    let height = width / ratio;
    if (height > containerHeight) {
      height = containerHeight;
      width = height * ratio;
    }

    return {
      width: Number(width.toFixed(3)),
      height: Number(height.toFixed(3))
    };
  }

  getStageWidth() {
    return this.getCanvasSize().width || this.getCanvasSpec().width;
  }

  getStageHeight() {
    return this.getCanvasSize().height || this.getCanvasSpec().height;
  }

  getCanvasScale() {
    const viewport = this.getViewportName();
    const reference = RUNNER_SCALE_REFERENCE_SIZE[normalizeViewportName(viewport)] || RUNNER_SCALE_REFERENCE_SIZE.desktop;
    return clamp(Math.min(this.getStageWidth() / reference.width, this.getStageHeight() / reference.height), 0.01, 1);
  }

  getSceneBaseBottom() {
    return this.getStageHeight() * 0.1;
  }

  getGroundBottom() {
    return this.getSceneBaseBottom();
  }

  getCharacterViewportTransform(viewport = this.getViewportName()) {
    const characterLayer = (this.config.location?.scene?.layers || []).find((layer) => layer?.id === "character") || {};
    const baseTransform = characterLayer.viewports?.[viewport]
      || characterLayer.viewports?.desktop
      || {
        x: 0,
        y: 0,
        z: 0,
        scale: Number(this.config.character?.preview?.scale || 1)
      };
    const profile = this.getCharacterProfile();
    const preview = profile.preview || {};
    const viewportTransform = preview.viewports?.[viewport]
      || (viewport === "mobile" ? preview.viewports?.desktop : null)
      || {};

    return {
      ...baseTransform,
      x: Number(viewportTransform.x ?? preview.x ?? baseTransform.x ?? 0),
      y: Number(viewportTransform.y ?? preview.y ?? baseTransform.y ?? 0),
      scale: Number(viewportTransform.scale ?? preview.scale ?? baseTransform.scale ?? 1)
    };
  }

  getPlayerBaseBottom() {
    const transform = this.getCharacterViewportTransform();
    const yFactor = clamp(Number(transform.y || 0), -250, 250) / 100;
    return this.getStageHeight() * Math.max(-1.5, 0.1 + yFactor);
  }

  getPlayerLeft(dimensions = null) {
    const visual = dimensions || this.getPlayerVisualDimensions(this.getAction(this.player.actionId));
    const transform = this.getCharacterViewportTransform();
    return (this.getStageWidth() / 2) + Number(transform.x || 0) - (Number(visual?.width || 0) / 2);
  }

  getPlayerBaseX() {
    return this.getPlayerLeft();
  }

  getSelectedSceneLayers(options = {}) {
    const includeVirtual = options.includeVirtual === true;
    const scene = this.config.location?.scene || {};
    const layers = this.config.location?.scene?.layers;
    if (!Array.isArray(layers)) {
      return [];
    }
    const selectedLayerIds = Array.isArray(scene.selectedLayerIds) && scene.selectedLayerIds.length
      ? new Set(scene.selectedLayerIds.map((id) => String(id)))
      : null;
    return layers
      .filter((layer) => layer && layer.enabled !== false)
      .filter((layer) => !selectedLayerIds || selectedLayerIds.has(String(layer.id || "")))
      .filter((layer) => includeVirtual || layer.src || layer.assetRef);
  }

  getSceneLayers() {
    return this.getSelectedSceneLayers({ includeVirtual: false });
  }

  getSceneLayerZIndex(layerId = "", fallback = 1) {
    const layerIndex = this.getSelectedSceneLayers({ includeVirtual: true }).findIndex((entry) => entry.id === layerId);
    return layerIndex >= 0 ? layerIndex + 1 : fallback;
  }

  getLayerMotionFactor(layer = {}, config = {}) {
    if (config.static === true || config.animated === false || layer.animated === false) {
      return 0;
    }
    if (layer.id === "scene") {
      return 1;
    }
    const configured = Number(config.speedMultiplier ?? layer.speedMultiplier);
    if (Number.isFinite(configured) && configured !== 1) {
      return Math.max(0, configured);
    }
    const parallax = Number(config.parallaxFactor ?? layer.parallaxFactor);
    if (Number.isFinite(parallax)) {
      return clamp(parallax, 0, 1.5);
    }
    const depth = Number(config.depth ?? layer.depth);
    if (Number.isFinite(depth)) {
      return clamp(depth, 0, 1.5);
    }
    return 0.35;
  }

  getLayerRuntimeSpeed(layer = {}, config = {}) {
    if (config.static === true || config.animated === false || layer.animated === false) {
      return 0;
    }

    const baseDepth = Number(layer.depth ?? 0.5);
    const zOffset = Number(config.z || 0) / 100;
    const proximity = clamp(baseDepth + zOffset, 0, 1);
    const level = this.getActiveIrgLevel();
    const runnerSettings = {
      ...(this.config.location?.scene?.runner || {}),
      ...(level || {})
    };
    const characterProximity = clamp(CHARACTER_DEPTH, 0.1, 0.95);
    const backT = clamp(proximity / characterProximity, 0, 1);
    const frontT = clamp((proximity - characterProximity) / (1 - characterProximity), 0, 1);
    const backFalloff = 1 - (Math.log1p((1 - backT) * 16) / Math.log1p(16));
    const backgroundMode = runnerSettings.backgroundParallaxSpeed || "native";
    const foregroundMode = runnerSettings.foregroundParallaxSpeed || "native";
    const backgroundDepthSpeed = backgroundMode === "linear"
      ? 0.08 + (backT * 0.92)
      : backgroundMode === "logarithmic"
        ? 0.08 + (backFalloff * 0.92)
        : 0.08 + (Number(layer.parallaxFactor ?? backFalloff) * 0.92);
    const foregroundDepthSpeed = foregroundMode === "logarithmic"
      ? 1 + (Math.log1p(frontT * 4) / Math.log1p(4)) * 0.55
      : foregroundMode === "linear"
        ? 1 + (frontT * 0.55)
        : 1 + (frontT * 0.55);
    const depthSpeed = proximity <= characterProximity
      ? backgroundDepthSpeed
      : foregroundDepthSpeed;
    const baseline = Math.max(120, Number(runnerSettings.worldScrollSpeed ?? this.config.physics?.worldScrollSpeed ?? 420));
    const levelSpeed = levelSpeedForViewport(runnerSettings, this.getViewportName());
    const layerSpeed = Math.max(0.1, Number(config.speedMultiplier ?? layer.speedMultiplier ?? 1));
    const contractSpeedBoost = layer.id === "scene" ? 1.75 : 1;
    return Number((baseline * levelSpeed * depthSpeed * layerSpeed * contractSpeedBoost).toFixed(2));
  }

  getViewportPov(viewport = this.getViewportName()) {
    const scene = this.config.location?.scene || {};
    const source = scene.viewports?.[viewport] || {};
    return {
      perspective: Number(source.perspective ?? scene.perspective ?? 100),
      camera: {
        ...(scene.camera || {}),
        ...(source.camera || {})
      }
    };
  }

  getLayerTranslateZ(layer = {}, config = {}, stageWidth = this.getStageWidth()) {
    if (layer.id === "screen" || layer.id === "lens") {
      return (Number(config.z || 0) / 100) * stageWidth;
    }
    return ((((1 - Number(layer.depth ?? 0.5)) * -65.63) + Number(config.z || 0)) / 100) * stageWidth;
  }

  primeAssetSize(source = "") {
    const resolvedSource = this.resolveAssetSource(source);
    if (!resolvedSource || this.assetSizeCache.has(resolvedSource) || this.assetSizeLoading.has(resolvedSource)) {
      return this.assetSizeCache.get(resolvedSource) || null;
    }

    this.preloadAssetSize(source);
    return null;
  }

  preloadAssetSize(source = "") {
    const resolvedSource = this.resolveAssetSource(source);
    if (!resolvedSource) {
      return Promise.resolve(null);
    }
    if (this.assetSizeCache.has(resolvedSource)) {
      return Promise.resolve(this.assetSizeCache.get(resolvedSource));
    }
    if (this.assetSizePromises.has(resolvedSource)) {
      return this.assetSizePromises.get(resolvedSource);
    }

    this.assetSizeLoading.add(resolvedSource);
    const pending = new Promise((resolve) => {
      const image = new Image();
      image.decoding = "async";
      const finish = (result = null) => {
        this.assetSizeLoading.delete(resolvedSource);
        this.assetSizePromises.delete(resolvedSource);
        resolve(result);
      };
      image.onload = () => {
        if (image.naturalWidth > 0 && image.naturalHeight > 0) {
          const size = {
            width: image.naturalWidth,
            height: image.naturalHeight
          };
          this.assetSizeCache.set(resolvedSource, size);
          this.render();
          finish(size);
          return;
        }
        finish(null);
      };
      image.onerror = () => {
        finish(null);
      };
      image.src = resolvedSource;
    });
    this.assetSizePromises.set(resolvedSource, pending);
    return pending;
  }

  getAssetSize(source = "") {
    const resolvedSource = this.resolveAssetSource(source);
    return this.assetSizeCache.get(resolvedSource) || this.primeAssetSize(source);
  }

  getAssetLocalWidth(source = "", fallbackWidth = this.getStageWidth()) {
    const size = this.getAssetSize(source);
    const stageHeight = Math.max(1, this.getStageHeight());
    if (size?.width && size?.height) {
      return Math.max(1, (Number(size.width) / Math.max(1, Number(size.height))) * stageHeight);
    }
    return Math.max(1, Number(fallbackWidth || 1));
  }

  getLayerRuntimeMetrics(layerId = "scene") {
    const viewport = this.getViewportName();
    const stageWidth = this.getStageWidth();
    const stageHeight = this.getStageHeight();
    const pov = this.getViewportPov(viewport);
    const camera = pov.camera || {};
    const layer = this.getSceneLayers().find((entry) => entry.id === layerId);
    if (!layer) {
      return {
        x: 0,
        y: 0,
        z: 0,
        scale: 1
      };
    }

    const config = resolveViewportConfig(layer, viewport);
    const source = config.src || config.assetRef || layer.src || layer.assetRef || "";
    const assetWidth = this.getAssetLocalWidth(source, stageWidth);
    const travel = clamp(Number(config.x ?? 50), 0, 100) / 100;
    const cameraTranslateXPercent = Number(camera.x || 0) * Number(layer.parallaxFactor ?? 0);
    const cameraTranslateYPercent = Number(camera.y || 0) * Number(layer.parallaxFactor ?? 0);
    const cameraX = (cameraTranslateXPercent / 100) * stageWidth;
    const assetRelativeX = (0.5 - travel) * (stageWidth + assetWidth);

    return {
      x: cameraX + assetRelativeX,
      y: ((cameraTranslateYPercent + Number(config.y || 0)) / 100) * stageHeight,
      z: this.getLayerTranslateZ(layer, config, stageWidth),
      scale: Math.max(0.05, Number(config.scale ?? layer.scaleBase ?? 1)),
      assetWidth,
      assetRelativeX,
      runtimeSpeed: this.getLayerRuntimeSpeed(layer, config),
      stageWidth,
      stageHeight,
      config,
      layer
    };
  }

  renderPlayerMarkup() {
    const action = this.getAction(this.player.actionId);
    const src = action.src || "assets/dummy/character/Idle.png";
    const resolvedSrc = this.resolveAssetSource(src);
    const metrics = this.getFrameMetrics(action);
    const frame = Math.min(this.player.frame, metrics.frameCount - 1);
    const transform = this.getCharacterViewportTransform();
    const bottomFactor = Number((0.1 + (clamp(Number(transform.y || 0), -250, 250) / 100)).toFixed(6));
    const scale = this.getPlayerVisualScale();
    const translateZ = (Number(transform.z || 0) / 100) * this.getStageWidth();

    return `
      <div
        class="runner-player"
        style="
          left:calc(50% + ${Number(Number(transform.x || 0).toFixed(2))}px);
          bottom:calc(100% * ${bottomFactor});
          z-index:8;
          width:${Number(metrics.width.toFixed(2))}px;
          height:${Number(metrics.height.toFixed(2))}px;
          transform:translate3d(0, ${-Number(this.player.y.toFixed(2))}px, ${Number(translateZ.toFixed(2))}px) scale(${Number(scale.toFixed(4))}) translateX(-50%);
          background-image:url('${cssUrl(resolvedSrc)}');
          background-size:${Number((metrics.frameCount * metrics.width).toFixed(2))}px ${Number(metrics.height.toFixed(2))}px;
          background-position:-${Number((frame * metrics.width).toFixed(2))}px 0;
        "
      ></div>
    `;
  }

  getRunnerOutcome() {
    if (this.state.status === "gameover") {
      return "game-over";
    }
    if (this.state.status === "life-lost") {
      return "life-lost";
    }
    if (this.state.status === "complete") {
      return "complete";
    }
    return "active";
  }

  renderRunnerOverlay() {
    const status = this.state.status;
    if (!["life-lost", "gameover", "complete"].includes(status)) {
      return "";
    }

    const restart = status === "gameover" || status === "complete";
    const title = status === "complete"
      ? "Level Complete"
      : (restart ? "Game Over" : "Life Lost");
    const label = restart ? "Restart" : "Retry";
    const control = restart ? "restart" : "retry";

    return `
      <div class="runner-result-overlay" data-runner-result="${escapeHtml(status)}">
        <div class="runner-result-overlay__panel" role="dialog" aria-label="${escapeHtml(title)}">
          <p class="runner-result-overlay__title">${escapeHtml(title)}</p>
          <button class="button runner-result-overlay__button" type="button" data-runner-control="${control}">
            ${escapeHtml(label)}
          </button>
        </div>
      </div>
    `;
  }

  renderSceneLayers() {
    const layers = this.getSceneLayers();
    if (!layers.length) {
      return "";
    }

    const viewport = this.getViewportName();
    const stageWidth = this.getStageWidth();
    const stageHeight = this.getStageHeight();
    const pov = this.getViewportPov(viewport);
    const camera = pov.camera || {};
    const worldWidth = Math.max(stageWidth, Number(this.getWorldPlan()?.world?.worldWidthPx || stageWidth));
    const hasRuntimeWorld = this.state.status !== "idle";

    return `
      <div class="runner-world" aria-hidden="true">
        ${layers.map((layer, layerIndex) => {
          const config = resolveViewportConfig(layer, viewport);
          const source = config.src || config.assetRef || layer.src || layer.assetRef || "";
          const resolvedSource = this.resolveAssetSource(source);
          const pattern = normalizeLayerPattern(config.pattern || layer.pattern);
          const repeatX = pattern === "horizontal" || pattern === "both";
          const assetWidth = this.getAssetLocalWidth(source, stageWidth);
          const tileStride = Math.max(1, assetWidth - PREVIEW_TILE_OVERLAP_PX);
          const travel = clamp(Number(config.x ?? 50), 0, 100) / 100;
          const cameraTranslateXPercent = Number(camera.x || 0) * Number(layer.parallaxFactor ?? 0);
          const cameraTranslateYPercent = Number(camera.y || 0) * Number(layer.parallaxFactor ?? 0);
          const cameraX = (cameraTranslateXPercent / 100) * stageWidth;
          const translateY = ((cameraTranslateYPercent + Number(config.y || 0)) / 100) * stageHeight;
          const translateZ = this.getLayerTranslateZ(layer, config, stageWidth);
          const runtimeSpeed = this.getLayerRuntimeSpeed(layer, config);
          const runnerOffset = Number(((hasRuntimeWorld ? this.state.elapsed : 0) * runtimeSpeed).toFixed(3));
          const scale = Math.max(0.05, Number(config.scale ?? layer.scaleBase ?? 1));
          const zIndex = layerIndex + 1;
          const assetRelativeX = (0.5 - travel) * (stageWidth + assetWidth);
          const defaultLayerX = cameraX + assetRelativeX;
          const coverageWidth = hasRuntimeWorld ? worldWidth : stageWidth;
          const tileCount = repeatX || layer.id === "scene"
            ? getPreviewSequenceTileCount(stageWidth, tileStride, assetRelativeX, coverageWidth)
            : 1;
          const tileIndexes = hasRuntimeWorld
            ? getPreviewRunnerTileIndexes(tileCount)
            : getPreviewTileIndexes(tileCount);
          return `
            <div
              class="runner-layer runner-layer--${escapeHtml(layer.id || "layer")}"
              data-runner-layer="${escapeHtml(layer.id || "layer")}"
              style="
                z-index:${zIndex};
                --runner-layer-x:${Number(defaultLayerX.toFixed(3))}px;
                --runner-layer-y:${Number(translateY.toFixed(3))}px;
                --runner-layer-z:${Number(translateZ.toFixed(3))}px;
                --runner-layer-scale:${Number(scale.toFixed(4))};
                --runner-track-x:${Number((-runnerOffset).toFixed(3))}px;
              "
            >
              <div class="runner-layer-plane">
                <div class="runner-layer-visual" data-pattern="${escapeHtml(pattern)}">
                  <div class="runner-layer-track">
                    ${tileIndexes.map((tileIndex) => {
                      const tileLeft = (Number(tileIndex) * tileStride) - (assetWidth / 2);
                      return `<img src="${escapeHtml(resolvedSource)}" alt="" style="width:${Number(assetWidth.toFixed(3))}px; transform:translate3d(${Number(tileLeft.toFixed(3))}px, 0, 0)">`;
                    }).join("")}
                    ${layer.id === "scene"
                      ? (this.getWorldPlan()?.entries || []).filter((entry) => entry.kind !== "hollow")
                        .map((entry) => this.renderSceneTrackSpawnEntry(entry, assetRelativeX, stageWidth))
                        .join("")
                      : ""}
                  </div>
                  ${layer.id === "scene" ? this.renderPlayerMarkup() : ""}
                </div>
              </div>
            </div>
          `;
        }).join("")}
      </div>
    `;
  }

  renderFallbackBackdrop() {
    return `
      <div class="runner-sky"></div>
      <div class="runner-horizon" style="transform:translateX(${-Number((this.state.distancePx * 0.12).toFixed(2))}px)"></div>
      <div class="runner-ground" style="transform:translateX(${-Number((this.state.distancePx * 0.35).toFixed(2))}px)"></div>
    `;
  }

  renderStageBackgroundStyle() {
    const background = this.config.location?.scene?.background || {};
    if (background.src || background.assetRef) {
      const source = this.resolveAssetSource(background.src || background.assetRef);
      return `background:${background.color || "#071017"} url('${cssUrl(source)}') center / cover no-repeat;`;
    }
    if (background.type === "gradient") {
      const from = background.from || background.color || "#071017";
      const to = background.to || "#0a1117";
      const angle = Number(background.angle ?? 180);
      return `background:linear-gradient(${angle}deg, ${from}, ${to});`;
    }
    return `background:${background.color || "#071017"};`;
  }

  getIrgContract() {
    const scene = this.config.location?.scene || {};
    return this.context.location?.getIrgContract?.()
      || normalizeIrgContract(this.config.gameplay?.irg || {}, {
        scene,
        physics: this.config.physics || {}
      });
  }

  getActiveIrgLevel() {
    const contract = this.getIrgContract();
    return contract.levels?.[contract.activeLevelId] || {};
  }

  getLevelPaintSeed(screenId = "runtime") {
    const level = this.getActiveIrgLevel();
    return level.paintSeed || `preview-${screenId}`;
  }

  paintWorld(seed = "") {
    const level = this.getActiveIrgLevel();
    const spawnObjects = this.getRuntimeSpawnObjects()
      .filter((entry) => !this.isTextBonusEntry(entry));
    return paintInfiniteRunnerWorld({
      level,
      physics: this.config.physics || {},
      spawnObjects,
      seed: seed || level.paintSeed || "runtime",
      viewport: this.getViewportName(),
      viewportWidth: this.getStageWidth()
    });
  }

  getWorldPlan() {
    if (!this.worldPlan) {
      this.worldPlan = this.paintWorld(this.getLevelPaintSeed());
    }
    return this.worldPlan;
  }

  getMaxLives() {
    return Math.max(1, Number(this.context.db?.get("rules.lives", 3) || 3));
  }

  getStoredGameplayLives() {
    let value = null;
    if (typeof window !== "undefined") {
      try {
        value = window.sessionStorage?.getItem?.(GAMEPLAY_LIVES_STORAGE_KEY);
      } catch {
        value = null;
      }
    }
    if (value == null) {
      value = this.context.db?.get?.(GAMEPLAY_LIVES_SESSION_KEY, null);
    }
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return null;
    }
    return clamp(Math.round(numeric), 0, this.getMaxLives());
  }

  setStoredGameplayLives(lives) {
    const safeLives = clamp(Math.round(Number(lives || 0)), 0, this.getMaxLives());
    if (typeof window !== "undefined") {
      try {
        window.sessionStorage?.setItem?.(GAMEPLAY_LIVES_STORAGE_KEY, String(safeLives));
      } catch {
        // Session storage can be unavailable in embedded/private contexts.
      }
    }
    this.context.db?.set?.(GAMEPLAY_LIVES_SESSION_KEY, safeLives);
  }

  getHudTiming() {
    const plan = this.getWorldPlan();
    const world = plan?.world || {};
    const sceneSpeed = Math.max(1, Number(plan?.sceneSpeed || this.config.physics?.worldScrollSpeed || 420));
    const durationPs = Math.max(1, Number(world.durationPs || this.getActiveIrgLevel().durationPs || 30));
    const gameStartX = Number(world.gameStartX || 0);
    const distancePx = Number(this.state.distancePx || 0);
    const phase = this.state.status === "idle"
      ? "idle"
      : (this.isWorldRenderingActive() && distancePx < gameStartX ? "pregame" : "game");
    const elapsedGame = clamp((distancePx - gameStartX) / sceneSpeed, 0, durationPs);
    const remaining = Math.max(0, durationPs - elapsedGame);
    const progress = phase === "idle" || phase === "pregame"
      ? 100
      : clamp((remaining / durationPs) * 100, 0, 100);
    const countdownVisible = phase === "game";

    return {
      phase,
      elapsedGame,
      remaining,
      progress,
      countdownVisible,
      label: formatHudSeconds(countdownVisible ? remaining : durationPs)
    };
  }

  hasRuntimeHud() {
    return Boolean(this.mountNode?.closest(".screen")?.querySelector("[data-hud-element]"));
  }

  renderHudLivesMarkup(currentLives, maxLives) {
    const safeMax = Math.max(1, Number(maxLives) || 3);
    const filled = clamp(Number(currentLives) || 0, 0, safeMax);
    return Array.from({ length: safeMax }, (_, index) => {
      const state = index < filled ? "filled" : "empty";
      return `<span class="screen__hud-life" data-hud-life data-state="${state}"></span>`;
    }).join("");
  }

  ensureRuntimeHudTimeMarkup(node) {
    if (node?.querySelector("[data-hud-time-value]")) {
      return;
    }

    node.innerHTML = `
      <span class="screen__hud-timeline" data-hud-timeline aria-hidden="true"></span>
      <span class="screen__hud-time-value" data-hud-time-value></span>
    `;
  }

  updateRuntimeHud(options = {}) {
    const updateLives = options.updateLives !== false;
    const updateTime = options.updateTime !== false;
    const screenNode = this.mountNode?.closest(".screen");
    if (!screenNode) {
      return;
    }

    const maxLives = this.getMaxLives();
    const currentLives = Math.max(0, Number(this.state.lives || 0));

    if (updateLives) {
      screenNode.querySelectorAll('[data-hud-element="lives"]').forEach((node) => {
        node.setAttribute("aria-label", `Lives ${currentLives} of ${maxLives}`);
        node.innerHTML = `
          <span class="screen__hud-lives" data-hud-lives aria-hidden="true">
            ${this.renderHudLivesMarkup(currentLives, maxLives)}
          </span>
          <span class="screen__hud-text">${currentLives}/${maxLives}</span>
        `;
      });
    }

    if (updateTime) {
      const timing = this.getHudTiming();
      screenNode.querySelectorAll('[data-hud-element="time"]').forEach((node) => {
        this.ensureRuntimeHudTimeMarkup(node);
        node.style.setProperty("--hud-time-progress", `${Number(timing.progress.toFixed(2))}%`);
        node.style.setProperty("--hud-time-value-opacity", timing.countdownVisible ? "1" : "0");
        node.dataset.hudTimePhase = timing.phase;
        node.setAttribute("aria-label", `Time ${timing.label}`);
        const valueNode = node.querySelector("[data-hud-time-value]");
        if (valueNode) {
          valueNode.textContent = timing.label;
        }
      });
    }
  }

  startRuntimeHudTimer() {
    this.stopRuntimeHudTimer();
    this.updateRuntimeHud({ updateTime: true });
    this.hudTimerId = window.setInterval(() => {
      this.updateRuntimeHud({ updateTime: true });
      if (this.state.status !== "running") {
        this.stopRuntimeHudTimer();
      }
    }, 250);
  }

  stopRuntimeHudTimer() {
    if (!this.hudTimerId) {
      return;
    }
    window.clearInterval(this.hudTimerId);
    this.hudTimerId = null;
  }

  getRuntimeSpawnObjects(viewport = this.getViewportName()) {
    const scene = this.config.location?.scene || {};
    const spawnObjects = scene.spawnObjects && typeof scene.spawnObjects === "object" ? scene.spawnObjects : {};
    const viewportName = normalizeViewportName(viewport);
    return Object.entries(spawnObjects).map(([source, storedConfig]) => {
      const config = resolveViewportConfig(storedConfig || {}, viewportName);
      const isTextBonus = isTextBonusSource(source, config);
      const triggerAction = String(config.trigger?.action || "").toLowerCase();
      const inferredFallback = triggerAction === "death" || triggerAction === "damage"
        ? "obstacle"
        : (config.kind || "object");
      const type = config.type
        || config.kind
        || getSpawnKindFromSource(source, isTextBonus ? "bonus" : inferredFallback, `${config.internalName || ""} ${triggerAction}`);
      return {
        ...config,
        source,
        key: source,
        type: isTextBonus ? "bonus" : type,
        kind: isTextBonus ? "bonus" : type,
        textBonus: isTextBonus,
        textStyle: config.textStyle || TEXT_BONUS_STYLE_ID,
        textEffect: config.textEffect || (Array.isArray(config.effects) && config.effects.some((effect) => effect?.type === "hideText") ? "hide" : "show"),
        wordListSource: config.wordListSource || "",
        enabled: config.enabled !== false,
        xPx: Number(config.xPx ?? config.x ?? 0),
        y: Number(config.y ?? 0),
        scale: Number(config.scale ?? 1),
        maxOccurrences: Math.max(0, Math.round(Number(config.maxOccurrences ?? 1))),
        randomness: config.randomness || "regular",
        bonusLink: config.bonusLink || "none",
        soundId: config.soundId || "",
        trigger: config.trigger || {},
        effects: Array.isArray(config.effects) ? config.effects : [],
        spriteSheet: isTextBonus ? {} : (config.spriteSheet || {}),
        animation: isTextBonus ? {} : (config.animation || {})
      };
    });
  }

  isTextBonusEntry(entry = {}) {
    return entry?.textBonus === true || isTextBonusSource(entry.source || entry.key || "", entry.config || entry);
  }

  resolveTextBonusAssetSource(source = "") {
    return this.context.assets?.resolveRaw ? this.context.assets.resolveRaw(source) : source;
  }

  loadTextBonusWordList(source = "") {
    const key = String(source || "");
    if (!key || this.wordListCache.has(key) || this.wordListLoading.has(key) || typeof fetch !== "function") {
      return;
    }
    this.wordListLoading.add(key);
    fetch(this.resolveTextBonusAssetSource(key))
      .then((response) => response.ok ? response.text() : "")
      .then((text) => {
        const words = parseWordListText(text);
        this.wordListCache.set(key, words.length ? words : DEFAULT_TEXT_BONUS_WORDS);
        this.wordListOrderCache.clear();
        this.render();
      })
      .catch(() => {
        this.wordListCache.set(key, DEFAULT_TEXT_BONUS_WORDS);
      })
      .finally(() => {
        this.wordListLoading.delete(key);
      });
  }

  getTextBonusWords(entry = {}) {
    const source = entry.config?.wordListSource || entry.wordListSource || "";
    if (!source) {
      return DEFAULT_TEXT_BONUS_WORDS;
    }
    if (!this.wordListCache.has(source)) {
      this.loadTextBonusWordList(source);
    }
    return this.wordListCache.get(source) || DEFAULT_TEXT_BONUS_WORDS;
  }

  getTextBonusWordSource(entry = {}) {
    return entry.config?.wordListSource || entry.wordListSource || "";
  }

  getTextBonusWordOrder(entry = {}, words = DEFAULT_TEXT_BONUS_WORDS) {
    const source = this.getTextBonusWordSource(entry) || "default";
    const runSeed = this.runSeed || this.worldPlan?.seed || "runtime";
    const cacheKey = `${runSeed}:${source}:${words.join("\u001f")}`;
    if (!this.wordListOrderCache.has(cacheKey)) {
      this.wordListOrderCache.set(cacheKey, shuffleWithRandom(words, createSeededRandom(cacheKey)));
    }
    return this.wordListOrderCache.get(cacheKey) || words;
  }

  getTextBonusOccurrenceIndex(entry = {}) {
    const entries = this.worldPlan?.entries || [];
    const source = this.getTextBonusWordSource(entry);
    const index = entries
      .filter((item) => this.isTextBonusEntry(item) && this.getTextBonusWordSource(item) === source)
      .findIndex((item) => item.id === entry.id);
    return index >= 0 ? index : hashString(`${entry.source || ""}:${entry.id || ""}`);
  }

  getTextBonusWord(entry = {}) {
    const words = this.getTextBonusWords(entry);
    const orderedWords = words.length > 1 ? this.getTextBonusWordOrder(entry, words) : words;
    const index = orderedWords.length > 1 ? this.getTextBonusOccurrenceIndex(entry) % orderedWords.length : 0;
    return orderedWords[index] || DEFAULT_TEXT_BONUS_WORDS[0];
  }

  getTextBonusOverlayConfig() {
    return this.getRuntimeSpawnObjects()
      .find((entry) => entry.enabled !== false && this.isTextBonusEntry(entry)) || null;
  }

  getNextTextBonusOverlayWord(config = {}) {
    const words = this.getTextBonusWords(config);
    const orderedWords = words.length > 1 ? this.getTextBonusWordOrder(config, words) : words;
    const index = orderedWords.length > 1 ? this.textBonusOverlayIndex % orderedWords.length : 0;
    this.textBonusOverlayIndex += 1;
    return orderedWords[index] || DEFAULT_TEXT_BONUS_WORDS[0];
  }

  showTextBonusOverlay(entry = {}) {
    const config = this.getTextBonusOverlayConfig();
    if (!config || this.isTextBonusEntry(entry)) {
      return;
    }

    const spawnRect = this.getSpawnRect(entry);
    const now = performance.now();
    this.textBonusOverlays = this.textBonusOverlays
      .filter((overlay) => overlay.expiresAt > now)
      .concat({
        id: `${entry.id}-text-${now.toFixed(0)}`,
        x: (spawnRect.left + spawnRect.right) / 2,
        y: Math.max(0, spawnRect.top - 18),
        word: this.getNextTextBonusOverlayWord(config),
        config,
        expiresAt: now + 1400
      });
  }

  getTextBonusVisible(entry = {}, collected = false) {
    const effect = String(entry.config?.textEffect || entry.textEffect || "").toLowerCase();
    const effects = Array.isArray(entry.effects) ? entry.effects : [];
    const fadeOut = effect === "hide" || effects.some((item) => item?.type === "hideText");
    return fadeOut ? !collected : collected;
  }

  getThemeDevice() {
    return this.getViewportName();
  }

  getThemeDeviceOverride(styling = {}, device = this.getThemeDevice()) {
    return styling.deviceOverrides?.[device] || {};
  }

  resolveThemeColor(styling = {}, value = "textColor", device = this.getThemeDevice()) {
    const token = String(value || "textColor");
    if (/^#|^rgb|^hsl|^var\(/i.test(token)) {
      return token;
    }
    const custom = (styling.customColors || []).find((color) => color?.id === token);
    const override = this.getThemeDeviceOverride(styling, device);
    return override.colors?.[token] || custom?.value || styling[token] || THEME_COLOR_FALLBACKS[token] || token;
  }

  getThemeTextShadow(effect = "none", color = "#000") {
    const effects = {
      "soft-shadow": "0 10px 26px rgba(0, 0, 0, 0.35)",
      "pixel-shadow": `2px 2px 0 ${color}`,
      outline: `1px 1px 0 ${color}`,
      glow: `0 0 18px ${color}`,
      none: "none"
    };
    return effects[effect] || effects.none;
  }

  getTextBonusStyleToken(styling = {}, styleId = TEXT_BONUS_STYLE_ID, device = this.getThemeDevice()) {
    const themeTokens = styling.themeTokens || {};
    const overrideTokens = this.getThemeDeviceOverride(styling, device).themeTokens || {};
    return {
      ...TEXT_BONUS_STYLE_DEFAULT,
      ...(themeTokens[styleId] || themeTokens[TEXT_BONUS_STYLE_ID] || {}),
      ...(overrideTokens[styleId] || overrideTokens[TEXT_BONUS_STYLE_ID] || {})
    };
  }

  getTextBonusFontFamily(styling = {}, token = {}) {
    return token.fontFamily
      || (token.fontKey ? styling[token.fontKey] : "")
      || styling.fontHud
      || styling.fontFamily
      || "Press Start 2P";
  }

  getTextBonusInlineStyle(entry = {}, collected = false) {
    const styling = this.config.design?.styling || {};
    const styleId = entry.config?.textStyle || entry.textStyle || TEXT_BONUS_STYLE_ID;
    const device = this.getThemeDevice();
    const token = this.getTextBonusStyleToken(styling, styleId, device);
    const effectColor = this.resolveThemeColor(styling, "accentColor", device);
    const color = this.resolveThemeColor(styling, token.color || "accentColor", device);
    const size = Math.max(8, Math.min(96, Number(token.size || 18)));
    const visible = this.getTextBonusVisible(entry, collected);
    return [
      "position:absolute",
      "left:50%",
      "top:50%",
      "display:block",
      "min-width:max-content",
      "white-space:nowrap",
      "pointer-events:none",
      `opacity:${visible ? 1 : 0}`,
      "transform:translate(-50%, -50%)",
      "transition:opacity 180ms ease-out",
      "image-rendering:pixelated",
      `font-family:${getCssFontFamily(this.getTextBonusFontFamily(styling, token))}`,
      `font-size:${Number(size.toFixed(2))}px`,
      `font-weight:${String(token.weight || "900")}`,
      `color:${color}`,
      `text-transform:${String(token.transform || "uppercase")}`,
      `text-shadow:${this.getThemeTextShadow(token.effect || "pixel-shadow", effectColor)}`
    ].join(";");
  }

  getAction(actionId) {
    const profile = this.getCharacterProfile();
    const actions = profile.actions || this.config.character?.actions || {};
    const normalized = String(actionId || "");
    const alias = normalized === "death"
      ? "dead"
      : normalized === "damage"
        ? "hurt"
        : "";
    return actions[normalized]
      || (alias ? actions[alias] : null)
      || actions[profile.defaultActionId || this.config.character?.defaultActionId]
      || {};
  }

  getActionSoundId(actionId) {
    return this.getAction(actionId)?.soundId || "";
  }

  getDeathActionId() {
    const actions = this.getCharacterProfile().actions || this.config.character?.actions || {};
    if (actions.death) return "death";
    if (actions.dead) return "dead";
    return this.config.character?.defaultActionId || "idle";
  }

  getDamageActionId() {
    const actions = this.getCharacterProfile().actions || this.config.character?.actions || {};
    if (actions.damage) return "damage";
    if (actions.hurt) return "hurt";
    return this.config.character?.defaultActionId || "idle";
  }

  getCurrentLevelScreenId() {
    return this.mountNode?.dataset.screenId
      || this.mountNode?.closest?.("[data-screen]")?.dataset.screen
      || this.context.screens?.currentScreenId
      || "";
  }

  getDesignScreen(screenId = "") {
    const screens = Array.isArray(this.config.design?.screens) ? this.config.design.screens : [];
    return screens.find((screen) => screen?.id === screenId) || null;
  }

  getCurrentLevelScreen() {
    const currentScreen = this.getDesignScreen(this.getCurrentLevelScreenId());
    if (currentScreen) {
      return currentScreen;
    }

    const screens = Array.isArray(this.config.design?.screens) ? this.config.design.screens : [];
    return screens.find((screen) => screen?.role === "game-level") || null;
  }

  getOutcomeScreenId(status = "") {
    const eventByStatus = {
      complete: "complete",
      gameover: "fail",
      "life-lost": "retry"
    };
    const fallbackByStatus = {
      complete: "level-complete",
      gameover: "life-zero",
      "life-lost": "life-lost"
    };
    const levelScreen = this.getCurrentLevelScreen();
    const eventId = eventByStatus[status] || "";
    const targetId = eventId && levelScreen?.events?.[eventId] ? String(levelScreen.events[eventId]) : "";
    return targetId || fallbackByStatus[status] || "";
  }

  presentOutcomeScreen(status = "", payload = {}) {
    const screenId = this.getOutcomeScreenId(status);
    if (!screenId || this.presentedOutcomeStatus === status) {
      return;
    }

    this.presentedOutcomeStatus = status;
    this.context.events.emit("gameplay:outcome", {
      status,
      screenId,
      score: Math.floor(this.state.score),
      lives: this.state.lives,
      ...payload
    });
    this.context.screens?.show?.(screenId)?.catch?.((error) => {
      this.context.logger?.warn?.("Gameplay outcome screen failed", { status, screenId, error });
    });
  }

  getSfx(soundId) {
    const sounds = Array.isArray(this.config.audio?.sfx) ? this.config.audio.sfx : [];
    return sounds.find((sound) => sound.id === soundId || sound.slot === soundId);
  }

  primeSfx(soundId) {
    if (isAudioMuted()) {
      return null;
    }

    const sound = this.getSfx(soundId);
    if (!sound?.path) {
      return null;
    }

    const src = this.context.assets?.resolveRaw ? this.context.assets.resolveRaw(sound.path) : sound.path;
    if (this.context.audio?.primeSfxSource) {
      return this.context.audio.primeSfxSource(src);
    }

    let audio = this.audioCache.get(src);
    if (!audio) {
      audio = new Audio(src);
      audio.preload = "auto";
      audio.load();
      this.audioCache.set(src, audio);
    }
    return this.context.audio?.registerSfx?.(audio) || audio;
  }

  preloadSfx() {
    if (isAudioMuted()) {
      return;
    }

    const sounds = Array.isArray(this.config.audio?.sfx) ? this.config.audio.sfx : [];
    sounds.forEach((sound) => {
      if (sound?.enabled !== false && sound?.path) {
        this.primeSfx(sound.id || sound.slot);
      }
    });
    Object.values(this.config.character?.actions || {}).forEach((action) => {
      if (action?.soundId) {
        this.primeSfx(action.soundId);
      }
    });
    Object.values(this.config.location?.scene?.spawnObjects || {}).forEach((spawn) => {
      if (spawn?.soundId) {
        this.primeSfx(spawn.soundId);
      }
    });
  }

  collectVisualAssetSources() {
    const sources = new Set();
    const addSource = (source) => {
      if (source) {
        sources.add(source);
      }
    };

    Object.values(this.config.character?.actions || {}).forEach((action) => addSource(action?.src));
    Object.values(this.config.character?.characters || {}).forEach((profile) => {
      Object.values(profile?.actions || {}).forEach((action) => addSource(action?.src));
    });
    this.getSceneLayers().forEach((layer) => {
      const config = resolveViewportConfig(layer, this.getViewportName());
      addSource(config.src || config.assetRef || layer.src || layer.assetRef);
    });
    Object.entries(this.config.location?.scene?.spawnObjects || {}).forEach(([source, config]) => {
      if (!isTextBonusSource(source, config)) {
        addSource(source);
      }
    });
    return [...sources];
  }

  preloadVisualAssets() {
    const sources = this.collectVisualAssetSources();
    if (!sources.length) {
      return Promise.resolve([]);
    }
    return Promise.allSettled(sources.map((source) => this.preloadAssetSize(source)));
  }

  playSfx(soundId) {
    if (isAudioMuted()) {
      return;
    }

    const audio = this.primeSfx(soundId);
    if (!audio) {
      return;
    }
    if (typeof audio.then === "function") {
      const sound = this.getSfx(soundId);
      const src = sound?.path && this.context.assets?.resolveRaw ? this.context.assets.resolveRaw(sound.path) : sound?.path;
      this.context.audio?.playSfxSource?.(src);
      return;
    }
    if (this.context.audio?.playSfxSource) {
      const sound = this.getSfx(soundId);
      const src = sound?.path && this.context.assets?.resolveRaw ? this.context.assets.resolveRaw(sound.path) : sound?.path;
      if (src) {
        this.context.audio.playSfxSource(src);
        return;
      }
    }
    audio.currentTime = 0;
    audio.play().catch(() => {});
  }

  getFrameMetrics(action = {}) {
    const metadata = this.getSpriteSheetMetadata(action.src);
    const frameCount = Math.max(1, Number(action.frameCount || metadata?.frameCount || 1));
    const size = action.src ? this.getAssetSize(action.src) : null;
    const width = size?.width
      ? Math.max(1, Number(size.width) / frameCount)
      : Math.max(1, Number(metadata?.frameWidth ?? action.frameWidth ?? 128));
    const height = size?.height
      ? Math.max(1, Number(size.height))
      : Math.max(1, Number(metadata?.frameHeight ?? action.frameHeight ?? 128));
    return { width, height, frameCount };
  }

  getSpriteSheetMetadata(source = "") {
    if (!source) {
      return null;
    }
    const sheets = this.config.assets?.spriteSheets || {};
    const normalized = String(source).replace(/^\//, "");
    return sheets[source]
      || sheets[normalized]
      || Object.values(sheets).find((sheet) => {
        const assetRef = String(sheet?.assetRef || "").replace(/^\//, "");
        return assetRef === normalized;
      })
      || null;
  }

  getCharacterProfile() {
    const character = this.config.character || {};
    const selectedId = character.selectedCharacterId || "";
    return character.characters?.[selectedId] || character;
  }

  getPlayerVisualScale() {
    const transform = this.getCharacterViewportTransform();
    const profile = this.getCharacterProfile();
    const authoredScale = Number(transform.scale ?? profile.preview?.scale ?? this.config.character?.preview?.scale ?? 1);
    return getSceneBoundScale(authoredScale, this.getCanvasScale(), { min: 0.01 });
  }

  getPlayerJumpDuration() {
    const action = this.getAction("jump");
    const frameCount = Math.max(1, Number(action.frameCount || 1));
    const fps = Math.max(1, Number(action.fps || 1));
    return Number((frameCount / fps).toFixed(4));
  }

  getPlayerJumpHeight() {
    const action = this.getAction("jump");
    const dimensions = this.getPlayerVisualDimensions(action);
    const elevation = clamp(
      Number(this.getCharacterProfile()?.preview?.maxJumpElevation ?? this.config.character?.preview?.maxJumpElevation ?? DEFAULT_MAX_JUMP_ELEVATION),
      0,
      5
    );
    return Math.max(0, dimensions.height * elevation);
  }

  getPlayerVisualDimensions(action = {}) {
    const metrics = this.getFrameMetrics(action);
    const scale = this.getPlayerVisualScale();
    return {
      width: metrics.width * scale,
      height: metrics.height * scale,
      scale,
      frameWidth: metrics.width,
      frameHeight: metrics.height,
      frameCount: metrics.frameCount
    };
  }

  getPlayerCollisionAction() {
    const profile = this.getCharacterProfile();
    const actionId = profile.collisionActionId || this.config.character?.collisionActionId || "run";
    return this.getAction(actionId);
  }

  getPlayerRect() {
    const action = this.getPlayerCollisionAction();
    const dimensions = this.getPlayerVisualDimensions(action);
    const scene = this.config.location?.scene || {};
    const viewport = this.getViewportName();
    const bounds = {
      ...(scene.characterBounds || {}),
      ...(scene.characterBoundsViewports?.[viewport] || {})
    };
    const width = dimensions.width;
    const height = dimensions.height;
    const scaleX = Math.max(0.01, Number(bounds.scaleX ?? bounds.scale ?? 0.56));
    const scaleY = Math.max(0.01, Number(bounds.scaleY ?? bounds.scale ?? 0.78));
    const sceneMetrics = this.getLayerRuntimeMetrics("scene");
    const sceneScale = Math.max(0.01, Number(sceneMetrics.scale || 1));
    const transform = this.getCharacterViewportTransform();
    const bottomFactor = 0.1 + (clamp(Number(transform.y || 0), -250, 250) / 100);
    const screenWidth = width * sceneScale;
    const screenHeight = height * sceneScale;
    const boxWidth = screenWidth * scaleX;
    const boxHeight = screenHeight * scaleY;
    const centerX = (this.getStageWidth() / 2)
      + Number(sceneMetrics.x || 0)
      + (Number(transform.x || 0) * sceneScale)
      + ((Number(bounds.x || 0) / 100) * screenWidth);
    const localBottomDistance = (this.getStageHeight() * bottomFactor) + this.player.y;
    const bottom = Number(sceneMetrics.y || 0)
      + (this.getStageHeight() / 2)
      + (((this.getStageHeight() / 2) - localBottomDistance) * sceneScale)
      + ((Number(bounds.y || 0) / 100) * screenHeight);
    return {
      left: centerX - (boxWidth / 2),
      right: centerX + (boxWidth / 2),
      top: bottom - boxHeight,
      bottom
    };
  }

  getSpawnFrameMetrics(entry = {}) {
    if (this.isTextBonusEntry(entry)) {
      return { ...KIND_DIMENSIONS.textBonus, frameCount: 1 };
    }
    const dimensions = KIND_DIMENSIONS[entry.kind] || KIND_DIMENSIONS.object;
    const sprite = entry.config?.spriteSheet || {};
    const metadata = this.getSpriteSheetMetadata(entry.source || "");
    const frameCount = Math.max(1, Number(sprite.frameCount || metadata?.frameCount || 1));
    const size = this.getAssetSize(entry.source || "");
    const naturalWidth = size?.width
      ? Number(size.width) / frameCount
      : Number(metadata?.frameWidth || dimensions.width);
    const naturalHeight = size?.height || Number(metadata?.frameHeight || dimensions.height);
    return {
      width: Math.max(1, naturalWidth),
      height: Math.max(1, naturalHeight),
      frameCount
    };
  }

  getSpawnVisualScale(entry = {}) {
    if (this.isTextBonusEntry(entry)) {
      return 1;
    }
    return getSceneBoundScale(Number(entry.config?.scale || 1), this.getCanvasScale(), { min: 0.01 });
  }

  getSpawnDimensions(entry = {}) {
    const metrics = this.getSpawnFrameMetrics(entry);
    const sceneMetrics = this.getLayerRuntimeMetrics("scene");
    const sceneScale = Math.max(0.01, Number(sceneMetrics.scale || 1));
    const scale = this.getSpawnVisualScale(entry);
    return {
      width: Math.max(1, metrics.width * scale * sceneScale),
      height: Math.max(1, metrics.height * scale * sceneScale),
      scale
    };
  }

  getEntryScreenX(entry = {}) {
    const sceneMetrics = this.getLayerRuntimeMetrics("scene");
    const stageWidth = this.getStageWidth();
    const sceneScale = Math.max(0.01, Number(sceneMetrics.scale || 1));
    const trackLeft = Number(entry.worldX || 0)
      - Number(sceneMetrics.assetRelativeX || 0)
      - (stageWidth / 2);
    const runnerOffset = (this.state.status === "running" ? Number(this.state.elapsed || 0) : 0)
      * Number(sceneMetrics.runtimeSpeed ?? 0);
    return Number(sceneMetrics.x || 0)
      + (stageWidth / 2)
      + ((trackLeft - runnerOffset) * sceneScale);
  }

  getSpawnRect(entry = {}) {
    const dimensions = this.getSpawnDimensions(entry);
    const bounds = entry.config?.boundingBox || {};
    const x = this.getEntryScreenX(entry);
    const sceneMetrics = this.getLayerRuntimeMetrics("scene");
    const sceneScale = Math.max(0.01, Number(sceneMetrics.scale || 1));
    const yPercent = Number(entry.config?.y || 0);
    const bottomDistance = this.getStageHeight() * (0.1 + (yPercent / 100));
    const bottom = Number(sceneMetrics.y || 0)
      + (this.getStageHeight() / 2)
      + (((this.getStageHeight() / 2) - bottomDistance) * sceneScale)
      + ((Number(bounds.y || 0) / 100) * dimensions.height);
    const scale = Math.max(0.01, Number(bounds.scale || 1));
    const scaleX = Math.max(0.01, Number(bounds.scaleX ?? scale));
    const scaleY = Math.max(0.01, Number(bounds.scaleY ?? scale));
    const boxWidth = dimensions.width * scaleX;
    const boxHeight = dimensions.height * scaleY;
    const centerX = x + ((Number(bounds.x || 0) / 100) * dimensions.width);
    return {
      left: centerX - (boxWidth / 2),
      right: centerX + (boxWidth / 2),
      top: bottom - boxHeight,
      bottom
    };
  }

  getHollowRect(entry = {}) {
    const dimensions = this.getSpawnDimensions(entry);
    const bounds = entry.config?.boundingBox || {};
    const width = dimensions.width * Math.max(0.01, Number(bounds.scaleX ?? bounds.scale ?? 1));
    const centerX = this.getEntryScreenX(entry);
    const sceneMetrics = this.getLayerRuntimeMetrics("scene");
    const sceneScale = Math.max(0.01, Number(sceneMetrics.scale || 1));
    const baseHeight = (this.getGroundBottom() + 72) * sceneScale;
    const boxHeight = baseHeight * Math.max(0.01, Number(bounds.scaleY ?? bounds.scale ?? 1));
    const bottom = Number(sceneMetrics.y || 0)
      + (this.getStageHeight() / 2)
      + ((this.getStageHeight() / 2) * sceneScale)
      + ((Number(bounds.y || 0) / 100) * baseHeight);
    const x = centerX + ((Number(bounds.x || 0) / 100) * dimensions.width);
    return {
      left: x - (width / 2),
      right: x + (width / 2),
      top: bottom - boxHeight,
      bottom
    };
  }

  isFallingIntoHollow(entry = {}, playerRect = null) {
    if (!this.player.grounded || this.player.y > 8) {
      return false;
    }
    const hollowRect = this.getHollowRect(entry);
    return rectsOverlap(playerRect, hollowRect);
  }

  getVisibleEntries(buffer = 180) {
    const stageWidth = this.getStageWidth();
    return (this.getWorldPlan()?.entries || []).filter((entry) => {
      const width = this.getSpawnDimensions(entry).width;
      const x = this.getEntryScreenX(entry);
      return x > -width - buffer && x < stageWidth + width + buffer;
    });
  }

  renderTextBonusOverlays() {
    const now = performance.now();
    this.textBonusOverlays = this.textBonusOverlays.filter((overlay) => overlay.expiresAt > now);
    if (!this.textBonusOverlays.length) {
      return "";
    }

    return this.textBonusOverlays.map((overlay) => {
      const opacity = clamp((overlay.expiresAt - now) / 240, 0, 1);
      return `
        <div
          class="runner-spawn runner-spawn--bonus runner-spawn--text-bonus runner-spawn--text-overlay"
          data-runner-text-bonus="true"
          data-runner-text-overlay="true"
          style="
            left:${Number(overlay.x.toFixed(2))}px;
            top:${Number(overlay.y.toFixed(2))}px;
            width:${KIND_DIMENSIONS.textBonus.width}px;
            height:${KIND_DIMENSIONS.textBonus.height}px;
            z-index:4;
            opacity:${Number(opacity.toFixed(3))};
            overflow:visible;
            transform:translate(-50%, -50%);
            background-image:none;
          "
        >
          <span class="runner-spawn__text-bonus" style="${escapeHtml(this.getTextBonusInlineStyle(overlay.config, true))}">${escapeHtml(overlay.word)}</span>
        </div>
      `;
    }).join("");
  }

  renderSceneTrackSpawnEntry(entry = {}, assetRelativeX = 0, stageWidth = this.getStageWidth()) {
    const metrics = this.getSpawnFrameMetrics(entry);
    const scale = this.getSpawnVisualScale(entry);
    const trackLeft = Number(entry.worldX || 0) - Number(assetRelativeX || 0) - (Number(stageWidth || 0) / 2);
    const yPercent = Number(entry.config?.y || 0);
    const bottomFactor = Number((0.1 + (yPercent / 100)).toFixed(6));
    const sprite = entry.config?.spriteSheet || {};
    const animation = entry.config?.animation || {};
    const frameCount = Math.max(1, Number(sprite.frameCount || metrics.frameCount || 1));
    const fps = Math.max(1, Number(animation.fps ?? sprite.fps ?? 12));
    const loops = animation.loop ?? sprite.loop ?? true;
    const frame = loops === false
      ? Math.min(frameCount - 1, Math.floor(this.state.elapsed * fps))
      : Math.floor(this.state.elapsed * fps) % frameCount;
    const source = entry.source
      ? (this.context.assets?.resolveRaw ? this.context.assets.resolveRaw(entry.source) : entry.source)
      : "";
    const collected = this.collectedSpawnIds.has(entry.id);
    const zIndex = entry.kind === "bonus" ? 3 : 2;
    if (this.isTextBonusEntry(entry)) {
      return `
        <div
          class="runner-spawn runner-spawn--bonus runner-spawn--text-bonus"
          data-runner-spawn="${escapeHtml(entry.id)}"
          data-runner-spawn-kind="bonus"
          data-runner-text-bonus="true"
          data-runner-spawn-collected="${collected ? "true" : "false"}"
          style="
            left:${Number(trackLeft.toFixed(2))}px;
            bottom:calc(100% * ${bottomFactor});
            width:${Number(metrics.width.toFixed(2))}px;
            height:${Number(metrics.height.toFixed(2))}px;
            z-index:${zIndex};
            opacity:1;
            overflow:visible;
            transform:translateX(-50%);
            background-image:none;
          "
        >
          <span class="runner-spawn__text-bonus" style="${escapeHtml(this.getTextBonusInlineStyle(entry, collected))}">${escapeHtml(this.getTextBonusWord(entry))}</span>
        </div>
      `;
    }
    const backgroundSize = frameCount > 1
      ? `${Number((frameCount * metrics.width).toFixed(2))}px ${Number(metrics.height.toFixed(2))}px`
      : "100% 100%";

    return `
      <div
        class="runner-spawn runner-spawn--${escapeHtml(entry.kind)}"
        data-runner-spawn="${escapeHtml(entry.id)}"
        data-runner-spawn-kind="${escapeHtml(entry.kind)}"
        style="
          left:${Number(trackLeft.toFixed(2))}px;
          bottom:calc(100% * ${bottomFactor});
          width:${Number(metrics.width.toFixed(2))}px;
          height:${Number(metrics.height.toFixed(2))}px;
          z-index:${zIndex};
          opacity:${collected ? 0 : 1};
          transform:translateX(-50%) scale(${Number(scale.toFixed(4))});
          background-image:${source ? `url('${cssUrl(source)}')` : "none"};
          background-size:${backgroundSize};
          background-position:-${Number((frame * metrics.width).toFixed(2))}px 0;
        "
      ></div>
    `;
  }

  renderSpawnEntry(entry = {}) {
    if (entry.kind === "hollow") {
      return this.renderHollowEntry(entry);
    }

    const dimensions = this.getSpawnDimensions(entry);
    const x = this.getEntryScreenX(entry);
    const yPercent = Number(entry.config?.y || 0);
    const bottom = this.getGroundBottom() + (this.getStageHeight() * (yPercent / 100));
    const sprite = entry.config?.spriteSheet || {};
    const animation = entry.config?.animation || {};
    const frameCount = Math.max(1, Number(sprite.frameCount || 1));
    const fps = Math.max(1, Number(animation.fps ?? sprite.fps ?? 12));
    const loops = animation.loop ?? sprite.loop ?? true;
    const frame = loops === false
      ? Math.min(frameCount - 1, Math.floor(this.state.elapsed * fps))
      : Math.floor(this.state.elapsed * fps) % frameCount;
    const source = entry.source
      ? (this.context.assets?.resolveRaw ? this.context.assets.resolveRaw(entry.source) : entry.source)
      : "";
    const collected = this.collectedSpawnIds.has(entry.id);
    const backgroundSize = frameCount > 1 ? `${frameCount * dimensions.width}px ${dimensions.height}px` : "contain";
    const zIndex = entry.kind === "bonus"
      ? this.getSceneLayerZIndex("character", 75) + 2
      : this.getSceneLayerZIndex("scene", 70) + 1;
    if (this.isTextBonusEntry(entry)) {
      return `
        <div
          class="runner-spawn runner-spawn--bonus runner-spawn--text-bonus"
          data-runner-spawn="${escapeHtml(entry.id)}"
          data-runner-spawn-kind="bonus"
          data-runner-text-bonus="true"
          data-runner-spawn-collected="${collected ? "true" : "false"}"
          style="
            left:${Number((x - (dimensions.width / 2)).toFixed(2))}px;
            bottom:${Number(bottom.toFixed(2))}px;
            width:${Number(dimensions.width.toFixed(2))}px;
            height:${Number(dimensions.height.toFixed(2))}px;
            z-index:${zIndex};
            opacity:1;
            overflow:visible;
            background-image:none;
          "
        >
          <span class="runner-spawn__text-bonus" style="${escapeHtml(this.getTextBonusInlineStyle(entry, collected))}">${escapeHtml(this.getTextBonusWord(entry))}</span>
        </div>
      `;
    }
    return `
      <div
        class="runner-spawn runner-spawn--${escapeHtml(entry.kind)}"
        data-runner-spawn="${escapeHtml(entry.id)}"
        data-runner-spawn-kind="${escapeHtml(entry.kind)}"
        style="
          left:${Number((x - (dimensions.width / 2)).toFixed(2))}px;
          bottom:${Number(bottom.toFixed(2))}px;
          width:${Number(dimensions.width.toFixed(2))}px;
          height:${Number(dimensions.height.toFixed(2))}px;
          z-index:${zIndex};
          opacity:${collected ? 0 : 1};
          background-image:${source ? `url('${cssUrl(source)}')` : "none"};
          background-size:${backgroundSize};
          background-position:-${Number((frame * dimensions.width).toFixed(2))}px 0;
        "
      ></div>
    `;
  }

  renderHollowEntry(entry = {}) {
    const rect = this.getHollowRect(entry);
    const width = rect.right - rect.left;
    const zIndex = this.getSceneLayerZIndex("scene", 70) + 1;
    return `
      <div
        class="runner-hollow-gap"
        data-runner-spawn="${escapeHtml(entry.id)}"
        data-runner-spawn-kind="hollow"
        style="
          left:${Number(rect.left.toFixed(2))}px;
          width:${Number(width.toFixed(2))}px;
          z-index:${zIndex};
        "
      ></div>
    `;
  }

  render() {
    if (!this.mountNode) {
      return;
    }

    const statusLabel = this.state.status === "gameover"
      ? "Game Over"
      : this.state.status === "complete"
        ? "Complete"
        : this.state.status === "life-lost"
          ? "Life Lost"
          : this.isWorldRenderingActive()
          ? "Running"
          : "Ready";
    const worldPlan = this.getWorldPlan();
    const viewport = this.getViewportName();
    const canvasSpec = this.getCanvasSpec(viewport);
    const pov = this.getViewportPov(viewport);
    const effectivePerspective = Number(((Number(pov.perspective || 100) / 100) * this.getStageWidth()).toFixed(2));
    const progress = worldPlan?.world?.worldWidthPx
      ? clamp((this.state.distancePx / worldPlan.world.worldWidthPx) * 100, 0, 100)
      : 0;
    const previewCanvasMode = this.getPreviewCanvasExportMode();
    const screenNode = this.mountNode.closest(".screen");
    if (screenNode) {
      screenNode.dataset.runnerViewport = viewport;
      if (previewCanvasMode) {
        screenNode.dataset.runnerRenderer = "preview-canvas";
      } else {
        delete screenNode.dataset.runnerRenderer;
      }
    }
    if (previewCanvasMode) {
      return;
    }
    const sceneLayers = this.renderSceneLayers();
    const fallbackHud = this.hasRuntimeHud()
      ? ""
      : `
        <div class="runner-hud">
          <span>Score ${Math.floor(this.state.score)}</span>
          <span>Lives ${Math.max(0, this.state.lives)}</span>
          <span>${escapeHtml(statusLabel)}</span>
          <span>${Math.round(progress)}%</span>
        </div>
      `;

    this.mountNode.innerHTML = `
      <div
        class="runner-stage runner-stage--${escapeHtml(viewport)}"
        data-runner-stage
        data-runner-viewport="${escapeHtml(viewport)}"
        data-runner-outcome="${this.getRunnerOutcome()}"
        style="--runner-canvas-aspect:${canvasSpec.aspect}; --runner-perspective:${effectivePerspective}px; ${this.renderStageBackgroundStyle()}"
      >
        ${sceneLayers || this.renderFallbackBackdrop()}
        ${fallbackHud}
        ${this.renderTextBonusOverlays()}
        ${this.renderRunnerOverlay()}
      </div>
    `;

    this.updateRuntimeHud({ updateTime: this.state.status !== "running" });
    this.mountNode.querySelectorAll("[data-runner-control], [data-runner-start]").forEach((node) => {
      node.addEventListener("click", this.boundRunnerControlClick);
    });
  }
}

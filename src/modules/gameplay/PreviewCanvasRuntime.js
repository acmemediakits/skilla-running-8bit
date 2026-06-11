export const moduleName = "PreviewCanvasRuntime";

const VIEWPORT_BREAKPOINT = 992;
const VIEWPORTS = ["desktop", "mobile"];
const SOUND_ENABLED_SESSION_KEY = "jsmii:soundEnabled";
const GAMEPLAY_LIVES_SESSION_KEY = "session.gameplayLives";
const GAMEPLAY_LIVES_STORAGE_KEY = "jsmii:gameplayLives";
const RESULT_SCREEN_BY_OUTCOME = {
  "life-lost": "life-lost",
  gameover: "life-zero",
  complete: "level-complete"
};

const escapeHtml = (value = "") => String(value)
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#39;");

const normalizeMode = (value = "current") => {
  const mode = String(value || "current").toLowerCase();
  return ["desktop", "mobile", "both"].includes(mode) ? mode : "current";
};

const normalizeViewport = (value = "desktop") => {
  return String(value || "").toLowerCase() === "mobile" ? "mobile" : "desktop";
};

const filterActiveSceneLayers = (scene = {}) => {
  const layers = Array.isArray(scene.layers) ? scene.layers : [];
  const selectedLayerIds = Array.isArray(scene.selectedLayerIds) && scene.selectedLayerIds.length
    ? new Set(scene.selectedLayerIds.map((id) => String(id)))
    : null;
  return layers
    .filter((layer) => layer && layer.enabled !== false)
    .filter((layer) => !selectedLayerIds || selectedLayerIds.has(String(layer.id || "")));
};

const isAudioMuted = () => {
  if (typeof window === "undefined") {
    return false;
  }

  return Boolean(window.__JSMII_AUDIO_MUTED__);
};

const setAudioMuted = (muted = true) => {
  if (typeof window === "undefined") {
    return;
  }

  window.__JSMII_AUDIO_MUTED__ = Boolean(muted);
  try {
    window.sessionStorage?.setItem(SOUND_ENABLED_SESSION_KEY, muted ? "false" : "true");
  } catch {
    // Session storage can be unavailable in embedded/private contexts.
  }
};

const cloneValue = (value) => {
  if (value == null) {
    return value;
  }
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
};

const normalizeClassToken = (value = "hero") => {
  return String(value || "hero")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "hero";
};

const isTextBonusSpawn = (source = "", config = {}) => {
  const normalized = String(source || "").replace(/^\/+/, "").toLowerCase();
  return config?.textBonus === true
    || normalized === "spawn/bonus/text-bonus"
    || normalized.endsWith("/text-bonus")
    || normalized === "text-bonus";
};

export default class PreviewCanvasRuntime {
  constructor(context) {
    this.context = context;
    this.mountNode = null;
    this.mode = "current";
    this.activeViewportKey = "";
    this.viewportStates = new Map();
    this.audioCache = new Map();
    this.resizeTimer = 0;
    this.resizeRedirecting = false;
    this.boundResize = this.handleResize.bind(this);
    this.boundClick = this.handleClick.bind(this);
    this.boundPointerDown = this.handlePointerDown.bind(this);
    this.boundKeyDown = this.handleKeyDown.bind(this);
    this.boundSuppressLongTap = this.suppressLongTap.bind(this);
    this.muted = isAudioMuted();
    this.viewportPrefs = new Map();
    this.screenId = "";
    this.jumpInputSuspended = false;
    this.jumpInputUnlockTimer = 0;
  }

  mount(mountNode, options = {}) {
    if (!mountNode) {
      return;
    }

    this.unmount({ clearNode: false });
    this.mountNode = mountNode;
    this.mode = normalizeMode(options.mode);
    this.screenId = String(options.screenId || mountNode.dataset.screenId || "");
    this.render();
    this.mountNode.addEventListener("click", this.boundClick);
    this.mountNode.addEventListener("pointerdown", this.boundPointerDown);
    this.mountNode.addEventListener("contextmenu", this.boundSuppressLongTap);
    this.mountNode.addEventListener("selectstart", this.boundSuppressLongTap);
    this.mountNode.addEventListener("dragstart", this.boundSuppressLongTap);
    document.addEventListener("keydown", this.boundKeyDown);
    if (this.mode === "current") {
      window.addEventListener("resize", this.boundResize);
    }
  }

  unmount({ clearNode = true } = {}) {
    window.clearTimeout(this.resizeTimer);
    window.clearTimeout(this.jumpInputUnlockTimer);
    this.resizeTimer = 0;
    this.jumpInputUnlockTimer = 0;
    this.jumpInputSuspended = false;
    window.removeEventListener("resize", this.boundResize);
    document.removeEventListener("keydown", this.boundKeyDown);
    this.mountNode?.removeEventListener("click", this.boundClick);
    this.mountNode?.removeEventListener("pointerdown", this.boundPointerDown);
    this.mountNode?.removeEventListener("contextmenu", this.boundSuppressLongTap);
    this.mountNode?.removeEventListener("selectstart", this.boundSuppressLongTap);
    this.mountNode?.removeEventListener("dragstart", this.boundSuppressLongTap);
    this.viewportStates.forEach((state) => {
      const renderer = state.renderer;
      window.clearTimeout(state.resultTimer);
      renderer?.setRunnerPreviewPlaying?.(false);
      renderer?.stopRunnerPreviewLoop?.();
      renderer?.stopPreviewHudTimer?.();
      state.stageNode?.querySelectorAll?.("img").forEach((image) => {
        image.removeAttribute("srcset");
        image.removeAttribute("src");
        image.src = "";
      });
      state.stageNode?.querySelectorAll?.(".tester-preview__spawn-object-sprite").forEach((node) => {
        node.style.backgroundImage = "none";
        node.style.removeProperty("--spawn-sprite-image");
      });
      if (state.stageNode) {
        state.stageNode.innerHTML = "";
      }
      if (renderer) {
        renderer.previewNode = null;
        renderer.spawnPlan = [];
        renderer.spawnPlanById = new Map();
        renderer.spawnCollisionMap = [];
        renderer.collectedSpawnIds?.clear?.();
        renderer.revealedTextBonusIds?.clear?.();
        renderer.previewAssetSizeCache?.clear?.();
        renderer.previewAssetSizePending?.clear?.();
        renderer.textBonusWordOrderCache?.clear?.();
        renderer.textBonusWordListCache?.clear?.();
        renderer.textBonusWordListPending?.clear?.();
        renderer.currentWorldPlan = null;
        renderer.previewRenderSequence = 0;
      }
      state.renderer = null;
    });
    this.viewportStates.clear();
    this.audioCache.forEach((audio) => {
      audio.pause?.();
      audio.removeAttribute?.("src");
      audio.load?.();
    });
    this.audioCache.clear();
    this.activeViewportKey = "";
    if (clearNode && this.mountNode) {
      this.mountNode.innerHTML = "";
    }
    this.mountNode = null;
    this.screenId = "";
  }

  getMaxLives() {
    return Math.max(1, Math.round(Number(this.context.db?.get("rules.lives", 3) || 3)));
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
    return Math.max(0, Math.min(this.getMaxLives(), Math.round(numeric)));
  }

  setStoredGameplayLives(lives) {
    const safeLives = Math.max(0, Math.min(this.getMaxLives(), Math.round(Number(lives || 0))));
    if (typeof window !== "undefined") {
      try {
        window.sessionStorage?.setItem?.(GAMEPLAY_LIVES_STORAGE_KEY, String(safeLives));
      } catch {
        // Session storage can be unavailable in embedded/private contexts.
      }
    }
    this.context.db?.set?.(GAMEPLAY_LIVES_SESSION_KEY, safeLives);
    return safeLives;
  }

  syncGameplayLives(lives) {
    const safeLives = this.setStoredGameplayLives(lives);
    this.viewportStates.forEach((state) => {
      state.lives = safeLives;
      this.syncHudLives(state);
    });
    return safeLives;
  }

  getAutoViewport() {
    return window.innerWidth < VIEWPORT_BREAKPOINT ? "mobile" : "desktop";
  }

  getViewports() {
    if (this.mode === "both") {
      return VIEWPORTS;
    }
    if (this.mode === "desktop" || this.mode === "mobile") {
      return [this.mode];
    }
    return [this.getAutoViewport()];
  }

  getViewportKey(viewports = this.getViewports()) {
    return viewports.join(",");
  }

  getLevelIdForScreen(screenId = "") {
    const safeScreenId = String(screenId || "");
    if (!safeScreenId) {
      return "";
    }

    const storedScene = this.context.db?.get?.("location.scene", {}) || {};
    const sceneLevels = storedScene.levels && typeof storedScene.levels === "object" ? storedScene.levels : {};
    const irgLevels = this.context.db?.get?.("gameplay.irg.levels", {}) || {};
    const designScreen = this.context.screens?.getDesignScreen?.(safeScreenId) || null;
    if (designScreen?.role === "game-level" || sceneLevels[safeScreenId] || irgLevels[safeScreenId]) {
      return safeScreenId;
    }
    return "";
  }

  getActiveScene(fallbackScene = {}) {
    const storedScene = this.context.db?.get?.("location.scene", {}) || {};
    const gameplayLevelId = this.context.db?.get?.("gameplay.irg.activeLevelId", "") || "";
    const screenLevelId = this.getLevelIdForScreen(this.screenId);
    const activeLevelId = screenLevelId || storedScene.levelId || gameplayLevelId || fallbackScene.levelId || "level-1";
    const activeLevelScene = activeLevelId && storedScene.levels?.[activeLevelId]
      ? storedScene.levels[activeLevelId]
      : null;

    if (activeLevelScene) {
      return {
        ...storedScene,
        ...activeLevelScene,
        levelId: activeLevelId,
        levels: storedScene.levels
      };
    }

    return this.context.location?.getScene?.() || storedScene || fallbackScene;
  }

  render() {
    if (!this.mountNode) {
      return;
    }

    const viewports = this.getViewports();
    const viewportKey = this.getViewportKey(viewports);
    this.activeViewportKey = viewportKey;
    this.mountNode.innerHTML = `
      <div class="runner-preview-export-set" data-preview-canvas-export="${escapeHtml(this.mode)}">
        ${viewports.map((viewport) => this.renderViewportShell(viewport)).join("")}
      </div>
    `;

    viewports.forEach((viewport) => this.mountViewportRenderer(viewport));
  }

  renderViewportShell(viewport = "desktop") {
    const safeViewport = normalizeViewport(viewport);
    const canvasAspect = safeViewport === "mobile" ? "10 / 16" : "4 / 3";
    const previewDash = `
        <div class="runner-preview-dash" role="group" aria-label="Preview controls">
          <button class="runner-preview-dash__button" type="button" data-preview-game-toggle="mute">${this.muted ? "Mute On" : "Mute Off"}</button>
          <button class="runner-preview-dash__button" type="button" data-preview-game-toggle="bb">BB Off</button>
          <button class="runner-preview-dash__button" type="button" data-preview-game-toggle="pause">Pause</button>
        </div>
      `;
    return `
      <div class="runner-preview-export runner-preview-export--${escapeHtml(safeViewport)}" data-preview-canvas-viewport="${escapeHtml(safeViewport)}">
        <div class="runner-preview-game-container">
          <div
            class="runner-stage runner-stage--${escapeHtml(safeViewport)} runner-stage--preview-canvas tester-preview tester-preview--${escapeHtml(safeViewport)}"
            data-runner-stage
            data-runner-viewport="${escapeHtml(safeViewport)}"
            data-preview-canvas-stage="${escapeHtml(safeViewport)}"
            data-preview-canvas-sizing="${safeViewport === "mobile" ? "viewport" : "capped"}"
            style="--runner-canvas-aspect:${canvasAspect};"
          ></div>
        </div>
        <div class="runner-result-overlay" data-preview-canvas-result="${escapeHtml(safeViewport)}" hidden></div>
        ${previewDash}
      </div>
    `;
  }

  mountViewportRenderer(viewport = "desktop") {
    const RendererClass = this.context.location?.constructor;
    const exportNode = this.mountNode?.querySelector(`[data-preview-canvas-viewport="${CSS.escape(viewport)}"]`);
    const stageNode = exportNode?.querySelector("[data-preview-canvas-stage]");
    const resultNode = exportNode?.querySelector("[data-preview-canvas-result]");
    if (!RendererClass || !stageNode) {
      return;
    }
    const prefs = this.getViewportPrefs(viewport);

    const initialLives = this.getStoredGameplayLives() ?? this.getMaxLives();
    const state = {
      viewport,
      exportNode,
      stageNode,
      resultNode,
      lives: initialLives,
      maxLives: this.getMaxLives(),
      outcome: "active",
      resultTimer: 0,
      resultRenderToken: 0,
      startToken: 0,
      muted: this.muted,
      bbVisible: prefs.bbVisible,
      presentedOutcomeStatus: "",
      paused: false,
      renderer: null
    };
    const rendererContext = {
      ...this.context,
      events: {
        emit: (eventName, payload = {}) => {
          this.handleRendererEvent(viewport, eventName, payload);
          this.context.events?.emit?.(eventName, { ...payload, viewport });
        },
        on: (...args) => this.context.events?.on?.(...args),
        off: (...args) => this.context.events?.off?.(...args)
      }
    };

    const renderer = new RendererClass(rendererContext);
    renderer.previewCanvasRuntime = true;
    renderer.start?.();
    const sourceScene = this.getActiveScene(renderer.getScene?.() || {});
    renderer.scene = {
      ...(renderer.getScene?.() || {}),
      ...(cloneValue(sourceScene) || {}),
      layers: filterActiveSceneLayers(sourceScene),
      viewport
    };
    state.renderer = renderer;
    this.viewportStates.set(viewport, state);

    this.syncPreviewDash(state);
    renderer.previewHudLives = state.lives;
    renderer.mountPreview(stageNode);
    this.exposeDebugRenderer(stageNode, viewport, renderer, state);
    this.syncDebugDataset(stageNode, renderer);
    this.syncHudLives(state);
    this.queueViewportStart(state);
  }

  syncPreviewDash(state) {
    if (!state?.exportNode) {
      return;
    }

    state.exportNode.dataset.previewMuted = this.muted ? "true" : "false";
    state.exportNode.dataset.previewBb = state.bbVisible ? "true" : "false";
    state.exportNode.dataset.previewPaused = state.paused ? "true" : "false";
    state.stageNode?.setAttribute("data-preview-paused", state.paused ? "true" : "false");

    const muteNode = state.exportNode.querySelector('[data-preview-game-toggle="mute"]');
    const bbNode = state.exportNode.querySelector('[data-preview-game-toggle="bb"]');
    const pauseNode = state.exportNode.querySelector('[data-preview-game-toggle="pause"]');
    if (muteNode) {
      muteNode.textContent = this.muted ? "Mute On" : "Mute Off";
      muteNode.setAttribute("aria-pressed", this.muted ? "true" : "false");
    }
    if (bbNode) {
      bbNode.textContent = state.bbVisible ? "BB On" : "BB Off";
      bbNode.setAttribute("aria-pressed", state.bbVisible ? "true" : "false");
    }
    if (pauseNode) {
      pauseNode.textContent = state.paused ? "Resume" : "Pause";
      pauseNode.setAttribute("aria-pressed", state.paused ? "true" : "false");
    }
  }

  syncAllPreviewDash() {
    this.viewportStates.forEach((state) => this.syncPreviewDash(state));
  }

  getViewportPrefs(viewport = "desktop") {
    const key = normalizeViewport(viewport);
    if (!this.viewportPrefs.has(key)) {
      this.viewportPrefs.set(key, { bbVisible: false });
    }
    return this.viewportPrefs.get(key);
  }

  exposeDebugRenderer(stageNode, viewport, renderer, state) {
    if (!this.context.runtimeSettings?.debug?.enabled || !stageNode || !renderer) {
      return;
    }

    Object.defineProperty(stageNode, "__jsmiiPreviewRenderer", {
      configurable: true,
      value: renderer
    });
    Object.defineProperty(stageNode, "__jsmiiPreviewState", {
      configurable: true,
      value: state
    });
    window.__JSMII_PREVIEW_CANVAS__ = window.__JSMII_PREVIEW_CANVAS__ || {};
    window.__JSMII_PREVIEW_CANVAS__[viewport] = { renderer, state };
  }

  syncDebugDataset(stageNode, renderer) {
    if (!stageNode || !renderer) {
      return;
    }

    const spawnEntries = Object.entries(renderer.scene?.spawnObjects || {});
    const enabledSpawnEntries = spawnEntries.filter(([, config]) => config?.enabled);
    stageNode.dataset.previewSpawnSourceCount = String(spawnEntries.length);
    stageNode.dataset.previewSpawnEnabledCount = String(enabledSpawnEntries.length);
    stageNode.dataset.previewSpawnKinds = enabledSpawnEntries
      .map(([source]) => renderer.getSpawnKindFromSource?.(source) || "object")
      .join(",");
    stageNode.dataset.previewSpawnPlanCount = String(renderer.spawnPlan?.length || 0);
  }

  handleRendererEvent(viewport, eventName, payload = {}) {
    const state = this.viewportStates.get(viewport);
    if (!state) {
      return;
    }

    if (eventName === "preview-runner:bonus-collected") {
      this.playSfx(payload.soundId || "coin-up-sfx");
      return;
    }

    if (eventName === "preview-runner:death-start") {
      this.playSfx(payload.trigger?.soundId || this.getActionSoundId(payload.actionId || payload.trigger?.action || "dead") || "hurt-sfx");
      return;
    }

    if (eventName === "preview-runner:death-complete") {
      if (state.outcome !== "active") {
        return;
      }
      window.clearTimeout(state.resultTimer);
      this.repaintAfterLifeLoss(state, payload);
      return;
    }

    if (eventName === "preview-runner:complete") {
      if (state.outcome !== "active") {
        return;
      }
      this.finishComplete(state, payload);
    }
  }

  repaintAfterLifeLoss(state, payload = {}) {
    state.lives = this.syncGameplayLives(Math.max(0, Math.round(Number(state.lives || 0)) - 1));
    const shouldResetLives = state.lives <= 0;
    const status = shouldResetLives ? "gameover" : "life-lost";
    state.outcome = status;
    state.stageNode?.setAttribute("data-runner-outcome", status === "gameover" ? "game-over" : status);
    this.context.audio?.playTheme?.("death");
    this.syncHudLives(state);
    this.showOutcome(state, status, {
      title: status === "gameover" ? "Game Over" : "Life Lost",
      label: status === "gameover" ? "Restart" : "Retry",
      control: status === "gameover" ? "restart" : "retry"
    }, payload);
    if (shouldResetLives) {
      this.context.events?.emit?.("gameplay:ended", {
        outcome: "fail",
        trigger: payload.trigger || {},
        viewport: state.viewport,
        worldPlan: state.renderer?.currentWorldPlan || null
      });
    }
  }

  repaintPaused(state, { resetLives = false } = {}) {
    this.restartViewport(state, { resetLives, startPaused: true });
  }

  finishLifeLoss(state, payload = {}) {
    this.repaintAfterLifeLoss(state, payload);
  }

  finishComplete(state, payload = {}) {
    state.outcome = "complete";
    state.stageNode?.setAttribute("data-runner-outcome", "complete");
    this.context.audio?.playTheme?.("success");
    this.syncGameplayLives(state.lives);
    this.syncHudLives(state);
    this.showOutcome(state, "complete", {
      title: "Level Complete",
      label: "Continue",
      control: "continue"
    }, payload);
    this.context.events?.emit?.("gameplay:ended", {
      outcome: "success",
      viewport: state.viewport,
      worldPlan: payload.worldPlan || state.renderer?.currentWorldPlan || null
    });
  }

  getResultScreenId(state, result = {}) {
    return result.screenId || this.getOutcomeScreenId(state?.outcome) || RESULT_SCREEN_BY_OUTCOME[state?.outcome] || "";
  }

  getCurrentLevelScreenId() {
    return this.screenId
      || this.context.screens?.currentScreenId
      || this.mountNode?.closest?.("[data-screen]")?.dataset.screen
      || "level-1";
  }

  getDesignScreen(screenId = "") {
    return this.context.screens?.getDesignScreen?.(screenId) || null;
  }

  getCurrentLevelScreen() {
    const currentScreen = this.getDesignScreen(this.getCurrentLevelScreenId());
    if (currentScreen) {
      return currentScreen;
    }

    const screens = this.context.db?.get?.("authoring.design.screens", []) || [];
    return Array.isArray(screens)
      ? screens.find((screen) => screen?.role === "game-level") || null
      : null;
  }

  getOutcomeScreenId(status = "") {
    const eventByStatus = {
      complete: "complete",
      gameover: "fail",
      "life-lost": "retry"
    };
    const levelScreen = this.getCurrentLevelScreen();
    const eventId = eventByStatus[status] || "";
    const targetId = eventId && levelScreen?.events?.[eventId] ? String(levelScreen.events[eventId]) : "";
    return targetId || RESULT_SCREEN_BY_OUTCOME[status] || "";
  }

  getOutcomeScreenPresentationMode(screenId = "") {
    const mode = this.getDesignScreen(screenId)?.presentation?.mode || "screen";
    return ["screen", "modal", "overlay", "external"].includes(mode) ? mode : "screen";
  }

  shouldUseMountedOutcomeScreen(screenId = "") {
    if (!screenId) {
      return false;
    }
    if (this.getViewports().length !== 1) {
      return false;
    }
    const mode = this.getOutcomeScreenPresentationMode(screenId);
    return mode === "screen" || mode === "modal" || mode === "overlay";
  }

  presentOutcomeScreen(state, status = "", payload = {}) {
    const screenId = this.getOutcomeScreenId(status);
    if (!screenId || state.presentedOutcomeStatus === status) {
      return;
    }

    state.presentedOutcomeStatus = status;
    this.context.events?.emit?.("gameplay:outcome", {
      status,
      screenId,
      viewport: state.viewport,
      worldPlan: payload.worldPlan || state.renderer?.currentWorldPlan || null
    });
    this.context.screens?.show?.(screenId)?.catch?.((error) => {
      this.context.logger?.warn?.("Preview outcome screen failed", { status, screenId, error });
    });
  }

  showOutcome(state, status = "", result = {}, payload = {}) {
    const screenId = this.getOutcomeScreenId(status);
    if (this.shouldUseMountedOutcomeScreen(screenId)) {
      this.hideResult(state);
      this.presentOutcomeScreen(state, status, payload);
      return;
    }
    this.showResult(state, result);
  }

  getResultTemplatePath(screenId = "") {
    const basePath = this.context.runtimeSettings?.html?.screensBasePath || "html/screens";
    return `${basePath.replace(/\/$/, "")}/${screenId}.html`;
  }

  async fetchResultTemplate(screenId = "") {
    if (!screenId) {
      return "";
    }

    const screens = await this.context.kernel?.getModule?.("screens");
    if (screens?.fetchScreen) {
      return screens.fetchScreen(screenId);
    }

    const fetcher = await this.context.kernel?.getModule?.("data");
    return fetcher?.fetchHtml?.(this.getResultTemplatePath(screenId)) || "";
  }

  getPreviewControl(control = "", screenId = "") {
    const safeControl = String(control || "").toLowerCase();
    if (safeControl === "retry" || safeControl === "restart") {
      return safeControl;
    }
    if (String(screenId || "").startsWith("life-lost")) {
      return "retry";
    }
    if (screenId === "life-zero") {
      return "restart";
    }
    return "";
  }

  getCharacterConfig() {
    return this.context.character?.getConfig?.()
      || this.context.db?.get?.("character", {})
      || {};
  }

  getSelectedCharacterProfile() {
    const config = this.getCharacterConfig();
    const selectedCharacterId = config.selectedCharacterId || config.characterOrder?.[0] || config.id || "hero";
    const profile = config.characters?.[selectedCharacterId] || config;
    return {
      id: selectedCharacterId,
      config,
      profile: profile || {}
    };
  }

  getSelectedCharacterClassToken() {
    const { id, profile } = this.getSelectedCharacterProfile();
    const explicitClass = profile.presentationClass || profile.cssClass || profile.slug || "";
    if (explicitClass) {
      return normalizeClassToken(explicitClass);
    }

    const labelClass = normalizeClassToken(profile.label || "");
    if (labelClass && labelClass !== "character-2") {
      return labelClass;
    }

    if (id === "hero") {
      return "alieno";
    }
    if (id === "character-2") {
      return "robot";
    }

    return normalizeClassToken(id);
  }

  hydrateCharacterIdleNodes(fragment, characterClass = this.getSelectedCharacterClassToken()) {
    fragment.querySelectorAll(".character-idle").forEach((node) => {
      node.classList.add(`character-${characterClass}`);
    });
  }

  prepareResultTemplate(markup = "", screenId = "", result = {}) {
    const characterClass = this.getSelectedCharacterClassToken();
    const template = document.createElement("template");
    template.innerHTML = String(markup || "")
      .replace(/\{\{\s*currentCharacter\s*\}\}/g, characterClass)
      .trim();
    const screenNode = template.content.querySelector("[data-screen]");
    if (screenNode) {
      screenNode.classList.add("screen--preview-canvas-result");
      screenNode.dataset.previewCanvasTemplate = screenId;
    }

    template.content
      .querySelectorAll("[data-runner-control], [data-preview-canvas-control]")
      .forEach((controlNode) => {
        const control = this.getPreviewControl(
          controlNode.dataset.previewCanvasControl || controlNode.dataset.runnerControl || result.control,
          screenId
        );
        if (control) {
          controlNode.dataset.previewCanvasControl = control;
        }
      });

    this.hydrateCharacterIdleNodes(template.content, characterClass);

    return template.innerHTML;
  }

  getFallbackResultMarkup(result = {}) {
    return `
      <div class="runner-result-overlay__panel" role="dialog" aria-label="${escapeHtml(result.title || "Result")}">
        <p class="runner-result-overlay__title">${escapeHtml(result.title || "Result")}</p>
        <button class="button runner-result-overlay__button" type="button" data-preview-canvas-control="${escapeHtml(result.control || "retry")}">
          ${escapeHtml(result.label || "Retry")}
        </button>
      </div>
    `;
  }

  async showResult(state, result = {}) {
    if (!state.resultNode) {
      return;
    }

    const screenId = this.getResultScreenId(state, result);
    const renderToken = state.resultRenderToken + 1;
    state.resultRenderToken = renderToken;
    state.resultNode.hidden = false;
    state.resultNode.dataset.runnerResult = state.outcome;
    state.resultNode.dataset.runnerResultScreen = screenId;
    state.resultNode.innerHTML = "";

    try {
      const templateMarkup = await this.fetchResultTemplate(screenId);
      if (state.resultRenderToken !== renderToken || state.outcome === "active") {
        return;
      }
      state.resultNode.innerHTML = this.prepareResultTemplate(templateMarkup, screenId, result);
    } catch (error) {
      this.context.logger?.warn?.("Result template unavailable, using fallback", { screenId, error });
      if (state.resultRenderToken !== renderToken || state.outcome === "active") {
        return;
      }
      state.resultNode.innerHTML = this.getFallbackResultMarkup(result);
    }
  }

  hideResult(state) {
    if (!state.resultNode) {
      return;
    }

    state.resultNode.hidden = true;
    state.resultNode.dataset.runnerResult = "";
    state.resultNode.dataset.runnerResultScreen = "";
    state.resultNode.innerHTML = "";
  }

  restartViewport(state, { resetLives = false, startPaused = false } = {}) {
    if (!state?.renderer) {
      return;
    }

    window.clearTimeout(state.resultTimer);
    state.resultTimer = 0;
    if (resetLives) {
      state.lives = this.syncGameplayLives(state.maxLives);
    } else {
      state.lives = this.syncGameplayLives(state.lives);
    }
    state.paused = Boolean(startPaused);
    state.outcome = "active";
    state.presentedOutcomeStatus = "";
    this.resumeJumpInput();
    state.resultRenderToken += 1;
    this.hideResult(state);
    state.renderer.previewHudLives = state.lives;
    state.renderer.setRunnerPreviewPlaying(false);
    if (!state.paused) {
      this.context.audio?.playTheme?.("gameplay");
    }
    this.queueViewportStart(state);
    this.syncHudLives(state);
    this.syncPreviewDash(state);
  }

  pauseViewport(state) {
    if (!state?.renderer || state.outcome !== "active") {
      return;
    }

    state.paused = true;
    state.renderer.stopRunnerPreviewLoop?.();
    state.renderer.stopPreviewHudTimer?.();
    this.syncPreviewDash(state);
  }

  resumeViewport(state) {
    if (!state?.renderer || state.outcome !== "active") {
      return;
    }

    state.paused = false;
    const now = performance.now();
    state.renderer.runnerDistanceLastTimestamp = now;
    state.renderer.runnerElapsedTimestamp = now;
    if (state.renderer.runnerPlaying) {
      state.renderer.startRunnerPreviewLoop?.();
      state.renderer.startPreviewHudTimer?.();
    } else {
      this.queueViewportStart(state);
    }
    this.syncPreviewDash(state);
  }

  toggleMute() {
    this.muted = !this.muted;
    setAudioMuted(this.muted);
    if (this.muted) {
      this.audioCache.forEach((audio) => {
        audio.pause?.();
      });
      this.context.audio?.stopSfx?.();
      this.context.audio?.stopTheme?.();
    }
    this.syncAllPreviewDash();
  }

  handlePreviewGameControl(control) {
    const action = control?.dataset.previewGameToggle || "";
    const viewport = control?.closest("[data-preview-canvas-viewport]")?.dataset.previewCanvasViewport || this.getViewports()[0];
    const state = this.viewportStates.get(normalizeViewport(viewport));
    if (action === "mute") {
      this.toggleMute();
      return;
    }
    if (!state) {
      return;
    }
    if (action === "bb") {
      state.bbVisible = !state.bbVisible;
      this.getViewportPrefs(state.viewport).bbVisible = state.bbVisible;
      this.syncPreviewDash(state);
      state.renderer.syncMobileSpawnOverlayCanvas?.();
      return;
    }
    if (action === "pause") {
      if (state.paused) {
        this.resumeViewport(state);
      } else {
        this.pauseViewport(state);
      }
    }
  }

  handleClick(event) {
    const previewControl = event.target.closest("[data-preview-game-toggle]");
    if (previewControl) {
      event.preventDefault();
      event.stopPropagation();
      this.handlePreviewGameControl(previewControl);
      return;
    }

    const funnelLink = event.target.closest("[data-result-funnel-link]");
    if (funnelLink) {
      return;
    }

    const control = event.target.closest("[data-preview-canvas-control]");
    if (!control) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const viewport = control.closest("[data-preview-canvas-viewport]")?.dataset.previewCanvasViewport || this.getViewports()[0];
    const state = this.viewportStates.get(viewport);
    const action = control.dataset.previewCanvasControl || "retry";
    this.restartViewport(state, { resetLives: action === "restart" });
  }

  handleExternalRunnerControl(control) {
    if (!control) {
      return false;
    }

    const action = control.dataset.runnerControl || "retry";
    if (!["retry", "restart", "start"].includes(action)) {
      return false;
    }

    const target = control.dataset.screenTarget || "";
    const currentLevelScreenId = this.getCurrentLevelScreenId();
    if (target && target !== currentLevelScreenId && target !== "level-1") {
      return false;
    }

    const viewport = control.closest?.("[data-preview-canvas-viewport]")?.dataset.previewCanvasViewport || this.getViewports()[0];
    const state = this.viewportStates.get(normalizeViewport(viewport));
    if (!state) {
      return false;
    }

    this.context.screens?.clearPresentation?.();
    this.restartViewport(state, { resetLives: action === "restart" || state.lives <= 0 });
    return true;
  }

  handlePointerDown(event) {
    if (this.allowsNativeTouch(event.target)) {
      return;
    }

    event.preventDefault();
    if (this.jumpInputSuspended) {
      return;
    }
    const viewport = event.target.closest("[data-preview-canvas-viewport]")?.dataset.previewCanvasViewport || this.getViewports()[0];
    const action = this.playViewportAction(viewport, "jump");
    if (action) {
      this.suspendJumpInput(action);
    }
  }

  allowsNativeTouch(target) {
    return Boolean(target?.closest?.([
      "a[href]",
      "button",
      "input",
      "select",
      "textarea",
      "[contenteditable='true']",
      "[data-preview-game-toggle]",
      "[data-preview-canvas-control]",
      "[data-preview-canvas-result]:not([hidden])"
    ].join(",")));
  }

  suppressLongTap(event) {
    if (!this.mountNode?.contains?.(event.target) || this.allowsNativeTouch(event.target)) {
      return;
    }

    event.preventDefault();
  }

  handleKeyDown(event) {
    if (!this.isJumpKey(event)) {
      return;
    }

    const viewports = this.getViewports();
    const viewport = viewports.length === 1 ? viewports[0] : this.getAutoViewport();
    event.preventDefault();
    if (event.repeat || this.jumpInputSuspended) {
      return;
    }
    const action = this.playViewportAction(viewport, "jump");
    if (action) {
      this.suspendJumpInput(action);
    }
  }

  playViewportAction(viewport = "desktop", actionId = "jump") {
    const state = this.viewportStates.get(normalizeViewport(viewport));
    if (!state || state.paused || state.outcome !== "active" || state.renderer?.isPreviewRunnerGameOver?.()) {
      return null;
    }

    if (actionId === "jump" && this.jumpInputSuspended) {
      return this.getActionConfig(actionId);
    }

    this.playSfx(this.getActionSoundId(actionId) || (actionId === "jump" ? "jump-sfx" : ""));
    return state.renderer?.playPreviewCharacterAction?.(actionId) || null;
  }

  clearScreenPreload() {
    this.mountNode?.closest?.(".screen")?.classList.remove("preload");
  }

  getActionSoundId(actionId = "") {
    const action = this.getActionConfig(actionId);
    return action?.soundId || "";
  }

  getActionConfig(actionId = "") {
    const renderer = [...this.viewportStates.values()].find((state) => state.renderer)?.renderer;
    return renderer?.getPreviewCharacterAction?.(actionId, { allowDisabled: true })
      || this.context.character?.getConfig?.()?.actions?.[actionId]
      || this.context.db?.get?.(`character.actions.${actionId}`, {})
      || {};
  }

  isJumpKey(event = {}) {
    const action = this.getActionConfig("jump");
    if (action?.enabled === false) {
      return false;
    }
    const configuredKey = String(action?.key || "");
    return (configuredKey && (event.code === configuredKey || event.key === configuredKey))
      || event.code === "Space"
      || event.code === "ArrowUp";
  }

  suspendJumpInput(action = {}) {
    this.jumpInputSuspended = true;
    window.clearTimeout(this.jumpInputUnlockTimer);
    this.jumpInputUnlockTimer = 0;
    document.removeEventListener("keydown", this.boundKeyDown);
    this.mountNode?.removeEventListener("pointerdown", this.boundPointerDown);
    this.jumpInputUnlockTimer = window.setTimeout(() => {
      this.resumeJumpInput();
    }, this.getActionDurationMs(action));
  }

  resumeJumpInput() {
    window.clearTimeout(this.jumpInputUnlockTimer);
    this.jumpInputUnlockTimer = 0;
    this.jumpInputSuspended = false;
    if (!this.mountNode) {
      return;
    }
    document.addEventListener("keydown", this.boundKeyDown);
    this.mountNode.addEventListener("pointerdown", this.boundPointerDown);
  }

  getActionDurationMs(action = {}) {
    const frameCount = Math.max(1, Number(action.frameCount || 1));
    const fps = Math.max(1, Number(action.fps || 12));
    return Math.max(120, (frameCount / fps) * 1000);
  }

  getSfx(soundId = "") {
    if (!soundId) {
      return null;
    }

    const sounds = this.context.db?.get?.("audio.sfx", []) || [];
    return Array.isArray(sounds)
      ? sounds.find((sound) => sound?.id === soundId || sound?.slot === soundId)
      : null;
  }

  primeSfx(soundId = "") {
    if (isAudioMuted()) {
      return null;
    }

    const sound = this.getSfx(soundId);
    if (!sound?.path || sound.enabled === false) {
      return null;
    }

    const source = this.context.assets?.resolveRaw ? this.context.assets.resolveRaw(sound.path) : sound.path;
    if (!source || typeof Audio !== "function") {
      return null;
    }
    if (this.context.audio?.primeSfxSource) {
      return this.context.audio.primeSfxSource(source);
    }

    let audio = this.audioCache.get(source);
    if (!audio) {
      audio = new Audio(source);
      audio.preload = "auto";
      audio.load();
      this.audioCache.set(source, audio);
    }
    return this.context.audio?.registerSfx?.(audio) || audio;
  }

  preloadSfx() {
    if (isAudioMuted()) {
      return;
    }

    const sounds = this.context.db?.get?.("audio.sfx", []) || [];
    if (Array.isArray(sounds)) {
      sounds.forEach((sound) => {
        if (sound?.enabled !== false) {
          this.primeSfx(sound.id || sound.slot);
        }
      });
    }
  }

  playSfx(soundId = "") {
    if (isAudioMuted()) {
      return;
    }

    const audio = this.primeSfx(soundId);
    if (!audio) {
      return;
    }
    if (typeof audio.then === "function") {
      const sound = this.getSfx(soundId);
      const source = sound?.path && this.context.assets?.resolveRaw ? this.context.assets.resolveRaw(sound.path) : sound?.path;
      this.context.audio?.playSfxSource?.(source);
      return;
    }
    if (this.context.audio?.playSfxSource) {
      const sound = this.getSfx(soundId);
      const source = sound?.path && this.context.assets?.resolveRaw ? this.context.assets.resolveRaw(sound.path) : sound?.path;
      if (source) {
        this.context.audio.playSfxSource(source);
        return;
      }
    }

    audio.currentTime = 0;
    audio.play().catch(() => {});
  }

  queueViewportStart(state) {
    if (!state?.renderer || !state.stageNode) {
      return;
    }

    const token = state.startToken + 1;
    state.startToken = token;
    state.stageNode.dataset.previewStartState = "preloading";
    this.preloadSfx();
    if (!state.paused) {
      this.playSfx(this.getActionSoundId("run") || "run-sfx");
    }
    this.preloadRendererAssets(state.renderer)
      .then(() => this.waitForLayoutFrame())
      .then(() => {
        if (
          token !== state.startToken
          || !state.stageNode?.isConnected
          || this.viewportStates.get(state.viewport) !== state
          || state.outcome !== "active"
        ) {
          return;
        }

        state.renderer.previewHudLives = state.lives;
        if (state.paused) {
          state.stageNode.dataset.previewStartState = "paused";
          state.renderer.setRunnerPreviewPlaying(false);
          state.renderer.stopRunnerPreviewLoop?.();
          state.renderer.stopPreviewHudTimer?.();
        } else {
          state.stageNode.dataset.previewStartState = "running";
          state.renderer.prepareRunnerPreviewSession?.();
          state.renderer.setRunnerPreviewPlaying(true);
          this.clearScreenPreload();
        }
        this.syncDebugDataset(state.stageNode, state.renderer);
        this.syncHudLives(state);
        this.syncPreviewDash(state);
      });
  }

  waitForLayoutFrame() {
    return new Promise((resolve) => {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(resolve);
      });
    });
  }

  preloadRendererAssets(renderer) {
    const sources = this.collectRendererAssetSources(renderer);
    if (!sources.length) {
      return Promise.resolve();
    }

    return Promise.allSettled(sources.map((source) => this.preloadRendererImage(renderer, source)));
  }

  collectRendererAssetSources(renderer) {
    const sources = new Set();
    const addSource = (source) => {
      if (source) {
        sources.add(source);
      }
    };

    (renderer.scene?.layers || []).forEach((layer) => {
      addSource(layer.src || layer.assetRef);
    });

    const characterProfile = renderer.getPreviewCharacterProfile?.()
      || this.context.character?.getConfig?.()
      || this.context.db?.get?.("character", {})
      || {};
    Object.values(characterProfile.actions || {}).forEach((action) => addSource(action?.src || action?.assetRef));

    Object.entries(renderer.scene?.spawnObjects || {}).forEach(([source, config]) => {
      if (isTextBonusSpawn(source, config)) {
        return;
      }
      addSource(source);
      addSource(config?.spriteSheet?.assetRef || config?.spriteSheet?.src);
    });

    return [...sources];
  }

  preloadRendererImage(renderer, source = "") {
    const resolvedSource = this.context.assets?.resolveRaw ? this.context.assets.resolveRaw(source) : source;
    if (!resolvedSource) {
      return Promise.resolve();
    }
    if (renderer.previewAssetSizeCache?.has(resolvedSource)) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      const image = new Image();
      let done = false;
      const finish = () => {
        if (done) {
          return;
        }
        done = true;
        window.clearTimeout(timeoutId);
        if (image.naturalWidth && image.naturalHeight) {
          renderer.previewAssetSizeCache?.set(resolvedSource, {
            width: Math.max(1, Number(image.naturalWidth || 0)),
            height: Math.max(1, Number(image.naturalHeight || 0))
          });
        }
        resolve();
      };
      const timeoutId = window.setTimeout(finish, 5000);
      image.decoding = "async";
      image.addEventListener("load", finish, { once: true });
      image.addEventListener("error", finish, { once: true });
      image.src = resolvedSource;
    });
  }

  syncHudLives(state) {
    if (!state?.stageNode) {
      return;
    }

    const apply = () => {
      if (state.renderer) {
        state.renderer.previewHudLives = state.lives;
      }
      state.stageNode.querySelectorAll("[data-hud-life]").forEach((node, index) => {
        node.dataset.state = index < state.lives ? "filled" : "empty";
      });
    };
    apply();
    window.requestAnimationFrame(apply);
  }

  handleResize() {
    if (this.mode !== "current" || !this.mountNode || this.resizeRedirecting) {
      return;
    }

    window.clearTimeout(this.resizeTimer);
    this.resizeTimer = window.setTimeout(() => {
      const nextKey = this.getViewportKey();
      if (nextKey !== this.activeViewportKey && this.mountNode) {
        this.resizeRedirecting = true;
        window.location.assign("./index.html");
      }
    }, 120);
  }
}

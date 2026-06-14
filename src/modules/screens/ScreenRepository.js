export const moduleName = "ScreenRepository";

const CHARACTER_CHOICE_SESSION_KEY = "jsmii:characterChoice";
const GAMEPLAY_LIVES_STORAGE_KEY = "jsmii:gameplayLives";
const HARD_NAVIGATION_BREAKPOINT = 992;
const DEFAULT_MOBILE_FLOW_MODE = "paged";

const SCREEN_THEME_FALLBACKS = {
  welcome: "intro",
  preroll: "intro",
  info: "info",
  "game-rules": "info",
  "level-1": "gameplay",
  "level-complete": "success",
  "game-end": "success",
  "life-lost": "death",
  "life-zero": "death"
};

const getDefaultScreenTheme = (screen = {}) => (
  screen?.role === "game-level" ? "gameplay" : "intro"
);

const getMobileFlowMode = () => {
  if (typeof document === "undefined") {
    return DEFAULT_MOBILE_FLOW_MODE;
  }
  const value = document.querySelector('meta[name="mobile-flow"]')?.getAttribute("content") || DEFAULT_MOBILE_FLOW_MODE;
  return String(value).trim().toLowerCase() === "ajax" ? "ajax" : DEFAULT_MOBILE_FLOW_MODE;
};

const normalizeClassToken = (value = "") => String(value || "")
  .trim()
  .toLowerCase()
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-z0-9_-]+/g, "-")
  .replace(/^-+|-+$/g, "");

const readStoredCharacterChoice = () => {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.sessionStorage?.getItem(CHARACTER_CHOICE_SESSION_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
};

const writeStoredCharacterChoice = (choice) => {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage?.setItem(CHARACTER_CHOICE_SESSION_KEY, JSON.stringify(choice));
  } catch {
    // Session storage can be unavailable in private or embedded contexts.
  }
};

export default class ScreenRepository {
  constructor(context) {
    this.context = context;
    this.mountNode = document.getElementById("screen-mount");
    this.presentationLayerNode = document.getElementById("presentation-layer");
    this.basePath = context.runtimeSettings?.html?.screensBasePath || "/html/screens";
    this.currentScreenId = null;
    this.currentPresentationId = null;
    this.handleNavigationClick = this.handleNavigationClick.bind(this);
    this.boundSyncSoundControls = this.syncSoundControls.bind(this);
  }

  getCharacterConfig() {
    return this.context.character?.getConfig?.()
      || this.context.db?.get?.("character", {})
      || {};
  }

  getCharacterProfile(characterId = "") {
    const config = this.getCharacterConfig();
    return config.characters?.[characterId] || null;
  }

  getCharacterClassToken(characterId = "", profile = null) {
    const explicitClass = profile?.presentationClass || profile?.cssClass || profile?.slug || "";
    if (explicitClass) {
      return normalizeClassToken(explicitClass);
    }

    const labelClass = normalizeClassToken(profile?.label || "");
    if (labelClass && labelClass !== "character-2") {
      return labelClass;
    }
    if (characterId === "hero") {
      return "alieno";
    }
    if (characterId === "character-2") {
      return "robot";
    }
    return normalizeClassToken(characterId || "hero");
  }

  resolveCharacterId(value = "") {
    const config = this.getCharacterConfig();
    const rawValue = String(value || "").trim();
    if (config.characters?.[rawValue]) {
      return rawValue;
    }

    const token = normalizeClassToken(rawValue);
    const match = Object.entries(config.characters || {}).find(([id, profile]) => (
      this.getCharacterClassToken(id, profile) === token
      || normalizeClassToken(profile?.label || "") === token
    ));

    return match?.[0] || rawValue;
  }

  normalizeCharacterChoice(choice = {}) {
    if (!choice || typeof choice !== "object") {
      return null;
    }

    const rawId = choice.id || choice.characterId || choice.profileId || "";
    const id = this.resolveCharacterId(rawId);
    const profile = this.getCharacterProfile(id);
    const fallbackToken = this.getCharacterClassToken(id, profile);
    const token = normalizeClassToken(choice.token || choice.currentCharacter || choice.value || fallbackToken);
    if (!id && !token) {
      return null;
    }

    return {
      id,
      token: token || fallbackToken,
      value: String(choice.value || token || id),
      label: String(choice.label || profile?.label || choice.value || token || id)
    };
  }

  getDefaultCharacterChoice() {
    const config = this.getCharacterConfig();
    const id = config.selectedCharacterId || config.characterOrder?.[0] || config.id || "hero";
    const profile = config.characters?.[id] || config;
    return this.normalizeCharacterChoice({
      id,
      token: this.getCharacterClassToken(id, profile),
      value: this.getCharacterClassToken(id, profile),
      label: profile.label || id
    });
  }

  getSessionCharacterChoice() {
    const dbChoice = this.context.db?.get?.("session.characterChoice", null);
    return this.normalizeCharacterChoice(dbChoice || readStoredCharacterChoice()) || this.getDefaultCharacterChoice();
  }

  getCharacterChoiceFromControl(control) {
    if (!control) {
      return null;
    }

    const characterId = control.dataset.characterId || control.value || control.dataset.characterToken || "";
    const id = this.resolveCharacterId(characterId);
    const profile = this.getCharacterProfile(id);
    const token = control.dataset.characterToken || control.value || this.getCharacterClassToken(id, profile);
    const label = control.dataset.characterLabel
      || control.getAttribute("aria-label")
      || profile?.label
      || token
      || id;

    return this.normalizeCharacterChoice({
      id,
      token,
      value: control.value || token || id,
      label
    });
  }

  updateCharacterChoiceControls(container, choice) {
    if (!container || !choice) {
      return;
    }

    container.querySelectorAll("[data-character-choice]").forEach((control) => {
      const controlChoice = this.getCharacterChoiceFromControl(control);
      const isSelected = controlChoice?.id === choice.id || controlChoice?.token === choice.token;
      control.classList.toggle("selected", Boolean(isSelected));
      control.setAttribute("aria-pressed", isSelected ? "true" : "false");
      if ("checked" in control) {
        control.checked = Boolean(isSelected);
      }
    });
  }

  playCharacterChoiceSound(choice) {
    const config = this.getCharacterConfig();
    const profile = config.characters?.[choice?.id] || config;
    const actionId = profile.defaultActionId || config.defaultActionId || "idle";
    const soundId = profile.actions?.[actionId]?.soundId || profile.actions?.idle?.soundId || "";

    this.context.events.emit("character:choice-sound", { ...choice, actionId, soundId });
    if (soundId) {
      this.context.gameplay?.playSfx?.(soundId);
    }
  }

  applyCharacterChoice(choice, options = {}) {
    const normalizedChoice = this.normalizeCharacterChoice(choice);
    if (!normalizedChoice) {
      return null;
    }

    const currentCharacterId = this.context.character?.getConfig?.()?.selectedCharacterId
      || this.context.db?.get?.("character.selectedCharacterId", "");
    if (normalizedChoice.id && normalizedChoice.id !== currentCharacterId) {
      this.context.character?.setSelectedCharacter?.(normalizedChoice.id);
    }

    this.context.db?.set?.("session.characterChoice", normalizedChoice);
    this.context.db?.set?.("session.currentCharacter", normalizedChoice.token);
    this.context.db?.set?.("session.currentCharacterId", normalizedChoice.id);
    if (options.persist === true) {
      writeStoredCharacterChoice(normalizedChoice);
    }
    this.updateCharacterChoiceControls(options.container || this.mountNode, normalizedChoice);

    if (options.emit !== false) {
      this.context.events.emit("character:choice-selected", normalizedChoice);
    }
    if (options.playSound) {
      this.playCharacterChoiceSound(normalizedChoice);
    }

    return normalizedChoice;
  }

  hydrateCharacterChoiceControls(container) {
    const controls = Array.from(container?.querySelectorAll?.("[data-character-choice]") || []);
    if (!controls.length) {
      return;
    }

    const storedChoice = this.getSessionCharacterChoice();
    const selectedControl = controls.find((control) => control.classList.contains("selected") || control.getAttribute("aria-pressed") === "true")
      || controls[0];
    const fallbackChoice = this.getCharacterChoiceFromControl(selectedControl);
    const choice = controls.some((control) => {
      const controlChoice = this.getCharacterChoiceFromControl(control);
      return controlChoice?.id === storedChoice?.id || controlChoice?.token === storedChoice?.token;
    })
      ? storedChoice
      : fallbackChoice;

    this.applyCharacterChoice(choice, {
      container,
      emit: false,
      playSound: false,
      persist: false
    });
  }

  interpolateSessionMarkup(markup = "") {
    const choice = this.getSessionCharacterChoice();
    return String(markup || "")
      .replace(/\{\{\s*currentCharacter\s*\}\}/g, choice?.token || "")
      .replace(/\{\{\s*currentCharacterId\s*\}\}/g, choice?.id || "")
      .replace(/\{\{\s*currentPlayer\s*\}\}/g, choice?.value || choice?.token || "");
  }

  getDesignScreen(screenId) {
    const screens = this.context.db?.get?.("authoring.design.screens", []) || [];
    return Array.isArray(screens)
      ? screens.find((screen) => screen?.id === screenId)
      : null;
  }

  getScreenPresentation(screenId) {
    const screen = this.getDesignScreen(screenId);
    const mode = screen?.presentation?.mode || (screen?.role === "external-endpoint" ? "external" : "screen");
    return {
      mode: ["screen", "modal", "overlay", "external"].includes(mode) ? mode : "screen",
      blocking: screen?.presentation?.blocking ?? mode === "modal"
    };
  }

  getScreenThemeId(screenId) {
    const screen = this.getDesignScreen(screenId);
    return screen?.audio?.themeId
      || screen?.audio?.theme
      || screen?.theme?.audioId
      || screen?.theme?.themeId
      || screen?.themeId
      || getDefaultScreenTheme(screen);
  }

  getScreenThemeOptions(screenId) {
    const screen = this.getDesignScreen(screenId);
    const audio = screen?.audio && typeof screen.audio === "object" ? screen.audio : {};
    const options = {};
    if (audio.volume != null && audio.volume !== "") {
      options.volume = audio.volume;
    }
    return options;
  }

  playScreenTheme(screenId) {
    const themeId = this.getScreenThemeId(screenId);
    if (themeId) {
      this.context.audio?.playTheme?.(themeId, this.getScreenThemeOptions(screenId));
    }
  }

  async fetchScreen(screenId) {
    const fetcher = await this.context.kernel.getModule("data");
    const path = `${this.basePath}/${screenId}.html`;
    this.context.logger.debug("Loading screen", path);
    return fetcher.fetchHtml(path);
  }

  clearPresentation() {
    if (this.presentationLayerNode) {
      this.presentationLayerNode.innerHTML = "";
      this.presentationLayerNode.className = "presentation-layer";
    }
    this.currentPresentationId = null;
  }

  getMountedScreens(container) {
    return Array.from(container?.querySelectorAll?.(".screen") || []);
  }

  async hydratePreviewFormIncludes(container) {
    const params = new URLSearchParams(window.location.search || "");
    const enabled = params.get("previewForm") === "1";
    const slots = Array.from(container?.querySelectorAll?.("[data-preview-form-include]") || []);
    if (!slots.length) {
      return;
    }

    if (!enabled) {
      slots.forEach((slot) => {
        slot.hidden = true;
        slot.innerHTML = "";
      });
      container?.querySelectorAll?.("[data-live-dynamics-form]").forEach((node) => {
        node.hidden = false;
      });
      return;
    }

    const fetcher = await this.context.kernel.getModule("data");
    await Promise.all(slots.map(async (slot) => {
      const src = String(slot.dataset.previewFormSrc || "").trim();
      if (!src) {
        slot.hidden = true;
        slot.innerHTML = "";
        return;
      }
      const resolvedSrc = new URL(src, window.location.href).toString();
      try {
        slot.innerHTML = await fetcher.fetchHtml(resolvedSrc);
        slot.hidden = false;
      } catch (error) {
        this.context.logger?.warn?.("Preview form include unavailable", { src: resolvedSrc, error });
        slot.hidden = true;
        slot.innerHTML = "";
      }
    }));

    container?.querySelectorAll?.("[data-live-dynamics-form]").forEach((node) => {
      node.hidden = true;
    });
  }

  async prepareScreenRuntime(container) {
    this.getMountedScreens(container).forEach((screen) => {
      screen.classList.toggle("preload", Boolean(screen.querySelector("[data-gameplay-runner]")));
    });
    this.injectSoundControls(container);
    await this.hydratePreviewFormIncludes(container);
  }

  rememberGameplayScreen(screenId = "") {
    if (!screenId) {
      return;
    }

    const screen = this.getDesignScreen(screenId);
    if (screen?.role === "game-level") {
      this.context.db?.set?.("session.currentGameplayScreenId", screenId);
    }
  }

  getCurrentGameplayScreenId() {
    const candidates = [
      this.currentScreenId,
      this.context.db?.get?.("session.currentGameplayScreenId", ""),
      this.context.screens?.currentScreenId
    ];

    for (const candidate of candidates) {
      if (!candidate) {
        continue;
      }
      const screen = this.getDesignScreen(candidate);
      if (screen?.role === "game-level") {
        return candidate;
      }
    }

    return "";
  }

  parameterizeLifeLostScreen(container, screenId = "") {
    if (!container || screenId !== "life-lost") {
      return;
    }

    const retryTarget = this.getCurrentGameplayScreenId() || "level-1";
    container.querySelectorAll('[data-screen="life-lost"] [data-runner-control="retry"]').forEach((control) => {
      control.dataset.screenTarget = retryTarget;
    });
  }

  clearGameplayLivesForNewRun(screenId = "") {
    const screen = this.getDesignScreen(screenId);
    const role = String(screen?.role || "").trim().toLowerCase();
    if (!["welcome", "info", "character-choice", "game-rules"].includes(role) && screenId !== "game-rules") {
      return;
    }
    if (role === "game-rules" || screenId === "game-rules") {
      const maxLives = Math.max(1, Number(this.context.db?.get?.("rules.lives", 3) || 3));
      if (typeof window !== "undefined") {
        try {
          window.sessionStorage?.setItem?.(GAMEPLAY_LIVES_STORAGE_KEY, String(maxLives));
        } catch {
          // Session storage can be unavailable in embedded/private contexts.
        }
      }
      this.context.db?.set?.("session.gameplayLives", maxLives);
      return;
    }
    if (typeof window !== "undefined") {
      try {
        window.sessionStorage?.removeItem?.(GAMEPLAY_LIVES_STORAGE_KEY);
      } catch {
        // Session storage can be unavailable in embedded/private contexts.
      }
    }
    this.context.db?.set?.("session.gameplayLives", null);
  }

  injectSoundControls(container) {
    container?.querySelectorAll?.(".screen > .screen__panel").forEach((panel) => {
      const screen = panel.closest(".screen");
      if (screen?.querySelector("[data-gameplay-runner]") || screen?.classList.contains("screen--game-level")) {
        return;
      }
      if (panel.querySelector(":scope > [data-sound-toggle]")) {
        return;
      }
      const button = document.createElement("button");
      button.type = "button";
      button.className = "screen__sound-toggle sound-on";
      button.dataset.soundToggle = "mute";
      button.setAttribute("aria-label", "Toggle sound");
      button.setAttribute("aria-pressed", "false");
      button.appendChild(document.createElement("span"));
      panel.appendChild(button);
    });
    this.syncSoundControls(container);
  }

  syncSoundControls(container = document) {
    const muted = this.context.audio?.isMuted?.() ?? Boolean(window.__JSMII_AUDIO_MUTED__);
    container?.querySelectorAll?.("[data-sound-toggle]").forEach((button) => {
      button.classList.toggle("sound-on", !muted);
      button.classList.toggle("sound-off", muted);
      button.setAttribute("aria-pressed", muted ? "true" : "false");
      button.dataset.soundState = muted ? "off" : "on";
    });
  }

  mount(markup, screenId = null, options = {}) {
    const presentationMode = options.presentationMode || "screen";
    const preparedMarkup = this.interpolateSessionMarkup(markup);
    if (presentationMode === "modal" || presentationMode === "overlay") {
      if (this.presentationLayerNode) {
        this.presentationLayerNode.innerHTML = preparedMarkup;
        this.presentationLayerNode.className = `presentation-layer is-visible is-${presentationMode}`;
        this.hydrateCharacterChoiceControls(this.presentationLayerNode);
        this.prepareScreenRuntime(this.presentationLayerNode);
        this.parameterizeLifeLostScreen(this.presentationLayerNode, screenId);
        this.syncHardScreenLinks(this.presentationLayerNode);
      }
      this.currentPresentationId = screenId;
      this.context.events.emit("screen:presented", { screenId, mountNode: this.presentationLayerNode, presentationMode });
      this.playScreenTheme(screenId);
      return;
    }

    this.clearPresentation();
    if (this.mountNode) {
      this.mountNode.innerHTML = preparedMarkup;
      this.hydrateCharacterChoiceControls(this.mountNode);
      this.prepareScreenRuntime(this.mountNode);
      this.parameterizeLifeLostScreen(this.mountNode, screenId);
      this.syncHardScreenLinks(this.mountNode);
    }

    this.currentScreenId = screenId;
    this.rememberGameplayScreen(screenId);
    this.context.events.emit("screen:mounted", { screenId, mountNode: this.mountNode });
    this.playScreenTheme(screenId);
  }

  async show(screenId) {
    this.clearGameplayLivesForNewRun(screenId);
    const presentation = this.getScreenPresentation(screenId);
    if (presentation.mode === "external") {
      this.context.events.emit("screen:external", { screenId });
      return screenId;
    }

    const markup = await this.fetchScreen(screenId);
    this.mount(markup, screenId, { presentationMode: presentation.mode });
    return screenId;
  }

  start() {
    document.addEventListener("click", this.handleNavigationClick);
    this.context.events?.on?.("audio:muted", this.boundSyncSoundControls);
  }

  isHardNavigationViewport() {
    if (typeof window === "undefined") {
      return false;
    }
    if (this.getRuntimeMobileFlowMode() !== "paged") {
      return false;
    }

    return window.matchMedia?.(`(max-width: ${HARD_NAVIGATION_BREAKPOINT - 0.02}px)`)?.matches
      ?? window.innerWidth < HARD_NAVIGATION_BREAKPOINT;
  }

  getRuntimeMobileFlowMode() {
    const metaValue = typeof document === "undefined"
      ? ""
      : document.querySelector('meta[name="mobile-flow"]')?.getAttribute("content");
    if (String(metaValue || "").trim()) {
      return String(metaValue).trim().toLowerCase() === "ajax" ? "ajax" : "paged";
    }
    const runtimeValue = this.context.runtimeSettings?.flow?.mobileFlow;
    if (String(runtimeValue || "").trim().toLowerCase() === "ajax") {
      return "ajax";
    }
    return getMobileFlowMode();
  }

  syncHardScreenLinks(container = document) {
    const useHardNavigation = this.isHardNavigationViewport();
    container?.querySelectorAll?.("[data-hard-screen-target]").forEach((trigger) => {
      const screenId = trigger.dataset.hardScreenTarget || "";
      if (!screenId) {
        trigger.removeAttribute("href");
        return;
      }

      if (useHardNavigation) {
        trigger.setAttribute("href", this.getHardScreenUrl(screenId));
        trigger.removeAttribute("role");
      } else {
        trigger.removeAttribute("href");
        trigger.setAttribute("role", "button");
      }
    });
  }

  getHardScreenUrl(screenId = "") {
    if (!screenId) {
      return "";
    }
    const url = new URL(window.location.href);
    url.searchParams.set("screen", screenId);
    url.searchParams.delete("mute");
    return `./index.html?${url.searchParams.toString()}`;
  }

  navigateHardToScreen(screenId = "") {
    if (this.getRuntimeMobileFlowMode() !== "paged") {
      return false;
    }
    const url = this.getHardScreenUrl(screenId);
    if (!url) {
      return false;
    }
    window.location.assign(url);
    return true;
  }

  replaceHardToScreen(screenId = "") {
    if (this.getRuntimeMobileFlowMode() !== "paged") {
      return false;
    }
    const url = this.getHardScreenUrl(screenId);
    if (!url) {
      return false;
    }
    window.location.replace(url);
    return true;
  }

  shouldReloadLifeLostRetry(trigger) {
    return Boolean(
      trigger?.dataset?.runnerControl === "retry"
      && trigger.closest?.('[data-screen="life-lost"]')
      && this.isHardNavigationViewport()
    );
  }

  handleNavigationClick(event) {
    const soundToggle = event.target.closest("[data-sound-toggle]");
    if (soundToggle) {
      event.preventDefault();
      event.stopPropagation();
      const themeId = this.getScreenThemeId(this.currentPresentationId || this.currentScreenId || "");
      const themeOptions = this.getScreenThemeOptions(this.currentPresentationId || this.currentScreenId || "");
      this.context.audio?.toggleMuted?.({ themeId, ...themeOptions });
      this.syncSoundControls(document);
      return;
    }

    const characterTrigger = event.target.closest("[data-character-choice]");
    if (characterTrigger) {
      event.preventDefault();
      this.applyCharacterChoice(this.getCharacterChoiceFromControl(characterTrigger), {
        container: characterTrigger.closest("[data-screen]") || this.mountNode,
        playSound: true,
        persist: true
      });
      return;
    }

    const dismissTrigger = event.target.closest("[data-screen-dismiss]");
    if (dismissTrigger) {
      event.preventDefault();
      this.clearPresentation();
      return;
    }

    const hardTrigger = event.target.closest("[data-hard-screen-target]");
    if (hardTrigger) {
      event.preventDefault();
      const hardScreenId = hardTrigger.dataset.hardScreenTarget || "";
      if (!hardScreenId) {
        return;
      }
      this.clearGameplayLivesForNewRun(hardScreenId);
      if (this.isHardNavigationViewport()) {
        this.navigateHardToScreen(hardScreenId);
      } else {
        this.playScreenTheme(hardScreenId);
        this.show(hardScreenId);
      }
      return;
    }

    const trigger = event.target.closest("[data-screen-target]");
    if (!trigger) {
      return;
    }

    event.preventDefault();
    const screenId = trigger.dataset.screenTarget;
    const runnerControl = trigger.dataset.runnerControl || "";
    if (this.shouldReloadLifeLostRetry(trigger)) {
      event.stopImmediatePropagation();
      this.replaceHardToScreen(screenId || this.getCurrentGameplayScreenId() || "level-1");
      return;
    }
    if (runnerControl && this.context.gameplay?.handleExternalRunnerControl?.(trigger)) {
      return;
    }
    if (screenId) {
      this.clearGameplayLivesForNewRun(screenId);
      this.playScreenTheme(screenId);
      this.show(screenId);
    }
  }
}

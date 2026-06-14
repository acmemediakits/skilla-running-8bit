import { AssetResolver } from "./AssetResolver.js?v=1.1.3-20260611170100";
import { EventBus } from "./EventBus.js";
import { Logger } from "./Logger.js";
import { ModuleLoader } from "./ModuleLoader.js";

const SCREEN_QUERY_PARAM = "screen";
const SCREEN_QUERY_ALIASES = {
  form: "lead",
  "all-levels-complete": "all-levels-complete"
};
const HARD_NAVIGATION_BREAKPOINT = 992;
const CLEAN_SCREEN_QUERY_NAVIGATION_TYPES = new Set(["reload", "back_forward"]);

const normalizeScreenId = (value) => {
  const rawValue = String(value || "").trim().replace(/\.html$/i, "");
  if (!/^[a-zA-Z0-9_-]+$/.test(rawValue)) {
    return "";
  }
  return SCREEN_QUERY_ALIASES[rawValue] || rawValue;
};

const isMobileViewport = () => {
  if (typeof window === "undefined") {
    return false;
  }
  return window.matchMedia?.(`(max-width: ${HARD_NAVIGATION_BREAKPOINT - 0.02}px)`)?.matches
    ?? window.innerWidth < HARD_NAVIGATION_BREAKPOINT;
};

const hasScreenQuery = () => {
  if (typeof window === "undefined") {
    return false;
  }
  return new URLSearchParams(window.location.search || "").has(SCREEN_QUERY_PARAM);
};

const getNavigationType = () => {
  if (typeof window === "undefined" || typeof performance === "undefined") {
    return "";
  }
  const navigation = performance.getEntriesByType?.("navigation")?.[0];
  if (navigation?.type) {
    return navigation.type;
  }
  if (performance.navigation?.type === 1) {
    return "reload";
  }
  if (performance.navigation?.type === 2) {
    return "back_forward";
  }
  return "";
};

const getCleanIndexUrl = () => {
  const url = new URL("index.html", window.location.href);
  url.search = "";
  url.hash = "";
  return url;
};

const assignCleanIndex = () => {
  if (typeof window === "undefined") {
    return false;
  }
  const cleanUrl = getCleanIndexUrl();
  if (window.location.href === cleanUrl.toString()) {
    return false;
  }
  window.location.assign(cleanUrl.toString());
  return true;
};

const shouldCleanScreenQueryNavigation = () => (
  hasScreenQuery()
  && isMobileViewport()
  && CLEAN_SCREEN_QUERY_NAVIGATION_TYPES.has(getNavigationType())
);

if (typeof window !== "undefined") {
  window.addEventListener("pageshow", (event) => {
    if (event.persisted && hasScreenQuery() && isMobileViewport()) {
      assignCleanIndex();
    }
  });
  window.addEventListener("popstate", () => {
    if (hasScreenQuery() && isMobileViewport()) {
      assignCleanIndex();
    }
  });
  if (shouldCleanScreenQueryNavigation()) {
    assignCleanIndex();
  }
}

const getInitialScreenOverride = () => {
  if (typeof window === "undefined") {
    return "";
  }

  if (shouldCleanScreenQueryNavigation()) {
    assignCleanIndex();
    return "";
  }

  const params = new URLSearchParams(window.location.search || "");
  return normalizeScreenId(params.get(SCREEN_QUERY_PARAM));
};

export class Kernel {
  constructor(runtimeSettings = {}) {
    this.state = "created";
    this.runtimeSettings = runtimeSettings;
    this.logger = new Logger(runtimeSettings.debug);
    this.assets = new AssetResolver(runtimeSettings);
    this.events = new EventBus();
    this.loader = new ModuleLoader(this.logger);
    this.context = {
      runtimeSettings: this.runtimeSettings,
      logger: this.logger,
      assets: this.assets,
      events: this.events,
      kernel: this
    };
  }

  registerModule(id, resolver) {
    this.loader.register(id, resolver);
  }

  async getModule(id) {
    return this.loader.load(id, this.context);
  }

  setState(nextState) {
    this.state = nextState;
    this.logger.debug("Kernel state changed", nextState);
    this.events.emit("kernel:state-changed", { state: nextState });
  }

  async boot() {
    this.setState("booted");

    const loadingOverlay = await this.getModule("interface");
    loadingOverlay.mount();
    loadingOverlay.update("Booting jsmii kernel", 64);

    const dataFetcher = await this.getModule("data");

    if (this.runtimeSettings.assets?.useManifest) {
      try {
        const manifest = await dataFetcher.fetchJson(this.runtimeSettings.build.manifestPath);
        this.assets.setManifest(manifest);
        this.logger.info("Asset manifest loaded");
      } catch (error) {
        this.logger.warn("Asset manifest unavailable, falling back to build version", error);
      }
    }

    this.setState("configured");

    const db = await this.getModule("db");
    await db.load();
    this.context.db = db;

    const audio = await this.getModule("audio");
    audio.start();
    this.context.audio = audio;

    const location = await this.getModule("location");
    location.start();
    this.context.location = location;

    const physics = await this.getModule("physics");
    physics.start();
    this.context.physics = physics;

    const character = await this.getModule("character");
    character.start();
    this.context.character = character;

    const gameplay = await this.getModule("gameplay");
    gameplay.startModule();
    this.context.gameplay = gameplay;

    const queryInitialScreen = getInitialScreenOverride();
    const initialScreen = queryInitialScreen || db.get("flow.initialScreen", this.runtimeSettings.flow?.initialScreen || "preroll");
    if (queryInitialScreen) {
      this.logger.info("Initial screen overridden from query", queryInitialScreen);
    }

    const screens = await this.getModule("screens");
    this.context.screens = screens;
    screens.start();

    if (this.runtimeSettings.debug?.mountInRuntime === true) {
      const debug = await this.getModule("debug");
      debug.start();
    }

    loadingOverlay.update("Loading initial screen modules", 86);
    await screens.show(initialScreen);

    this.setState("ready");

    loadingOverlay.update("Runtime ready", 100);
    await loadingOverlay.release(this.runtimeSettings.loading?.minVisibleMs || 450);

    document.body.classList.remove("is-booting");
    document.getElementById("game-root")?.setAttribute("data-runtime", "ready");
    this.setState("running");
    this.logger.info("Kernel ready");
  }
}

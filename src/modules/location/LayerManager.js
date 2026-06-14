import {
  createInfiniteRunnerPaintSeed,
  HUD_AREA_IDS,
  levelSpeedForViewport,
  normalizeHudFlexDirection,
  normalizeHudLayoutMode,
  normalizeIrgContract,
  paintInfiniteRunnerWorld
} from "../gameplay/InfiniteRunnerWorld.js?v=1.1.4-irg-windowed-20260613";

export const moduleName = "LayerManager";

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const LEGACY_TRANSFORM_BASE = {
  x: 640,
  y: 480,
  z: 640
};
const VIEWPORT_BASE_SIZE = {
  desktop: { width: 1024, height: 768 },
  mobile: { width: 420, height: 747 }
};
const GAME_CANVAS_MAX_SIZE = {
  desktop: { width: 1024, height: 768 },
  mobile: { width: 420, height: 747 }
};
const CHARACTER_SCENE_REFERENCE_HEIGHT = GAME_CANVAS_MAX_SIZE.desktop.height;
const DEFAULT_MAX_JUMP_ELEVATION = 1.5;
const PREVIEW_SEQUENCE_MIN_TILE_COUNT = 5;
const PREVIEW_SEQUENCE_MAX_TILE_COUNT = 161;
const PREVIEW_TILE_OVERLAP_PX = 1;
const PREVIEW_RUNTIME_REBASE_PX = 4096;
const PREVIEW_SPAWN_PLAN_SECONDS = 30;
const PREVIEW_SPAWN_PREROLL_SECONDS = 3;
const PREVIEW_RUNNER_STOP_DURATION_MS = 500;
const PREVIEW_RUNNER_MAX_DELTA_SECONDS = 1 / 30;
const PREVIEW_HOLLOW_PREROLL_TILES = 3;
const PREVIEW_HOLLOW_MIN_SCENE_TILES = 1;
const PREVIEW_SPAWN_MIN_GAP_SECONDS = 0.5;
const PREVIEW_SPAWN_Y_LIMIT = 300;
const PREVIEW_SCENE_TILE_SELECTOR = "img:not(.tester-preview__scene-hollow-segment):not(.tester-preview__scene-hollow-overlay)";
const TEXT_BONUS_KEY = "spawn/bonus/text-bonus";
const TEXT_BONUS_STYLE_ID = "textBonus";
const DEFAULT_TEXT_BONUS_WORDS = ["BONUS"];
const TEXT_BONUS_FRAME_SIZE = { width: 160, height: 44 };
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
const THEME_COLOR_FALLBACKS = {
  primaryColor: "#00a778",
  secondaryColor: "#ef4b8f",
  accentColor: "#ffce4f",
  textColor: "#e7f3ff",
  backgroundFrom: "#142535",
  backgroundTo: "#071017",
  shadowColor: "#05080d"
};
const AVAILABLE_LAYERS = [
  "horizon",
  "stars",
  "mountains",
  "clouds",
  "terrain",
  "background",
  "scene",
  "character",
  "foreground",
  "screen",
  "lens"
];

const VIEWPORTS = ["desktop", "mobile"];
const clampPercent = (value, min, max) => Number(clamp(value, min, max).toFixed(2));
const getBoundsScaleX = (bounds = {}) => Number(bounds.scaleX ?? bounds.scale ?? 1);
const getBoundsScaleY = (bounds = {}) => Number(bounds.scaleY ?? bounds.scale ?? 1);
const getBoundsThickness = (bounds = {}, fallback = 4) => Number(clamp(Number(bounds.thickness ?? fallback), 0, 50).toFixed(2));
const getSceneBoundPreviewScale = (authoredScale = 1, canvasScale = 1, { min = 0, max = 6 } = {}) => {
  const safeScale = Number.isFinite(Number(authoredScale)) ? Number(authoredScale) : 1;
  const safeCanvasScale = Number.isFinite(Number(canvasScale)) ? Number(canvasScale) : 1;
  return Number((clamp(safeScale, min, max) * clamp(safeCanvasScale, 0.01, 1)).toFixed(4));
};
const normalizeAssetPath = (value = "") => String(value || "")
  .replace(/^https?:\/\/[^/]+/i, "")
  .replace(/^\/+/, "")
  .replaceAll("\\", "/")
  .toLowerCase();
const SPRITE_ALIAS_STOPWORDS = new Set([
  "asset",
  "assets",
  "background",
  "bonus",
  "character",
  "jpeg",
  "jpg",
  "obstacle",
  "png",
  "project",
  "source",
  "spawn",
  "webp"
]);
const getAssetBasename = (value = "") => {
  const normalized = normalizeAssetPath(value).split("?")[0].split("#")[0];
  return normalized.split("/").filter(Boolean).pop() || normalized;
};
const getSpriteAliasStem = (value = "") => {
  return getAssetBasename(value)
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[-_][a-f0-9]{8,}$/i, "")
    .replace(/[-_]v\d+$/i, "")
    .replace(/^(?:bonus|obstacle|ostacolo|asset|sprite|img)[-_]+/i, "")
    .replace(/^(?:l|p)\d+[-_]+/i, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "");
};
const getSpriteAliasTokens = (value = "") => {
  return getSpriteAliasStem(value)
    .split("-")
    .map((token) => token.trim())
    .filter((token) => token.length >= 4 && !SPRITE_ALIAS_STOPWORDS.has(token) && !/^(?:l|p)?\d+$/i.test(token));
};
const createSpriteAliasSet = (values = []) => {
  const aliases = new Set();
  values.filter(Boolean).forEach((value) => {
    const stem = getSpriteAliasStem(value);
    if (stem) {
      aliases.add(stem);
    }
    getSpriteAliasTokens(value).forEach((token) => aliases.add(token));
  });
  return aliases;
};
const spriteSheetMatchesSource = (source = "", config = {}, key = "", value = {}) => {
  const normalizedSource = normalizeAssetPath(source);
  const normalizedKey = normalizeAssetPath(key);
  const normalizedRef = normalizeAssetPath(value?.assetRef || "");
  if (
    normalizedKey === normalizedSource
    || normalizedRef === normalizedSource
    || normalizedSource.endsWith(`/${normalizedKey}`)
    || (normalizedRef && normalizedSource.endsWith(`/${normalizedRef}`))
  ) {
    return true;
  }

  const sourceAliases = createSpriteAliasSet([
    source,
    config?.assetRef,
    config?.src,
    config?.source,
    config?.internalName,
    config?.name,
    config?.label
  ]);
  const sheetAliases = createSpriteAliasSet([key, value?.assetRef]);
  return [...sourceAliases].some((alias) => sheetAliases.has(alias));
};
const rectsOverlap = (a, b) => {
  return Boolean(a && b)
    && a.right > b.left
    && a.left < b.right
    && a.bottom > b.top
    && a.top < b.bottom;
};

const isNoCollisionMetaEnabled = () => {
  if (typeof document === "undefined") {
    return false;
  }
  const value = document.querySelector('meta[name="no-collision"]')?.getAttribute("content") || "false";
  return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
};

const isNegativeSpawnKind = (kind = "") => ["hazard", "obstacle"].includes(String(kind || "").toLowerCase());

const isBonusSpawnKind = (kind = "") => String(kind || "").toLowerCase() === "bonus";

const isTextBonusSource = (source = "", config = {}) => {
  const normalized = normalizeAssetPath(source);
  return config?.textBonus === true
    || normalized === TEXT_BONUS_KEY
    || normalized.endsWith("/text-bonus")
    || normalized === "text-bonus";
};

const parseWordListText = (text = "") => String(text || "")
  .split(/[\n,;]+/)
  .map((word) => word.trim())
  .filter(Boolean);

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

const isNegativeSpawnTrigger = (trigger = {}) => {
  return ["death", "damage"].includes(String(trigger?.action || "").toLowerCase());
};

const isDeathActionId = (actionId = "") => ["death", "dead"].includes(String(actionId || "").toLowerCase());

const inferSpawnKindFromText = (value = "", fallback = "object") => {
  const text = String(value || "").toLowerCase();
  if (/(^|[-_/\s])(hollow|gap|hole|buco|fossa)([-_/\s.]|$)/.test(text)) return "hollow";
  if (/(^|[-_/\s])(bonus|coin|moneta|pickup|collectible|cuore|heart|life)([-_/\s.]|$)/.test(text)) return "bonus";
  if (/(^|[-_/\s])(hazard|danger|danno)([-_/\s.]|$)/.test(text)) return "hazard";
  if (/(^|[-_/\s])(obstacle|ostacolo|bidone|distributore|transenna|barrier|trash|bin|cactus|stone|sasso|fungo|pietra|coreteccia|tondo)([-_/\s.]|$)/.test(text)) return "obstacle";
  if (/(^|[-_/\s])(platform|piattaforma)([-_/\s.]|$)/.test(text)) return "platform";
  return fallback;
};

const CHARACTER_SPEED_MULTIPLIERS = {
  idle: 0,
  "0x": 0,
  "1x": 1,
  "2x": 2,
  "3x": 3,
  "4x": 4
};

// Debug preview only: these dummy sources live inside the framework but are not gameplay/runtime assets.
const PREVIEW_LAYER_ASSETS = {
  background: "/assets/dummy/test-layer/background.png",
  clouds: "/assets/dummy/test-layer/clouds.png",
  foreground: "/assets/dummy/test-layer/foreground.png",
  horizon: "/assets/dummy/test-layer/horizon.png",
  mountains: "/assets/dummy/test-layer/mountains.png",
  scene: "/assets/dummy/test-layer/scene.png",
  stars: "/assets/dummy/test-layer/stars.png",
  terrain: "/assets/dummy/test-layer/terrain.png"
};

const LAYER_DEFAULTS = {
  horizon: { zIndex: 1, depth: 0.01, parallaxFactor: 0.01, scaleBase: 1.02, offsetX: 0, offsetY: -12 },
  stars: { zIndex: 5, depth: 0.05, parallaxFactor: 0.05, scaleBase: 1, offsetX: 0, offsetY: -26 },
  mountains: { zIndex: 10, depth: 0.1, parallaxFactor: 0.1, scaleBase: 1.08, offsetX: 0, offsetY: 8 },
  clouds: { zIndex: 30, depth: 0.3, parallaxFactor: 0.3, scaleBase: 1.08, offsetX: 0, offsetY: -16 },
  terrain: { zIndex: 60, depth: 0.6, parallaxFactor: 0.6, scaleBase: 1.12, offsetX: 0, offsetY: 24 },
  background: { zIndex: 90, depth: 0.9, parallaxFactor: 0.9, scaleBase: 1.14, offsetX: 0, offsetY: 10 },
  scene: { zIndex: 100, depth: 1, parallaxFactor: 1, scaleBase: 1.18, offsetX: 0, offsetY: 34 },
  character: { zIndex: 105, depth: 1.05, parallaxFactor: 1, scaleBase: 1, offsetX: 0, offsetY: 38 },
  foreground: { zIndex: 110, depth: 1.1, parallaxFactor: 1.1, scaleBase: 1.24, offsetX: 0, offsetY: 48 },
  screen: { zIndex: 130, depth: 1.3, parallaxFactor: 1.3, scaleBase: 1, offsetX: 0, offsetY: 0 },
  lens: { zIndex: 180, depth: 1.8, parallaxFactor: 1.8, scaleBase: 1, offsetX: 0, offsetY: 0 }
};
const CHARACTER_DEPTH = LAYER_DEFAULTS.character.depth;
const LEGACY_LAYER_Z_INDEX = {
  horizon: 10,
  stars: 20,
  mountains: 30,
  clouds: 40,
  terrain: 50,
  background: 60,
  scene: 70,
  character: 75,
  foreground: 80,
  screen: 90,
  lens: 100
};

const getLayerZIndex = (layer = {}, fallback = 1) => {
  const layerId = String(layer.id || "");
  if (layerId === "scene") {
    return LAYER_DEFAULTS.scene.zIndex;
  }
  const configured = Number(layer.zIndex ?? layer.z);
  if (
    Number.isFinite(configured)
    && Object.prototype.hasOwnProperty.call(LAYER_DEFAULTS, layerId)
    && configured === LEGACY_LAYER_Z_INDEX[layerId]
  ) {
    return LAYER_DEFAULTS[layerId].zIndex;
  }
  if (Number.isFinite(configured)) {
    return configured;
  }
  return LAYER_DEFAULTS[layerId]?.zIndex ?? fallback;
};

const normalizeViewportName = (viewport) => {
  return VIEWPORTS.includes(viewport) ? viewport : "desktop";
};

const normalizeViewportTransform = (layer, viewport, patch = {}) => {
  const isCharacterLayer = layer.id === "character";
  const baseX = Number(layer.offsetX ?? 0);
  const baseY = Number(layer.offsetY ?? 0);
  const baseScale = Number(layer.scaleBase ?? 1);
  const fallbackX = isCharacterLayer ? 0 : 50 + ((baseX / LEGACY_TRANSFORM_BASE.x) * 50);
  const fallback = viewport === "mobile"
    ? { x: fallbackX, y: baseY, z: 0, scale: baseScale }
    : { x: fallbackX, y: baseY, z: 0, scale: baseScale };

  const usesPercent = patch.unit === "percent";
  const usesAssetPercentX = patch.xMode === "asset" || patch.unit === "asset-percent";
  const normalizeX = () => {
    const rawValue = Number(patch.x ?? fallback.x);
    if (isCharacterLayer) {
      const migratedValue = patch.xMode === "scene-offset"
        ? rawValue
        : (rawValue === 50 ? 0 : rawValue);
      return Number(clamp(migratedValue, -1200, 1200).toFixed(2));
    }

    if (usesAssetPercentX) {
      return Number(clamp(rawValue, 0, 100).toFixed(2));
    }

    const percentValue = usesPercent
      ? rawValue
      : (rawValue / LEGACY_TRANSFORM_BASE.x) * 100;

    return Number(clamp(50 + (percentValue / 2), 0, 100).toFixed(2));
  };
  const normalizeAxis = (axis, min, max) => {
    const rawValue = Number(patch[axis] ?? fallback[axis]);
    const percentValue = usesPercent
      ? rawValue
      : (rawValue / LEGACY_TRANSFORM_BASE[axis]) * 100;

    return Number(clamp(percentValue, min, max).toFixed(2));
  };

  return {
    unit: "percent",
    xMode: isCharacterLayer ? "scene-offset" : "asset",
    x: normalizeX(),
    y: normalizeAxis("y", isCharacterLayer ? -250 : -120, isCharacterLayer ? 250 : 120),
    z: normalizeAxis("z", -25, 25),
    scale: clamp(Number(patch.scale ?? fallback.scale), 0.35, 5)
  };
};

const normalizePerspective = (scene = {}) => {
  const rawValue = Number(scene.perspective ?? 1200);
  const isLegacyPixelValue = rawValue > 300;
  const percentValue = scene.perspectiveUnit === "percent" && !isLegacyPixelValue
    ? rawValue
    : (rawValue / VIEWPORT_BASE_SIZE.desktop.width) * 100;

  return clampPercent(percentValue, 0, 300);
};

const normalizeCamera = (scene = {}) => {
  const camera = scene.camera || {};
  const usesPercent = camera.unit === "percent" || scene.cameraUnit === "percent";
  const rawX = Number(camera.x || 0);
  const rawY = Number(camera.y || 0);
  const xLooksLegacy = Math.abs(rawX) > 50;
  const yLooksLegacy = Math.abs(rawY) > 50;
  const x = usesPercent && !xLooksLegacy ? rawX : (rawX / VIEWPORT_BASE_SIZE.desktop.width) * 100;
  const y = usesPercent && !yLooksLegacy ? rawY : (rawY / VIEWPORT_BASE_SIZE.desktop.height) * 100;

  return {
    unit: "percent",
    x: clampPercent(x, -50, 50),
    y: clampPercent(y, -50, 50)
  };
};

const normalizeViewportPov = (scene = {}, viewport = "desktop") => {
  const source = scene.viewports?.[viewport] || (viewport === "desktop" ? scene : scene.viewports?.desktop || scene);
  return {
    perspectiveUnit: "percent",
    perspective: normalizePerspective(source),
    camera: normalizeCamera(source)
  };
};

const normalizeCharacterBounds = (bounds = {}, viewport = "desktop", viewportOverrides = {}) => {
  const legacyBounds = bounds && typeof bounds === "object" ? bounds : {};
  const rawViewports = {
    ...(legacyBounds.viewports && typeof legacyBounds.viewports === "object" ? legacyBounds.viewports : {}),
    ...(viewportOverrides && typeof viewportOverrides === "object" ? viewportOverrides : {})
  };
  const normalizeBounds = (source = {}, fallback = {}) => {
    return {
      x: Number(source.x ?? fallback.x ?? legacyBounds.x ?? 0),
      y: Number(source.y ?? fallback.y ?? legacyBounds.y ?? 0),
      scale: Number(source.scale ?? fallback.scale ?? legacyBounds.scale ?? 1),
      scaleX: Number(source.scaleX ?? fallback.scaleX ?? source.scale ?? fallback.scale ?? legacyBounds.scaleX ?? legacyBounds.scale ?? 1),
      scaleY: Number(source.scaleY ?? fallback.scaleY ?? source.scale ?? fallback.scale ?? legacyBounds.scaleY ?? legacyBounds.scale ?? 1),
      thickness: getBoundsThickness(source, fallback.thickness ?? legacyBounds.thickness ?? 4)
    };
  };
  const desktop = normalizeBounds(rawViewports.desktop, legacyBounds);
  const mobile = normalizeBounds(rawViewports.mobile, desktop);
  const viewports = { desktop, mobile };
  const activeViewport = normalizeViewportName(viewport);

  return {
    active: viewports[activeViewport] || desktop,
    viewports
  };
};

const toLabel = (id) => {
  return id.charAt(0).toUpperCase() + id.slice(1);
};

const escapeHtml = (value) => {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
};

const safeClassId = (value, fallback = "item") => {
  return String(value || "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || fallback;
};

const hexToRgba = (value, opacity = 1) => {
  const hex = String(value || "").replace("#", "").trim();
  const normalized = hex.length === 3
    ? hex.split("").map((char) => `${char}${char}`).join("")
    : hex;
  const parsed = Number.parseInt(normalized || "071017", 16);
  const r = (parsed >> 16) & 255;
  const g = (parsed >> 8) & 255;
  const b = parsed & 255;
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, Number(opacity)))})`;
};

const normalizeRunnerSettings = (runner = {}) => {
  const minObjectDistancePs = Math.max(0.5, Number(runner.minObjectDistancePs ?? runner.spawnMinDistancePixsecs ?? PREVIEW_SPAWN_MIN_GAP_SECONDS));
  const speedCoefficient = Math.max(0.1, Number(runner.speedCoefficient ?? 1.2));
  const desktopLevelSpeed = Math.max(0.1, Number(runner.desktopLevelSpeed ?? speedCoefficient));
  const mobileLevelSpeed = Math.max(0.1, Number(runner.mobileLevelSpeed ?? speedCoefficient ?? desktopLevelSpeed));
  return {
    speedCoefficient: desktopLevelSpeed,
    desktopLevelSpeed,
    mobileLevelSpeed,
    incrementalSpeed: Boolean(runner.incrementalSpeed),
    maxSpeedCoefficient: Number(runner.maxSpeedCoefficient ?? Math.max(desktopLevelSpeed, mobileLevelSpeed)),
    worldScrollSpeed: Number(runner.worldScrollSpeed ?? 420),
    durationPs: Math.max(5, Number(runner.durationPs ?? PREVIEW_SPAWN_PLAN_SECONDS)),
    preGamePs: Math.max(0, Number(runner.preGamePs ?? PREVIEW_SPAWN_PREROLL_SECONDS)),
    postGamePs: Math.max(0, Number(runner.postGamePs ?? 0)),
    minObjectDistancePs,
    spawnMinDistancePixsecs: minObjectDistancePs,
    paintSeed: String(runner.paintSeed || ""),
    backgroundParallaxSpeed: "native",
    foregroundParallaxSpeed: "native",
    renderer: {
      desktop: runner.renderer?.desktop === "strip" ? "striped" : (runner.renderer?.desktop || "windowed"),
      mobile: runner.renderer?.mobile === "strip" ? "striped" : (runner.renderer?.mobile || "windowed")
    }
  };
};

const getRunnerSpeed = (layer, transform = {}, runner = {}, viewport = "desktop") => {
  const runnerSettings = normalizeRunnerSettings(runner);
  const baseline = Math.max(120, runnerSettings.worldScrollSpeed);
  const levelSpeed = levelSpeedForViewport(runnerSettings, viewport);
  const zIndex = getLayerZIndex(layer, 35);
  const coefficient = clamp(Number.isFinite(zIndex) ? zIndex / 100 : 0.35, 0, 3);
  return Number((baseline * levelSpeed * coefficient).toFixed(2));
};

const getCharacterSpeedMultiplier = (action = {}) => {
  const speedProfile = String(action?.speedProfile || "1x").toLowerCase();
  if (Object.prototype.hasOwnProperty.call(CHARACTER_SPEED_MULTIPLIERS, speedProfile)) {
    return CHARACTER_SPEED_MULTIPLIERS[speedProfile];
  }

  const numeric = Number(speedProfile.replace("x", ""));
  return Number.isFinite(numeric) ? Math.max(0, numeric) : 1;
};

const getOddTileCount = (value) => {
  const rounded = Math.ceil(Number(value) || PREVIEW_SEQUENCE_MIN_TILE_COUNT);
  return rounded % 2 === 0 ? rounded + 1 : rounded;
};

const getPreviewSequenceTileCount = (previewWidth, tileStride, assetRelativeX = 0) => {
  const safeStride = Math.max(1, Number(tileStride || previewWidth || 1));
  const placementTravel = Math.abs(Number(assetRelativeX || 0)) * 2;
  const coverageWidth = Math.max(1, Number(previewWidth || 1)) + placementTravel + (safeStride * 2);
  const proportionalCount = Math.ceil(coverageWidth / safeStride) + 4;
  return clamp(getOddTileCount(proportionalCount), PREVIEW_SEQUENCE_MIN_TILE_COUNT, PREVIEW_SEQUENCE_MAX_TILE_COUNT);
};

const getGameCanvasMetrics = (containerNode, viewport = "desktop") => {
  const mode = normalizeViewportName(viewport);
  const maxSize = GAME_CANVAS_MAX_SIZE[mode] || GAME_CANVAS_MAX_SIZE.desktop;

  return {
    width: Number(maxSize.width.toFixed(2)),
    height: Number(maxSize.height.toFixed(2)),
    maxWidth: maxSize.width,
    maxHeight: maxSize.height,
    scale: 1
  };
};

const getGameCanvasRect = (containerNode, viewport = "desktop") => {
  const rect = containerNode?.getBoundingClientRect?.();
  const metrics = getGameCanvasMetrics(containerNode, viewport);
  if (!rect) {
    return {
      left: 0,
      right: metrics.width,
      top: 0,
      bottom: metrics.height,
      width: metrics.width,
      height: metrics.height
    };
  }

  const width = Math.min(metrics.width, rect.width || metrics.width);
  const height = Math.min(metrics.height, rect.height || metrics.height);
  const left = rect.left + Math.max(0, ((rect.width || width) - width) / 2);
  const top = rect.top + Math.max(0, ((rect.height || height) - height) / 2);

  return {
    left,
    right: left + width,
    top,
    bottom: top + height,
    width,
    height
  };
};

const rectIntersectsCanvas = (rect, canvasRect) => {
  return Boolean(rect && canvasRect)
    && rect.width > 1
    && rect.height > 1
    && rect.right >= canvasRect.left
    && rect.left <= canvasRect.right
    && rect.bottom >= canvasRect.top
    && rect.top <= canvasRect.bottom;
};

const getPreviewTileIndexes = (count = PREVIEW_SEQUENCE_MIN_TILE_COUNT) => {
  const centerIndex = Math.floor(count / 2);
  return Array.from({ length: count }, (_, index) => {
    return index - centerIndex;
  });
};

const getPreviewRunnerTileIndexes = (count = PREVIEW_SEQUENCE_MIN_TILE_COUNT) => {
  const safeCount = Math.max(PREVIEW_SEQUENCE_MIN_TILE_COUNT, Number(count) || PREVIEW_SEQUENCE_MIN_TILE_COUNT);
  return Array.from({ length: safeCount }, (_, index) => {
    return index - 2;
  });
};

const getPreviewTrackTiles = (trackNode) => {
  if (!trackNode) {
    return [];
  }
  return [...trackNode.children].filter((node) => node.matches?.(PREVIEW_SCENE_TILE_SELECTOR));
};

const detachTrackCharacterAnchors = (trackNode) => {
  const parent = trackNode?.parentElement;
  if (!parent) {
    return;
  }
  trackNode.querySelectorAll(".tester-preview__character-anchor").forEach((characterNode) => {
    parent.append(characterNode);
  });
};

const cloneSceneLevelForStorage = (scene = {}) => {
  const clone = JSON.parse(JSON.stringify(scene || {}));
  delete clone.levels;
  return clone;
};

const hashString = (value = "") => {
  let hash = 2166136261;
  for (const char of String(value)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const createSeededRandom = (seedValue = "") => {
  let state = hashString(seedValue) || 1;
  return () => {
    state = Math.imul(1664525, state) + 1013904223;
    return (state >>> 0) / 4294967296;
  };
};

const shuffleWithRandom = (items = [], random = Math.random) => {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]];
  }
  return shuffled;
};

const getSpawnRandomnessProfile = (value) => {
  const normalized = String(value || "regular").toLowerCase();
  const profiles = {
    never: { count: 0, jitter: 0, weight: 0 },
    rare: { count: 1, jitter: 0.42, weight: 0.18 },
    regular: { count: 2, jitter: 0.34, weight: 0.36 },
    frequent: { count: 4, jitter: 0.28, weight: 0.64 },
    "very-frequent": { count: 7, jitter: 0.22, weight: 0.92 }
  };
  return profiles[normalized] || profiles.regular;
};

const syncPreviewTrackTileCount = (trackNode, tileCount, tileIndexes = getPreviewTileIndexes(tileCount)) => {
  if (!trackNode || tileCount < 1) {
    return;
  }

  const currentTiles = getPreviewTrackTiles(trackNode);
  const currentKey = currentTiles.map((tile) => tile.dataset.previewTileIndex || "0").join(",");
  const nextKey = tileIndexes.join(",");
  if (currentTiles.length === tileIndexes.length && currentKey === nextKey) {
    return;
  }

  const sourceTile = currentTiles.find((tile) => tile.dataset.sceneReplacement !== "hollow") || currentTiles[0];
  if (!sourceTile) {
    return;
  }

  const fragment = document.createDocumentFragment();
  tileIndexes.forEach((tileIndex) => {
    const tile = sourceTile.cloneNode(false);
    if (tile.dataset.normalSrc) {
      tile.src = tile.dataset.normalSrc;
    }
    tile.classList.remove("tester-preview__scene-module--hollow");
    tile.classList.add("tester-preview__scene-module");
    tile.dataset.previewTileIndex = String(tileIndex);
    tile.dataset.sceneReplacement = "false";
    tile.dataset.spawnEventId = "";
    tile.dataset.triggerEvent = "";
    tile.dataset.triggerAction = "";
    tile.dataset.triggerOutcome = "";
    tile.classList.remove("is-scene-hollow-replacement");
    fragment.append(tile);
  });
  const spawnPlane = trackNode.querySelector(":scope > .tester-preview__spawn-plane");
  if (spawnPlane) {
    fragment.append(spawnPlane);
  } else {
    trackNode.querySelectorAll(":scope > .tester-preview__spawn-object").forEach((objectNode) => {
      fragment.append(objectNode);
    });
  }
  detachTrackCharacterAnchors(trackNode);
  trackNode.replaceChildren(fragment);
  delete trackNode.dataset.sceneCompositionKey;
  trackNode.parentElement?.setAttribute("data-preview-tile-count", String(tileIndexes.length));
};

const getPreviewAssetLocalSize = (assetNode, visualNode, fallbackWidth = 1, fallbackHeight = 1) => {
  const naturalWidth = Number(assetNode?.naturalWidth || 0);
  const naturalHeight = Number(assetNode?.naturalHeight || 0);
  if (naturalWidth > 0 && naturalHeight > 0) {
    return {
      width: Math.max(1, naturalWidth),
      height: Math.max(1, naturalHeight)
    };
  }

  const rect = assetNode?.getBoundingClientRect?.();
  const visualRect = visualNode?.getBoundingClientRect?.();
  return {
    width: Math.max(1, Number(rect?.width || 0), Number(visualRect?.width || 0), Number(fallbackWidth || 1)),
    height: Math.max(1, Number(rect?.height || 0), Number(visualRect?.height || 0), Number(fallbackHeight || 1))
  };
};

const DEFAULT_PREVIEW_CHARACTER_ACTIONS = {
  idle: {
    label: "Idle",
    src: "/assets/dummy/character/Idle.png",
    fps: 8,
    loop: true,
    returnTo: "none",
    enabled: true,
    frameWidth: 128,
    frameHeight: 128,
    frameCount: 6
  },
  run: {
    label: "Run",
    src: "/assets/dummy/character/Run.png",
    fps: 12,
    loop: true,
    returnTo: "none",
    enabled: true,
    frameWidth: 128,
    frameHeight: 128,
    frameCount: 8
  }
};

const normalizePreviewCharacterAction = (id, action = {}) => {
  const fallback = DEFAULT_PREVIEW_CHARACTER_ACTIONS[id] || DEFAULT_PREVIEW_CHARACTER_ACTIONS.idle;
  const frameCount = Math.max(1, Number(action.frameCount ?? fallback.frameCount ?? 1));
  const fps = Math.max(1, Number(action.fps ?? fallback.fps ?? 10));
  return {
    ...fallback,
    ...action,
    id,
    fps,
    returnTo: isDeathActionId(id)
      ? "none"
      : (action.returnTo ?? fallback.returnTo ?? ((action.loop ?? fallback.loop ?? true) ? "none" : "previous")),
    frameWidth: Math.max(1, Number(action.frameWidth ?? fallback.frameWidth ?? 128)),
    frameHeight: Math.max(1, Number(action.frameHeight ?? fallback.frameHeight ?? 128)),
    frameCount,
    loop: isDeathActionId(id) ? false : (action.loop ?? fallback.loop ?? true),
    enabled: action.enabled ?? fallback.enabled ?? true,
    src: action.src || fallback.src || DEFAULT_PREVIEW_CHARACTER_ACTIONS.idle.src
  };
};

const defaultLayer = (id) => {
  const base = LAYER_DEFAULTS[id] || {};
  const layer = {
    id,
    label: toLabel(id),
    zIndex: base.zIndex ?? 10,
    depth: base.depth ?? 0.5,
    parallaxFactor: base.parallaxFactor ?? 0.3,
    scaleBase: base.scaleBase ?? 1,
    offsetX: base.offsetX ?? 0,
    offsetY: base.offsetY ?? 0
  };

  return {
    ...layer,
    viewports: {
      desktop: normalizeViewportTransform(layer, "desktop"),
      mobile: normalizeViewportTransform(layer, "mobile")
    }
  };
};

const cloneLayer = (layer) => {
  return {
    ...layer,
    viewports: {
      desktop: { ...(layer.viewports?.desktop || {}) },
      mobile: { ...(layer.viewports?.mobile || {}) }
    }
  };
};

const normalizeLayer = (id, current = {}) => {
  const base = {
    ...defaultLayer(id),
    ...(current || {})
  };

  return {
    ...base,
    label: base.label || "",
    assetRef: base.assetRef || "",
    src: base.src || "",
    pattern: base.pattern || "none",
    animated: Boolean(base.animated),
    speedMultiplier: Number(base.speedMultiplier ?? 1),
    viewports: {
      desktop: normalizeViewportTransform(base, "desktop", base.viewports?.desktop),
      mobile: normalizeViewportTransform(base, "mobile", base.viewports?.mobile)
    }
  };
};

const migrateSelectedLayerIds = (ids) => {
  const migrated = ids.slice();
  if (!migrated.includes("scene")) {
    const foregroundIndex = migrated.indexOf("foreground");
    migrated.splice(foregroundIndex >= 0 ? foregroundIndex : migrated.length, 0, "scene");
  }
  if (
    !migrated.includes("character")
    && migrated.includes("scene")
    && migrated.includes("foreground")
  ) {
    migrated.splice(migrated.indexOf("foreground"), 0, "character");
  }

  return migrated;
};

const normalizeScene = (scene = {}) => {
  const hasSelectedLayerIds = Array.isArray(scene.selectedLayerIds);
  const requestedIds = hasSelectedLayerIds
    ? migrateSelectedLayerIds(scene.selectedLayerIds.filter((id) => AVAILABLE_LAYERS.includes(id)))
    : AVAILABLE_LAYERS.slice(0, 4);

  const selectedLayerIds = requestedIds.slice(0, AVAILABLE_LAYERS.length);

  if (!selectedLayerIds.includes("scene")) {
    selectedLayerIds.push("scene");
  }

  const count = clamp(selectedLayerIds.length || 1, 1, AVAILABLE_LAYERS.length);
  const layers = AVAILABLE_LAYERS.map((id) => {
    const current = scene.layers?.find((entry) => entry.id === id);
    return normalizeLayer(id, current);
  });
  const viewport = normalizeViewportName(scene.viewport);
  const viewports = {
    desktop: normalizeViewportPov(scene, "desktop"),
    mobile: normalizeViewportPov(scene, "mobile")
  };
  const activePov = viewports[viewport] || viewports.desktop;
  const characterBounds = normalizeCharacterBounds(
    scene.characterBounds,
    viewport,
    scene.characterBoundsViewports
  );
  const background = scene.background || {};
  const runner = normalizeRunnerSettings(scene.runner || {});

  return {
    availableLayerIds: AVAILABLE_LAYERS,
    levelId: scene.levelId || "",
    levels: scene.levels || {},
    background: {
      type: background.type || "gradient",
      color: background.color || "#071017",
      from: background.from || "#102d29",
      to: background.to || "#071110",
      angle: Number(background.angle ?? 180),
      opacity: Number(background.opacity ?? 1),
      assetRef: background.assetRef || "",
      src: background.src || ""
    },
    runner,
    viewport,
    usePerspective: scene.usePerspective !== false,
    perspectiveUnit: activePov.perspectiveUnit,
    perspective: activePov.perspective,
    layerCount: count,
    selectedLayerIds,
    camera: activePov.camera,
    viewports,
    layers,
    boundingBox: {
      showAlways: Boolean(scene.boundingBox?.showAlways),
      selectedKey: scene.boundingBox?.selectedKey || "character"
    },
    characterBounds: characterBounds.active,
    characterBoundsViewports: characterBounds.viewports,
    spawnObjects: scene.spawnObjects && typeof scene.spawnObjects === "object"
      ? scene.spawnObjects
      : {}
  };
};

export default class LayerManager {
  constructor(context) {
    this.context = context;
    this.scene = normalizeScene();
    this.previewNode = null;
    this.previewResizeObserver = null;
    this.previewResizeFrameId = 0;
    this.previewCanvasMetricsKey = "";
    this.previewRenderSequence = 0;
    this.runnerFrameId = null;
    this.previewHudTimerId = null;
    this.runnerPlaying = false;
    this.runnerMode = "js";
    this.runnerStartedAt = 0;
    this.boundRunnerTick = this.tickRunnerPreview.bind(this);
    this.previewCharacterActionId = "";
    this.previewCharacterBaseActionId = "";
    this.previewCharacterPreviousActionId = "";
    this.previewCharacterReturnTimer = null;
    this.previewCharacterActionStartedAt = 0;
    this.previewCharacterActionDurationMs = 0;
    this.previewCharacterActionInputLockedUntil = 0;
    this.characterFallStartedAt = 0;
    this.previewCharacterAirborneUntil = 0;
    this.runnerStopStartedAt = 0;
    this.runnerStopElapsedAt = 0;
    this.runnerStopSpeedMultiplier = 1;
    this.runnerDistanceSeconds = 0;
    this.runnerDistanceLastTimestamp = 0;
    this.runnerElapsedTimestamp = 0;
    this.runnerElapsedValue = 0;
    this.runnerSpeedMultiplier = 0;
    this.runnerSpeedTransition = null;
    this.runnerGameOver = false;
    this.runnerGameOverTrigger = null;
    this.runnerGameOverEventEmitted = false;
    this.runnerComplete = false;
    this.spawnPlan = [];
    this.spawnPlanById = new Map();
    this.spawnCollisionMap = [];
    this.spawnPlanSeed = "";
    this.runnerRuntimePaintSeed = "";
    this.collectedSpawnIds = new Set();
    this.revealedTextBonusIds = new Set();
    this.previewAssetSizeCache = new Map();
    this.previewAssetSizePending = new Map();
    this.textBonusWordListCache = new Map();
    this.textBonusWordListPending = new Set();
    this.textBonusWordOrderCache = new Map();
    this.textBonusRunSeed = "";
    this.textBonusOverlayIndex = 0;
    this.assetRelativeLayerOffsetsLoadFrameId = 0;
    this.assetRelativeLayerOffsetsLoadApplied = false;
    this.layerStore = new Map();
    this.rememberLayers(AVAILABLE_LAYERS.map((id) => defaultLayer(id)));
    this.rememberLayers(this.scene.layers);
  }

  start() {
    const storedScene = this.context.db?.get("location.scene", {});
    const activeLevelId = storedScene.levelId || "";
    const activeLevelScene = activeLevelId && storedScene.levels?.[activeLevelId]
      ? storedScene.levels[activeLevelId]
      : null;
    const scene = activeLevelScene
      ? {
        ...storedScene,
        ...activeLevelScene,
        levelId: activeLevelId,
        levels: storedScene.levels
      }
      : storedScene;
    this.scene = normalizeScene(scene);
    this.rememberLayers(scene.layers || []);
    this.rememberLayers(this.scene.layers);
    this.context.events.emit("location:ready", { scene: this.scene });
  }

  getScene() {
    return this.scene;
  }

  getIrgContract() {
    const physics = this.context.db?.get("physics", {}) || {};
    const stored = this.context.db?.get("gameplay.irg", {}) || {};
    const contract = normalizeIrgContract(stored, {
      scene: this.scene,
      physics,
      fallbackLevelId: this.scene.levelId || "level-1"
    });
    if (this.previewCanvasRuntime && this.scene.levelId && contract.levels?.[this.scene.levelId]) {
      return {
        ...contract,
        activeLevelId: this.scene.levelId
      };
    }
    return contract;
  }

  getIrgLevel() {
    const contract = this.getIrgContract();
    return contract.levels[contract.activeLevelId];
  }

  getLayoutPreviewHudConfig() {
    const design = this.context.db?.get("authoring.design", {}) || {};
    const uiElements = design.uiElements && typeof design.uiElements === "object" ? design.uiElements : {};
    const level = this.getIrgLevel() || {};
    const hud = level.hud || {};

    return {
      hud,
      elements: Object.entries(uiElements)
        .filter(([, element]) => element && typeof element === "object" && element.enabled)
        .map(([id, element]) => [id, element])
    };
  }

  getHudPlacementForElement(element = {}) {
    const x = clamp(Number(element.x ?? 50), 0, 100);
    const y = clamp(Number(element.y ?? 50), 0, 100);
    const area = x < 33.34 ? "left" : x > 66.66 ? "right" : "center";

    if (y <= 24) {
      return { zone: "header", area, x, y };
    }

    if (y >= 76) {
      return { zone: "footer", area, x, y };
    }

    return { zone: "game", x, y };
  }

  getHudAreaDirection(hud = {}, zone = "header", area = "center", items = []) {
    if (zone === "header" && area === "center" && items.some((item) => (
      item.includes("screen__hud-item--lives") || item.includes("screen__hud-item--time")
    ))) {
      return "column";
    }

    return normalizeHudFlexDirection(
      hud?.zones?.[zone]?.areas?.[area]?.direction
        || hud?.zones?.[zone]?.direction
        || "row"
    );
  }

  renderLayoutPreviewHudElementContent(elementId = "", label = "") {
    const safeId = safeClassId(elementId);
    if (safeId === "lives") {
      const total = Math.max(1, Math.round(Number(this.context.db?.get("rules.lives", 3) || 3)));
      const filled = clamp(total - 1, 0, total);
      const hearts = Array.from({ length: total }, (_, index) => {
        const state = index < filled ? "filled" : "empty";
        return `<span class="screen__hud-life" data-hud-life data-state="${state}"></span>`;
      }).join("");

      return `
        <span class="screen__hud-lives" data-hud-lives aria-hidden="true">${hearts}</span>
        <span class="screen__hud-text">${escapeHtml(label)}</span>
      `;
    }

    if (safeId === "time") {
      const duration = Math.max(1, Math.round(Number(this.getIrgLevel()?.durationPs || 30)));
      return `
        <span class="screen__hud-timeline" data-hud-timeline aria-hidden="true"></span>
        <span class="screen__hud-time-value" data-hud-time-value>${duration}s</span>
      `;
    }

    return escapeHtml(label);
  }

  renderLayoutPreviewHudItem(elementId = "", element = {}, placement = {}) {
    const label = element.label || toLabel(String(elementId || "item"));
    const safeId = safeClassId(elementId);
    const isVisualHudElement = ["lives", "time"].includes(safeId);
    const scale = Number.isFinite(Number(element.size)) ? Number(element.size) : 1;
    const z = Number.isFinite(Number(element.z)) ? Number(element.z) : 20;
    const positionStyle = placement.zone === "game"
      ? `left:${Number(placement.x).toFixed(2)}%; top:${Number(placement.y).toFixed(2)}%; --preview-hud-item-scale:${Number(scale).toFixed(3)}; z-index:${z};`
      : `--preview-hud-item-scale:${Number(scale).toFixed(3)}; z-index:${z};`;

    return `
      <span
        class="tester-preview__hud-item tester-preview__hud-item--${escapeHtml(safeId)}${isVisualHudElement ? ` screen__hud-item screen__hud-item--${escapeHtml(safeId)}` : ""}"
        data-hud-element="${escapeHtml(elementId)}"
        data-hud-zone="${escapeHtml(placement.zone)}"
        ${placement.area ? `data-hud-area="${escapeHtml(placement.area)}"` : ""}
        style="${positionStyle}"
      >
        ${this.renderLayoutPreviewHudElementContent(safeId, label)}
      </span>
    `;
  }

  renderLayoutPreviewHud() {
    const { hud, elements } = this.getLayoutPreviewHudConfig();
    if (!elements.length) {
      return "";
    }

    const slots = {
      header: { left: [], center: [], right: [] },
      footer: { left: [], center: [], right: [] },
      game: []
    };

    elements.forEach(([elementId, element]) => {
      const placement = this.getHudPlacementForElement(element);
      const itemMarkup = this.renderLayoutPreviewHudItem(elementId, element, placement);
      if ((placement.zone === "header" || placement.zone === "footer") && placement.area) {
        slots[placement.zone][placement.area].push(itemMarkup);
        return;
      }
      slots.game.push(itemMarkup);
    });

    const renderArea = (zone, area) => {
      const items = slots[zone][area];
      const direction = this.getHudAreaDirection(hud, zone, area, items);
      return `
        <div class="tester-preview__hud-area tester-preview__hud-area--${escapeHtml(zone)}-${escapeHtml(area)} tester-preview__hud-area--${escapeHtml(area)} tester-preview__hud-area--${escapeHtml(direction)}" data-hud-zone="${escapeHtml(zone)}" data-hud-area="${escapeHtml(area)}" data-hud-area-direction="${escapeHtml(direction)}">
          ${items.join("")}
        </div>
      `;
    };
    const renderZone = (zone) => `
      <div class="tester-preview__hud-zone tester-preview__hud-zone--${escapeHtml(zone)}">
        ${HUD_AREA_IDS.map((area) => renderArea(zone, area)).join("")}
      </div>
    `;
    const hudMode = normalizeHudLayoutMode(hud.mode);

    return `
      <div class="tester-preview__hud tester-preview__hud--${escapeHtml(hudMode)}" data-layout-preview-hud data-hud-mode="${escapeHtml(hudMode)}">
        ${renderZone("header")}
        <div class="tester-preview__hud-game">${slots.game.join("")}</div>
        ${renderZone("footer")}
      </div>
    `;
  }

  getLayoutPreviewHudTiming(timestamp = performance.now()) {
    const level = this.getIrgLevel() || {};
    const durationPs = Math.max(1, Number(level.durationPs || 30));
    const preGamePs = Math.max(0, Number(level.preGamePs || 0));
    const elapsed = this.runnerPlaying || this.runnerGameOver || this.runnerComplete
      ? this.getRunnerElapsed(timestamp)
      : 0;
    const phase = !this.runnerPlaying && !this.runnerGameOver && !this.runnerComplete
      ? "idle"
      : (this.runnerPlaying && elapsed < preGamePs ? "pregame" : "game");
    const elapsedGame = clamp(elapsed - preGamePs, 0, durationPs);
    const remaining = Math.max(0, durationPs - elapsedGame);
    const progress = phase === "idle" || phase === "pregame"
      ? 100
      : clamp((remaining / durationPs) * 100, 0, 100);
    const countdownVisible = phase === "game";

    return {
      phase,
      progress,
      countdownVisible,
      label: `${Math.max(0, Math.ceil(countdownVisible ? remaining : durationPs))}s`
    };
  }

  updateLayoutPreviewHudTiming(timestamp = performance.now()) {
    if (!this.previewNode) {
      return;
    }

    const timing = this.getLayoutPreviewHudTiming(timestamp);
    this.previewNode.querySelectorAll('[data-hud-element="time"]').forEach((node) => {
      node.style.setProperty("--hud-time-progress", `${Number(timing.progress.toFixed(2))}%`);
      node.style.setProperty("--hud-time-value-opacity", timing.countdownVisible ? "1" : "0");
      node.style.setProperty("--tester-preview-hud-time-progress", `${Number(timing.progress.toFixed(2))}%`);
      node.style.setProperty("--tester-preview-hud-time-value-opacity", timing.countdownVisible ? "1" : "0");
      node.dataset.hudTimePhase = timing.phase;
      const valueNode = node.querySelector("[data-hud-time-value]");
      if (valueNode) {
        valueNode.textContent = timing.label;
      }
    });
  }

  startPreviewHudTimer() {
    this.stopPreviewHudTimer();
    this.updateLayoutPreviewHudTiming(performance.now());
    this.previewHudTimerId = window.setInterval(() => {
      this.updateLayoutPreviewHudTiming(performance.now());
      if (!this.runnerPlaying && !this.runnerGameOver) {
        this.stopPreviewHudTimer();
      }
    }, 250);
  }

  stopPreviewHudTimer() {
    if (!this.previewHudTimerId) {
      return;
    }

    window.clearInterval(this.previewHudTimerId);
    this.previewHudTimerId = null;
  }

  getPersistableScene(scene = this.scene) {
    const storedScene = this.context.db?.get("location.scene", {}) || {};
    const storedLevels = storedScene.levels && typeof storedScene.levels === "object" ? storedScene.levels : {};
    const sceneLevels = scene.levels && typeof scene.levels === "object" ? scene.levels : {};
    const levels = {};
    [...new Set([...Object.keys(storedLevels), ...Object.keys(sceneLevels)])].forEach((storedLevelId) => {
      levels[storedLevelId] = {
        ...cloneSceneLevelForStorage(sceneLevels[storedLevelId] || storedLevels[storedLevelId] || {}),
        levelId: storedLevelId
      };
    });

    const levelId = scene.levelId || "";
    if (levelId) {
      levels[levelId] = {
        ...cloneSceneLevelForStorage(scene),
        levelId
      };
    }

    return {
      ...cloneSceneLevelForStorage(scene),
      levels
    };
  }

  updateIrgLevel(patch = {}, options = {}) {
    const contract = this.getIrgContract();
    const levelId = options.levelId || contract.activeLevelId || this.scene.levelId || "level-1";
    const nextLevel = {
      ...(contract.levels[levelId] || {}),
      ...patch
    };
    const nextContract = {
      ...contract,
      activeLevelId: levelId,
      levels: {
        ...contract.levels,
        [levelId]: nextLevel
      }
    };
    this.context.db?.merge("gameplay", { irg: nextContract });
    this.scene = normalizeScene({
      ...this.scene,
      levelId,
      runner: {
        ...(this.scene.runner || {}),
        desktopLevelSpeed: nextLevel.desktopLevelSpeed,
        mobileLevelSpeed: nextLevel.mobileLevelSpeed,
        speedCoefficient: nextLevel.speedCoefficient,
        incrementalSpeed: nextLevel.incrementalSpeed,
        maxSpeedCoefficient: nextLevel.maxSpeedCoefficient,
        worldScrollSpeed: nextLevel.worldScrollSpeed,
        durationPs: nextLevel.durationPs,
        preGamePs: nextLevel.preGamePs,
        postGamePs: nextLevel.postGamePs,
        minObjectDistancePs: nextLevel.minObjectDistancePs,
        spawnMinDistancePixsecs: nextLevel.minObjectDistancePs,
        paintSeed: nextLevel.paintSeed,
        backgroundParallaxSpeed: nextLevel.backgroundParallaxSpeed,
        foregroundParallaxSpeed: nextLevel.foregroundParallaxSpeed,
        renderer: nextLevel.renderer || this.scene.runner?.renderer
      }
    });
    this.spawnPlan = [];
    this.spawnPlanById = new Map();
    this.spawnCollisionMap = [];
    this.sync({ renderLayerControls: options.renderLayerControls !== false });
    return nextLevel;
  }

  repaintInfiniteRunnerWorld(seed = createInfiniteRunnerPaintSeed(this.scene.levelId || "level")) {
    return this.updateIrgLevel({ paintSeed: seed }, { renderLayerControls: false });
  }

  prepareRunnerPreviewSession(seed = createInfiniteRunnerPaintSeed(this.scene.levelId || "preview")) {
    this.runnerRuntimePaintSeed = seed;
    this.textBonusRunSeed = seed;
    this.textBonusWordOrderCache.clear();
    this.spawnPlan = [];
    this.spawnPlanById = new Map();
    this.spawnCollisionMap = [];
    this.spawnPlanSeed = "";
    this.collectedSpawnIds.clear();
    this.revealedTextBonusIds.clear();
    this.textBonusOverlayIndex = 0;
    return seed;
  }

  rememberLayers(layers = []) {
    layers.forEach((layer) => {
      if (!layer?.id) {
        return;
      }

      this.layerStore.set(layer.id, cloneLayer(normalizeLayer(layer.id, layer)));
    });
  }

  getStoredLayers() {
    const activeLayers = new Map(this.scene.layers.map((layer) => [layer.id, layer]));
    return AVAILABLE_LAYERS.map((id) => {
      return cloneLayer(this.layerStore.get(id) || activeLayers.get(id) || defaultLayer(id));
    });
  }

  setSelectedLayers(ids = []) {
    this.rememberLayers(this.scene.layers);
    const nextIds = ids.filter((id) => AVAILABLE_LAYERS.includes(id)).slice(0, AVAILABLE_LAYERS.length);
    this.scene = normalizeScene({
      ...this.scene,
      selectedLayerIds: nextIds,
      layers: this.getStoredLayers()
    });
    this.rememberLayers(this.scene.layers);
    this.sync();
    return this.scene;
  }

  updateCamera(cameraPatch = {}) {
    const viewport = normalizeViewportName(cameraPatch.viewport || this.scene.viewport);
    const renderLayerControls = cameraPatch.renderLayerControls !== false;
    const { viewport: ignoredViewport, renderLayerControls: ignoredRenderLayerControls, ...nextCameraPatch } = cameraPatch;
    this.rememberLayers(this.scene.layers);
    const currentPov = this.scene.viewports?.[viewport] || normalizeViewportPov(this.scene, viewport);
    this.scene = normalizeScene({
      ...this.scene,
      viewports: {
        ...this.scene.viewports,
        [viewport]: {
          ...currentPov,
          camera: {
            ...currentPov.camera,
            unit: "percent",
            ...nextCameraPatch
          }
        }
      },
      layers: this.getStoredLayers()
    });
    this.sync({ renderLayerControls });
    return this.scene;
  }

  updateScene(scenePatch = {}) {
    this.rememberLayers(this.scene.layers);
    const renderLayerControls = scenePatch.renderLayerControls !== false;
    const renderPreview = scenePatch.renderPreview !== false;
    const hasPovPatch = Object.prototype.hasOwnProperty.call(scenePatch, "perspective")
      || Object.prototype.hasOwnProperty.call(scenePatch, "perspectiveUnit")
      || Object.prototype.hasOwnProperty.call(scenePatch, "camera");
    const viewport = normalizeViewportName(scenePatch.viewport || this.scene.viewport);
    const currentPov = this.scene.viewports?.[viewport] || normalizeViewportPov(this.scene, viewport);
    const nextPatch = { ...scenePatch };
    if (hasPovPatch) {
      delete nextPatch.perspective;
      delete nextPatch.perspectiveUnit;
      delete nextPatch.camera;
    }
    delete nextPatch.renderLayerControls;
    delete nextPatch.renderPreview;
    this.scene = normalizeScene({
      ...this.scene,
      ...nextPatch,
      viewports: hasPovPatch
        ? {
          ...this.scene.viewports,
          [viewport]: {
            ...currentPov,
            perspectiveUnit: "percent",
            perspective: scenePatch.perspective ?? currentPov.perspective,
            camera: scenePatch.camera
              ? { ...currentPov.camera, unit: "percent", ...scenePatch.camera }
              : currentPov.camera
          }
        }
        : this.scene.viewports,
      layers: scenePatch.layers || this.getStoredLayers()
    });
    this.sync({ renderLayerControls, renderPreview });
    return this.scene;
  }

  resetViewportPov(viewport) {
    const targetViewport = normalizeViewportName(viewport);
    this.rememberLayers(this.scene.layers);
    this.scene = normalizeScene({
      ...this.scene,
      viewports: {
        ...this.scene.viewports,
        [targetViewport]: {
          perspectiveUnit: "percent",
          perspective: 117.19,
          camera: { unit: "percent", x: 0, y: 0 }
        }
      },
      layers: this.getStoredLayers()
    });
    this.sync({ renderLayerControls: false });
    return this.scene;
  }

  updateLayerViewport(layerId, viewport, patch = {}) {
    const targetViewport = normalizeViewportName(viewport);
    this.rememberLayers(this.scene.layers);
    const nextLayers = this.getStoredLayers().map((layer) => {
      if (layer.id !== layerId) {
        return layer;
      }

      return {
        ...layer,
        viewports: {
          ...layer.viewports,
          [targetViewport]: {
            ...layer.viewports?.[targetViewport],
            ...patch
          }
        }
      };
    });

    this.scene = normalizeScene({
      ...this.scene,
      layers: nextLayers
    });
    this.rememberLayers(nextLayers);
    this.rememberLayers(this.scene.layers);
    this.sync({ renderLayerControls: false });
    return this.scene;
  }

  updateLayerAsset(layerId, patch = {}) {
    this.rememberLayers(this.scene.layers);
    const nextLayers = this.getStoredLayers().map((layer) => {
      if (layer.id !== layerId) {
        return layer;
      }

      return {
        ...layer,
        assetRef: patch.assetRef || "",
        src: patch.src || "",
        pattern: patch.pattern ?? layer.pattern ?? "none",
        animated: patch.animated ?? layer.animated ?? false
      };
    });

    this.scene = normalizeScene({
      ...this.scene,
      layers: nextLayers
    });
    this.rememberLayers(nextLayers);
    this.rememberLayers(this.scene.layers);
    this.sync({ renderLayerControls: false });
    return this.scene;
  }

  updateLayerSettings(layerId, patch = {}) {
    this.rememberLayers(this.scene.layers);
    const nextLayers = this.getStoredLayers().map((layer) => {
      if (layer.id !== layerId) {
        return layer;
      }

      return {
        ...layer,
        ...patch
      };
    });

    this.scene = normalizeScene({
      ...this.scene,
      layers: nextLayers
    });
    this.rememberLayers(nextLayers);
    this.rememberLayers(this.scene.layers);
    this.sync();
    return this.scene;
  }

  resetLayerViewport(layerId, viewport) {
    const targetViewport = normalizeViewportName(viewport);
    const defaultTransform = defaultLayer(layerId).viewports[targetViewport];
    return this.updateLayerViewport(layerId, targetViewport, defaultTransform);
  }

  resetAllLayerViewports(viewport) {
    const targetViewport = normalizeViewportName(viewport);
    this.rememberLayers(this.scene.layers);
    const nextLayers = this.getStoredLayers().map((layer) => ({
      ...layer,
      viewports: {
        ...layer.viewports,
        [targetViewport]: {
          ...defaultLayer(layer.id).viewports[targetViewport]
        }
      }
    }));

    this.scene = normalizeScene({
      ...this.scene,
      layers: nextLayers
    });
    this.rememberLayers(nextLayers);
    this.rememberLayers(this.scene.layers);
    this.sync();
    return this.scene;
  }

  mountPreview(node) {
    if (this.previewNode && this.previewNode !== node) {
      this.stopRunnerPreviewLoop();
    }
    this.previewNode = node;
    this.previewResizeObserver?.disconnect();
    if (this.previewResizeFrameId) {
      window.cancelAnimationFrame(this.previewResizeFrameId);
      this.previewResizeFrameId = 0;
    }
    if (this.previewNode && typeof ResizeObserver === "function") {
      this.previewResizeObserver = new ResizeObserver(() => {
        this.schedulePreviewResizeRender();
      });
      this.previewResizeObserver.observe(this.previewNode);
    }
    this.renderPreview();
    this.setRunnerPreviewPlaying(this.runnerPlaying);
  }

  getPreviewCanvasMetricsKey(metrics = {}) {
    return [
      Number(metrics.width || 0).toFixed(2),
      Number(metrics.height || 0).toFixed(2),
      Number(metrics.scale || 0).toFixed(4)
    ].join("x");
  }

  schedulePreviewResizeRender() {
    if (!this.previewNode) {
      return;
    }

    if (this.previewResizeFrameId) {
      window.cancelAnimationFrame(this.previewResizeFrameId);
    }

    this.previewResizeFrameId = window.requestAnimationFrame(() => {
      this.previewResizeFrameId = 0;
      if (!this.previewNode) {
        return;
      }

      const metrics = getGameCanvasMetrics(this.previewNode, this.scene.viewport);
      const metricsKey = this.getPreviewCanvasMetricsKey(metrics);
      if (metricsKey === this.previewCanvasMetricsKey) {
        return;
      }

      this.previewCanvasMetricsKey = metricsKey;
      this.previewNode.style.setProperty("--game-canvas-width", `${metrics.width}px`);
      this.previewNode.style.setProperty("--game-canvas-height", `${metrics.height}px`);
      this.previewNode.style.setProperty("--game-canvas-scale", String(metrics.scale));
      if (this.runnerPlaying || this.runnerGameOver || this.runnerComplete) {
        this.applyAssetRelativeLayerOffsets(performance.now());
        return;
      }

      if (!this.refreshPreviewLayout({ canvasMetrics: metrics })) {
        this.renderPreview({ canvasMetrics: metrics });
      }
    });
  }

  renderPreview(options = {}) {
    if (!this.previewNode) {
      return;
    }

    this.previewRenderSequence += 1;
    if (this.assetRelativeLayerOffsetsLoadFrameId) {
      window.cancelAnimationFrame(this.assetRelativeLayerOffsetsLoadFrameId);
      this.assetRelativeLayerOffsetsLoadFrameId = 0;
    }
    this.assetRelativeLayerOffsetsLoadApplied = false;

    const { perspective, usePerspective, camera, layers, selectedLayerIds, viewport, background } = this.scene;
    const stageClass = usePerspective ? " tester-preview__stage--perspective" : "";
    const visibleLayers = layers.filter((layer) => selectedLayerIds.includes(layer.id));
    const structureKey = this.getPreviewStructureKey(visibleLayers);
    const canvasMetrics = options.canvasMetrics || getGameCanvasMetrics(this.previewNode, viewport);
    this.previewCanvasMetricsKey = this.getPreviewCanvasMetricsKey(canvasMetrics);
    const previewWidth = canvasMetrics.width;
    const previewHeight = canvasMetrics.height;
    const effectivePerspective = Number(((perspective / 100) * previewWidth).toFixed(2));
    this.previewNode.dataset.previewViewport = viewport;
    this.previewNode.dataset.previewStructureKey = structureKey;
    this.previewNode.dataset.runnerMode = this.runnerMode;
    this.previewNode.dataset.previewState = this.runnerPlaying ? "render" : "placement";
    this.previewNode.dataset.runnerOutcome = this.runnerGameOver ? "game-over" : (this.runnerComplete ? "complete" : "active");
    this.previewNode.dataset.boundingBoxMode = this.scene.boundingBox?.showAlways ? "always" : "static";
    this.previewNode.dataset.gameCanvasMax = `${canvasMetrics.maxWidth}x${canvasMetrics.maxHeight}`;
    this.previewNode.style.setProperty("--game-canvas-width", `${canvasMetrics.width}px`);
    this.previewNode.style.setProperty("--game-canvas-height", `${canvasMetrics.height}px`);
    this.previewNode.style.setProperty("--game-canvas-scale", String(canvasMetrics.scale));

    this.previewNode.innerHTML = `
      <div class="tester-preview__stage${stageClass}" style="${this.renderBackgroundStyle(background)}; --preview-perspective:${effectivePerspective}px; --preview-world-width:${previewWidth}px; --preview-world-height:${previewHeight}px">
        ${visibleLayers.map((layer, layerIndex) => {
          const transform = layer.viewports?.[viewport] || layer.viewports?.desktop || normalizeViewportTransform(layer, "desktop");
          const translateX = 0;
          const translateY = Number(((Number(transform.y || 0) / 100) * previewHeight).toFixed(2));
          const translateZ = 0;
          const effectiveScale = Number((transform.scale || 1).toFixed(4));
          const layerClass = `tester-preview__layer tester-preview__layer--${layer.id}`;
          const runnerSpeed = getRunnerSpeed(layer, transform, this.scene.runner, viewport);
          const previewSource = layer.src || PREVIEW_LAYER_ASSETS[layer.id];
          const visualMarkup = this.renderLayerVisual(layer, previewSource);
          return `
            <div
              class="${layerClass}"
              data-layer-id="${layer.id}"
              data-layer-x-travel="${Number(transform.x ?? 50).toFixed(2)}"
              data-layer-transform-y="${Number(transform.y ?? 0).toFixed(2)}"
              data-layer-transform-z="${Number(transform.z ?? 0).toFixed(2)}"
              data-layer-transform-scale="${effectiveScale}"
              data-layer-camera-x="${translateX}"
              data-runner-speed="${runnerSpeed}"
              data-animated="${layer.animated ? "true" : "false"}"
              data-pattern="${escapeHtml(layer.pattern || "none")}"
              style="
                --layer-z:${getLayerZIndex(layer, layerIndex + 1)};
                --layer-scale:${effectiveScale};
                --layer-x:${translateX}px;
                --layer-y:${translateY}px;
                --layer-z-offset:${translateZ}px;
                --layer-depth:${layer.depth};
                --layer-origin-x:50%;
                --layer-origin-y:50%;
                --runner-duration:18s;
                --runner-distance:100%;
              "
            >
              <div class="tester-preview__layer-plane">
                ${visualMarkup}
              </div>
            </div>
          `;
        }).join("")}
        ${this.renderLayoutPreviewHud()}
      </div>
    `;

    this.applyAssetRelativeLayerOffsets(performance.now(), null, { syncComposition: true });
    this.updateSpawnRuntimePositions(performance.now());
    this.updateLayoutPreviewHudTiming(performance.now());
    this.syncAssetRelativeLayerOffsets();
    if (this.runnerPlaying) {
      this.startRunnerPreviewLoop();
      this.startPreviewHudTimer();
    }
  }

  refreshPreviewLayout(options = {}) {
    if (!this.previewNode) {
      return false;
    }

    const stageNode = this.previewNode.querySelector(".tester-preview__stage");
    const { perspective, usePerspective, camera, layers, selectedLayerIds, viewport, background } = this.scene;
    const visibleLayers = layers.filter((layer) => selectedLayerIds.includes(layer.id));
    const structureKey = this.getPreviewStructureKey(visibleLayers);
    const layerNodes = [...this.previewNode.querySelectorAll(".tester-preview__layer")];
    if (!stageNode || layerNodes.length !== visibleLayers.length) {
      return false;
    }

    const idsMatch = visibleLayers.every((layer, index) => layerNodes[index]?.dataset.layerId === layer.id);
    if (!idsMatch) {
      return false;
    }
    if (this.previewNode.dataset.previewStructureKey && this.previewNode.dataset.previewStructureKey !== structureKey) {
      return false;
    }

    const canvasMetrics = options.canvasMetrics || getGameCanvasMetrics(this.previewNode, viewport);
    this.previewCanvasMetricsKey = this.getPreviewCanvasMetricsKey(canvasMetrics);
    const previewWidth = canvasMetrics.width;
    const previewHeight = canvasMetrics.height;
    const effectivePerspective = Number(((perspective / 100) * previewWidth).toFixed(2));
    this.previewNode.dataset.previewViewport = viewport;
    this.previewNode.dataset.previewStructureKey = structureKey;
    this.previewNode.dataset.runnerMode = this.runnerMode;
    this.previewNode.dataset.previewState = this.runnerPlaying ? "render" : "placement";
    this.previewNode.dataset.runnerOutcome = this.runnerGameOver ? "game-over" : (this.runnerComplete ? "complete" : "active");
    this.previewNode.dataset.boundingBoxMode = this.scene.boundingBox?.showAlways ? "always" : "static";
    this.previewNode.dataset.gameCanvasMax = `${canvasMetrics.maxWidth}x${canvasMetrics.maxHeight}`;
    this.previewNode.style.setProperty("--game-canvas-width", `${canvasMetrics.width}px`);
    this.previewNode.style.setProperty("--game-canvas-height", `${canvasMetrics.height}px`);
    this.previewNode.style.setProperty("--game-canvas-scale", String(canvasMetrics.scale));
    stageNode.classList.toggle("tester-preview__stage--perspective", Boolean(usePerspective));
    stageNode.setAttribute(
      "style",
      `${this.renderBackgroundStyle(background)}; --preview-perspective:${effectivePerspective}px; --preview-world-width:${previewWidth}px; --preview-world-height:${previewHeight}px`
    );

    visibleLayers.forEach((layer, layerIndex) => {
      const layerNode = layerNodes[layerIndex];
      const transform = layer.viewports?.[viewport] || layer.viewports?.desktop || normalizeViewportTransform(layer, "desktop");
      const translateX = 0;
      const translateY = Number(((Number(transform.y || 0) / 100) * previewHeight).toFixed(2));
      const translateZ = 0;
      const effectiveScale = Number((transform.scale || 1).toFixed(4));
      const runnerSpeed = getRunnerSpeed(layer, transform, this.scene.runner, viewport);
      layerNode.dataset.layerXTravel = Number(transform.x ?? 50).toFixed(2);
      layerNode.dataset.layerTransformY = Number(transform.y ?? 0).toFixed(2);
      layerNode.dataset.layerTransformZ = Number(transform.z ?? 0).toFixed(2);
      layerNode.dataset.layerTransformScale = String(effectiveScale);
      layerNode.dataset.layerCameraX = String(translateX);
      layerNode.dataset.runnerSpeed = String(runnerSpeed);
      layerNode.dataset.animated = layer.animated ? "true" : "false";
      layerNode.dataset.pattern = layer.pattern || "none";
      layerNode.style.setProperty("--layer-z", String(getLayerZIndex(layer, layerIndex + 1)));
      layerNode.style.setProperty("--layer-scale", String(effectiveScale));
      layerNode.style.setProperty("--layer-x", `${translateX}px`);
      layerNode.style.setProperty("--layer-y", `${translateY}px`);
      layerNode.style.setProperty("--layer-z-offset", `${translateZ}px`);
      layerNode.style.setProperty("--layer-depth", String(layer.depth));
    });

    const timestamp = performance.now();
    this.applyAssetRelativeLayerOffsets(timestamp, this.runnerPlaying || this.runnerGameOver || this.runnerComplete ? this.runnerDistanceSeconds : null, {
      syncComposition: options.syncComposition !== false
    });
    this.updateSpawnRuntimePositions(timestamp, this.runnerPlaying || this.runnerGameOver || this.runnerComplete ? this.runnerDistanceSeconds : null);
    this.updateLayoutPreviewHudTiming(timestamp);
    return true;
  }

  getPreviewStructureKey(layers = []) {
    return layers.map((layer) => {
      const previewSource = layer.src || PREVIEW_LAYER_ASSETS[layer.id] || "";
      return [
        layer.id,
        previewSource,
        layer.pattern || "none",
        layer.animated ? "a" : "s"
      ].join(":");
    }).join("|");
  }

  setRunnerPreviewMode() {
    this.runnerMode = "js";
    this.previewNode?.setAttribute("data-runner-mode", this.runnerMode);
    if (this.runnerPlaying) {
      this.startRunnerPreviewLoop();
    }
    this.applyAssetRelativeLayerOffsets(performance.now());
  }

  setRunnerPreviewPlaying(isPlaying) {
    const nextPlaying = Boolean(isPlaying);
    const wasPlaying = this.runnerPlaying;
    const wasGameOver = this.runnerGameOver;
    this.runnerPlaying = nextPlaying;
    if (this.runnerPlaying) {
      if (!wasPlaying || wasGameOver) {
        this.runnerStartedAt = performance.now();
      } else {
        this.runnerStartedAt = this.runnerStartedAt || performance.now();
      }
      this.runnerStopStartedAt = 0;
      this.runnerStopElapsedAt = 0;
      this.runnerStopSpeedMultiplier = 1;
      this.runnerDistanceSeconds = 0;
      this.runnerDistanceLastTimestamp = this.runnerStartedAt;
      this.runnerElapsedTimestamp = this.runnerStartedAt;
      this.runnerElapsedValue = 0;
      this.runnerSpeedMultiplier = 0;
      this.runnerSpeedTransition = null;
      this.runnerGameOver = false;
      this.runnerGameOverTrigger = null;
      this.runnerGameOverEventEmitted = false;
      this.runnerComplete = false;
      this.collectedSpawnIds.clear();
      this.revealedTextBonusIds.clear();
      this.textBonusOverlayIndex = 0;
      this.textBonusRunSeed = createInfiniteRunnerPaintSeed(`${this.scene.levelId || "preview"}-text-bonus`);
      this.textBonusWordOrderCache.clear();
      if (!wasPlaying || !this.spawnPlan.length) {
        const irgLevel = this.getIrgLevel();
        this.spawnPlanSeed = this.runnerRuntimePaintSeed || irgLevel.paintSeed || createInfiniteRunnerPaintSeed(this.scene.levelId || "preview");
        this.runnerRuntimePaintSeed = "";
        this.spawnPlan = this.buildSpawnPlan(irgLevel.durationPs, this.spawnPlanSeed);
        this.spawnPlanById = new Map(this.spawnPlan.map((entry) => [entry.id, entry]));
        this.spawnCollisionMap = this.spawnPlan.map((entry) => ({
          id: entry.id,
          source: entry.source,
          kind: entry.kind,
          startsAt: entry.startsAt,
          duration: entry.duration,
          collision: entry.kind === "hollow" ? "surface-gap" : "spawn-object",
          trigger: entry.trigger
        }));
      }
      this.previewNode?.classList.add("is-running");
      if (this.previewNode) {
        this.previewNode.dataset.runnerStartedAt = String(this.runnerStartedAt);
      }
      this.startRunnerPreviewLoop();
      this.startPreviewHudTimer();
    } else {
      this.runnerStartedAt = 0;
      this.characterFallStartedAt = 0;
      this.previewCharacterAirborneUntil = 0;
      this.runnerStopStartedAt = 0;
      this.runnerStopElapsedAt = 0;
      this.runnerStopSpeedMultiplier = 1;
      this.runnerDistanceSeconds = 0;
      this.runnerDistanceLastTimestamp = 0;
      this.runnerElapsedTimestamp = 0;
      this.runnerElapsedValue = 0;
      this.runnerSpeedMultiplier = 0;
      this.runnerSpeedTransition = null;
      this.runnerGameOver = false;
      this.runnerGameOverTrigger = null;
      this.runnerGameOverEventEmitted = false;
      this.runnerComplete = false;
      this.collectedSpawnIds.clear();
      this.revealedTextBonusIds.clear();
      this.textBonusOverlayIndex = 0;
      this.spawnPlan = [];
      this.spawnPlanById = new Map();
      this.spawnCollisionMap = [];
      this.previewNode?.classList.remove("is-running");
      if (this.previewNode) {
        delete this.previewNode.dataset.runnerStartedAt;
        this.previewNode.dataset.runnerOutcome = "active";
      }
      this.stopRunnerPreviewLoop();
      this.stopPreviewHudTimer();
      this.applyAssetRelativeLayerOffsets(performance.now(), 0);
      this.updateLayoutPreviewHudTiming(performance.now());
    }

    const nextCharacterBaseActionId = this.getPreviewCharacterBaseActionId(this.runnerPlaying);
    if (
      wasPlaying !== this.runnerPlaying
      || this.previewCharacterBaseActionId !== nextCharacterBaseActionId
      || !this.previewCharacterActionId
    ) {
      this.previewCharacterBaseActionId = nextCharacterBaseActionId;
      this.setPreviewCharacterAction(nextCharacterBaseActionId, { scheduleReturn: false });
      if (wasPlaying !== this.runnerPlaying || wasGameOver) {
        this.renderPreview();
      }
    } else {
      const timestamp = performance.now();
      this.applyAssetRelativeLayerOffsets(timestamp, this.runnerDistanceSeconds);
      this.updateLayoutPreviewHudTiming(timestamp, this.runnerDistanceSeconds);
    }
  }

  startRunnerPreviewLoop() {
    if (this.runnerFrameId || !this.previewNode) {
      return;
    }

    this.runnerFrameId = window.requestAnimationFrame(this.boundRunnerTick);
  }

  stopRunnerPreviewLoop() {
    if (!this.runnerFrameId) {
      return;
    }

    window.cancelAnimationFrame(this.runnerFrameId);
    this.runnerFrameId = null;
  }

  getRunnerElapsed(timestamp = performance.now()) {
    if (!this.runnerPlaying && !this.runnerGameOver) {
      this.runnerElapsedTimestamp = timestamp;
      this.runnerElapsedValue = this.runnerDistanceSeconds;
      return this.runnerDistanceSeconds;
    }

    if (timestamp === this.runnerElapsedTimestamp) {
      return this.runnerElapsedValue;
    }

    if (!this.runnerDistanceLastTimestamp) {
      this.runnerDistanceLastTimestamp = timestamp;
      this.runnerElapsedTimestamp = timestamp;
      this.runnerElapsedValue = this.runnerDistanceSeconds;
      return this.runnerDistanceSeconds;
    }

    const rawDeltaSeconds = Math.max(0, (timestamp - this.runnerDistanceLastTimestamp) / 1000);
    const deltaSeconds = Math.min(rawDeltaSeconds, PREVIEW_RUNNER_MAX_DELTA_SECONDS);
    this.runnerDistanceSeconds += deltaSeconds * this.getTimedRunnerSpeedMultiplier(timestamp);
    this.runnerDistanceLastTimestamp = timestamp;
    this.runnerElapsedTimestamp = timestamp;
    this.runnerElapsedValue = this.runnerDistanceSeconds;
    return this.runnerDistanceSeconds;
  }

  getPreviewWorldDurationPs() {
    const level = this.getIrgLevel() || {};
    const preGamePs = Math.max(0, Number(level.preGamePs || 0));
    const durationPs = Math.max(1, Number(level.durationPs || PREVIEW_SPAWN_PLAN_SECONDS));
    const postGamePs = Math.max(0, Number(level.postGamePs || 0));
    return preGamePs + durationPs + postGamePs;
  }

  getRawPreviewCharacterSpeedMultiplier() {
    const actionId = this.previewCharacterActionId || this.getPreviewCharacterBaseActionId(this.runnerPlaying);
    const action = this.getPreviewCharacterAction(actionId, { allowDisabled: true });
    return getCharacterSpeedMultiplier(action);
  }

  getTimedRunnerSpeedMultiplier(timestamp = performance.now()) {
    const transition = this.runnerSpeedTransition;
    if (!transition) {
      return this.runnerSpeedMultiplier;
    }

    const duration = Math.max(1, Number(transition.duration || PREVIEW_RUNNER_STOP_DURATION_MS));
    const progress = clamp((timestamp - transition.startedAt) / duration, 0, 1);
    const eased = 1 - ((1 - progress) * (1 - progress));
    const value = transition.from + ((transition.to - transition.from) * eased);
    if (progress >= 1) {
      this.runnerSpeedMultiplier = transition.to;
      this.runnerSpeedTransition = null;
      return this.runnerSpeedMultiplier;
    }

    return value;
  }

  transitionRunnerSpeedTo(targetMultiplier, timestamp = performance.now(), duration = PREVIEW_RUNNER_STOP_DURATION_MS) {
    const target = Math.max(0, Number(targetMultiplier) || 0);
    const current = this.getTimedRunnerSpeedMultiplier(timestamp);
    this.runnerSpeedTransition = {
      from: current,
      to: target,
      startedAt: timestamp,
      duration
    };
    this.runnerSpeedMultiplier = current;
  }

  beginRunnerDeathSequence(trigger = {}, timestamp = performance.now()) {
    if (this.runnerGameOver) {
      return;
    }

    this.runnerGameOver = true;
    this.runnerGameOverTrigger = trigger;
    this.runnerGameOverEventEmitted = false;
    this.runnerStopStartedAt = timestamp;
    this.runnerStopElapsedAt = this.getRunnerElapsed(timestamp);
    this.runnerMode = "js";
    this.previewCharacterAirborneUntil = 0;
    this.characterFallStartedAt = 0;
    this.previewNode?.setAttribute("data-runner-outcome", "game-over");
    const actionId = trigger.action === "damage" ? "death" : (trigger.action || "death");
    this.setPreviewCharacterAction(actionId, {
      scheduleReturn: false,
      allowDisabled: true
    });
    this.previewNode?.setAttribute("data-runner-mode", this.runnerMode);
    this.context.events?.emit?.("preview-runner:death-start", { trigger, actionId });
  }

  getRunnerDeathSequenceDurationMs() {
    const actionDuration = Number(this.previewCharacterActionDurationMs || 0);
    if (Number.isFinite(actionDuration) && actionDuration > 0) {
      return actionDuration;
    }
    return PREVIEW_RUNNER_STOP_DURATION_MS;
  }

  finishRunnerDeathSequence(timestamp = performance.now()) {
    if (!this.runnerGameOver || this.runnerGameOverEventEmitted) {
      return;
    }

    this.runnerGameOverEventEmitted = true;
    this.runnerPlaying = false;
    this.previewNode?.classList.remove("is-running");
    this.stopPreviewHudTimer();
    this.updateLayoutPreviewHudTiming(timestamp);
    this.context.events?.emit?.("preview-runner:death-complete", {
      trigger: this.runnerGameOverTrigger || {},
      actionId: this.previewCharacterActionId || "death",
      durationMs: this.getRunnerDeathSequenceDurationMs()
    });
  }

  completeRunnerPreview(timestamp = performance.now()) {
    if (this.runnerComplete) {
      return;
    }

    this.runnerComplete = true;
    this.updateLayoutPreviewHudTiming(timestamp);
    this.runnerPlaying = false;
    this.runnerSpeedTransition = null;
    this.runnerSpeedMultiplier = 0;
    this.previewNode?.classList.remove("is-running");
    this.previewNode?.setAttribute("data-runner-outcome", "complete");
    this.stopRunnerPreviewLoop();
    this.stopPreviewHudTimer();
    this.context.events?.emit?.("preview-runner:complete", { outcome: "complete" });
  }

  hasPreviewCharacterExitedCanvas() {
    if (!this.previewNode) {
      return false;
    }

    const characterNode = this.previewNode.querySelector(".tester-preview__character-sprite");
    if (!characterNode) {
      return false;
    }

    const canvasRect = getGameCanvasRect(this.previewNode, this.scene.viewport);
    const characterRect = characterNode.getBoundingClientRect();
    return characterRect.left > canvasRect.right + 4;
  }

  tickRunnerPreview(timestamp) {
    this.runnerFrameId = null;
    const elapsed = this.getRunnerElapsed(timestamp);
    this.applyAssetRelativeLayerOffsets(timestamp, elapsed);
    this.updateSpawnRuntimePositions(timestamp, elapsed);
    if (
      this.runnerGameOver
      && this.runnerStopStartedAt
      && timestamp - (this.previewCharacterActionStartedAt || this.runnerStopStartedAt) >= this.getRunnerDeathSequenceDurationMs()
    ) {
      this.finishRunnerDeathSequence(timestamp);
      return;
    }
    if (this.runnerPlaying && this.hasPreviewCharacterExitedCanvas()) {
      this.completeRunnerPreview(timestamp);
      return;
    }
    if (this.runnerPlaying && this.previewNode?.isConnected) {
      this.startRunnerPreviewLoop();
    }
  }

  syncAssetRelativeLayerOffsets() {
    if (!this.previewNode) {
      return;
    }

    const renderSequence = this.previewRenderSequence;
    const applyOffsets = () => this.scheduleAssetRelativeLayerOffsetsFromLoad(renderSequence);

    window.requestAnimationFrame(applyOffsets);
    this.previewNode.querySelectorAll(".tester-preview__layer img").forEach((image) => {
      this.syncPreviewImageAssetSize(image);
      if (!image.complete && !image.closest(".tester-preview__spawn-object")) {
        image.addEventListener("load", () => {
          if (renderSequence !== this.previewRenderSequence) {
            return;
          }
          this.syncPreviewImageAssetSize(image);
          applyOffsets();
        }, { once: true });
      }
    });
    this.previewNode.querySelectorAll(".tester-preview__character-sprite[data-character-src]").forEach((node) => {
      this.syncPreviewCharacterAssetSize(node, applyOffsets);
    });
    const spawnSources = new Set();
    this.previewNode.querySelectorAll(".tester-preview__spawn-object[data-spawn-resolved-src]").forEach((node) => {
      if (node.dataset.spawnTextBonus === "true") {
        return;
      }
      if (node.dataset.spawnResolvedSrc) {
        spawnSources.add(node.dataset.spawnResolvedSrc);
      }
    });
    spawnSources.forEach((source) => {
      this.syncPreviewAssetSourceSize(source, () => {
        if (renderSequence !== this.previewRenderSequence) {
          return;
        }
        this.updateSpawnAssetSourceSizeNodes(source);
      });
    });
  }

  scheduleAssetRelativeLayerOffsetsFromLoad(renderSequence = this.previewRenderSequence) {
    if (renderSequence !== this.previewRenderSequence) {
      return;
    }
    if (this.assetRelativeLayerOffsetsLoadApplied || this.assetRelativeLayerOffsetsLoadFrameId) {
      return;
    }

    this.assetRelativeLayerOffsetsLoadFrameId = window.requestAnimationFrame(() => {
      this.assetRelativeLayerOffsetsLoadFrameId = 0;
      if (renderSequence !== this.previewRenderSequence) {
        return;
      }
      this.assetRelativeLayerOffsetsLoadApplied = true;
      this.applyAssetRelativeLayerOffsets(performance.now());
    });
  }

  syncPreviewImageAssetSize(image) {
    if (!image) {
      return;
    }

    const width = Number(image.naturalWidth || 0);
    const height = Number(image.naturalHeight || 0);
    if (width <= 0 || height <= 0) {
      return;
    }

    image.dataset.assetNaturalWidth = String(width);
    image.dataset.assetNaturalHeight = String(height);
    const layerNode = image.closest?.(".tester-preview__layer");
    if (layerNode) {
      layerNode.dataset.assetNaturalWidth = String(width);
      layerNode.dataset.assetNaturalHeight = String(height);
    }
  }

  getPreviewCharacterFrameRatio(frameWidth = 1, frameHeight = 1) {
    const safeFrameWidth = Math.max(1, Number(frameWidth || 1));
    const safeFrameHeight = Math.max(1, Number(frameHeight || 1));

    return {
      aspect: Number((safeFrameWidth / safeFrameHeight).toFixed(6)),
      heightRatio: Number(clamp(safeFrameHeight / CHARACTER_SCENE_REFERENCE_HEIGHT, 0.01, 2).toFixed(6))
    };
  }

  syncPreviewCharacterAssetSize(characterNode, onReady = null) {
    const source = characterNode?.dataset.characterSrc || "";
    if (!source) {
      return;
    }

    const applySize = (size) => {
      if (!size?.width || !size?.height) {
        return;
      }

      const frameCount = Math.max(1, Number(characterNode.dataset.characterFrameCount || 1));
      const frameWidth = Math.max(1, Number(size.width || 0) / frameCount);
      const frameHeight = Math.max(1, Number(size.height || 0));
      const frameRatio = this.getPreviewCharacterFrameRatio(frameWidth, frameHeight);
      characterNode.dataset.assetNaturalWidth = String(size.width);
      characterNode.dataset.assetNaturalHeight = String(size.height);
      characterNode.style.setProperty("--preview-character-frame-natural-width", `${Number(frameWidth.toFixed(3))}px`);
      characterNode.style.setProperty("--preview-character-frame-natural-height", `${Number(frameHeight.toFixed(3))}px`);
      const jumpGuideNode = characterNode.closest?.(".tester-preview__character-anchor")?.querySelector(".tester-preview__character-jump-guide");
      jumpGuideNode?.style.setProperty("--preview-character-frame-natural-width", `${Number(frameWidth.toFixed(3))}px`);
      jumpGuideNode?.style.setProperty("--preview-character-frame-natural-height", `${Number(frameHeight.toFixed(3))}px`);
      characterNode.style.setProperty("--preview-character-frame-aspect", String(frameRatio.aspect));
      characterNode.style.setProperty("--preview-character-frame-height-ratio", String(frameRatio.heightRatio));
      onReady?.();
    };

    const cached = this.previewAssetSizeCache.get(source);
    if (cached) {
      applySize(cached);
      return;
    }

    const image = new Image();
    image.decoding = "async";
    image.addEventListener("load", () => {
      const size = {
        width: Math.max(1, Number(image.naturalWidth || 0)),
        height: Math.max(1, Number(image.naturalHeight || 0))
      };
      this.previewAssetSizeCache.set(source, size);
      applySize(size);
    }, { once: true });
    image.src = source;
  }

  syncPreviewAssetSourceSize(source = "", onReady = null) {
    if (!source) {
      return;
    }

    const cached = this.previewAssetSizeCache.get(source);
    if (cached) {
      onReady?.(cached);
      return;
    }

    if (this.previewAssetSizePending.has(source)) {
      if (onReady) {
        this.previewAssetSizePending.get(source).add(onReady);
      }
      return;
    }

    this.previewAssetSizePending.set(source, new Set(onReady ? [onReady] : []));
    const image = new Image();
    image.decoding = "async";
    image.addEventListener("load", () => {
      const size = {
        width: Math.max(1, Number(image.naturalWidth || 0)),
        height: Math.max(1, Number(image.naturalHeight || 0))
      };
      this.previewAssetSizeCache.set(source, size);
      const callbacks = this.previewAssetSizePending.get(source) || new Set();
      this.previewAssetSizePending.delete(source);
      callbacks.forEach((callback) => callback(size));
    }, { once: true });
    image.addEventListener("error", () => {
      this.previewAssetSizePending.delete(source);
    }, { once: true });
    image.src = source;
  }

  updateSpawnAssetSourceSizeNodes(source = "") {
    const size = this.previewAssetSizeCache.get(source);
    if (!this.previewNode || !source || !size) {
      return;
    }

    this.previewNode.querySelectorAll(`.tester-preview__spawn-object[data-spawn-resolved-src="${CSS.escape(source)}"]`).forEach((node) => {
      const spawnSource = node.dataset.spawnSource || "";
      const config = this.scene.spawnObjects?.[spawnSource] || {};
      const renderConfig = this.getSpawnObjectRenderConfigForSource(spawnSource, config);
      const sprite = this.getSpawnSpriteSheetForSource(spawnSource, renderConfig);
      const frameCount = Math.max(1, Number(sprite.frameCount || 1));
      const frameWidth = Math.max(1, size.width / frameCount);
      const frameHeight = Math.max(1, size.height);
      const fps = Math.max(1, Number(sprite.fps || 12));
      const spriteDuration = Number((frameCount / fps).toFixed(3));
      const isSpriteSheet = frameCount > 1;
      node.dataset.spawnSprite = isSpriteSheet ? "true" : "false";
      node.style.setProperty("--spawn-frame-width", `${frameWidth}px`);
      node.style.setProperty("--spawn-frame-height", `${frameHeight}px`);
      node.style.setProperty("--spawn-frame-count", String(frameCount));
      node.style.setProperty("--spawn-frame-steps", String(Math.max(1, frameCount - 1)));
      node.style.setProperty("--spawn-last-frame-x", frameCount > 1 ? "100%" : "0%");
      node.style.setProperty("--spawn-frame-duration", `${spriteDuration}s`);
      node.style.setProperty("--spawn-sprite-sheet-width", `${frameWidth * frameCount}px`);
      if (isSpriteSheet && !node.querySelector(".tester-preview__spawn-object-sprite")) {
        node.replaceChildren();
        const spriteNode = document.createElement("span");
        spriteNode.className = "tester-preview__spawn-object-sprite";
        spriteNode.setAttribute("aria-hidden", "true");
        node.append(spriteNode);
      }
    });
  }

  buildSpawnPlan(durationSeconds = PREVIEW_SPAWN_PLAN_SECONDS, seed = "preview") {
    const canvasMetrics = getGameCanvasMetrics(this.previewNode, this.scene.viewport);
    const level = {
      ...this.getIrgLevel(),
      durationPs: Math.max(5, Number(durationSeconds) || PREVIEW_SPAWN_PLAN_SECONDS)
    };
    const allSpawnObjects = Object.entries(this.scene.spawnObjects || {})
      .filter(([, config]) => config?.enabled)
      .map(([source, config]) => {
        const renderConfig = this.getSpawnObjectRenderConfigForSource(source, config);
        const spawnKind = this.getSpawnKindFromSource(source, renderConfig);
        return {
          ...renderConfig,
          x: 0,
          xPx: 0,
          source,
          key: source,
          type: spawnKind,
          kind: spawnKind,
          trigger: this.getSpawnCollisionTrigger(source, renderConfig, spawnKind),
          effects: this.getSpawnEffects(source, renderConfig),
          spriteSheet: this.getSpawnSpriteSheetForSource(source, renderConfig),
          animation: renderConfig.animation || {}
        };
      });
    const spawnObjects = allSpawnObjects.filter((spawnObject) => !isTextBonusSource(spawnObject.source, spawnObject));
    const worldPlan = paintInfiniteRunnerWorld({
      level,
      physics: this.context.db?.get("physics", {}),
      spawnObjects,
      seed,
      viewport: this.scene.viewport === "mobile" ? "mobile" : "desktop",
      viewportWidth: canvasMetrics.width
    });

    this.currentWorldPlan = worldPlan;
    return worldPlan.entries;
  }

  updateSpawnRuntimePositions(timestamp = performance.now(), elapsedOverride = null) {
    if (!this.previewNode || !this.runnerPlaying) {
      return;
    }

    const canvasMetrics = getGameCanvasMetrics(this.previewNode, this.scene.viewport);
    const previewWidth = canvasMetrics.width;
    const hasElapsedOverride = Number.isFinite(Number(elapsedOverride));
    const elapsed = hasElapsedOverride ? Number(elapsedOverride) : this.getRunnerElapsed(timestamp);
    const isCompleteExitPhase = elapsed >= this.getPreviewWorldDurationPs();
    const characterNode = this.previewNode.querySelector(".tester-preview__character-sprite");
    const characterBoxRect = this.getCharacterCollisionRect(characterNode);
    let activeHollowTrigger = null;
    let activeObjectTrigger = null;

    const canvasRect = getGameCanvasRect(this.previewNode, this.scene.viewport);
    this.previewNode.querySelectorAll("[data-spawn-runtime='true']").forEach((node) => {
      const startsAt = Number(node.dataset.spawnStartsAt || 0);
      const eventId = node.dataset.spawnEventId || "";
      const isPrerendered = node.dataset.spawnPrerendered === "true";
      const isBonus = isBonusSpawnKind(node.dataset.spawnKind);
      const isTextBonus = node.dataset.spawnTextBonus === "true";
      const isTextBonusRevealed = isTextBonus && eventId && this.revealedTextBonusIds.has(eventId);
      const isCollected = !isTextBonus && isBonus && eventId && this.collectedSpawnIds.has(eventId);
      const rect = node.getBoundingClientRect();
      const isVisibleInCanvas = rect.right >= canvasRect.left && rect.left <= canvasRect.right;
      const isActive = isPrerendered || isTextBonus
        ? isVisibleInCanvas
        : elapsed >= startsAt && isVisibleInCanvas;
      const nextVisibility = isVisibleInCanvas ? "visible" : "hidden";
      const nextOpacity = isTextBonus && isTextBonusRevealed ? "1" : (isCollected ? "0" : (isPrerendered ? "1" : (isActive ? "1" : "0")));
      const nextActive = isActive && !isCollected && !isTextBonusRevealed ? "true" : "false";
      const nextCollected = isCollected ? "true" : "false";
      if (node.style.visibility !== nextVisibility) {
        node.style.visibility = nextVisibility;
      }
      if (node.style.opacity !== nextOpacity) {
        node.style.opacity = nextOpacity;
      }
      if (node.dataset.spawnActive !== nextActive) {
        node.dataset.spawnActive = nextActive;
      }
      if (node.dataset.spawnCollected !== nextCollected) {
        node.dataset.spawnCollected = nextCollected;
      }
    });

    if (this.runnerGameOver || isCompleteExitPhase) {
      if (characterNode) {
        characterNode.dataset.collisionTriggerEvent = "";
        characterNode.dataset.collisionTriggerAction = "";
        characterNode.dataset.collisionTriggerOutcome = "";
      }
      return;
    }

    if (isNoCollisionMetaEnabled()) {
      if (characterNode) {
        characterNode.dataset.collisionTriggerEvent = "";
        characterNode.dataset.collisionTriggerAction = "";
        characterNode.dataset.collisionTriggerOutcome = "";
        characterNode.dataset.characterSurface = "grounded";
      }
      this.characterFallStartedAt = 0;
      return;
    }

    if (characterBoxRect) {
      const collisionNodes = [...this.previewNode.querySelectorAll("[data-spawn-runtime='true'][data-spawn-kind]:not([data-spawn-kind='hollow'])")]
        .sort((left, right) => {
          const leftBonus = isBonusSpawnKind(left.dataset.spawnKind) ? 1 : 0;
          const rightBonus = isBonusSpawnKind(right.dataset.spawnKind) ? 1 : 0;
          const leftTextBonus = left.dataset.spawnTextBonus === "true" ? 1 : 0;
          const rightTextBonus = right.dataset.spawnTextBonus === "true" ? 1 : 0;
          return (rightBonus - leftBonus) || (rightTextBonus - leftTextBonus);
        });
      for (const node of collisionNodes) {
        if (node.dataset.spawnActive !== "true") {
          continue;
        }
        if (node.dataset.spawnTextBonus === "true") {
          const eventId = node.dataset.spawnEventId || "";
          if (!eventId || this.revealedTextBonusIds.has(eventId)) {
            continue;
          }
          const spawnBoxRect = this.getSpawnObjectCollisionRect(node);
          if (rectsOverlap(characterBoxRect, spawnBoxRect)) {
            this.revealedTextBonusIds.add(eventId);
            node.dataset.spawnTextDecorative = "true";
            node.dataset.spawnActive = "false";
            node.style.opacity = "1";
            const config = this.getTextBonusRenderConfigForNode(node);
            this.applyTextBonusNodeStyle(node.querySelector(".tester-preview__spawn-text-bonus"), config, false, true);
          }
          continue;
        }
        const trigger = {
          event: node.dataset.triggerEvent || "contact",
          action: node.dataset.triggerAction || "none",
          outcome: node.dataset.triggerOutcome || "none"
        };
        const isBonus = isBonusSpawnKind(node.dataset.spawnKind);
        if (!isBonus && !isNegativeSpawnKind(node.dataset.spawnKind) && !isNegativeSpawnTrigger(trigger)) {
          continue;
        }
        const spawnBoxRect = this.getSpawnObjectCollisionRect(node);
        if (rectsOverlap(characterBoxRect, spawnBoxRect)) {
          if (isBonus) {
            const eventId = node.dataset.spawnEventId || "";
            if (eventId) {
              this.collectedSpawnIds.add(eventId);
            }
            node.dataset.spawnCollected = "true";
            node.dataset.spawnActive = "false";
            node.style.opacity = node.dataset.spawnTextBonus === "true" ? "1" : "0";
            if (node.dataset.spawnTextBonus === "true") {
              const config = this.getTextBonusRenderConfigForNode(node);
              this.applyTextBonusNodeStyle(node.querySelector(".tester-preview__spawn-text-bonus"), config, true);
            } else {
              this.showTextBonusOverlayForSpawnNode(node, eventId);
            }
            this.context.events?.emit?.("preview-runner:bonus-collected", {
              eventId,
              kind: node.dataset.spawnKind || "bonus",
              source: node.dataset.spawnSource || "",
              soundId: node.dataset.spawnSoundId || ""
            });
            continue;
          }
          activeObjectTrigger = {
            event: trigger.event || "contact",
            action: trigger.action === "none" ? "death" : trigger.action,
            outcome: trigger.outcome === "none" ? "restart-gameover" : trigger.outcome
          };
          break;
        }
      }
    }

    if (activeObjectTrigger) {
      this.beginRunnerDeathSequence(activeObjectTrigger, timestamp);
      return;
    }

    const renderedHollow = this.getVisibleSceneHollowCollision(characterBoxRect);
    if (renderedHollow?.collides) {
      activeHollowTrigger = renderedHollow.trigger;
    }
    const hollowSupportsCharacter = Boolean(renderedHollow?.collides);
    const jumpProtected = !this.characterFallStartedAt && this.isPreviewCharacterAirborne(timestamp);
    if (hollowSupportsCharacter && !jumpProtected && !this.runnerGameOver) {
      this.beginRunnerDeathSequence(activeHollowTrigger || { event: "fall", action: "death", outcome: "restart-gameover" }, timestamp);
      return;
    }
    const shouldKeepFalling = Boolean(this.characterFallStartedAt)
      || (hollowSupportsCharacter && !jumpProtected);

    if (characterNode) {
      if (shouldKeepFalling && !this.characterFallStartedAt) {
        this.characterFallStartedAt = timestamp;
      } else if (!shouldKeepFalling) {
        this.characterFallStartedAt = 0;
      }

      const fallElapsed = this.characterFallStartedAt
        ? Math.max(0, (timestamp - this.characterFallStartedAt) / 1000)
        : 0;
      const fallY = this.characterFallStartedAt
        ? Math.min(canvasMetrics.height * 1.15, 0.5 * 520 * fallElapsed * fallElapsed)
        : 0;
      const fallX = this.characterFallStartedAt
        ? Math.min(84, 58 * fallElapsed)
        : 0;
      const fallRotation = this.characterFallStartedAt
        ? Math.min(16, 11 * fallElapsed)
        : 0;

      characterNode.style.setProperty("--preview-character-fall-x", `${Number(fallX.toFixed(2))}px`);
      characterNode.style.setProperty("--preview-character-fall-y", `${Number(fallY.toFixed(2))}px`);
      characterNode.style.setProperty("--preview-character-fall-rotation", `${Number(fallRotation.toFixed(2))}deg`);
      characterNode.dataset.characterSurface = shouldKeepFalling ? "falling" : (jumpProtected ? "airborne" : "grounded");
      characterNode.dataset.collisionTriggerEvent = shouldKeepFalling ? (activeHollowTrigger?.event || characterNode.dataset.collisionTriggerEvent || "fall") : "";
      characterNode.dataset.collisionTriggerAction = shouldKeepFalling ? (activeHollowTrigger?.action || characterNode.dataset.collisionTriggerAction || "death") : "";
      characterNode.dataset.collisionTriggerOutcome = shouldKeepFalling ? (activeHollowTrigger?.outcome || characterNode.dataset.collisionTriggerOutcome || "restart-gameover") : "";
    }
  }

  getCharacterCollisionRect(characterNode) {
    if (!characterNode) {
      return null;
    }

    const surfaceNode = characterNode.querySelector?.(".tester-preview__character-frame") || characterNode;
    const rect = surfaceNode.getBoundingClientRect();
    if (rect.width <= 1 || rect.height <= 1) {
      return null;
    }

    const styles = getComputedStyle(characterNode);
    const x = Number.parseFloat(styles.getPropertyValue("--preview-character-bb-x")) || 0;
    const y = Number.parseFloat(styles.getPropertyValue("--preview-character-bb-y")) || 0;
    const scaleX = Math.max(0.01, Number.parseFloat(styles.getPropertyValue("--preview-character-bb-scale-x")) || 1);
    const scaleY = Math.max(0.01, Number.parseFloat(styles.getPropertyValue("--preview-character-bb-scale-y")) || 1);
    const width = rect.width * scaleX;
    const height = rect.height * scaleY;
    const centerX = rect.left + (rect.width / 2) + ((x / 100) * rect.width);
    const bottom = rect.bottom + ((y / 100) * rect.height);

    return {
      left: centerX - (width / 2),
      right: centerX + (width / 2),
      top: bottom - height,
      bottom
    };
  }

  getSpawnObjectCollisionRect(spawnNode) {
    if (!spawnNode) {
      return null;
    }

    const rect = spawnNode.getBoundingClientRect();
    if (rect.width <= 1 || rect.height <= 1) {
      return null;
    }

    const styles = getComputedStyle(spawnNode);
    const x = Number.parseFloat(styles.getPropertyValue("--spawn-bb-x")) || 0;
    const y = Number.parseFloat(styles.getPropertyValue("--spawn-bb-y")) || 0;
    const scale = Number.parseFloat(styles.getPropertyValue("--spawn-bb-scale")) || 1;
    const scaleX = Math.max(0.01, Number.parseFloat(styles.getPropertyValue("--spawn-bb-scale-x")) || scale);
    const scaleY = Math.max(0.01, Number.parseFloat(styles.getPropertyValue("--spawn-bb-scale-y")) || scale);
    const width = rect.width * scaleX;
    const height = rect.height * scaleY;
    const centerX = rect.left + (rect.width / 2) + ((x / 100) * rect.width);
    const bottom = rect.bottom + ((y / 100) * rect.height);

    return {
      left: centerX - (width / 2),
      right: centerX + (width / 2),
      top: bottom - height,
      bottom
    };
  }

  getTextBonusRenderConfigForNode(spawnNode) {
    const source = spawnNode?.dataset?.spawnSource || TEXT_BONUS_KEY;
    const eventId = spawnNode?.dataset?.spawnEventId || "";
    const runtimeEntry = eventId
      ? this.spawnPlanById.get(eventId) || this.spawnPlan.find((entry) => entry.id === eventId)
      : null;
    const storedConfig = this.scene.spawnObjects?.[source] || {};
    return runtimeEntry?.config || this.getSpawnObjectRenderConfigForSource(source, storedConfig);
  }

  getTextBonusOverlayConfig() {
    const entry = Object.entries(this.scene.spawnObjects || {})
      .find(([source, config]) => config?.enabled && this.isTextBonusSource(source, config));
    if (!entry) {
      return null;
    }
    const [source, storedConfig] = entry;
    return {
      source,
      config: this.getSpawnObjectRenderConfigForSource(source, storedConfig)
    };
  }

  getNextTextBonusOverlayWord(config = {}) {
    const words = this.getTextBonusWords(config);
    const orderedWords = words.length > 1 ? this.getTextBonusWordOrder(config, words) : words;
    const index = orderedWords.length > 1 ? this.textBonusOverlayIndex % orderedWords.length : 0;
    this.textBonusOverlayIndex += 1;
    return orderedWords[index] || DEFAULT_TEXT_BONUS_WORDS[0];
  }

  showTextBonusOverlayForSpawnNode(spawnNode, eventId = "") {
    if (!this.previewNode || !spawnNode?.parentElement) {
      return;
    }
    const overlayConfig = this.getTextBonusOverlayConfig();
    if (!overlayConfig) {
      return;
    }
    const { source, config } = overlayConfig;
    const y = clamp(Number(config.y ?? 0), -PREVIEW_SPAWN_Y_LIMIT, PREVIEW_SPAWN_Y_LIMIT);
    const bottomFactor = Number((0.1 + (y / 100)).toFixed(6));
    const parentNode = spawnNode.parentElement;
    const left = spawnNode.style.getPropertyValue("--spawn-left")
      || getComputedStyle(spawnNode).getPropertyValue("--spawn-left")
      || "50%";
    const overlay = document.createElement("div");
    overlay.className = "tester-preview__spawn-object tester-preview__spawn-object--text-bonus tester-preview__spawn-object--text-overlay";
    overlay.dataset.spawnKind = "bonus";
    overlay.dataset.spawnSource = source;
    overlay.dataset.spawnTextBonus = "true";
    overlay.dataset.spawnTextOverlay = "true";
    overlay.dataset.spawnRuntime = "false";
    overlay.dataset.spawnPrerendered = "true";
    overlay.dataset.spawnCollected = "false";
    overlay.dataset.spawnEventId = eventId;
    overlay.dataset.boundingBoxMode = "hidden";
    overlay.style.setProperty("--spawn-z", "95");
    overlay.style.setProperty("--spawn-left", left.trim());
    overlay.style.setProperty("--spawn-bottom", `calc(var(--preview-world-height, 1px) * ${bottomFactor})`);
    overlay.style.setProperty("--spawn-scale", "1");
    overlay.style.setProperty("--spawn-frame-width", `${TEXT_BONUS_FRAME_SIZE.width}px`);
    overlay.style.setProperty("--spawn-frame-height", `${TEXT_BONUS_FRAME_SIZE.height}px`);
    overlay.style.setProperty("--spawn-sprite-image", "none");

    const textNode = document.createElement("span");
    textNode.className = "tester-preview__spawn-text-bonus";
    textNode.textContent = this.getNextTextBonusOverlayWord(config);
    this.applyTextBonusNodeStyle(textNode, config, false, true);
    overlay.append(textNode);
    parentNode.append(overlay);

    window.setTimeout(() => overlay.remove(), 1400);
  }

  getVisibleSceneHollowCollision(characterBoxRect = null) {
    if (!this.previewNode) {
      return { visible: false, collides: false };
    }

    const canvasRect = getGameCanvasRect(this.previewNode, this.scene.viewport);
    const readCollisions = (nodes = []) => {
      let sawVisibleNode = false;
      for (const node of nodes) {
        const rect = node.getBoundingClientRect();
        const left = rect.left - canvasRect.left;
        const right = rect.right - canvasRect.left;
        const visible = rectIntersectsCanvas(rect, canvasRect);
        if (!visible) {
          continue;
        }
        sawVisibleNode = true;

        const collision = {
          visible: true,
          collides: rectsOverlap(characterBoxRect, rect),
          left,
          right,
          trigger: {
            event: node.dataset.triggerEvent || "fall",
            action: node.dataset.triggerAction || "death",
            outcome: node.dataset.triggerOutcome || "restart-gameover"
          }
        };
        if (collision.collides) {
          return collision;
        }
      }

      return { visible: sawVisibleNode, collides: false };
    };

    const bbCollision = readCollisions([...this.previewNode.querySelectorAll(".tester-preview__scene-module-bb--hollow")]);
    if (bbCollision.visible || bbCollision.collides) {
      return bbCollision;
    }

    return readCollisions([...this.previewNode.querySelectorAll(".tester-preview__scene-module--hollow")]);
  }

  getSpawnBoundingBoxMode(source = "", bounds = {}, isRuntime = false) {
    if (isRuntime && !this.scene.boundingBox?.showAlways) {
      return "hidden";
    }

    if (this.scene.boundingBox?.showAlways) {
      return "always";
    }

    return "hidden";
  }

  getSceneHollowTileReplacements(tileStride = 1, assetRelativeX = 0) {
    const replacements = new Map();
    if (!this.runnerPlaying || !this.spawnPlan.length) {
      return replacements;
    }

    const usedTileIndexes = new Set();
    let previousHollowTileIndex = PREVIEW_HOLLOW_PREROLL_TILES - PREVIEW_HOLLOW_MIN_SCENE_TILES - 1;
    this.spawnPlan
      .filter((entry) => entry.kind === "hollow")
      .forEach((entry) => {
        let tileIndex = Math.max(
          PREVIEW_HOLLOW_PREROLL_TILES,
          Math.ceil((Number(entry.worldX || 0) - Number(assetRelativeX || 0)) / Math.max(1, tileStride))
        );
        tileIndex = Math.max(tileIndex, previousHollowTileIndex + PREVIEW_HOLLOW_MIN_SCENE_TILES + 1);
        while (usedTileIndexes.has(tileIndex)) {
          tileIndex += 1;
        }
        usedTileIndexes.add(tileIndex);
        previousHollowTileIndex = tileIndex;
        replacements.set(tileIndex, entry);
    });
    return replacements;
  }

  getClosestAvailableSceneTileIndex(tileIndexes = [], targetIndex = 0, usedTileIndexes = new Set()) {
    const availableIndexes = tileIndexes
      .map((tileIndex) => Number(tileIndex))
      .filter((tileIndex) => Number.isFinite(tileIndex) && !usedTileIndexes.has(tileIndex));
    if (!availableIndexes.length) {
      return null;
    }

    availableIndexes.sort((a, b) => {
      const distanceA = Math.abs(a - targetIndex);
      const distanceB = Math.abs(b - targetIndex);
      if (distanceA !== distanceB) {
        return distanceA - distanceB;
      }
      return Math.abs(a) - Math.abs(b);
    });
    return availableIndexes[0];
  }

  getStaticSceneHollowTileReplacements(tileIndexes = [], tileStride = 1) {
    const replacements = new Map();
    if (this.runnerPlaying || !tileIndexes.length) {
      return replacements;
    }

    const safeStride = Math.max(1, Number(tileStride || 1));
    const usedTileIndexes = new Set();
    this.getStaticSceneHollowPlacements().forEach((placement) => {
      const targetTileIndex = Math.round(Number(placement.x || 0) / safeStride);
      const tileIndex = this.getClosestAvailableSceneTileIndex(tileIndexes, targetTileIndex, usedTileIndexes);
      if (tileIndex === null) {
        return;
      }
      usedTileIndexes.add(tileIndex);
      replacements.set(tileIndex, {
        ...placement,
        tileIndex,
        snappedX: tileIndex * safeStride
      });
    });
    return replacements;
  }

  getSceneObjectPlacements(assetWidth = 1, assetRelativeX = 0, previewWidth = 1) {
    const sceneLayer = this.scene.layers.find((layer) => layer.id === "scene") || LAYER_DEFAULTS.scene;
    const zIndex = Number(sceneLayer.zIndex || 70) + 1;
    const viewportMode = normalizeViewportName(this.scene.viewport);
    const canvasMetrics = getGameCanvasMetrics(this.previewNode, this.scene.viewport);
    const canvasMaxSize = GAME_CANVAS_MAX_SIZE[viewportMode] || GAME_CANVAS_MAX_SIZE.desktop;
    const canvasScale = clamp(
      Math.min(canvasMetrics.width / canvasMaxSize.width, canvasMetrics.height / canvasMaxSize.height),
      0.01,
      1
    );
    const entries = this.runnerPlaying
      ? this.spawnPlan
        .filter((entry) => entry.kind !== "hollow")
        .map((entry) => [entry.source, entry.config, entry])
      : Object.entries(this.scene.spawnObjects || {})
        .filter(([source, config]) => config?.enabled && this.getSpawnKindFromSource(source) !== "hollow")
        .map(([source, config], index) => [source, config, { id: `static-${hashString(`${source}:${index}`).toString(16)}`, startsAt: 0 }]);

    return entries.map(([source, config, runtimeEvent]) => {
      const renderConfig = runtimeEvent?.config || this.getSpawnObjectRenderConfigForSource(source, config);
      const textBonus = this.isTextBonusSource(source, renderConfig);
      const y = clamp(Number(renderConfig.y ?? 0), -PREVIEW_SPAWN_Y_LIMIT, PREVIEW_SPAWN_Y_LIMIT);
      const scale = clamp(Number(renderConfig.scale ?? 1), 0, 6);
      const effectiveScale = textBonus ? 1 : getSceneBoundPreviewScale(scale, canvasScale);
      const xPx = clamp(Number(renderConfig.xPx ?? renderConfig.x ?? 0), -1200, 1200);
      const runtime = this.runnerPlaying && Boolean(runtimeEvent?.id);
      const worldX = runtime ? Number(runtimeEvent.worldX || previewWidth + 96) : 0;
      const trackLeft = runtime
        ? worldX - assetRelativeX - (previewWidth / 2)
        : xPx;
      const bottomFactor = Number((0.1 + (y / 100)).toFixed(6));
      return {
        id: runtimeEvent?.id || `static-${hashString(source).toString(16)}`,
        source,
        kind: textBonus ? "bonus" : this.getSpawnKindFromSource(source),
        textBonus,
        textBonusVisible: textBonus && runtimeEvent?.id && this.revealedTextBonusIds.has(runtimeEvent.id),
        textWord: textBonus ? this.getTextBonusWord(renderConfig, runtimeEvent?.id || source) : "",
        runtime,
        startsAt: runtimeEvent?.startsAt || 0,
        duration: runtimeEvent?.duration || 0,
        speed: runtimeEvent?.speed || 0,
        worldX,
        trackLeft,
        x: xPx,
        xPx,
        effectiveScale,
        bottom: `calc(var(--preview-world-height, 1px) * ${bottomFactor})`,
        zIndex,
        trigger: runtimeEvent?.trigger || this.getSpawnCollisionTrigger(source, renderConfig),
        config: renderConfig,
        collected: Boolean(
          !textBonus
          && runtimeEvent?.id
          && isBonusSpawnKind(textBonus ? "bonus" : this.getSpawnKindFromSource(source))
          && this.collectedSpawnIds.has(runtimeEvent.id)
        ),
        boxMode: this.getSpawnBoundingBoxMode(source, renderConfig.boundingBox || {}, runtime)
      };
    });
  }

  getStaticSceneHollowPlacements() {
    if (this.runnerPlaying) {
      return [];
    }

    return Object.entries(this.scene.spawnObjects || {})
      .filter(([source, config]) => config?.enabled && this.getSpawnKindFromSource(source) === "hollow")
      .map(([source, config], index) => {
        const renderConfig = this.getSpawnObjectRenderConfigForSource(source, config);
        return {
          id: `static-${hashString(`${source}:${index}`).toString(16)}`,
          source,
          index,
          x: clamp(Number(renderConfig.xPx ?? renderConfig.x ?? 0), -1200, 1200),
          trigger: this.getSpawnCollisionTrigger(source, renderConfig),
          config: renderConfig
        };
      });
  }

  syncStaticSceneHollowPlacement(trackNode) {
    if (!trackNode) {
      return;
    }

    trackNode.querySelectorAll(".tester-preview__scene-hollow-overlay, .tester-preview__scene-module-bb--static-hollow").forEach((node) => {
      node.remove();
    });

    const placements = this.getStaticSceneHollowPlacements();
    if (!placements.length) {
      delete trackNode.dataset.staticHollowCompositionKey;
      return;
    }

    trackNode.dataset.staticHollowCompositionKey = placements.map((placement) => {
      const bounds = placement.config?.boundingBox || {};
      return [
        placement.source,
        placement.x,
        bounds.x ?? 0,
        bounds.y ?? 0,
        getBoundsScaleX(bounds),
        getBoundsScaleY(bounds),
        bounds.showAlways ? "a" : "s",
        this.scene.boundingBox?.showAlways ? "all" : "one"
      ].join(":");
    }).join("|");

    const fragment = document.createDocumentFragment();
    placements.forEach((placement) => {
      const bounds = placement.config?.boundingBox || {};
      const resolvedSource = this.context.assets?.resolveRaw
        ? this.context.assets.resolveRaw(placement.source)
        : placement.source;

      const image = document.createElement("img");
      image.className = "tester-preview__scene-module tester-preview__scene-module--hollow tester-preview__scene-hollow-overlay";
      image.alt = "";
      image.decoding = "async";
      image.src = resolvedSource;
      image.dataset.previewTileIndex = `static-${placement.index}`;
      image.dataset.sceneReplacement = "hollow";
      image.dataset.scenePlacementX = Number(placement.x).toFixed(3);
      image.dataset.spawnEventId = placement.id;
      image.dataset.triggerEvent = placement.trigger?.event || "";
      image.dataset.triggerAction = placement.trigger?.action || "";
      image.dataset.triggerOutcome = placement.trigger?.outcome || "";
      image.dataset.spawnY = "0.000";
      image.dataset.spawnScale = "1.000";
      fragment.append(image);

      const box = document.createElement("span");
      box.className = "tester-preview__scene-module-bb tester-preview__scene-module-bb--hollow tester-preview__scene-module-bb--static-hollow";
      box.dataset.previewTileIndex = `static-${placement.index}`;
      box.dataset.sceneReplacement = "hollow";
      box.dataset.scenePlacementX = Number(placement.x).toFixed(3);
      box.dataset.spawnEventId = placement.id;
      box.dataset.triggerEvent = placement.trigger?.event || "";
      box.dataset.triggerAction = placement.trigger?.action || "";
      box.dataset.triggerOutcome = placement.trigger?.outcome || "";
      box.dataset.boundingBoxMode = this.getSpawnBoundingBoxMode(placement.source, bounds, false);
      box.dataset.spawnY = "0.000";
      box.dataset.spawnScale = "1.000";
      box.dataset.spawnBbX = Number(bounds.x || 0).toFixed(3);
      box.dataset.spawnBbY = Number(bounds.y || 0).toFixed(3);
      box.dataset.spawnBbScaleX = Number(getBoundsScaleX(bounds)).toFixed(3);
      box.dataset.spawnBbScaleY = Number(getBoundsScaleY(bounds)).toFixed(3);
      box.dataset.spawnBbThickness = Number(getBoundsThickness(bounds, 4)).toFixed(0);
      fragment.append(box);
    });
    trackNode.append(fragment);
  }

  ensureSceneSpawnPlane(trackNode) {
    if (!trackNode) {
      return null;
    }

    let spawnPlane = trackNode.querySelector(":scope > .tester-preview__spawn-plane");
    if (!spawnPlane) {
      spawnPlane = document.createElement("div");
      spawnPlane.className = "tester-preview__spawn-plane";
      spawnPlane.setAttribute("aria-hidden", "true");
      trackNode.append(spawnPlane);
    }

    trackNode.querySelectorAll(":scope > .tester-preview__spawn-object").forEach((node) => {
      spawnPlane.append(node);
    });

    return spawnPlane;
  }

  syncSceneTrackComposition(trackNode, tileIndexes = [], replacements = new Map(), objectPlacements = []) {
    if (!trackNode || !tileIndexes.length) {
      return;
    }

    const spawnPlane = this.ensureSceneSpawnPlane(trackNode);
    const currentTiles = getPreviewTrackTiles(trackNode);
    const sourceTile = currentTiles.find((tile) => tile.dataset.sceneReplacement !== "hollow" && tile.dataset.normalSrc) || currentTiles[0];
    if (!sourceTile) {
      return;
    }

    const normalSrc = sourceTile.dataset.normalSrc || sourceTile.src;
    detachTrackCharacterAnchors(trackNode);
    const objectCompositionKey = objectPlacements.map((placement) => {
      const bounds = placement.config?.boundingBox || {};
      return [
        placement.id,
        placement.source,
        placement.kind,
        placement.runtime ? placement.worldX : placement.trackLeft,
        placement.config?.y ?? 0,
        placement.config?.scale ?? 1,
        placement.collected ? "c" : "a",
        bounds.x ?? 0,
        bounds.y ?? 0,
        getBoundsScaleX(bounds),
        getBoundsScaleY(bounds),
        bounds.showAlways ? "a" : "s",
        this.scene.boundingBox?.showAlways ? "all" : "one"
      ].join(":");
    }).join("|");
    const compositionKey = `${tileIndexes.map((tileIndex) => {
      const replacement = replacements.get(tileIndex);
      if (!replacement) {
        return `${tileIndex}:s`;
      }
      const bounds = replacement.config?.boundingBox || {};
      return [
        tileIndex,
        "h",
        replacement.id,
        replacement.config?.y ?? 0,
        replacement.config?.scale ?? 1,
        bounds.x ?? 0,
        bounds.y ?? 0,
        getBoundsScaleX(bounds),
        getBoundsScaleY(bounds),
        bounds.showAlways ? "a" : "s",
        this.scene.boundingBox?.showAlways ? "all" : "one"
      ].join(":");
    }).join("|")}::objects:${objectCompositionKey}`;
    if (trackNode.dataset.sceneCompositionKey === compositionKey) {
      return;
    }

    const fragment = document.createDocumentFragment();
    tileIndexes.forEach((tileIndex) => {
      const replacement = replacements.get(tileIndex);
      const bounds = replacement?.config?.boundingBox || {};
      const tile = sourceTile.cloneNode(false);
      tile.classList.add("tester-preview__scene-module");
      tile.classList.toggle("tester-preview__scene-module--hollow", Boolean(replacement));
      tile.src = replacement
        ? (this.context.assets?.resolveRaw ? this.context.assets.resolveRaw(replacement.source) : replacement.source)
        : normalSrc;
      tile.dataset.normalSrc = normalSrc;
      tile.dataset.previewTileIndex = String(tileIndex);
      tile.dataset.sceneReplacement = replacement ? "hollow" : "false";
      tile.dataset.spawnEventId = replacement?.id || "";
      tile.dataset.triggerEvent = replacement?.trigger?.event || "";
      tile.dataset.triggerAction = replacement?.trigger?.action || "";
      tile.dataset.triggerOutcome = replacement?.trigger?.outcome || "";
      tile.dataset.spawnY = replacement ? Number(replacement.config?.y || 0).toFixed(3) : "0";
      tile.dataset.spawnScale = replacement ? Number(replacement.config?.scale ?? 1).toFixed(3) : "1";
      tile.dataset.spawnBbX = replacement ? Number(bounds.x || 0).toFixed(3) : "0";
      tile.dataset.spawnBbY = replacement ? Number(bounds.y || 0).toFixed(3) : "0";
      tile.dataset.spawnBbScaleX = replacement ? Number(getBoundsScaleX(bounds)).toFixed(3) : "1";
      tile.dataset.spawnBbScaleY = replacement ? Number(getBoundsScaleY(bounds)).toFixed(3) : "1";
      fragment.append(tile);
      if (replacement) {
        const box = document.createElement("span");
        box.className = "tester-preview__scene-module-bb tester-preview__scene-module-bb--hollow";
        box.dataset.previewTileIndex = String(tileIndex);
        box.dataset.spawnEventId = replacement.id || "";
        box.dataset.sceneReplacement = "hollow";
        box.dataset.triggerEvent = replacement.trigger?.event || "";
        box.dataset.triggerAction = replacement.trigger?.action || "";
        box.dataset.triggerOutcome = replacement.trigger?.outcome || "";
        box.dataset.boundingBoxMode = this.getSpawnBoundingBoxMode(replacement.source, bounds, true);
        box.dataset.spawnY = Number(replacement.config?.y || 0).toFixed(3);
        box.dataset.spawnScale = Number(replacement.config?.scale ?? 1).toFixed(3);
        box.dataset.spawnBbX = Number(bounds.x || 0).toFixed(3);
        box.dataset.spawnBbY = Number(bounds.y || 0).toFixed(3);
        box.dataset.spawnBbScaleX = Number(getBoundsScaleX(bounds)).toFixed(3);
        box.dataset.spawnBbScaleY = Number(getBoundsScaleY(bounds)).toFixed(3);
        box.dataset.spawnBbThickness = Number(getBoundsThickness(bounds, 4)).toFixed(0);
        fragment.append(box);
      }
    });

    const reusableObjectNodes = new Map();
    const desiredObjectIds = new Set();
    spawnPlane?.querySelectorAll(":scope > .tester-preview__spawn-object").forEach((node) => {
      const eventId = node.dataset.spawnEventId || "";
      if (eventId) {
        reusableObjectNodes.set(eventId, node);
      }
    });

    objectPlacements.forEach((placement) => {
      const eventId = String(placement.id || "");
      if (eventId) {
        desiredObjectIds.add(eventId);
      }
      const node = eventId && reusableObjectNodes.has(eventId)
        ? reusableObjectNodes.get(eventId)
        : this.createSceneObjectNode(placement);
      if (node) {
        this.updateStaticSceneObjectNode(node, placement);
        if (spawnPlane && node.parentElement !== spawnPlane) {
          spawnPlane.append(node);
        }
      }
    });
    reusableObjectNodes.forEach((node, eventId) => {
      if (!desiredObjectIds.has(eventId)) {
        node.remove();
      }
    });
    [...trackNode.children]
      .filter((node) => {
        return node.matches?.(PREVIEW_SCENE_TILE_SELECTOR)
          || node.classList?.contains("tester-preview__scene-module-bb")
          || node.classList?.contains("tester-preview__scene-hollow-overlay");
      })
      .forEach((node) => node.remove());
    trackNode.prepend(fragment);
    trackNode.dataset.sceneCompositionKey = compositionKey;
    trackNode.parentElement?.setAttribute("data-preview-tile-count", String(tileIndexes.length));
  }

  syncStaticSceneObjectComposition(trackNode, objectPlacements = []) {
    if (!trackNode) {
      return;
    }

    const spawnPlane = this.ensureSceneSpawnPlane(trackNode);
    const desiredIds = new Set(objectPlacements.map((placement) => String(placement.id || "")));
    spawnPlane?.querySelectorAll(":scope > .tester-preview__spawn-object").forEach((node) => {
      const eventId = node.dataset.spawnEventId || "";
      if (!desiredIds.has(eventId)) {
        node.remove();
      }
    });

    objectPlacements.forEach((placement) => {
      const eventId = String(placement.id || "");
      if (!eventId) {
        return;
      }

      let node = spawnPlane?.querySelector(`:scope > .tester-preview__spawn-object[data-spawn-event-id="${CSS.escape(eventId)}"]`);
      if (!node) {
        node = this.createSceneObjectNode(placement);
      } else {
        this.updateStaticSceneObjectNode(node, placement);
      }
      if (spawnPlane && node.parentElement !== spawnPlane) {
        spawnPlane.append(node);
      }
    });
  }

  updateStaticSceneObjectNode(node, placement = {}) {
    if (!node) {
      return;
    }

    const renderConfig = placement.config || {};
    const source = placement.source || "";
    const resolvedSource = this.context.assets?.resolveRaw ? this.context.assets.resolveRaw(source) : source;
    const bounds = renderConfig.boundingBox || {};
    const trigger = placement.trigger || this.getSpawnCollisionTrigger(source, renderConfig);
    const textBonus = placement.textBonus || this.isTextBonusSource(source, renderConfig);
    const sprite = this.getSpawnSpriteSheetForSource(source, renderConfig);
    const frameCount = Math.max(1, Number(sprite.frameCount || 1));
    const cachedAssetSize = this.previewAssetSizeCache.get(resolvedSource);
    const frameWidth = textBonus
      ? TEXT_BONUS_FRAME_SIZE.width
      : cachedAssetSize
      ? Math.max(1, cachedAssetSize.width / frameCount)
      : Math.max(1, Number(sprite.frameWidth || 1));
    const frameHeight = textBonus
      ? TEXT_BONUS_FRAME_SIZE.height
      : cachedAssetSize
      ? Math.max(1, cachedAssetSize.height)
      : Math.max(1, Number(sprite.frameHeight || 1));
    const fps = Math.max(1, Number(sprite.fps || 12));
    const isSpriteSheet = !textBonus && frameCount > 1;
    const spriteDuration = Number((frameCount / fps).toFixed(3));
    node.className = `tester-preview__spawn-object tester-preview__spawn-object--scene${textBonus ? " tester-preview__spawn-object--text-bonus" : ""}`;
    node.setAttribute("aria-hidden", "true");
    delete node.dataset.spawnVisualOnly;
    delete node.dataset.spawnVisualRuntime;
    node.dataset.spawnKind = placement.kind || (textBonus ? "bonus" : this.getSpawnKindFromSource(source));
    node.dataset.spawnSource = source;
    node.dataset.spawnResolvedSrc = textBonus ? "" : resolvedSource;
    node.dataset.spawnSprite = !textBonus && isSpriteSheet ? "true" : "false";
    node.dataset.spawnTextBonus = textBonus ? "true" : "false";
    node.dataset.spawnTextDecorative = placement.textBonusVisible ? "true" : "false";
    node.dataset.spawnTextEffect = textBonus ? (renderConfig.textEffect || "show") : "";
    node.dataset.spawnRuntime = placement.runtime ? "true" : "false";
    node.dataset.spawnPrerendered = "true";
    node.dataset.spawnCollected = placement.collected ? "true" : "false";
    node.dataset.spawnEventId = placement.id || "";
    node.dataset.spawnSoundId = renderConfig.soundId || placement.soundId || "";
    node.dataset.spawnStartsAt = Number(placement.startsAt || 0).toFixed(3);
    node.dataset.spawnDuration = Number(placement.duration || 0).toFixed(3);
    node.dataset.spawnSpeed = Number(placement.speed || 0).toFixed(3);
    node.dataset.spawnX = Number(placement.xPx ?? placement.x ?? renderConfig.xPx ?? renderConfig.x ?? 0).toFixed(3);
    node.dataset.spawnXPx = node.dataset.spawnX;
    node.dataset.spawnWorldX = Number(placement.worldX || 0).toFixed(3);
    node.dataset.spawnScale = Number(placement.effectiveScale ?? 1).toFixed(3);
    node.dataset.spawnAuthoredScale = Number(renderConfig.scale ?? 1).toFixed(3);
    node.dataset.spawnY = Number(renderConfig.y || 0).toFixed(3);
    node.dataset.triggerEvent = trigger.event || "";
    node.dataset.triggerAction = trigger.action || "";
    node.dataset.triggerOutcome = trigger.outcome || "";
    node.dataset.boundingBoxMode = placement.boxMode || this.getSpawnBoundingBoxMode(source, bounds, Boolean(placement.runtime));
    node.style.setProperty("--spawn-z", String(placement.zIndex || 71));
    node.style.setProperty("--spawn-left", `${Number(placement.trackLeft || 0).toFixed(3)}px`);
    node.style.setProperty("--spawn-bottom", placement.bottom || "10%");
    node.style.setProperty("--spawn-scale", Number(placement.effectiveScale ?? 1).toFixed(4));
    node.style.setProperty("--spawn-bb-x", `${Number(bounds.x || 0).toFixed(2)}%`);
    node.style.setProperty("--spawn-bb-y", `${Number(bounds.y || 0).toFixed(2)}%`);
    node.style.setProperty("--spawn-bb-scale", Number(bounds.scale || 1).toFixed(3));
    node.style.setProperty("--spawn-bb-scale-x", Number(getBoundsScaleX(bounds)).toFixed(3));
    node.style.setProperty("--spawn-bb-scale-y", Number(getBoundsScaleY(bounds)).toFixed(3));
    node.style.setProperty("--spawn-bb-thickness", `${Number(getBoundsThickness(bounds, 45)).toFixed(0)}px`);
    node.style.setProperty("--spawn-frame-width", `${frameWidth}px`);
    node.style.setProperty("--spawn-frame-height", `${frameHeight}px`);
    node.style.setProperty("--spawn-frame-count", String(frameCount));
    node.style.setProperty("--spawn-frame-steps", String(Math.max(1, frameCount - 1)));
    node.style.setProperty("--spawn-last-frame-x", frameCount > 1 ? "100%" : "0%");
    node.style.setProperty("--spawn-frame-duration", `${spriteDuration}s`);
    node.style.setProperty("--spawn-sprite-image", textBonus ? "none" : `url('${resolvedSource}')`);
    node.style.setProperty("--spawn-sprite-sheet-width", `${frameWidth * frameCount}px`);
    if (textBonus) {
      let textNode = node.querySelector(".tester-preview__spawn-text-bonus");
      if (!textNode) {
        node.replaceChildren();
        textNode = document.createElement("span");
        textNode.className = "tester-preview__spawn-text-bonus";
        node.append(textNode);
      }
      textNode.textContent = placement.textWord || this.getTextBonusWord(renderConfig, placement.id || source);
      this.applyTextBonusNodeStyle(textNode, renderConfig, Boolean(placement.collected), Boolean(placement.textBonusVisible));
    } else if (isSpriteSheet) {
      if (!node.querySelector(".tester-preview__spawn-object-sprite")) {
        node.replaceChildren();
        const spriteNode = document.createElement("span");
        spriteNode.className = "tester-preview__spawn-object-sprite";
        spriteNode.setAttribute("aria-hidden", "true");
        node.append(spriteNode);
      }
    } else {
      let image = node.querySelector(":scope > img");
      if (!image) {
        node.replaceChildren();
        image = document.createElement("img");
        image.alt = "";
        image.decoding = "async";
        node.append(image);
      }
      image.src = resolvedSource;
    }
  }

  createSceneObjectNode(placement = {}) {
    const renderConfig = placement.config || {};
    const source = placement.source || "";
    const textBonus = placement.textBonus || this.isTextBonusSource(source, renderConfig);
    const resolvedSource = this.context.assets?.resolveRaw ? this.context.assets.resolveRaw(source) : source;
    const bounds = renderConfig.boundingBox || {};
    const trigger = placement.trigger || this.getSpawnCollisionTrigger(source, renderConfig);
    const sprite = this.getSpawnSpriteSheetForSource(source, renderConfig);
    const frameCount = Math.max(1, Number(sprite.frameCount || 1));
    const cachedAssetSize = this.previewAssetSizeCache.get(resolvedSource);
    const frameWidth = textBonus
      ? TEXT_BONUS_FRAME_SIZE.width
      : cachedAssetSize
      ? Math.max(1, cachedAssetSize.width / frameCount)
      : Math.max(1, Number(sprite.frameWidth || 1));
    const frameHeight = textBonus
      ? TEXT_BONUS_FRAME_SIZE.height
      : cachedAssetSize
      ? Math.max(1, cachedAssetSize.height)
      : Math.max(1, Number(sprite.frameHeight || 1));
    const fps = Math.max(1, Number(sprite.fps || 12));
    const isSpriteSheet = !textBonus && frameCount > 1;
    const spriteDuration = Number((frameCount / fps).toFixed(3));
    const node = document.createElement("div");
    node.className = `tester-preview__spawn-object tester-preview__spawn-object--scene${textBonus ? " tester-preview__spawn-object--text-bonus" : ""}`;
    node.setAttribute("aria-hidden", "true");
    node.dataset.spawnKind = placement.kind || (textBonus ? "bonus" : this.getSpawnKindFromSource(source));
    node.dataset.spawnSource = source;
    node.dataset.spawnResolvedSrc = textBonus ? "" : resolvedSource;
    node.dataset.spawnSprite = !textBonus && isSpriteSheet ? "true" : "false";
    node.dataset.spawnTextBonus = textBonus ? "true" : "false";
    node.dataset.spawnTextDecorative = placement.textBonusVisible ? "true" : "false";
    node.dataset.spawnTextEffect = textBonus ? (renderConfig.textEffect || "show") : "";
    node.dataset.spawnRuntime = placement.runtime ? "true" : "false";
    node.dataset.spawnPrerendered = "true";
    node.dataset.spawnCollected = placement.collected ? "true" : "false";
    node.dataset.spawnEventId = placement.id || "";
    node.dataset.spawnSoundId = renderConfig.soundId || placement.soundId || "";
    node.dataset.spawnStartsAt = Number(placement.startsAt || 0).toFixed(3);
    node.dataset.spawnDuration = Number(placement.duration || 0).toFixed(3);
    node.dataset.spawnSpeed = Number(placement.speed || 0).toFixed(3);
    node.dataset.spawnX = Number(placement.xPx ?? placement.x ?? renderConfig.xPx ?? renderConfig.x ?? 0).toFixed(3);
    node.dataset.spawnXPx = node.dataset.spawnX;
    node.dataset.spawnWorldX = Number(placement.worldX || 0).toFixed(3);
    node.dataset.spawnScale = Number(placement.effectiveScale ?? 1).toFixed(3);
    node.dataset.spawnAuthoredScale = Number(renderConfig.scale ?? 1).toFixed(3);
    node.dataset.spawnY = Number(renderConfig.y || 0).toFixed(3);
    node.dataset.triggerEvent = trigger.event || "";
    node.dataset.triggerAction = trigger.action || "";
    node.dataset.triggerOutcome = trigger.outcome || "";
    node.dataset.boundingBoxMode = placement.boxMode || this.getSpawnBoundingBoxMode(source, bounds, Boolean(placement.runtime));
    node.style.setProperty("--spawn-z", String(placement.zIndex || 71));
    node.style.setProperty("--spawn-left", `${Number(placement.trackLeft || 0).toFixed(3)}px`);
    node.style.setProperty("--spawn-bottom", placement.bottom || "10%");
    node.style.setProperty("--spawn-scale", Number(placement.effectiveScale ?? 1).toFixed(4));
    node.style.setProperty("--spawn-bb-x", `${Number(bounds.x || 0).toFixed(2)}%`);
    node.style.setProperty("--spawn-bb-y", `${Number(bounds.y || 0).toFixed(2)}%`);
    node.style.setProperty("--spawn-bb-scale", Number(bounds.scale || 1).toFixed(3));
    node.style.setProperty("--spawn-bb-scale-x", Number(getBoundsScaleX(bounds)).toFixed(3));
    node.style.setProperty("--spawn-bb-scale-y", Number(getBoundsScaleY(bounds)).toFixed(3));
    node.style.setProperty("--spawn-bb-thickness", `${Number(getBoundsThickness(bounds, 45)).toFixed(0)}px`);
    node.style.setProperty("--spawn-frame-width", `${frameWidth}px`);
    node.style.setProperty("--spawn-frame-height", `${frameHeight}px`);
    node.style.setProperty("--spawn-frame-count", String(frameCount));
    node.style.setProperty("--spawn-frame-steps", String(Math.max(1, frameCount - 1)));
    node.style.setProperty("--spawn-last-frame-x", frameCount > 1 ? "100%" : "0%");
    node.style.setProperty("--spawn-frame-duration", `${spriteDuration}s`);
    node.style.setProperty("--spawn-sprite-image", textBonus ? "none" : `url('${resolvedSource}')`);
    node.style.setProperty("--spawn-sprite-sheet-width", `${frameWidth * frameCount}px`);
    if (textBonus) {
      const textNode = document.createElement("span");
      textNode.className = "tester-preview__spawn-text-bonus";
      textNode.textContent = placement.textWord || this.getTextBonusWord(renderConfig, placement.id || source);
      this.applyTextBonusNodeStyle(textNode, renderConfig, Boolean(placement.collected), Boolean(placement.textBonusVisible));
      node.append(textNode);
    } else if (isSpriteSheet) {
      const spriteNode = document.createElement("span");
      spriteNode.className = "tester-preview__spawn-object-sprite";
      spriteNode.setAttribute("aria-hidden", "true");
      node.append(spriteNode);
    } else {
      const image = document.createElement("img");
      image.alt = "";
      image.decoding = "async";
      image.src = resolvedSource;
      node.append(image);
    }
    return node;
  }

  syncSceneHollowReplacement(sceneLayerNode, replacement = null) {
    const trackNode = sceneLayerNode?.querySelector(".tester-preview__layer-track");
    if (!trackNode) {
      return { visible: false };
    }

    let segmentNode = trackNode.querySelector(".tester-preview__scene-hollow-segment");
    if (!replacement?.source) {
      if (segmentNode) {
        segmentNode.style.opacity = "0";
        segmentNode.dataset.spawnEventId = "";
      }
      sceneLayerNode.dataset.hollowReplacementActive = "false";
      return { visible: false };
    }

    if (!segmentNode) {
      segmentNode = document.createElement("img");
      segmentNode.className = "tester-preview__scene-hollow-segment";
      segmentNode.alt = "";
      segmentNode.decoding = "async";
      segmentNode.dataset.sceneReplacement = "hollow";
      trackNode.append(segmentNode);
    }

    const resolvedSource = this.context.assets?.resolveRaw
      ? this.context.assets.resolveRaw(replacement.source)
      : replacement.source;
    const referenceTile = getPreviewTrackTiles(trackNode)[0] || null;
    const referenceWidth = Math.max(
      1,
      Number.parseFloat(referenceTile?.style.width || "0"),
      Number(referenceTile?.getBoundingClientRect?.().width || 0) / Math.max(0.01, Number.parseFloat(getComputedStyle(sceneLayerNode).getPropertyValue("--layer-scale")) || 1)
    );
    const layerScale = Math.max(0.01, Number.parseFloat(getComputedStyle(sceneLayerNode).getPropertyValue("--layer-scale")) || 1);
    const canvasRect = getGameCanvasRect(this.previewNode || sceneLayerNode, this.scene.viewport);
    const trackRect = trackNode.getBoundingClientRect();
    const trackLeftInPreview = trackRect.left - canvasRect.left;
    const localLeft = ((replacement.left - trackLeftInPreview) / layerScale) - (referenceWidth / 2);
    const localYOffset = -1 * (Number(replacement.y || 0) / 100) * Math.max(1, trackNode.clientHeight || referenceTile?.clientHeight || 1);
    const visualScale = Math.max(0.01, Number(replacement.scale || 1));

    segmentNode.src = resolvedSource;
    segmentNode.dataset.spawnEventId = replacement.eventId || "";
    segmentNode.style.width = `${Number(referenceWidth.toFixed(3))}px`;
    segmentNode.style.opacity = "1";
    segmentNode.style.transform = `translate3d(${Number(localLeft.toFixed(3))}px, ${Number(localYOffset.toFixed(3))}px, 0) scale(${Number(visualScale.toFixed(3))})`;
    sceneLayerNode.dataset.hollowReplacementActive = "true";

    const segmentRect = segmentNode.getBoundingClientRect();
    const segmentLeft = segmentRect.left - canvasRect.left;
    const segmentRight = segmentRect.right - canvasRect.left;
    const visible = segmentNode.complete !== false
      && rectIntersectsCanvas(segmentRect, canvasRect);
    return {
      visible,
      left: segmentLeft,
      right: segmentRight
    };
  }

  applyAssetRelativeLayerOffsets(timestamp = performance.now(), elapsedOverride = null, options = {}) {
    if (!this.previewNode) {
      return;
    }

    const canvasMetrics = getGameCanvasMetrics(this.previewNode, this.scene.viewport);
    const previewWidth = canvasMetrics.width;
    const hasElapsedOverride = Number.isFinite(Number(elapsedOverride));
    const runnerElapsed = hasElapsedOverride
      ? Number(elapsedOverride)
      : this.runnerPlaying || this.runnerComplete
        ? this.getRunnerElapsed(timestamp)
        : this.runnerDistanceSeconds;
    const keepRuntimeScene = this.runnerPlaying || this.runnerComplete;
    const syncComposition = options.syncComposition ?? !keepRuntimeScene;
    const worldDurationPs = this.getPreviewWorldDurationPs();
    const worldElapsed = Math.min(runnerElapsed, worldDurationPs);
    const exitElapsed = Math.max(0, runnerElapsed - worldDurationPs);
    let scenePlaneMetrics = null;

    this.previewNode.querySelectorAll(".tester-preview__layer").forEach((layerNode) => {
      const layerId = layerNode.dataset.layerId || "";
      const travel = clamp(Number(layerNode.dataset.layerXTravel ?? 50), 0, 100) / 100;
      const cameraX = Number(layerNode.dataset.layerCameraX || 0);
      const visualNode = layerNode.querySelector(".tester-preview__layer-visual, .tester-preview__screen-fog, .tester-preview__lens-flare");
      const trackNode = visualNode?.querySelector(".tester-preview__layer-track") || null;
      const assetNode = getPreviewTrackTiles(trackNode)[0] || visualNode;
      const assetSize = getPreviewAssetLocalSize(assetNode, visualNode, previewWidth, canvasMetrics.height);
      const assetWidth = assetSize.width;
      const assetHeight = assetSize.height;
      const layerScale = Math.max(0.01, Number.parseFloat(getComputedStyle(layerNode).getPropertyValue("--layer-scale")) || 1);
      const runnerSpeed = Math.max(1, Number(layerNode.dataset.runnerSpeed || 1));
      const isAnimated = layerNode.dataset.animated === "true";
      const tileStride = Math.max(1, assetWidth - PREVIEW_TILE_OVERLAP_PX);
      const runnerDistance = tileStride;
      const runnerDuration = runnerSpeed > 0
        ? clamp(runnerDistance / runnerSpeed, 1.2, 60)
        : 60;
      const runnerOffset = isAnimated && keepRuntimeScene
        ? worldElapsed * runnerSpeed
        : 0;
      const runtimeRebaseOffset = isAnimated && keepRuntimeScene
        ? Math.floor(runnerOffset / PREVIEW_RUNTIME_REBASE_PX) * PREVIEW_RUNTIME_REBASE_PX
        : 0;
      const visualRunnerOffset = runnerOffset - runtimeRebaseOffset;
      const runnerPhase = runnerDuration > 0 ? runnerElapsed % runnerDuration : 0;
      const assetRelativeX = (0.5 - travel) * (previewWidth + assetWidth);
      const defaultLayerX = cameraX + assetRelativeX;
      const maxRunnerOffset = isAnimated && keepRuntimeScene
        ? worldDurationPs * runnerSpeed
        : 0;
      const layerWorldWidth = keepRuntimeScene
        ? Math.max(previewWidth, maxRunnerOffset + previewWidth + Math.abs(assetRelativeX) + tileStride)
        : previewWidth;
      const staticSceneTiles = layerId === "scene";
      const tileCount = keepRuntimeScene || staticSceneTiles
        ? clamp(
          Math.ceil((layerWorldWidth + Math.abs(assetRelativeX) + (tileStride * 2)) / tileStride) + 3,
          2,
          PREVIEW_SEQUENCE_MAX_TILE_COUNT
        )
        : 1;
      const leadingTileBuffer = Math.ceil((previewWidth + Math.abs(assetRelativeX)) / tileStride) + 2;
      const tileIndexes = keepRuntimeScene
        ? Array.from({ length: tileCount }, (_, index) => index - leadingTileBuffer)
        : staticSceneTiles
          ? getPreviewTileIndexes(tileCount)
          : [0];
      const trackMetricsKey = [
        tileCount,
        tileIndexes.join(","),
        Number(assetWidth.toFixed(3)),
        Number(assetHeight.toFixed(3)),
        Number(layerWorldWidth.toFixed(3)),
        Number(assetRelativeX.toFixed(3)),
        Number(previewWidth.toFixed(3))
      ].join(":");
      const allowMetricDrivenCompositionSync = true;
      const shouldSyncTrackComposition = syncComposition
        || (
          allowMetricDrivenCompositionSync
          && layerNode.dataset.previewTrackMetricsKey !== trackMetricsKey
        );

      if (trackNode && shouldSyncTrackComposition) {
        syncPreviewTrackTileCount(trackNode, tileCount, tileIndexes);
        if (layerId === "scene" && keepRuntimeScene) {
          this.syncSceneTrackComposition(
            trackNode,
            tileIndexes,
            this.getSceneHollowTileReplacements(tileStride, assetRelativeX),
            this.getSceneObjectPlacements(assetWidth, assetRelativeX, previewWidth)
          );
        } else if (layerId === "scene") {
          trackNode.querySelectorAll(".tester-preview__scene-hollow-overlay, .tester-preview__scene-module-bb--static-hollow").forEach((node) => node.remove());
          delete trackNode.dataset.staticHollowCompositionKey;
          delete trackNode.dataset.sceneCompositionKey;
          this.syncStaticSceneObjectComposition(
            trackNode,
            this.getSceneObjectPlacements(assetWidth, assetRelativeX, previewWidth)
          );
        } else {
          delete trackNode.dataset.sceneCompositionKey;
        }
        layerNode.dataset.previewTrackMetricsKey = trackMetricsKey;
      } else if (trackNode && layerId !== "scene" && !shouldSyncTrackComposition) {
        delete trackNode.dataset.sceneCompositionKey;
      }

      if (trackNode) {
        const tileNodes = getPreviewTrackTiles(trackNode);
        tileNodes.forEach((image, index) => {
          const tileIndex = Number(image.dataset.previewTileIndex ?? tileIndexes[index] ?? 0);
          const isHollowModule = image.dataset.sceneReplacement === "hollow";
          const hollowVisualScale = isHollowModule
            ? Math.max(0.01, Number(image.dataset.spawnScale || 1))
            : 1;
          const moduleBaseWidth = isHollowModule
            ? Math.max(1, getPreviewAssetLocalSize(image, visualNode, assetWidth, assetHeight).width)
            : assetWidth;
          const moduleBaseHeight = isHollowModule
            ? Math.max(1, getPreviewAssetLocalSize(image, visualNode, assetWidth, assetHeight).height)
            : assetHeight;
          const moduleWidth = Number((moduleBaseWidth * hollowVisualScale).toFixed(3));
          const moduleHeight = Number((moduleBaseHeight * hollowVisualScale).toFixed(3));
          const tileLeft = (tileIndex * tileStride) - (moduleWidth / 2);
          const renderTileLeft = tileLeft - runtimeRebaseOffset;
          const visualOffsetYFactor = isHollowModule
            ? Number((-1 * (Number(image.dataset.spawnY || 0) / 100)).toFixed(6))
            : 0;
          const visualOffsetY = isHollowModule
            ? `calc(var(--preview-world-height, 1px) * ${visualOffsetYFactor})`
            : "0px";
          const shouldPaintModule = !keepRuntimeScene
            || (renderTileLeft + moduleWidth >= visualRunnerOffset - (previewWidth * 4)
              && renderTileLeft <= visualRunnerOffset + (previewWidth * 6));
          image.style.width = `${Number(moduleWidth.toFixed(3))}px`;
          image.style.height = `${Number(moduleHeight.toFixed(3))}px`;
          image.style.visibility = shouldPaintModule ? "" : "hidden";
          image.style.transform = `translate(${Number(renderTileLeft.toFixed(3))}px, ${visualOffsetY})`;
        });
        trackNode.querySelectorAll(".tester-preview__scene-hollow-overlay").forEach((image) => {
          const hollowSize = getPreviewAssetLocalSize(image, visualNode, assetWidth, assetHeight);
          const hollowBaseWidth = hollowSize.width;
          const hollowBaseHeight = hollowSize.height;
          const placementX = clamp(Number(image.dataset.scenePlacementX ?? 0), -1200, 1200);
          const tileLeft = placementX - (hollowBaseWidth / 2);
          const renderTileLeft = tileLeft - runtimeRebaseOffset;
          const shouldPaintOverlay = !keepRuntimeScene
            || (renderTileLeft + hollowBaseWidth >= visualRunnerOffset - (previewWidth * 4)
              && renderTileLeft <= visualRunnerOffset + (previewWidth * 6));
          image.style.width = `${Number(hollowBaseWidth.toFixed(3))}px`;
          image.style.height = `${Number(hollowBaseHeight.toFixed(3))}px`;
          image.style.visibility = shouldPaintOverlay ? "" : "hidden";
          image.style.transform = `translate(${Number(renderTileLeft.toFixed(3))}px, 0)`;
        });
        trackNode.querySelectorAll(".tester-preview__scene-module-bb").forEach((box) => {
          const previewTileIndex = box.dataset.previewTileIndex || "0";
          const hollowModule = trackNode.querySelector(`.tester-preview__scene-module--hollow[data-preview-tile-index="${CSS.escape(previewTileIndex)}"]`);
          const isStaticHollow = box.classList.contains("tester-preview__scene-module-bb--static-hollow");
          const tileIndex = Number(previewTileIndex || 0);
          const hollowSize = getPreviewAssetLocalSize(hollowModule, visualNode, assetWidth, assetHeight);
          const hollowVisualScale = Math.max(0.01, Number(hollowModule?.dataset.spawnScale || box.dataset.spawnScale || 1));
          const hollowBaseWidth = Math.max(1, hollowSize.width * hollowVisualScale);
          const hollowBaseHeight = Math.max(1, hollowSize.height * hollowVisualScale);
          const placementX = clamp(Number(box.dataset.scenePlacementX ?? 0), -1200, 1200);
          const tileLeft = isStaticHollow
            ? placementX - (hollowBaseWidth / 2)
            : (tileIndex * tileStride) - (hollowBaseWidth / 2);
          const renderTileLeft = tileLeft - runtimeRebaseOffset;
          const shouldPaintBox = !keepRuntimeScene
            || (renderTileLeft + hollowBaseWidth >= visualRunnerOffset - (previewWidth * 4)
              && renderTileLeft <= visualRunnerOffset + (previewWidth * 6));
          const visualOffsetYFactor = Number((-1 * (Number(box.dataset.spawnY || 0) / 100)).toFixed(6));
          const visualOffsetY = `calc(var(--preview-world-height, 1px) * ${visualOffsetYFactor})`;
          const bbX = Number(box.dataset.spawnBbX || 0);
          const bbY = Number(box.dataset.spawnBbY || 0);
          const bbScaleX = Math.max(0.01, Number(box.dataset.spawnBbScaleX || box.dataset.spawnBbScale || 1));
          const bbScaleY = Math.max(0.01, Number(box.dataset.spawnBbScaleY || box.dataset.spawnBbScale || 1));
          const bbThickness = Math.max(0, Math.min(50, Number(box.dataset.spawnBbThickness || 4)));
          box.style.setProperty("--spawn-bb-thickness", `${Number(bbThickness.toFixed(0))}px`);
          box.style.width = `${Number(hollowBaseWidth.toFixed(3))}px`;
          box.style.height = `${Number(hollowBaseHeight.toFixed(3))}px`;
          box.style.visibility = shouldPaintBox ? "" : "hidden";
          box.style.transform = [
            `translate(${Number(renderTileLeft.toFixed(3))}px, ${visualOffsetY})`,
            `translate(${Number(bbX.toFixed(3))}%, ${Number(bbY.toFixed(3))}%)`,
            `scale(${Number(bbScaleX.toFixed(3))}, ${Number(bbScaleY.toFixed(3))})`
          ].join(" ");
        });
        trackNode.style.transform = `translateX(-${Number(visualRunnerOffset.toFixed(3))}px)`;
        if (layerId === "scene") {
          const sceneVisualRect = visualNode?.getBoundingClientRect?.();
          scenePlaneMetrics = {
            assetWidth,
            layerX: defaultLayerX,
            layerY: Number.parseFloat(layerNode.style.getPropertyValue("--layer-y")) || 0,
            layerZ: Number.parseFloat(layerNode.style.getPropertyValue("--layer-z-offset")) || 0,
            visualHeight: Math.max(1, Number(sceneVisualRect?.height || 0), canvasMetrics.height * layerScale),
            layerScale,
            runnerOffset: visualRunnerOffset,
            characterExitX: Math.max(0, exitElapsed * runnerSpeed)
          };
          trackNode.querySelectorAll(".tester-preview__spawn-object[data-spawn-runtime='true']").forEach((objectNode) => {
            const isRuntimeObject = objectNode.dataset.spawnRuntime === "true";
            const authoredX = clamp(Number(objectNode.dataset.spawnX ?? 0), -1200, 1200);
            const runtimeWorldX = Number(objectNode.dataset.spawnWorldX || 0);
            const trackLeft = isRuntimeObject
              ? runtimeWorldX - assetRelativeX - (previewWidth / 2)
              : authoredX;
            const renderTrackLeft = trackLeft - runtimeRebaseOffset;
            objectNode.style.setProperty("--spawn-left", `${Number(renderTrackLeft.toFixed(3))}px`);
          });
        }
      }

      if (trackNode) {
        trackNode.style.transform = `translateX(-${Number(visualRunnerOffset.toFixed(3))}px)`;
      }
      layerNode.style.setProperty("--layer-x", `${Number(defaultLayerX.toFixed(2))}px`);
      layerNode.style.setProperty("--runner-distance", `${Number(runnerDistance.toFixed(2))}px`);
      layerNode.style.setProperty("--runner-duration", `${Number(runnerDuration.toFixed(3))}s`);
      layerNode.style.setProperty("--runner-delay", isAnimated ? `-${Number(runnerPhase.toFixed(3))}s` : "0s");
      layerNode.style.setProperty("--runner-tile-overlap", `${PREVIEW_TILE_OVERLAP_PX}px`);
      layerNode.style.setProperty("--runner-tile-count", String(tileCount));
      layerNode.style.setProperty("--runner-world-width", `${Number(layerWorldWidth.toFixed(2))}px`);
      layerNode.style.setProperty("--runner-rebase-offset", `${Number(runtimeRebaseOffset.toFixed(2))}px`);
      layerNode.style.setProperty("--runner-visual-offset", `${Number(visualRunnerOffset.toFixed(2))}px`);
      if (layerId === "scene" && scenePlaneMetrics) {
        this.syncPreviewCharacterSceneAnchor(visualNode, scenePlaneMetrics, canvasMetrics, timestamp);
      }
    });
  }

  getPreviewCharacterViewportTransform() {
    const characterLayer = this.scene.layers.find((layer) => layer.id === "character") || defaultLayer("character");
    const viewport = normalizeViewportName(this.scene.viewport);
    const baseTransform = characterLayer.viewports?.[viewport]
      || characterLayer.viewports?.desktop
      || normalizeViewportTransform(characterLayer, viewport);
    const profile = this.getPreviewCharacterProfile();
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

  syncPreviewCharacterSceneAnchor(containerNode, scenePlaneMetrics, canvasMetrics, timestamp = performance.now()) {
    const anchorNode = containerNode?.querySelector(".tester-preview__character-anchor");
    const characterNode = anchorNode?.querySelector(".tester-preview__character-sprite");
    if (!characterNode || !scenePlaneMetrics) {
      return;
    }

    const transform = this.getPreviewCharacterViewportTransform();
    const x = clamp(Number(transform.x || 0), -1200, 1200);
    const yFactor = clamp(Number(transform.y || 0), -250, 250) / 100;
    const bottomFactor = Number((0.1 + yFactor).toFixed(6));
    const z = (Number(transform.z || 0) / 100) * Number(canvasMetrics?.width || 1);
    const authoredScale = Math.max(0.01, Number(transform.scale || 1));
    const canvasScale = clamp(Number(canvasMetrics?.scale || 1), 0.01, 1);
    const effectiveScale = getSceneBoundPreviewScale(authoredScale, canvasScale, { min: 0.01 });
    const runnerOffset = Math.max(0, Number(scenePlaneMetrics.runnerOffset || 0));
    const characterExitX = Math.max(0, Number(scenePlaneMetrics.characterExitX || 0));
    const syncedNodes = [
      characterNode,
      anchorNode.querySelector(".tester-preview__character-jump-guide")
    ].filter(Boolean);
    const isTrackAnchored = Boolean(anchorNode.closest(".tester-preview__layer-track"));
    const runnerCompensation = isTrackAnchored ? runnerOffset : 0;

    syncedNodes.forEach((node) => {
      node.style.setProperty("--preview-character-scene-x", `${Number((x + runnerCompensation).toFixed(2))}px`);
      node.style.setProperty("--preview-character-scene-y-factor", Number(yFactor.toFixed(6)));
      node.style.setProperty("--preview-character-scene-bottom-factor", Number(bottomFactor.toFixed(6)));
      node.style.setProperty("--preview-character-scene-z", `${Number(z.toFixed(2))}px`);
      node.style.setProperty("--preview-character-authored-scale", Number(authoredScale.toFixed(4)));
      node.style.setProperty("--preview-character-canvas-scale", Number(canvasScale.toFixed(4)));
      node.style.setProperty("--preview-character-scene-scale", effectiveScale);
      node.style.setProperty("--preview-character-exit-x", `${Number(characterExitX.toFixed(2))}px`);
      node.style.setProperty("--preview-character-anchor-transform", "translateX(-50%)");
    });
    characterNode.dataset.characterAuthoredScale = Number(authoredScale.toFixed(4));
    characterNode.dataset.characterCanvasScale = Number(canvasScale.toFixed(4));
    characterNode.dataset.characterEffectiveScale = String(effectiveScale);
    characterNode.dataset.characterBottomFactor = String(bottomFactor);
    characterNode.dataset.sceneAnchored = "true";
  }

  getPreviewCharacterProfile() {
    const character = this.context.character?.getConfig?.() || this.context.db?.get("character", {}) || {};
    return character.characters?.[character.selectedCharacterId] || character;
  }

  getPreviewCharacterAction(actionId, { allowDisabled = false } = {}) {
    const profile = this.getPreviewCharacterProfile();
    const actions = profile.actions || {};
    const defaultActionId = profile.defaultActionId || "idle";
    const deathAlias = String(actionId || "").toLowerCase() === "death" ? "dead" : "";
    const candidateIds = [actionId, deathAlias, defaultActionId, "idle", "run"].filter(Boolean);
    const seen = new Set();

    for (const id of candidateIds) {
      if (seen.has(id)) {
        continue;
      }
      seen.add(id);
      const action = actions[id] || DEFAULT_PREVIEW_CHARACTER_ACTIONS[id];
      if (action && (allowDisabled || action.enabled !== false)) {
        return normalizePreviewCharacterAction(id, action);
      }
    }

    return normalizePreviewCharacterAction("idle", DEFAULT_PREVIEW_CHARACTER_ACTIONS.idle);
  }

  getPreviewCharacterBaseActionId(isPlaying = this.runnerPlaying) {
    const profile = this.getPreviewCharacterProfile();
    const defaultActionId = profile.defaultActionId || "idle";
    const runAction = profile.actions?.run || DEFAULT_PREVIEW_CHARACTER_ACTIONS.run;
    if (isPlaying && runAction?.enabled !== false) {
      return "run";
    }

    return defaultActionId;
  }

  getPreviewCharacterSpeedMultiplier() {
    return this.runnerSpeedMultiplier;
  }

  isTextBonusSource(source = "", config = {}) {
    return isTextBonusSource(source, config);
  }

  resolveTextBonusAssetSource(source = "") {
    return this.context.assets?.resolveRaw ? this.context.assets.resolveRaw(source) : source;
  }

  loadTextBonusWordList(source = "") {
    const key = String(source || "");
    if (!key || this.textBonusWordListCache.has(key) || this.textBonusWordListPending.has(key) || typeof fetch !== "function") {
      return;
    }
    this.textBonusWordListPending.add(key);
    fetch(this.resolveTextBonusAssetSource(key))
      .then((response) => response.ok ? response.text() : "")
      .then((text) => {
        const words = parseWordListText(text);
        this.textBonusWordListCache.set(key, words.length ? words : DEFAULT_TEXT_BONUS_WORDS);
        this.textBonusWordOrderCache.clear();
        if (!this.updateTextBonusPreviewNodes()) {
          this.renderPreview();
        }
      })
      .catch(() => {
        this.textBonusWordListCache.set(key, DEFAULT_TEXT_BONUS_WORDS);
      })
      .finally(() => {
        this.textBonusWordListPending.delete(key);
      });
  }

  getTextBonusWords(config = {}) {
    const source = config.wordListSource || "";
    if (!source) {
      return DEFAULT_TEXT_BONUS_WORDS;
    }
    if (!this.textBonusWordListCache.has(source)) {
      this.loadTextBonusWordList(source);
    }
    return this.textBonusWordListCache.get(source) || DEFAULT_TEXT_BONUS_WORDS;
  }

  getTextBonusWordSource(config = {}) {
    return config.wordListSource || "";
  }

  isTextBonusPlanEntry(entry = {}) {
    return this.isTextBonusSource(entry.source || "", entry.config || entry);
  }

  getTextBonusWordOrder(config = {}, words = DEFAULT_TEXT_BONUS_WORDS) {
    const source = this.getTextBonusWordSource(config) || "default";
    const runSeed = this.textBonusRunSeed || this.spawnPlanSeed || this.runnerRuntimePaintSeed || this.scene.levelId || "preview";
    const cacheKey = `${runSeed}:${source}:${words.join("\u001f")}`;
    if (!this.textBonusWordOrderCache.has(cacheKey)) {
      this.textBonusWordOrderCache.set(cacheKey, shuffleWithRandom(words, createSeededRandom(cacheKey)));
    }
    return this.textBonusWordOrderCache.get(cacheKey) || words;
  }

  getTextBonusOccurrenceIndex(config = {}, seed = "") {
    const source = this.getTextBonusWordSource(config);
    const entries = this.spawnPlan || [];
    const index = entries
      .filter((entry) => this.isTextBonusPlanEntry(entry) && this.getTextBonusWordSource(entry.config || entry) === source)
      .findIndex((entry) => entry.id === seed);
    return index >= 0 ? index : hashString(seed || `${source}:text-bonus`);
  }

  getTextBonusWord(config = {}, seed = "") {
    const words = this.getTextBonusWords(config);
    const orderedWords = words.length > 1 ? this.getTextBonusWordOrder(config, words) : words;
    const index = orderedWords.length > 1 ? this.getTextBonusOccurrenceIndex(config, seed) % orderedWords.length : 0;
    return orderedWords[index] || DEFAULT_TEXT_BONUS_WORDS[0];
  }

  updateTextBonusPreviewNodes() {
    if (!this.previewNode) {
      return false;
    }

    const nodes = [...this.previewNode.querySelectorAll('.tester-preview__spawn-object[data-spawn-text-bonus="true"]')];
    if (!nodes.length) {
      return false;
    }

    nodes.forEach((node) => {
      const source = node.dataset.spawnSource || TEXT_BONUS_KEY;
      const eventId = node.dataset.spawnEventId || "";
      const runtimeEntry = eventId
        ? this.spawnPlan.find((entry) => entry.id === eventId)
        : null;
      const storedConfig = this.scene.spawnObjects?.[source] || {};
      const renderConfig = runtimeEntry?.config || this.getSpawnObjectRenderConfigForSource(source, storedConfig);
      const textNode = node.querySelector(".tester-preview__spawn-text-bonus");
      if (!textNode) {
        return;
      }

      textNode.textContent = this.getTextBonusWord(renderConfig, eventId || source);
      this.applyTextBonusNodeStyle(
        textNode,
        renderConfig,
        node.dataset.spawnCollected === "true",
        node.dataset.spawnTextDecorative === "true"
      );
    });

    return true;
  }

  isTextBonusVisible(config = {}, collected = false) {
    const effects = Array.isArray(config.effects) ? config.effects : [];
    const fadeOut = String(config.textEffect || "").toLowerCase() === "hide"
      || effects.some((effect) => effect?.type === "hideText");
    return fadeOut ? !collected : collected;
  }

  getThemeDevice() {
    return normalizeViewportName(this.scene.viewport);
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

  getTextBonusInlineStyle(config = {}, collected = false, forceVisible = false) {
    const design = this.context.db?.get?.("authoring.design", {}) || {};
    const styling = design.styling || {};
    const styleId = config.textStyle || TEXT_BONUS_STYLE_ID;
    const device = this.getThemeDevice();
    const token = this.getTextBonusStyleToken(styling, styleId, device);
    const effectColor = this.resolveThemeColor(styling, "accentColor", device);
    const color = this.resolveThemeColor(styling, token.color || "accentColor", device);
    const size = Math.max(8, Math.min(96, Number(token.size || 18)));
    return [
      `opacity:${forceVisible || this.isTextBonusVisible(config, collected) ? 1 : 0}`,
      `font-family:${getCssFontFamily(this.getTextBonusFontFamily(styling, token))}`,
      `font-size:${Number(size.toFixed(2))}px`,
      `font-weight:${String(token.weight || "900")}`,
      `color:${color}`,
      `text-transform:${String(token.transform || "uppercase")}`,
      `text-shadow:${this.getThemeTextShadow(token.effect || "pixel-shadow", effectColor)}`
    ].join(";");
  }

  applyTextBonusNodeStyle(textNode, config = {}, collected = false, forceVisible = false) {
    if (!textNode) {
      return;
    }
    const nextStyle = this.getTextBonusInlineStyle(config, collected, forceVisible);
    if (textNode.dataset.textBonusStyle === nextStyle) {
      return;
    }
    textNode.dataset.textBonusStyle = nextStyle;
    textNode.style.cssText = nextStyle;
  }

  getSpawnKindFromSource(source = "", config = {}) {
    if (config?.type || config?.kind) {
      return config.type || config.kind;
    }
    if (this.isTextBonusSource(source)) {
      return "bonus";
    }
    const parts = String(source || "").split("/").filter(Boolean);
    const spawnIndex = parts.lastIndexOf("spawn");
    const inferenceText = `${source || ""} ${config.internalName || ""}`;
    const inferredKind = spawnIndex >= 0 ? (parts[spawnIndex + 1] || "object") : inferSpawnKindFromText(inferenceText);
    const trigger = config.trigger && typeof config.trigger === "object" ? config.trigger : {};
    if (inferredKind === "object" && isNegativeSpawnTrigger(trigger)) {
      return "obstacle";
    }
    return inferredKind;
  }

  getSpawnCollisionTrigger(source = "", config = {}, kind = "") {
    const spawnKind = kind || this.getSpawnKindFromSource(source, config);
    const trigger = config.trigger && typeof config.trigger === "object" ? config.trigger : {};
    const negative = isNegativeSpawnKind(spawnKind);
    const bonus = isBonusSpawnKind(spawnKind);
    return {
      event: trigger.event || (spawnKind === "hollow" ? "fall" : "contact"),
      action: trigger.action || (spawnKind === "hollow" || negative ? "death" : (bonus ? "bonus" : "none")),
      outcome: trigger.outcome || (spawnKind === "hollow" || negative ? "restart-gameover" : (bonus ? "continue" : "none"))
    };
  }

  getSpawnEffects(source = "", config = {}) {
    if (Array.isArray(config.effects) && config.effects.length) {
      return config.effects;
    }
    if (this.isTextBonusSource(source, config)) {
      return [
        { type: "showText" },
        { type: "score", amount: 1 }
      ];
    }
    if (isBonusSpawnKind(this.getSpawnKindFromSource(source))) {
      return [
        { type: "hideAsset" },
        { type: "score", amount: 1 }
      ];
    }
    return [];
  }

  getPreviewCharacterSurfaceState() {
    return "grounded";
  }

  setPreviewCharacterPlaying(isPlaying = this.runnerPlaying) {
    if (this.runnerGameOver) {
      return;
    }

    this.previewCharacterBaseActionId = this.getPreviewCharacterBaseActionId(isPlaying);
    this.setPreviewCharacterAction(this.previewCharacterBaseActionId, { scheduleReturn: false });
  }

  isPreviewRunnerGameOver() {
    return Boolean(this.runnerGameOver);
  }

  syncPreviewCharacterActionNode(timestamp = performance.now()) {
    if (!this.previewNode) {
      return false;
    }

    const anchorNode = this.previewNode.querySelector(".tester-preview__character-anchor");
    const currentNode = anchorNode?.querySelector(".tester-preview__character-sprite");
    if (!anchorNode || !currentNode) {
      return false;
    }

    const template = document.createElement("template");
    template.innerHTML = this.renderPreviewCharacterSprite().trim();
    const nextNode = template.content.firstElementChild;
    if (!(nextNode instanceof HTMLElement)) {
      return false;
    }

    [
      "--preview-character-scene-x",
      "--preview-character-scene-y-factor",
      "--preview-character-scene-bottom-factor",
      "--preview-character-scene-z",
      "--preview-character-authored-scale",
      "--preview-character-canvas-scale",
      "--preview-character-scene-scale",
      "--preview-character-exit-x",
      "--preview-character-anchor-transform"
    ].forEach((property) => {
      const value = currentNode.style.getPropertyValue(property);
      if (value) {
        nextNode.style.setProperty(property, value);
      }
    });

    currentNode.replaceWith(nextNode);
    const applyOffsets = () => this.applyAssetRelativeLayerOffsets(timestamp, this.runnerDistanceSeconds);
    this.syncPreviewCharacterAssetSize(nextNode, applyOffsets);
    applyOffsets();
    this.updateLayoutPreviewHudTiming(timestamp, this.runnerDistanceSeconds);
    return true;
  }

  setPreviewCharacterAction(actionId, { scheduleReturn = false, allowDisabled = false, lockInput = false } = {}) {
    const action = this.getPreviewCharacterAction(actionId, { allowDisabled });
    window.clearTimeout(this.previewCharacterReturnTimer);
    this.previewCharacterReturnTimer = null;
    const previousActionId = this.previewCharacterActionId || this.previewCharacterBaseActionId || this.getPreviewCharacterBaseActionId();
    if (previousActionId !== action.id) {
      this.previewCharacterPreviousActionId = previousActionId;
    }
    this.previewCharacterActionId = action.id;
    const frameDurationMs = Math.max(1, (action.frameCount / action.fps) * 1000);
    const isJumpAction = this.isPreviewCharacterJumpAction(action);
    const durationMs = frameDurationMs;
    const startedAt = performance.now();
    this.previewCharacterActionStartedAt = startedAt;
    this.previewCharacterActionDurationMs = durationMs;
    if (lockInput && !action.loop) {
      this.previewCharacterActionInputLockedUntil = startedAt + durationMs;
    }
    if (isJumpAction) {
      this.characterFallStartedAt = 0;
    }
    this.previewCharacterAirborneUntil = isJumpAction ? startedAt + durationMs : 0;
    this.transitionRunnerSpeedTo(getCharacterSpeedMultiplier(action), startedAt, PREVIEW_RUNNER_STOP_DURATION_MS);
    if (!this.syncPreviewCharacterActionNode(startedAt)) {
      this.renderPreview();
    }

    if (scheduleReturn && !action.loop && !isDeathActionId(action.id)) {
      this.previewCharacterReturnTimer = window.setTimeout(() => {
        const returnActionId = this.resolvePreviewCharacterReturnTarget(action);
        if (returnActionId) {
          this.setPreviewCharacterAction(returnActionId, { scheduleReturn: false });
        }
      }, durationMs);
    }

    return action;
  }

  resolvePreviewCharacterReturnTarget(action = {}) {
    const returnTo = action.returnTo || (action.loop ? "none" : "previous");
    if (returnTo === "none") {
      return "";
    }
    if (returnTo === "previous") {
      return this.previewCharacterPreviousActionId || this.previewCharacterBaseActionId || this.getPreviewCharacterBaseActionId();
    }
    return returnTo;
  }

  isPreviewCharacterJumpAction(action = null) {
    const candidate = action || this.getPreviewCharacterAction(this.previewCharacterActionId, { allowDisabled: true });
    return candidate?.motionProfile === "jump-arc" || String(candidate?.id || "").toLowerCase().includes("jump");
  }

  isPreviewCharacterAirborne(timestamp = performance.now()) {
    return this.previewCharacterAirborneUntil > 0 && timestamp <= this.previewCharacterAirborneUntil;
  }

  playPreviewCharacterAction(actionId) {
    const timestamp = performance.now();
    if (this.previewCharacterActionInputLockedUntil > timestamp) {
      return null;
    }

    const action = this.getPreviewCharacterAction(actionId, { allowDisabled: true });
    if (this.isPreviewCharacterJumpAction(action) && this.isPreviewCharacterAirborne(timestamp)) {
      return null;
    }
    return this.setPreviewCharacterAction(actionId, { scheduleReturn: true, lockInput: true });
  }

  renderBackgroundStyle(background = {}) {
    const opacity = Math.max(0, Math.min(1, Number(background.opacity ?? 1)));
    if (background.type === "image" && background.src) {
      const resolvedSrc = this.context.assets?.resolveRaw ? this.context.assets.resolveRaw(background.src) : background.src;
      return `background:linear-gradient(rgba(7,16,23,${1 - opacity}), rgba(7,16,23,${1 - opacity})), url('${escapeHtml(resolvedSrc)}') center / cover no-repeat`;
    }

    if (background.type === "solid") {
      return `background:${hexToRgba(background.color || "#071017", opacity)}`;
    }

    return `background:linear-gradient(${Number(background.angle ?? 180)}deg, ${hexToRgba(background.from || "#102d29", opacity)}, ${hexToRgba(background.to || "#071110", opacity)})`;
  }

  getPreviewCharacterMaxJumpElevation(characterProfile = this.getPreviewCharacterProfile()) {
    const characterConfig = this.context.character?.getConfig?.() || this.context.db?.get("character", {}) || {};
    const viewport = this.scene.viewport === "mobile" ? "mobile" : "desktop";
    const profilePreview = characterProfile?.preview || {};
    const configPreview = characterConfig.preview || {};
    return Number(clamp(
      Number(
        profilePreview.viewports?.[viewport]?.maxJumpElevation
          ?? (viewport === "mobile" ? profilePreview.viewports?.desktop?.maxJumpElevation : undefined)
          ?? profilePreview.maxJumpElevation
          ?? configPreview.viewports?.[viewport]?.maxJumpElevation
          ?? (viewport === "mobile" ? configPreview.viewports?.desktop?.maxJumpElevation : undefined)
          ?? configPreview.maxJumpElevation
          ?? DEFAULT_MAX_JUMP_ELEVATION
      ),
      0,
      5
    ).toFixed(2));
  }

  renderPreviewCharacterSprite() {
    const actionId = this.previewCharacterActionId || this.getPreviewCharacterBaseActionId();
    const action = this.getPreviewCharacterAction(actionId);
    const characterProfile = this.getPreviewCharacterProfile();
    const resolvedSrc = this.context.assets?.resolveRaw ? this.context.assets.resolveRaw(action.src) : action.src;
    const frameCount = Math.max(1, Number(action.frameCount || 1));
    const cachedAssetSize = this.previewAssetSizeCache.get(resolvedSrc);
    const frameWidth = cachedAssetSize
      ? Math.max(1, cachedAssetSize.width / frameCount)
      : Math.max(1, Number(action.frameWidth || 0) || 128);
    const frameHeight = cachedAssetSize
      ? Math.max(1, cachedAssetSize.height)
      : Math.max(1, Number(action.frameHeight || 0) || 128);
    const frameRatio = this.getPreviewCharacterFrameRatio(frameWidth, frameHeight);
    const animationSteps = Math.max(1, frameCount - 1);
    const duration = Number((frameCount / Math.max(1, action.fps || 1)).toFixed(3));
    const isDeathAction = isDeathActionId(action.id);
    const shouldSuppressDeathFall = this.runnerGameOver
      && isDeathAction
      && String(this.runnerGameOverTrigger?.event || "").toLowerCase() !== "fall";
    const motionProfile = shouldSuppressDeathFall && action.motionProfile === "death-fall"
      ? "none"
      : (action.motionProfile || "none");
    const direction = characterProfile.preview?.facing === "left" ? -1 : 1;
    const maxJumpElevation = this.getPreviewCharacterMaxJumpElevation(characterProfile);
    const runX = 10 * direction;
    const lungeX = 22 * direction;
    const knockbackX = -24 * direction;
    const bounds = this.scene.characterBounds || { x: 0, y: 0, scale: 1 };
    const boundsScaleX = getBoundsScaleX(bounds);
    const boundsScaleY = getBoundsScaleY(bounds);
    const boundsThickness = getBoundsThickness(bounds, 4);
    const characterBoxMode = this.scene.boundingBox?.showAlways ? "always" : "hidden";
    const surfaceState = this.getPreviewCharacterSurfaceState();

    return `
      <div
        class="tester-preview__character-sprite"
        data-bounding-box-mode="${characterBoxMode}"
        data-character-surface="${surfaceState}"
        data-character-action-id="${escapeHtml(action.id)}"
        data-character-loop="${action.loop ? "true" : "false"}"
        data-character-animated="${frameCount > 1 ? "true" : "false"}"
        data-character-motion="${escapeHtml(motionProfile)}"
        data-character-src="${escapeHtml(resolvedSrc)}"
        data-character-frame-count="${frameCount}"
        data-character-frame-width="${Number(action.frameWidth || 0)}"
        data-character-frame-height="${Number(action.frameHeight || 0)}"
        data-asset-natural-width="${Number(cachedAssetSize?.width || 0)}"
        data-asset-natural-height="${Number(cachedAssetSize?.height || 0)}"
        style="
          --preview-character-duration:${duration}s;
          --preview-character-steps:${animationSteps};
          --preview-character-frame-count:${frameCount};
          --preview-character-frame-natural-width:${Number(frameWidth.toFixed(3))}px;
          --preview-character-frame-natural-height:${Number(frameHeight.toFixed(3))}px;
          --preview-character-frame-aspect:${frameRatio.aspect};
          --preview-character-frame-height-ratio:${frameRatio.heightRatio};
          --preview-character-last-frame-x:calc(var(--preview-character-frame-width) * -${animationSteps});
          --preview-character-jump-elevation:${maxJumpElevation};
          --preview-character-jump-y:calc(var(--preview-character-frame-height) * -${maxJumpElevation});
          --preview-character-run-x:${Number(runX.toFixed(2))}px;
          --preview-character-lunge-x:${Number(lungeX.toFixed(2))}px;
          --preview-character-knockback-x:${Number(knockbackX.toFixed(2))}px;
          --preview-character-bb-x:${Number(bounds.x || 0).toFixed(2)}%;
          --preview-character-bb-y:${Number(bounds.y || 0).toFixed(2)}%;
          --preview-character-bb-scale:${Number(bounds.scale || 1).toFixed(3)};
          --preview-character-bb-scale-x:${Number(boundsScaleX).toFixed(3)};
          --preview-character-bb-scale-y:${Number(boundsScaleY).toFixed(3)};
          --preview-character-bb-thickness:${Number(boundsThickness).toFixed(0)}px;
          --preview-character-image:url('${escapeHtml(resolvedSrc)}');
        "
      >
        <span class="tester-preview__character-frame" aria-hidden="true"></span>
      </div>
    `;
  }

  renderSceneCharacterAnchor() {
    if (!this.scene.selectedLayerIds.includes("scene")) {
      return "";
    }

    const characterProfile = this.getPreviewCharacterProfile();
    const actionId = this.previewCharacterActionId || this.getPreviewCharacterBaseActionId();
    const action = this.getPreviewCharacterAction(actionId);
    const resolvedSrc = this.context.assets?.resolveRaw ? this.context.assets.resolveRaw(action.src) : action.src;
    const frameCount = Math.max(1, Number(action.frameCount || 1));
    const cachedAssetSize = this.previewAssetSizeCache.get(resolvedSrc);
    const frameWidth = cachedAssetSize
      ? Math.max(1, cachedAssetSize.width / frameCount)
      : Math.max(1, Number(action.frameWidth || 0) || 128);
    const frameHeight = cachedAssetSize
      ? Math.max(1, cachedAssetSize.height)
      : Math.max(1, Number(action.frameHeight || 0) || 128);
    const maxJumpElevation = this.getPreviewCharacterMaxJumpElevation(characterProfile);

    return `
      <div class="tester-preview__character-anchor" data-character-anchor="scene-fixed">
        <span class="tester-preview__character-jump-guide" aria-hidden="true" style="--preview-character-frame-natural-width:${Number(frameWidth.toFixed(3))}px; --preview-character-frame-natural-height:${Number(frameHeight.toFixed(3))}px; --preview-character-jump-elevation:${maxJumpElevation}; --preview-character-jump-y:calc(var(--preview-character-frame-height) * -${maxJumpElevation});"></span>
        ${this.renderPreviewCharacterSprite()}
      </div>
    `;
  }

  renderLayerVisual(layer, previewSource) {
    if (layer.id === "character") {
      return `<div class="tester-preview__character-layer-proxy" aria-hidden="true"></div>`;
    }

    if (layer.id === "screen") {
      return `
        <div class="tester-preview__screen-fog">
          <div class="tester-preview__screen-fog-gradient"></div>
        </div>
      `;
    }

    if (layer.id === "lens") {
      return `
        <div class="tester-preview__lens-flare">
          <span class="tester-preview__lens-core"></span>
          <span class="tester-preview__lens-ring"></span>
          <span class="tester-preview__lens-streak"></span>
        </div>
      `;
    }

    if (!previewSource) {
      return `
        <div class="tester-preview__layer-visual tester-preview__layer-visual--empty">
          ${layer.id === "scene" ? '<div class="tester-preview__layer-track"><div class="tester-preview__spawn-plane" aria-hidden="true"></div></div>' : ""}
          ${layer.id === "scene" ? this.renderSceneCharacterAnchor() : ""}
        </div>
      `;
    }

    const resolvedSource = this.context.assets?.resolveRaw ? this.context.assets.resolveRaw(previewSource) : previewSource;
    const imgMarkup = (tileIndex) => `<img class="tester-preview__scene-module" src="${escapeHtml(resolvedSource)}" alt="" data-preview-tile-index="${tileIndex}" data-normal-src="${escapeHtml(resolvedSource)}" data-scene-replacement="false">`;
    const tileIndexes = this.runnerPlaying ? getPreviewRunnerTileIndexes(PREVIEW_SEQUENCE_MIN_TILE_COUNT) : [0];
    return `
      <div
        class="tester-preview__layer-visual tester-preview__layer-visual--image"
        data-pattern="${escapeHtml(layer.pattern || "none")}"
        data-animated="${layer.animated ? "true" : "false"}"
        data-preview-tile-count="${tileIndexes.length}"
      >
        <div class="tester-preview__layer-track">
          ${tileIndexes.map((tileIndex) => imgMarkup(tileIndex)).join("")}
          ${layer.id === "scene" ? '<div class="tester-preview__spawn-plane" aria-hidden="true"></div>' : ""}
        </div>
        ${layer.id === "scene" ? this.renderSceneCharacterAnchor() : ""}
      </div>
    `;
  }

  renderSpawnObjectVisuals() {
    const canvasMetrics = getGameCanvasMetrics(this.previewNode, this.scene.viewport);
    const previewWidth = canvasMetrics.width;
    const previewHeight = canvasMetrics.height;
    const entries = this.runnerPlaying
      ? this.spawnPlan
        .filter((entry) => entry.kind !== "hollow")
        .map((entry) => [entry.source, entry.config, entry])
      : Object.entries(this.scene.spawnObjects || {})
        .filter(([source, config]) => config?.enabled && this.getSpawnKindFromSource(source) !== "hollow")
        .map(([source, config]) => [source, config, null]);
    if (!entries.length) {
      return "";
    }

    const sceneLayer = this.scene.layers.find((layer) => layer.id === "scene") || LAYER_DEFAULTS.scene;
    const zIndex = Number(sceneLayer.zIndex || 70) + 1;
    const viewportMode = normalizeViewportName(this.scene.viewport);
    const canvasMaxSize = GAME_CANVAS_MAX_SIZE[viewportMode] || GAME_CANVAS_MAX_SIZE.desktop;
    const canvasScale = clamp(
      Math.min(previewWidth / canvasMaxSize.width, previewHeight / canvasMaxSize.height),
      0.01,
      1
    );
    return entries.map(([source, config, runtimeEvent]) => {
      const renderConfig = runtimeEvent?.config || this.getSpawnObjectRenderConfigForSource(source, config);
      const textBonus = this.isTextBonusSource(source, renderConfig);
      const resolvedSource = this.context.assets?.resolveRaw ? this.context.assets.resolveRaw(source) : source;
      const spawnKind = textBonus ? "bonus" : this.getSpawnKindFromSource(source);
      const bounds = renderConfig.boundingBox || {};
      const boundsThickness = getBoundsThickness(bounds, 45);
      const boxMode = this.getSpawnBoundingBoxMode(source, bounds, Boolean(runtimeEvent));
      const x = clamp(Number(renderConfig.xPx ?? renderConfig.x ?? 0), -1200, 1200);
      const y = clamp(Number(renderConfig.y ?? 0), -PREVIEW_SPAWN_Y_LIMIT, PREVIEW_SPAWN_Y_LIMIT);
      const scale = clamp(Number(renderConfig.scale ?? 1), 0, 6);
      const effectiveScale = textBonus ? 1 : getSceneBoundPreviewScale(scale, canvasScale);
      const worldX = runtimeEvent ? Number(runtimeEvent.worldX || previewWidth + 96) : x;
      const bottomFactor = Number((0.1 + (y / 100)).toFixed(6));
      const bottom = `calc(var(--preview-world-height, 1px) * ${bottomFactor})`;
      const className = spawnKind === "hollow"
        ? `tester-preview__spawn-object tester-preview__hollow-cut${runtimeEvent ? " tester-preview__hollow-cut--runtime" : ""}`
        : "tester-preview__spawn-object";
      const trigger = runtimeEvent?.trigger || this.getSpawnCollisionTrigger(source, renderConfig);
      const sprite = this.getSpawnSpriteSheetForSource(source, renderConfig);
      const frameCount = Math.max(1, Number(sprite.frameCount || 1));
      const cachedAssetSize = this.previewAssetSizeCache.get(resolvedSource);
      const frameWidth = textBonus
        ? TEXT_BONUS_FRAME_SIZE.width
        : cachedAssetSize
        ? Math.max(1, cachedAssetSize.width / frameCount)
        : Math.max(1, Number(sprite.frameWidth || 1));
      const frameHeight = textBonus
        ? TEXT_BONUS_FRAME_SIZE.height
        : cachedAssetSize
        ? Math.max(1, cachedAssetSize.height)
        : Math.max(1, Number(sprite.frameHeight || 1));
      const fps = Math.max(1, Number(sprite.fps || 12));
      const isSpriteSheet = !textBonus && frameCount > 1;
      const spriteDuration = Number((frameCount / fps).toFixed(3));
      const isCollected = !textBonus && Boolean(runtimeEvent?.id && this.collectedSpawnIds.has(runtimeEvent.id));
      const textBonusVisible = textBonus && runtimeEvent?.id && this.revealedTextBonusIds.has(runtimeEvent.id);
      const textWord = textBonus ? this.getTextBonusWord(renderConfig, runtimeEvent?.id || source) : "";
      const spriteMarkup = textBonus
        ? `<span class="tester-preview__spawn-text-bonus" style="${escapeHtml(this.getTextBonusInlineStyle(renderConfig, isCollected, textBonusVisible))}">${escapeHtml(textWord)}</span>`
        : isSpriteSheet
          ? `<span class="tester-preview__spawn-object-sprite" aria-hidden="true"></span>`
          : `<img src="${escapeHtml(resolvedSource)}" alt="">`;
      return `
        <div
          class="${className}${textBonus ? " tester-preview__spawn-object--text-bonus" : ""}"
          data-spawn-kind="${escapeHtml(spawnKind)}"
          data-spawn-source="${escapeHtml(source)}"
          data-spawn-resolved-src="${textBonus ? "" : escapeHtml(resolvedSource)}"
          data-spawn-sprite="${isSpriteSheet ? "true" : "false"}"
          data-spawn-text-bonus="${textBonus ? "true" : "false"}"
          data-spawn-text-decorative="${textBonusVisible ? "true" : "false"}"
          data-spawn-text-effect="${textBonus ? escapeHtml(renderConfig.textEffect || "show") : ""}"
          data-spawn-runtime="${runtimeEvent ? "true" : "false"}"
          data-spawn-collected="${isCollected ? "true" : "false"}"
          data-spawn-event-id="${escapeHtml(runtimeEvent?.id || "")}"
          data-spawn-sound-id="${escapeHtml(renderConfig.soundId || runtimeEvent?.soundId || "")}"
          data-spawn-starts-at="${runtimeEvent ? Number(runtimeEvent.startsAt).toFixed(3) : ""}"
          data-spawn-duration="${runtimeEvent ? Number(runtimeEvent.duration).toFixed(3) : ""}"
          data-spawn-speed="${runtimeEvent ? Number(runtimeEvent.speed || 0).toFixed(3) : ""}"
          data-spawn-x="${Number(x).toFixed(3)}"
          data-spawn-x-px="${Number(x).toFixed(3)}"
          data-spawn-world-x="${runtimeEvent ? Number(worldX).toFixed(3) : ""}"
          data-spawn-scale="${Number(effectiveScale).toFixed(3)}"
          data-spawn-authored-scale="${Number(scale).toFixed(3)}"
          data-spawn-y="${Number(y).toFixed(3)}"
          data-trigger-event="${escapeHtml(trigger.event)}"
          data-trigger-action="${escapeHtml(trigger.action)}"
          data-trigger-outcome="${escapeHtml(trigger.outcome)}"
          data-bounding-box-mode="${boxMode}"
          style="
            --spawn-z:${zIndex};
            --spawn-left:${Number(worldX.toFixed(3))}px;
            --spawn-bottom:${bottom};
            --spawn-scale:${effectiveScale};
            --spawn-bb-x:${Number(bounds.x || 0).toFixed(2)}%;
            --spawn-bb-y:${Number(bounds.y || 0).toFixed(2)}%;
            --spawn-bb-scale:${Number(bounds.scale || 1).toFixed(3)};
            --spawn-bb-scale-x:${Number(getBoundsScaleX(bounds)).toFixed(3)};
            --spawn-bb-scale-y:${Number(getBoundsScaleY(bounds)).toFixed(3)};
            --spawn-bb-thickness:${Number(boundsThickness).toFixed(0)}px;
            --spawn-frame-width:${frameWidth}px;
            --spawn-frame-height:${frameHeight}px;
            --spawn-frame-count:${frameCount};
            --spawn-frame-steps:${Math.max(1, frameCount - 1)};
            --spawn-last-frame-x:${frameCount > 1 ? "100%" : "0%"};
            --spawn-frame-duration:${spriteDuration}s;
            --spawn-sprite-image:${textBonus ? "none" : `url('${escapeHtml(resolvedSource)}')`};
            --spawn-sprite-sheet-width:${frameWidth * frameCount}px;
          "
        >
          ${spriteMarkup}
        </div>
      `;
    }).join("");
  }

  updateSpawnObjectPreviewNode(source, previewNode = this.previewNode) {
    if (!previewNode || !source) {
      return false;
    }

    const config = this.scene.spawnObjects?.[source];
    const nodes = [...previewNode.querySelectorAll(".tester-preview__spawn-object")]
      .filter((node) => node.dataset.spawnSource === source);
    if (!config || !nodes.length) {
      return false;
    }

    const canvasMetrics = getGameCanvasMetrics(previewNode, this.scene.viewport);
    const viewportMode = normalizeViewportName(this.scene.viewport);
    const canvasMaxSize = GAME_CANVAS_MAX_SIZE[viewportMode] || GAME_CANVAS_MAX_SIZE.desktop;
    const canvasScale = clamp(
      Math.min(canvasMetrics.width / canvasMaxSize.width, canvasMetrics.height / canvasMaxSize.height),
      0.01,
      1
    );
    const renderConfig = this.getSpawnObjectRenderConfigForSource(source, config);
    const textBonus = this.isTextBonusSource(source, renderConfig);
    const bounds = renderConfig.boundingBox || {};
    const x = clamp(Number(renderConfig.xPx ?? renderConfig.x ?? 0), -1200, 1200);
    const y = clamp(Number(renderConfig.y ?? 0), -PREVIEW_SPAWN_Y_LIMIT, PREVIEW_SPAWN_Y_LIMIT);
    const scale = clamp(Number(renderConfig.scale ?? 1), 0, 6);
    const effectiveScale = textBonus ? 1 : getSceneBoundPreviewScale(scale, canvasScale);
    const bottomFactor = Number((0.1 + (y / 100)).toFixed(6));
    const bottom = `calc(var(--preview-world-height, 1px) * ${bottomFactor})`;
    const trigger = this.getSpawnCollisionTrigger(source, renderConfig);
    const boxMode = this.getSpawnBoundingBoxMode(source, bounds, false);

    nodes.forEach((node) => {
      node.dataset.spawnX = Number(x).toFixed(3);
      node.dataset.spawnXPx = Number(x).toFixed(3);
      node.dataset.spawnScale = Number(effectiveScale).toFixed(3);
      node.dataset.spawnAuthoredScale = Number(scale).toFixed(3);
      node.dataset.spawnY = Number(y).toFixed(3);
      node.dataset.spawnTextBonus = textBonus ? "true" : "false";
      node.dataset.spawnTextDecorative = textBonus && this.revealedTextBonusIds.has(node.dataset.spawnEventId || "") ? "true" : "false";
      node.dataset.spawnTextEffect = textBonus ? (renderConfig.textEffect || "show") : "";
      node.dataset.triggerEvent = trigger.event || "";
      node.dataset.triggerAction = trigger.action || "";
      node.dataset.triggerOutcome = trigger.outcome || "";
      node.dataset.boundingBoxMode = boxMode;
      node.style.setProperty("--spawn-left", `${Number(x.toFixed(3))}px`);
      node.style.setProperty("--spawn-bottom", bottom);
      node.style.setProperty("--spawn-scale", Number(effectiveScale).toFixed(4));
      node.style.setProperty("--spawn-bb-x", `${Number(bounds.x || 0).toFixed(2)}%`);
      node.style.setProperty("--spawn-bb-y", `${Number(bounds.y || 0).toFixed(2)}%`);
      node.style.setProperty("--spawn-bb-scale", Number(bounds.scale || 1).toFixed(3));
      node.style.setProperty("--spawn-bb-scale-x", Number(getBoundsScaleX(bounds)).toFixed(3));
      node.style.setProperty("--spawn-bb-scale-y", Number(getBoundsScaleY(bounds)).toFixed(3));
      node.style.setProperty("--spawn-bb-thickness", `${Number(getBoundsThickness(bounds, 45)).toFixed(0)}px`);
      if (textBonus) {
        node.style.setProperty("--spawn-frame-width", `${TEXT_BONUS_FRAME_SIZE.width}px`);
        node.style.setProperty("--spawn-frame-height", `${TEXT_BONUS_FRAME_SIZE.height}px`);
        let textNode = node.querySelector(".tester-preview__spawn-text-bonus");
        if (!textNode) {
          node.replaceChildren();
          textNode = document.createElement("span");
          textNode.className = "tester-preview__spawn-text-bonus";
          node.append(textNode);
        }
        textNode.textContent = this.getTextBonusWord(renderConfig, node.dataset.spawnEventId || source);
        this.applyTextBonusNodeStyle(
          textNode,
          renderConfig,
          node.dataset.spawnCollected === "true",
          node.dataset.spawnTextDecorative === "true"
        );
      }
    });

    return true;
  }

  updateCharacterBoundsPreviewNode(bounds = {}, previewNode = this.previewNode) {
    if (!previewNode) {
      return false;
    }

    const nodes = [...previewNode.querySelectorAll(".tester-preview__character-sprite")];
    if (!nodes.length) {
      return false;
    }

    const scale = Number(bounds.scale || 1);
    const scaleX = Number(bounds.scaleX ?? scale);
    const scaleY = Number(bounds.scaleY ?? scale);
    const thickness = Math.max(0, Math.min(50, Number(bounds.thickness ?? 4)));

    nodes.forEach((node) => {
      node.style.setProperty("--preview-character-bb-x", `${Number(bounds.x || 0).toFixed(2)}%`);
      node.style.setProperty("--preview-character-bb-y", `${Number(bounds.y || 0).toFixed(2)}%`);
      node.style.setProperty("--preview-character-bb-scale", Number(scale).toFixed(3));
      node.style.setProperty("--preview-character-bb-scale-x", Number(scaleX).toFixed(3));
      node.style.setProperty("--preview-character-bb-scale-y", Number(scaleY).toFixed(3));
      node.style.setProperty("--preview-character-bb-thickness", `${Number(thickness.toFixed(0))}px`);
    });

    return true;
  }

  updateCharacterJumpElevationPreviewNode(elevation, previewNode = this.previewNode) {
    if (!previewNode) {
      return false;
    }

    const value = Number(clamp(Number(elevation ?? DEFAULT_MAX_JUMP_ELEVATION), 0, 5).toFixed(2));
    const nodes = [
      ...previewNode.querySelectorAll(".tester-preview__character-sprite"),
      ...previewNode.querySelectorAll(".tester-preview__character-jump-guide")
    ];
    if (!nodes.length) {
      return false;
    }

    const valueText = String(value);
    nodes.forEach((node) => {
      node.style.setProperty("--preview-character-jump-elevation", valueText);
      node.style.setProperty("--preview-character-jump-y", `calc(var(--preview-character-frame-height) * -${valueText})`);
    });

    return true;
  }

  getSpawnObjectRenderConfig(config = {}) {
    const viewport = this.scene.viewport === "mobile" ? "mobile" : "desktop";
    const viewportConfig = config.viewports && typeof config.viewports === "object" && config.viewports[viewport]
      ? config.viewports[viewport]
      : {};
    const legacyBounds = config.boundingBox && typeof config.boundingBox === "object" ? config.boundingBox : {};
    const viewportBounds = viewportConfig.boundingBox && typeof viewportConfig.boundingBox === "object" ? viewportConfig.boundingBox : {};

    return {
      ...config,
      ...viewportConfig,
      xPx: Number(viewportConfig.xPx ?? config.xPx ?? config.x ?? 0),
      boundingBox: {
        x: Number(viewportBounds.x ?? legacyBounds.x ?? 0),
        y: Number(viewportBounds.y ?? legacyBounds.y ?? 0),
        scale: Number(viewportBounds.scale ?? legacyBounds.scale ?? 1),
        scaleX: Number(viewportBounds.scaleX ?? legacyBounds.scaleX ?? viewportBounds.scale ?? legacyBounds.scale ?? 1),
        scaleY: Number(viewportBounds.scaleY ?? legacyBounds.scaleY ?? viewportBounds.scale ?? legacyBounds.scale ?? 1),
        thickness: getBoundsThickness(viewportBounds, legacyBounds.thickness ?? 45),
        showAlways: Boolean(viewportBounds.showAlways ?? legacyBounds.showAlways ?? false)
      }
    };
  }

  getSpawnSpriteSheetForSource(source = "", config = {}) {
    const animation = config.animation && typeof config.animation === "object" ? config.animation : {};
    if (config.spriteSheet && typeof config.spriteSheet === "object") {
      return {
        ...config.spriteSheet,
        fps: Math.max(1, Number(animation.fps ?? config.spriteSheet.fps ?? 12)),
        loop: animation.loop ?? config.spriteSheet.loop ?? true
      };
    }

    const spriteSheets = this.context.db?.get?.("assets.spriteSheets", {}) || {};
    const entry = Object.entries(spriteSheets).find(([key, value]) => {
      if (!value || typeof value !== "object") {
        return false;
      }
      return spriteSheetMatchesSource(source, config, key, value);
    });

    const spriteSheet = entry?.[1] || {};
    return {
      ...spriteSheet,
      fps: Math.max(1, Number(animation.fps ?? spriteSheet.fps ?? 12)),
      loop: animation.loop ?? spriteSheet.loop ?? true
    };
  }

  getSpawnObjectRenderConfigForSource(source = "", config = {}) {
    const renderConfig = this.getSpawnObjectRenderConfig(config);
    if (this.getSpawnKindFromSource(source) !== "hollow") {
      return renderConfig;
    }

    return {
      ...renderConfig,
      y: 0,
      scale: 1
    };
  }

  sync(eventPayload = {}) {
    const { renderPreview = true, ...payload } = eventPayload;
    this.rememberLayers(this.scene.layers);
    const persistableScene = this.getPersistableScene();
    this.scene = {
      ...this.scene,
      levels: persistableScene.levels
    };
    this.context.db?.merge("location", { scene: persistableScene });
    if (renderPreview) {
      if (!this.refreshPreviewLayout?.()) {
        this.renderPreview();
      }
    }
    this.context.events.emit("location:changed", { scene: this.scene, ...payload });
  }
}

export const moduleName = "InfiniteRunnerWorld";

export const DEFAULT_IRG_LEVEL = {
  durationPs: 30,
  preGamePs: 3,
  postGamePs: 0,
  minObjectDistancePs: 0.5,
  speedCoefficient: 1.2,
  desktopLevelSpeed: 1.2,
  mobileLevelSpeed: 1.2,
  incrementalSpeed: false,
  maxSpeedCoefficient: 1.2,
  paintSeed: "",
  backgroundParallaxSpeed: "native",
  foregroundParallaxSpeed: "native",
  hud: {
    mode: "overlay",
    zones: {
      header: {
        areas: {
          left: { direction: "row" },
          center: { direction: "row" },
          right: { direction: "row" }
        }
      },
      footer: {
        areas: {
          left: { direction: "row" },
          center: { direction: "row" },
          right: { direction: "row" }
        }
      }
    }
  }
};

export const IRG_RANDOMNESS_PROFILES = {
  never: { count: 0, jitter: 0, weight: 0 },
  rare: { count: 1, jitter: 0.42, weight: 0.18 },
  regular: { count: 2, jitter: 0.34, weight: 0.36 },
  frequent: { count: 4, jitter: 0.28, weight: 0.64 },
  "very-frequent": { count: 7, jitter: 0.22, weight: 0.92 }
};

export const BONUS_LINK_TARGETS = ["none", "obstacles", "hollow", "both"];
export const PARALLAX_SPEED_MODES = ["native", "linear", "logarithmic"];
export const HUD_LAYOUT_MODES = ["solid", "overlay"];
export const HUD_FLEX_DIRECTIONS = ["row", "column"];
export const HUD_AREA_IDS = ["left", "center", "right"];

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const LAST_OBSTACLE_TARGET_REMAINING_PS = 1;

export const hashString = (value = "") => {
  let hash = 2166136261;
  for (const char of String(value)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

export const createSeededRandom = (seedValue = "") => {
  let state = hashString(seedValue) || 1;
  return () => {
    state = Math.imul(1664525, state) + 1013904223;
    return (state >>> 0) / 4294967296;
  };
};

export const createInfiniteRunnerPaintSeed = (prefix = "paint") => {
  const now = new Date().toISOString();
  return `${prefix}-${now}-${Math.floor(Math.random() * 1000000).toString(36)}`;
};

export const normalizeRandomness = (value = "regular") => {
  const normalized = String(value || "").trim().toLowerCase();
  if (Object.prototype.hasOwnProperty.call(IRG_RANDOMNESS_PROFILES, normalized)) {
    return normalized;
  }
  const numeric = Number(normalized);
  if (Number.isFinite(numeric)) {
    if (numeric <= 0) return "never";
    if (numeric <= 0.25) return "rare";
    if (numeric <= 0.5) return "regular";
    if (numeric <= 0.75) return "frequent";
    return "very-frequent";
  }
  return "regular";
};

export const normalizeParallaxSpeedMode = (value = "native") => {
  const normalized = String(value || "native").trim().toLowerCase();
  return PARALLAX_SPEED_MODES.includes(normalized) ? normalized : "native";
};

export const normalizeHudLayoutMode = (value = "overlay") => {
  const normalized = String(value || "overlay").trim().toLowerCase();
  return HUD_LAYOUT_MODES.includes(normalized) ? normalized : "overlay";
};

export const normalizeHudFlexDirection = (value = "row") => {
  const normalized = String(value || "row").trim().toLowerCase();
  return HUD_FLEX_DIRECTIONS.includes(normalized) ? normalized : "row";
};

export const normalizeIrgHud = (hud = {}) => {
  const source = hud && typeof hud === "object" ? hud : {};
  const zones = source.zones && typeof source.zones === "object" ? source.zones : {};
  const normalizeZone = (zone = {}) => {
    const zoneSource = zone && typeof zone === "object" ? zone : {};
    const areas = zoneSource.areas && typeof zoneSource.areas === "object" ? zoneSource.areas : {};
    const fallbackDirection = normalizeHudFlexDirection(zoneSource.direction);

    return {
      ...zoneSource,
      areas: HUD_AREA_IDS.reduce((nextAreas, areaId) => {
        const area = areas[areaId] && typeof areas[areaId] === "object" ? areas[areaId] : {};
        nextAreas[areaId] = {
          ...area,
          direction: normalizeHudFlexDirection(area.direction || fallbackDirection)
        };
        return nextAreas;
      }, {})
    };
  };

  return {
    ...source,
    mode: normalizeHudLayoutMode(source.mode),
    zones: {
      header: normalizeZone(zones.header),
      footer: normalizeZone(zones.footer)
    }
  };
};

export const normalizeBonusLink = (value = "none") => {
  const normalized = String(value || "none").trim().toLowerCase();
  return BONUS_LINK_TARGETS.includes(normalized) ? normalized : "none";
};

export const normalizeLevelSpeed = (value, fallback = DEFAULT_IRG_LEVEL.speedCoefficient) => {
  const numeric = Number(value);
  const fallbackNumeric = Number(fallback);
  const safeFallback = Number.isFinite(fallbackNumeric) ? fallbackNumeric : DEFAULT_IRG_LEVEL.speedCoefficient;
  return Math.max(0.1, Number.isFinite(numeric) ? numeric : safeFallback);
};

export const levelSpeedForViewport = (level = {}, viewport = "desktop") => {
  const legacySpeed = normalizeLevelSpeed(level.speedCoefficient, DEFAULT_IRG_LEVEL.speedCoefficient);
  const desktopLevelSpeed = normalizeLevelSpeed(level.desktopLevelSpeed ?? level.speedCoefficient, legacySpeed);
  const mobileLevelSpeed = normalizeLevelSpeed(level.mobileLevelSpeed ?? level.speedCoefficient ?? desktopLevelSpeed, desktopLevelSpeed);
  return viewport === "mobile" ? mobileLevelSpeed : desktopLevelSpeed;
};

export const sceneSpeedForLevel = (level = {}, physics = {}, viewport = "desktop") => {
  const baseSpeed = Math.max(1, Number(level.worldScrollSpeed ?? physics.worldScrollSpeed ?? 420));
  const coefficient = levelSpeedForViewport(level, viewport);
  return Number((baseSpeed * coefficient).toFixed(3));
};

export const psToPixels = (ps = 0, sceneSpeed = 1) => {
  return Number((Math.max(0, Number(ps) || 0) * Math.max(1, Number(sceneSpeed) || 1)).toFixed(3));
};

export const pixelsToPs = (pixels = 0, sceneSpeed = 1) => {
  return Number((Math.max(0, Number(pixels) || 0) / Math.max(1, Number(sceneSpeed) || 1)).toFixed(3));
};

export const normalizeIrgLevel = (level = {}, legacyRunner = {}, physics = {}) => {
  const merged = {
    ...DEFAULT_IRG_LEVEL,
    worldScrollSpeed: physics.worldScrollSpeed ?? legacyRunner.worldScrollSpeed,
    speedCoefficient: legacyRunner.speedCoefficient,
    incrementalSpeed: legacyRunner.incrementalSpeed,
    maxSpeedCoefficient: legacyRunner.maxSpeedCoefficient,
    minObjectDistancePs: legacyRunner.minObjectDistancePs ?? legacyRunner.spawnMinDistancePixsecs,
    ...level
  };
  const legacySpeed = normalizeLevelSpeed(merged.speedCoefficient, DEFAULT_IRG_LEVEL.speedCoefficient);
  const desktopLevelSpeed = normalizeLevelSpeed(merged.desktopLevelSpeed ?? merged.speedCoefficient, legacySpeed);
  const mobileLevelSpeed = normalizeLevelSpeed(merged.mobileLevelSpeed ?? merged.speedCoefficient ?? desktopLevelSpeed, desktopLevelSpeed);
  const speedCoefficient = desktopLevelSpeed;
  return {
    durationPs: clamp(Number(merged.durationPs ?? DEFAULT_IRG_LEVEL.durationPs), 5, 120),
    preGamePs: clamp(Number(merged.preGamePs ?? DEFAULT_IRG_LEVEL.preGamePs), 0, 5),
    postGamePs: clamp(Number(merged.postGamePs ?? DEFAULT_IRG_LEVEL.postGamePs), 0, 5),
    minObjectDistancePs: Math.max(0.5, Number(merged.minObjectDistancePs ?? DEFAULT_IRG_LEVEL.minObjectDistancePs)),
    desktopLevelSpeed,
    mobileLevelSpeed,
    speedCoefficient,
    incrementalSpeed: Boolean(merged.incrementalSpeed),
    maxSpeedCoefficient: Math.max(desktopLevelSpeed, mobileLevelSpeed, Number(merged.maxSpeedCoefficient ?? speedCoefficient)),
    worldScrollSpeed: Math.max(1, Number(merged.worldScrollSpeed ?? physics.worldScrollSpeed ?? 420)),
    paintSeed: String(merged.paintSeed || ""),
    backgroundParallaxSpeed: normalizeParallaxSpeedMode(merged.backgroundParallaxSpeed),
    foregroundParallaxSpeed: normalizeParallaxSpeedMode(merged.foregroundParallaxSpeed),
    hud: normalizeIrgHud(merged.hud)
  };
};

export const getIrgLevelId = (levelId = "", fallback = "level-1") => {
  return String(levelId || fallback || "level-1");
};

export const normalizeIrgContract = (contract = {}, { scene = {}, physics = {}, fallbackLevelId = "level-1" } = {}) => {
  const activeLevelId = getIrgLevelId(contract.activeLevelId || scene.levelId, fallbackLevelId);
  const sourceLevels = contract.levels && typeof contract.levels === "object" ? contract.levels : {};
  const sceneLevels = scene.levels && typeof scene.levels === "object" ? scene.levels : {};
  const levelIds = new Set([activeLevelId, ...Object.keys(sceneLevels), ...Object.keys(sourceLevels)]);
  const levels = {};

  levelIds.forEach((levelId) => {
    const sceneLevel = sceneLevels[levelId] || {};
    levels[levelId] = normalizeIrgLevel(sourceLevels[levelId] || {}, sceneLevel.runner || scene.runner || {}, physics);
  });

  if (!levels[activeLevelId]) {
    levels[activeLevelId] = normalizeIrgLevel({}, scene.runner || {}, physics);
  }

  return {
    type: contract.type || "arcade-infinite-run",
    activeLevelId,
    levels
  };
};

export const normalizeSpawnType = (type = "object") => {
  const normalized = String(type || "object").trim().toLowerCase();
  if (["obstacle", "hollow", "bonus", "hazard", "platform"].includes(normalized)) {
    return normalized;
  }
  return "object";
};

export const normalizeSpawnEffects = (effects = [], spawnType = "object") => {
  if (Array.isArray(effects) && effects.length) {
    return effects
      .filter((effect) => effect && typeof effect === "object")
      .map((effect) => ({
        type: String(effect.type || "custom").trim(),
        action: String(effect.action || ""),
        amount: Number(effect.amount ?? 0)
      }));
  }

  if (spawnType === "bonus") {
    return [
      { type: "hideAsset" },
      { type: "score", amount: 1 }
    ];
  }

  return [];
};

export const normalizeWorldSpawn = (spawn = {}) => {
  const source = String(spawn.source || spawn.key || "");
  const trigger = spawn.trigger && typeof spawn.trigger === "object" ? spawn.trigger : {};
  const normalizedType = normalizeSpawnType(spawn.type || spawn.kind);
  const triggerAction = String(trigger.action || "").toLowerCase();
  const type = normalizedType === "object" && (triggerAction === "death" || triggerAction === "damage")
    ? "obstacle"
    : normalizedType;
  const maxOccurrences = Math.max(0, Math.round(Number(spawn.maxOccurrences ?? 1)));
  const randomness = normalizeRandomness(spawn.randomness);
  const animation = spawn.animation && typeof spawn.animation === "object" ? spawn.animation : {};
  const spriteSheet = spawn.spriteSheet && typeof spawn.spriteSheet === "object" ? spawn.spriteSheet : {};
  return {
    ...spawn,
    source,
    key: String(spawn.key || source),
    type,
    kind: type,
    enabled: spawn.enabled !== false && Boolean(source),
    internalName: String(spawn.internalName || spawn.name || ""),
    soundId: String(spawn.soundId || ""),
    xPx: Number(spawn.xPx ?? spawn.x ?? 0),
    y: Number(spawn.y ?? 0),
    scale: Math.max(0.01, Number(spawn.scale ?? 1)),
    boundingBox: spawn.boundingBox && typeof spawn.boundingBox === "object" ? spawn.boundingBox : {},
    maxOccurrences,
    randomness,
    bonusLink: normalizeBonusLink(spawn.bonusLink),
    trigger: {
      event: trigger.event || (type === "hollow" ? "fall" : "contact"),
      action: trigger.action || (type === "hollow" || type === "obstacle" || type === "hazard" ? "death" : (type === "bonus" ? "bonus" : "none")),
      outcome: trigger.outcome || (type === "hollow" || type === "obstacle" || type === "hazard" ? "restart-gameover" : (type === "bonus" ? "continue" : "none"))
    },
    effects: normalizeSpawnEffects(spawn.effects, type),
    spriteSheet: {
      ...spriteSheet,
      frameCount: Math.max(1, Number(spriteSheet.frameCount || 1))
    },
    animation: {
      fps: Math.max(1, Number(animation.fps ?? spriteSheet.fps ?? 12)),
      loop: animation.loop ?? spriteSheet.loop ?? true
    }
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

const supportsBonusLink = (bonusLink = "none", targetType = "object") => {
  if (bonusLink === "none") return false;
  if (bonusLink === "both") return targetType === "obstacle" || targetType === "hazard" || targetType === "hollow";
  if (bonusLink === "obstacles") return targetType === "obstacle" || targetType === "hazard";
  if (bonusLink === "hollow") return targetType === "hollow";
  return false;
};

const weightedPick = (items = [], random = Math.random) => {
  const totalWeight = items.reduce((sum, item) => sum + (IRG_RANDOMNESS_PROFILES[item.randomness]?.weight || 0), 0);
  if (totalWeight <= 0) {
    return null;
  }
  let cursor = random() * totalWeight;
  for (const item of items) {
    cursor -= IRG_RANDOMNESS_PROFILES[item.randomness]?.weight || 0;
    if (cursor <= 0) {
      return item;
    }
  }
  return items[items.length - 1] || null;
};

const distributeSlack = (count = 0, slack = 0, random = Math.random) => {
  if (count <= 0 || slack <= 0) {
    return [];
  }

  const weights = Array.from({ length: count }, () => 0.18 + Math.pow(random(), 1.9));
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0) || 1;
  return weights.map((weight) => (slack * weight) / totalWeight);
};

const createDistributedWorldPositions = ({
  count = 0,
  usableStartX = 0,
  usableEndX = 0,
  minObjectDistancePx = 1,
  random = Math.random
} = {}) => {
  const safeCount = Math.max(0, Math.round(Number(count) || 0));
  if (safeCount <= 0) {
    return [];
  }

  const startX = Number(usableStartX) || 0;
  const endX = Math.max(startX, Number(usableEndX) || startX);
  const usableWidthPx = Math.max(0, endX - startX);
  const minDistancePx = Math.max(1, Number(minObjectDistancePx) || 1);

  if (safeCount === 1) {
    const leadingSlack = usableWidthPx * (0.18 + (random() * 0.28));
    const trailingCap = Math.min(usableWidthPx * 0.2, minDistancePx * 0.8);
    return [clamp(startX + leadingSlack, startX, Math.max(startX, endX - trailingCap))];
  }

  const requiredSpanPx = minDistancePx * (safeCount - 1);
  const slackPx = Math.max(0, usableWidthPx - requiredSpanPx);
  const trailingCapPx = Math.min(slackPx, minDistancePx * 0.12);
  const trailingSlackPx = Math.min(trailingCapPx, slackPx * (0.02 + (random() * 0.08)));
  const remainingAfterTrailingPx = Math.max(0, slackPx - trailingSlackPx);
  const leadingCapPx = Math.min(remainingAfterTrailingPx, minDistancePx * 0.65);
  const leadingSlackPx = Math.min(leadingCapPx, remainingAfterTrailingPx * (0.08 + (random() * 0.2)));
  const innerSlackPx = Math.max(0, remainingAfterTrailingPx - leadingSlackPx);
  const innerExtras = distributeSlack(safeCount - 1, innerSlackPx, random);
  const positions = [startX + leadingSlackPx];

  for (let index = 1; index < safeCount; index += 1) {
    positions.push(positions[index - 1] + minDistancePx + (innerExtras[index - 1] || 0));
  }

  return positions.map((position, index) => {
    const minimumX = index === 0 ? startX : positions[index - 1] + minDistancePx;
    const maximumX = index === safeCount - 1 ? endX - trailingSlackPx : endX;
    return Number(clamp(position, minimumX, maximumX).toFixed(3));
  });
};

export const paintInfiniteRunnerWorld = ({
  level = {},
  physics = {},
  spawnObjects = [],
  seed = "",
  viewport = "desktop",
  viewportWidth = 1,
  objectWidth = 140
} = {}) => {
  const normalizedLevel = normalizeIrgLevel(level, {}, physics);
  const sceneSpeed = sceneSpeedForLevel(normalizedLevel, physics, viewport);
  const preGamePx = psToPixels(normalizedLevel.preGamePs, sceneSpeed);
  const gameWidthPx = psToPixels(normalizedLevel.durationPs, sceneSpeed);
  const postGamePx = psToPixels(normalizedLevel.postGamePs, sceneSpeed);
  const worldWidthPx = Number((preGamePx + gameWidthPx + postGamePx).toFixed(3));
  const minObjectDistancePx = psToPixels(normalizedLevel.minObjectDistancePs, sceneSpeed);
  const safeSeed = seed || normalizedLevel.paintSeed || "irg-preview";
  const random = createSeededRandom(safeSeed);
  const normalizedSpawns = spawnObjects
    .map((spawn) => normalizeWorldSpawn(spawn))
    .filter((spawn) => spawn.enabled);
  const gameStartX = preGamePx;
  const gameEndX = preGamePx + gameWidthPx;
  const usableStartX = gameStartX + minObjectDistancePx;
  const lastObstacleTargetX = gameEndX - psToPixels(LAST_OBSTACLE_TARGET_REMAINING_PS, sceneSpeed);
  const usableEndX = Math.max(
    usableStartX,
    Math.max(lastObstacleTargetX, gameEndX - (minObjectDistancePx * 0.25))
  );
  const usableWidthPx = Math.max(0, usableEndX - usableStartX);
  const physicalMaxSlots = Math.max(1, Math.floor(usableWidthPx / Math.max(1, minObjectDistancePx)) + 1);
  const entries = [];
  const scheduledBaseEntries = [];

  const createEntry = (spawn, worldX, index, patch = {}) => {
    const safeWorldX = Number(clamp(worldX, gameStartX, Math.max(gameStartX, gameEndX)).toFixed(3));
    const scale = Math.max(0.01, Number(spawn.scale || 1));
    const travelWidth = Math.max(1, Number(viewportWidth || 1)) + (Math.max(1, objectWidth) * scale * 2);
    const duration = Number(clamp(travelWidth / sceneSpeed, 0.4, 30).toFixed(3));
    const idSource = `${spawn.source}:${safeSeed}:${index}:${patch.pairedWith || ""}:${patch.kind || spawn.type}`;
    return {
      id: patch.id || `${hashString(idSource).toString(16)}-${index}`,
      source: spawn.source,
      kind: patch.kind || spawn.type,
      type: patch.kind || spawn.type,
      startsAt: Number(Math.max(0, (safeWorldX - Number(viewportWidth || 1)) / sceneSpeed).toFixed(3)),
      activePs: pixelsToPs(safeWorldX, sceneSpeed),
      worldX: safeWorldX,
      worldLength: worldWidthPx,
      duration,
      speed: sceneSpeed,
      soundId: patch.soundId || spawn.soundId || "",
      trigger: patch.trigger || spawn.trigger,
      effects: patch.effects || spawn.effects,
      config: {
        ...spawn,
        xPx: Number(spawn.xPx || 0),
        y: Number(spawn.y || 0),
        scale
      },
      pairedWith: patch.pairedWith || ""
    };
  };

  const schedulable = normalizedSpawns.filter((spawn) => {
    if (spawn.type === "bonus" && spawn.bonusLink !== "none") {
      return false;
    }
    return ["obstacle", "hollow", "hazard", "bonus"].includes(spawn.type);
  });
  const explicitQueue = [];
  schedulable
    .filter((spawn) => spawn.maxOccurrences > 0)
    .forEach((spawn) => {
      for (let index = 0; index < spawn.maxOccurrences; index += 1) {
        explicitQueue.push(spawn);
      }
    });

  const maxSlots = physicalMaxSlots;

  const candidateQueue = shuffleWithRandom(explicitQueue, random).slice(0, maxSlots);
  const autoSpawns = schedulable.filter((spawn) => spawn.maxOccurrences === 0 && IRG_RANDOMNESS_PROFILES[spawn.randomness]?.weight > 0);
  const availableAutoSlots = Math.max(0, maxSlots - candidateQueue.length);
  for (let slot = 0; slot < availableAutoSlots; slot += 1) {
    const picked = weightedPick(autoSpawns, random);
    if (!picked) {
      continue;
    }
    const profile = IRG_RANDOMNESS_PROFILES[picked.randomness] || IRG_RANDOMNESS_PROFILES.regular;
    if (random() <= profile.weight) {
      candidateQueue.push(picked);
    }
  }

  const scheduledQueue = shuffleWithRandom(candidateQueue, random).slice(0, maxSlots);
  const worldPositions = createDistributedWorldPositions({
    count: scheduledQueue.length,
    usableStartX,
    usableEndX,
    minObjectDistancePx,
    random
  });
  let previousWorldX = null;
  scheduledQueue.forEach((spawn, index) => {
    const minimumX = previousWorldX == null ? usableStartX : previousWorldX + minObjectDistancePx;
    const worldX = clamp(worldPositions[index] ?? minimumX, minimumX, usableEndX);
    if (previousWorldX != null && worldX - previousWorldX < minObjectDistancePx) {
      return;
    }
    const entry = createEntry(spawn, worldX, index);
    entries.push(entry);
    previousWorldX = entry.worldX;
    if (spawn.type !== "bonus") {
      scheduledBaseEntries.push(entry);
    }
  });

  const linkedBonuses = normalizedSpawns.filter((spawn) => spawn.type === "bonus" && spawn.bonusLink !== "none");
  linkedBonuses.forEach((bonus) => {
    const targets = scheduledBaseEntries.filter((entry) => supportsBonusLink(bonus.bonusLink, entry.kind));
    const cappedTargets = bonus.maxOccurrences > 0 ? targets.slice(0, bonus.maxOccurrences) : targets;
    cappedTargets.forEach((target, index) => {
      entries.push(createEntry(bonus, target.worldX, index, {
        pairedWith: target.id,
        id: `${target.id}-bonus-${hashString(bonus.source).toString(16)}`,
        kind: "bonus",
        soundId: bonus.soundId,
        trigger: bonus.trigger,
        effects: bonus.effects
      }));
    });
  });

  return {
    seed: safeSeed,
    sceneSpeed,
    level: normalizedLevel,
    world: {
      preGamePs: normalizedLevel.preGamePs,
      durationPs: normalizedLevel.durationPs,
      postGamePs: normalizedLevel.postGamePs,
      minObjectDistancePs: normalizedLevel.minObjectDistancePs,
      preGamePx,
      gameWidthPx,
      postGamePx,
      worldWidthPx,
      gameStartX,
      gameEndX,
      minObjectDistancePx
    },
    entries: entries.sort((left, right) => left.worldX - right.worldX)
  };
};

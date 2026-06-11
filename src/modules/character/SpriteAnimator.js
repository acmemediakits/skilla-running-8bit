export const moduleName = "SpriteAnimator";

const DEFAULT_FRAME_WIDTH = 128;
const DEFAULT_FRAME_HEIGHT = 128;
const DEFAULT_MAX_JUMP_ELEVATION = 1.5;
const CHARACTER_CHOICE_SESSION_KEY = "jsmii:characterChoice";
const DEFAULT_SELECTED_CHARACTER_TOKEN = "alieno";

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const DEFAULT_ACTION_ORDER = [
  "idle",
  "walk",
  "jump",
  "run",
  "dead",
  "attack_1",
  "attack_2",
  "attack_3",
  "shield",
  "hurt"
];

const DEFAULT_ACTION_MOTION = {
  idle: { motionProfile: "idle-breathe", speedProfile: "idle" },
  walk: { motionProfile: "walk-cycle", speedProfile: "1x" },
  run: { motionProfile: "run-cycle", speedProfile: "2x" },
  jump: { motionProfile: "jump-arc", speedProfile: "1x" },
  attack_1: { motionProfile: "lunge", speedProfile: "1x" },
  attack_2: { motionProfile: "lunge", speedProfile: "1x" },
  attack_3: { motionProfile: "lunge", speedProfile: "1x" },
  shield: { motionProfile: "guard", speedProfile: "idle" },
  hurt: { motionProfile: "knockback", speedProfile: "1x" },
  dead: { motionProfile: "death-fall", speedProfile: "idle" }
};

const MOTION_SPEED_MULTIPLIERS = {
  idle: 0,
  "1x": 1,
  "2x": 2
};

const DEFAULT_ACTIONS = {
  idle: {
    label: "Idle",
    src: "assets/dummy/character/Idle.png",
    fps: 8,
    loop: true,
    returnTo: "none",
    enabled: true,
    key: "",
    mouseGesture: "none",
    soundId: "idle-sfx",
    frameWidth: DEFAULT_FRAME_WIDTH,
    frameHeight: DEFAULT_FRAME_HEIGHT,
    frameCount: 6
  },
  walk: {
    label: "Walk",
    src: "assets/dummy/character/Walk.png",
    fps: 10,
    loop: true,
    returnTo: "none",
    enabled: true,
    key: "",
    mouseGesture: "none",
    soundId: "walk-sfx",
    frameWidth: DEFAULT_FRAME_WIDTH,
    frameHeight: DEFAULT_FRAME_HEIGHT,
    frameCount: 8
  },
  run: {
    label: "Run",
    src: "assets/dummy/character/Run.png",
    fps: 12,
    loop: true,
    returnTo: "none",
    enabled: true,
    key: "",
    mouseGesture: "swipe-right",
    soundId: "run-sfx",
    frameWidth: DEFAULT_FRAME_WIDTH,
    frameHeight: DEFAULT_FRAME_HEIGHT,
    frameCount: 8
  },
  jump: {
    label: "Jump",
    src: "assets/dummy/character/Jump.png",
    fps: 14,
    loop: false,
    returnTo: "previous",
    enabled: true,
    key: "Space",
    mouseGesture: "swipe-up",
    soundId: "jump-sfx",
    frameWidth: DEFAULT_FRAME_WIDTH,
    frameHeight: DEFAULT_FRAME_HEIGHT,
    frameCount: 12
  },
  attack_1: {
    label: "Attack 1",
    src: "assets/dummy/character/Attack_1.png",
    fps: 14,
    loop: false,
    returnTo: "previous",
    enabled: false,
    key: "KeyJ",
    mouseGesture: "click",
    soundId: "",
    frameWidth: DEFAULT_FRAME_WIDTH,
    frameHeight: DEFAULT_FRAME_HEIGHT,
    frameCount: 5
  },
  attack_2: {
    label: "Attack 2",
    src: "assets/dummy/character/Attack_2.png",
    fps: 14,
    loop: false,
    returnTo: "previous",
    enabled: false,
    key: "KeyK",
    mouseGesture: "double-tap",
    soundId: "",
    frameWidth: DEFAULT_FRAME_WIDTH,
    frameHeight: DEFAULT_FRAME_HEIGHT,
    frameCount: 3
  },
  attack_3: {
    label: "Attack 3",
    src: "assets/dummy/character/Attack_3.png",
    fps: 14,
    loop: false,
    returnTo: "previous",
    enabled: false,
    key: "KeyL",
    mouseGesture: "hold",
    soundId: "",
    frameWidth: DEFAULT_FRAME_WIDTH,
    frameHeight: DEFAULT_FRAME_HEIGHT,
    frameCount: 4
  },
  shield: {
    label: "Shield",
    src: "assets/dummy/character/Shield.png",
    fps: 8,
    loop: false,
    returnTo: "previous",
    enabled: false,
    key: "ShiftLeft",
    mouseGesture: "hold",
    soundId: "",
    frameWidth: DEFAULT_FRAME_WIDTH,
    frameHeight: DEFAULT_FRAME_HEIGHT,
    frameCount: 4
  },
  hurt: {
    label: "Hurt",
    src: "assets/dummy/character/Hurt.png",
    fps: 10,
    loop: false,
    returnTo: "previous",
    enabled: false,
    key: "",
    mouseGesture: "none",
    soundId: "",
    frameWidth: DEFAULT_FRAME_WIDTH,
    frameHeight: DEFAULT_FRAME_HEIGHT,
    frameCount: 2
  },
  dead: {
    label: "Dead",
    src: "assets/dummy/character/Dead.png",
    fps: 10,
    loop: false,
    returnTo: "none",
    enabled: true,
    key: "",
    mouseGesture: "none",
    soundId: "",
    frameWidth: DEFAULT_FRAME_WIDTH,
    frameHeight: DEFAULT_FRAME_HEIGHT,
    frameCount: 4
  }
};

const getDefaultReturnTo = (id, loop) => {
  if (loop) {
    return "none";
  }
  return id === "dead" ? "none" : "previous";
};

const isDeathActionId = (actionId = "") => ["death", "dead"].includes(String(actionId || "").toLowerCase());

const cloneValue = (value) => {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value));
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

const getCharacterClassToken = (characterId = "", profile = {}) => {
  const explicitClass = profile.presentationClass || profile.cssClass || profile.slug || "";
  if (explicitClass) {
    return normalizeClassToken(explicitClass);
  }

  const labelClass = normalizeClassToken(profile.label || "");
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
};

const getStoredSelectedCharacterId = (config = {}) => {
  const choice = readStoredCharacterChoice();
  const characters = config.characters && typeof config.characters === "object" ? config.characters : {};
  if (!choice || !Object.keys(characters).length) {
    return "";
  }

  const rawId = String(choice.id || choice.characterId || choice.profileId || "").trim();
  if (rawId && characters[rawId]) {
    return rawId;
  }

  const token = normalizeClassToken(choice.token || choice.currentCharacter || choice.value || rawId);
  if (!token) {
    return "";
  }

  return Object.entries(characters).find(([id, profile]) => (
    normalizeClassToken(id) === token
    || getCharacterClassToken(id, profile) === token
    || normalizeClassToken(profile?.label || "") === token
  ))?.[0] || "";
};

const getDefaultSelectedCharacterId = (config = {}) => {
  const characters = config.characters && typeof config.characters === "object" ? config.characters : {};
  const entries = Object.entries(characters);
  if (!entries.length) {
    return "";
  }

  return entries.find(([id, profile]) => (
    getCharacterClassToken(id, profile) === DEFAULT_SELECTED_CHARACTER_TOKEN
    || normalizeClassToken(profile?.label || "") === DEFAULT_SELECTED_CHARACTER_TOKEN
  ))?.[0] || (characters.hero ? "hero" : entries[0][0]);
};

const normalizeAction = (id, action = {}) => {
  const base = DEFAULT_ACTIONS[id] || {};
  const defaultMotion = DEFAULT_ACTION_MOTION[id] || { motionProfile: "none", speedProfile: "1x" };
  return {
    ...base,
    ...action,
    id,
    label: action.label || base.label || id,
    enabled: action.enabled ?? base.enabled ?? true,
    loop: action.loop ?? base.loop ?? true,
    returnTo: isDeathActionId(id)
      ? "none"
      : (action.returnTo ?? base.returnTo ?? getDefaultReturnTo(id, action.loop ?? base.loop ?? true)),
    fps: Number(action.fps ?? base.fps ?? 10),
    frameWidth: Number(action.frameWidth ?? base.frameWidth ?? DEFAULT_FRAME_WIDTH),
    frameHeight: Number(action.frameHeight ?? base.frameHeight ?? DEFAULT_FRAME_HEIGHT),
    frameCount: Number(action.frameCount ?? base.frameCount ?? 1),
    assetRef: action.assetRef ?? base.assetRef ?? "",
    src: action.src || base.src || "",
    key: action.key ?? base.key ?? "",
    mouseGesture: action.mouseGesture ?? base.mouseGesture ?? "none",
    soundId: action.soundId ?? base.soundId ?? "",
    motionProfile: action.motionProfile ?? base.motionProfile ?? defaultMotion.motionProfile,
    speedProfile: action.speedProfile ?? base.speedProfile ?? defaultMotion.speedProfile
  };
};

const normalizePreviewViewportTransform = (transform = {}) => ({
  x: Number(transform?.x ?? 0),
  y: Number(transform?.y ?? 0),
  scale: Number(transform?.scale ?? 1)
});

const normalizeCharacterProfile = (id = "hero", profile = {}) => {
  const actionOrder = Array.isArray(profile.actionOrder) && profile.actionOrder.length
    ? profile.actionOrder
    : DEFAULT_ACTION_ORDER;
  const actions = {};

  actionOrder.forEach((id) => {
    actions[id] = normalizeAction(id, profile.actions?.[id]);
  });

  return {
    id,
    label: profile.label || id,
    actionOrder,
    defaultActionId: profile.defaultActionId || "idle",
    weightProfile: profile.weightProfile || "man",
    strength: Number(profile.strength ?? 1),
    speedProfile: profile.speedProfile || "1x",
    preview: {
      anchorYPercent: Number(profile.preview?.anchorYPercent ?? 22),
      scale: Number(profile.preview?.scale ?? 2.8),
      facing: profile.preview?.facing || "right",
      maxJumpElevation: clamp(Number(profile.preview?.maxJumpElevation ?? DEFAULT_MAX_JUMP_ELEVATION), 0, 5),
      viewports: {
        ...(profile.preview?.viewports?.desktop ? { desktop: normalizePreviewViewportTransform(profile.preview.viewports.desktop) } : {}),
        ...(profile.preview?.viewports?.mobile ? { mobile: normalizePreviewViewportTransform(profile.preview.viewports.mobile) } : {})
      }
    },
    actions
  };
};

const normalizeConfig = (config = {}) => {
  const hasRoster = config.characters && typeof config.characters === "object";
  const rawCharacters = hasRoster
    ? config.characters
    : {
      hero: {
        id: "hero",
        label: config.label || "Hero",
        actionOrder: config.actionOrder,
        defaultActionId: config.defaultActionId,
        weightProfile: config.weightProfile,
        strength: config.strength,
        speedProfile: config.speedProfile,
        preview: config.preview,
        actions: config.actions
      }
    };
  const characters = {};
  const characterOrder = Array.isArray(config.characterOrder) && config.characterOrder.length
    ? config.characterOrder.filter((id) => rawCharacters[id])
    : Object.keys(rawCharacters);
  const orderedIds = characterOrder.length ? characterOrder : ["hero"];

  orderedIds.forEach((characterId) => {
    characters[characterId] = normalizeCharacterProfile(characterId, rawCharacters[characterId]);
  });

  const selectedCharacterId = characters[config.selectedCharacterId]
    ? config.selectedCharacterId
    : orderedIds[0];
  const active = characters[selectedCharacterId] || normalizeCharacterProfile("hero", {});

  return {
    ...active,
    selectedCharacterId,
    characterOrder: orderedIds,
    characters
  };
};

export default class SpriteAnimator {
  constructor(context) {
    this.context = context;
    this.config = normalizeConfig();
    this.previewNode = null;
    this.spriteNode = null;
    this.shadowNode = null;
    this.currentActionId = null;
    this.previousActionId = null;
    this.frameIndex = 0;
    this.lastFrameTime = 0;
    this.animationFrameId = null;
    this.assetCache = new Map();
    this.assetDimensions = new Map();
    this.appliedSpriteSrc = "";
    this.boundTick = this.tick.bind(this);
  }

  start() {
    const dbConfig = this.context.db?.get("character", {}) || {};
    const storedSelectedCharacterId = getStoredSelectedCharacterId(dbConfig);
    const selectedCharacterId = storedSelectedCharacterId || getDefaultSelectedCharacterId(dbConfig);
    this.config = normalizeConfig(selectedCharacterId
      ? { ...dbConfig, selectedCharacterId }
      : dbConfig);
    if (storedSelectedCharacterId) {
      this.context.db?.set?.("character.selectedCharacterId", storedSelectedCharacterId);
    }
    this.currentActionId = this.config.defaultActionId;
    this.preloadEnabledAssets();
    this.context.events.emit("character:ready", { config: this.getConfig() });
  }

  getConfig() {
    return cloneValue(this.config);
  }

  getCurrentActionId() {
    return this.currentActionId || this.config.defaultActionId;
  }

  resolveActionReturnTarget(action) {
    if (isDeathActionId(action?.id)) {
      return "";
    }

    const returnTo = action?.returnTo || getDefaultReturnTo(action?.id, action?.loop);
    if (returnTo === "none") {
      return "";
    }
    if (returnTo === "previous") {
      return this.previousActionId && this.config.actions[this.previousActionId]?.enabled
        ? this.previousActionId
        : this.config.defaultActionId;
    }
    return this.config.actions[returnTo]?.enabled ? returnTo : "";
  }

  getAction(actionId) {
    return this.config.actions[actionId] || null;
  }

  updateConfig(patch = {}, options = {}) {
    const selectedCharacterId = patch.selectedCharacterId || this.config.selectedCharacterId;
    const characters = {
      ...this.config.characters,
      ...(patch.characters || {})
    };
    const currentProfile = characters[selectedCharacterId] || this.config.characters[this.config.selectedCharacterId] || {};
    const activePatch = { ...patch };
    delete activePatch.selectedCharacterId;
    delete activePatch.characterOrder;
    delete activePatch.characters;

    characters[selectedCharacterId] = {
      ...currentProfile,
      ...activePatch,
      preview: {
        ...currentProfile.preview,
        ...(patch.preview || {})
      },
      actions: {
        ...currentProfile.actions,
        ...(patch.actions || {})
      }
    };

    this.config = normalizeConfig({
      ...this.config,
      ...patch,
      selectedCharacterId,
      characterOrder: patch.characterOrder || this.config.characterOrder,
      characters
    });

    this.context.db?.merge("character", this.config);
    this.context.events.emit("character:changed", { config: this.getConfig() });
    this.preloadEnabledAssets();
    if (options.renderPreview !== false) {
      this.renderPreview();
    }
    return this.getConfig();
  }

  updateAction(actionId, patch = {}) {
    const nextActions = {
      ...this.config.actions,
      [actionId]: normalizeAction(actionId, {
        ...this.config.actions[actionId],
        ...patch
      })
    };

    return this.updateConfig({ actions: nextActions });
  }

  setDefaultAction(actionId) {
    this.updateConfig({ defaultActionId: actionId });
    this.play(actionId, { forceRestart: true, triggerEvent: false });
  }

  setSelectedCharacter(characterId) {
    if (!this.config.characters[characterId]) {
      return this.getConfig();
    }

    this.stopLoop();
    this.currentActionId = null;
    this.appliedSpriteSrc = "";
    this.updateConfig({ selectedCharacterId: characterId });
    this.currentActionId = this.config.defaultActionId;
    this.play(this.config.defaultActionId, { forceRestart: true, triggerEvent: false });
    return this.getConfig();
  }

  addCharacter(label = "New Character") {
    const baseId = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "character";
    let id = baseId;
    let suffix = 2;
    while (this.config.characters[id]) {
      id = `${baseId}-${suffix++}`;
    }

    const source = this.config.characters[this.config.selectedCharacterId] || normalizeCharacterProfile("hero", {});
    this.updateConfig({
      selectedCharacterId: id,
      characterOrder: [...this.config.characterOrder, id],
      characters: {
        ...this.config.characters,
        [id]: {
          ...cloneValue(source),
          id,
          label
        }
      }
    });
    this.currentActionId = this.config.defaultActionId;
    this.renderPreview();
    return this.getConfig();
  }

  mountPreview(node) {
    this.previewNode = node;
    this.renderPreview();
  }

  renderPreview() {
    if (!this.previewNode) {
      return;
    }

    const actionId = this.currentActionId || this.config.defaultActionId;
    const action = this.config.actions[actionId];
    if (!action) {
      this.previewNode.innerHTML = '<div class="tester-character-preview__placeholder">No character action configured</div>';
      this.spriteNode = null;
      this.shadowNode = null;
      return;
    }

    this.ensurePreviewStage();
    this.applyPreviewStyles();
    this.applyFrame();
  }

  ensurePreviewStage() {
    if (this.spriteNode?.isConnected && this.shadowNode?.isConnected) {
      return;
    }

    this.previewNode.innerHTML = `
      <div class="tester-character-preview__stage">
        <div class="tester-character-preview__glow"></div>
        <div class="tester-character-preview__shadow"></div>
        <div class="tester-character-preview__sprite"></div>
      </div>
    `;

    this.spriteNode = this.previewNode.querySelector(".tester-character-preview__sprite");
    this.shadowNode = this.previewNode.querySelector(".tester-character-preview__shadow");
    this.appliedSpriteSrc = "";
  }

  applyPreviewStyles() {
    if (!this.spriteNode) {
      return;
    }

    this.spriteNode.style.setProperty("--character-anchor-y", `${this.config.preview.anchorYPercent}%`);
    this.spriteNode.style.setProperty("--character-scale", this.config.preview.scale);
    this.spriteNode.style.setProperty("--character-facing", this.config.preview.facing === "left" ? "-1" : "1");
    const action = this.config.actions[this.currentActionId || this.config.defaultActionId] || {};
    const dimensions = this.assetDimensions.get(action.src);
    const frameCount = Math.max(1, Number(action.frameCount || 1));
    const frameWidth = dimensions?.width ? dimensions.width / frameCount : Number(action.frameWidth || DEFAULT_FRAME_WIDTH);
    const frameHeight = dimensions?.height || Number(action.frameHeight || DEFAULT_FRAME_HEIGHT);
    const stageRect = this.previewNode?.getBoundingClientRect?.();
    const scale = Math.max(0.01, Number(this.config.preview.scale || 1));
    const maxWidth = Math.max(1, Number(stageRect?.width || 320) * 0.48);
    const maxHeight = Math.max(1, Number(stageRect?.height || 320) * 0.72);
    const containScale = Math.min(1, maxWidth / Math.max(1, frameWidth * scale), maxHeight / Math.max(1, frameHeight * scale));
    this.spriteNode.style.setProperty("--character-contain-scale", Number(containScale.toFixed(4)));

    if (this.shadowNode) {
      this.shadowNode.style.setProperty("--character-anchor-y", `${this.config.preview.anchorYPercent}%`);
      this.shadowNode.style.setProperty("--character-scale", this.config.preview.scale);
      this.shadowNode.style.setProperty("--character-contain-scale", Number(containScale.toFixed(4)));
    }
  }

  getMotionPhysics(action, progress) {
    const weight = Number(this.context.physics?.getWeightValue?.(this.config.weightProfile) ?? 1);
    const gravity = Number(this.context.physics?.getGravityValue?.() ?? 1);
    const strength = Math.max(0.1, Number(this.config.strength || 1));
    const dimensions = this.assetDimensions.get(action.src);
    const frameHeight = dimensions?.height || Number(action.frameHeight || DEFAULT_FRAME_HEIGHT);
    const globalSpeed = MOTION_SPEED_MULTIPLIERS[this.config.speedProfile] ?? 1;
    const actionSpeed = MOTION_SPEED_MULTIPLIERS[action.speedProfile] ?? 1;
    const speedFactor = Math.max(0.2, globalSpeed || 0.45) * Math.max(0.2, actionSpeed || 0.45);
    const weightFactor = 1 / Math.sqrt(Math.max(0.15, weight));
    const gravityFactor = 1 / Math.sqrt(Math.max(0.16, gravity));
    const maxJumpElevation = clamp(Number(this.config.preview?.maxJumpElevation ?? DEFAULT_MAX_JUMP_ELEVATION), 0, 5);

    return {
      progress,
      strength,
      frameHeight,
      maxJumpElevation,
      speedFactor,
      weightFactor,
      gravityFactor,
      direction: this.config.preview.facing === "left" ? -1 : 1
    };
  }

  getMotionOffset(action) {
    const frameCount = Math.max(1, action.frameCount);
    const progress = action.loop
      ? (this.frameIndex % frameCount) / frameCount
      : Math.min(1, this.frameIndex / Math.max(1, frameCount - 1));
    const metrics = this.getMotionPhysics(action, progress);
    const wave = Math.sin(progress * Math.PI * 2);
    const arc = Math.sin(progress * Math.PI);
    const settle = Math.sin(Math.min(1, progress) * Math.PI);

    switch (action.motionProfile) {
      case "idle-breathe":
        return { x: 0, y: -Math.max(1, 2.5 * metrics.strength) * Math.max(0, wave), scale: 1, shadowScale: 1 };
      case "walk-cycle":
        return {
          x: metrics.direction * wave * 2.5 * metrics.speedFactor * metrics.weightFactor,
          y: -Math.abs(wave) * 3 * metrics.weightFactor,
          scale: 1,
          shadowScale: 1 - Math.abs(wave) * 0.04
        };
      case "run-cycle":
        return {
          x: metrics.direction * wave * 5 * metrics.speedFactor * metrics.weightFactor,
          y: -Math.abs(wave) * 5 * metrics.weightFactor,
          scale: 1,
          shadowScale: 1 - Math.abs(wave) * 0.08
        };
      case "jump-arc": {
        const jumpHeight = metrics.frameHeight * metrics.maxJumpElevation;
        return {
          x: 0,
          y: -arc * jumpHeight,
          scale: 1,
          shadowScale: 1 - arc * 0.32,
          shadowOpacity: 1 - arc * 0.45
        };
      }
      case "lunge":
        return {
          x: metrics.direction * settle * 18 * metrics.strength * metrics.speedFactor * metrics.weightFactor,
          y: -settle * 4 * metrics.weightFactor,
          scale: 1 + settle * 0.025,
          shadowScale: 1 + settle * 0.08
        };
      case "guard":
        return {
          x: metrics.direction * -4 * metrics.weightFactor,
          y: 0,
          scale: 1,
          shadowScale: 1.05
        };
      case "knockback":
        return {
          x: metrics.direction * -settle * 22 * metrics.speedFactor * metrics.weightFactor,
          y: -settle * 8 * metrics.gravityFactor,
          scale: 1,
          shadowScale: 1 - settle * 0.12
        };
      case "death-fall":
        return {
          x: metrics.direction * -settle * 7 * metrics.weightFactor,
          y: settle * 14 * Math.sqrt(Math.max(0.16, 1 / metrics.gravityFactor)),
          scale: 1 - settle * 0.08,
          shadowScale: 1.15
        };
      case "none":
      default:
        return { x: 0, y: 0, scale: 1, shadowScale: 1, shadowOpacity: 1 };
    }
  }

  applyMotion(action) {
    const motion = this.getMotionOffset(action);
    this.spriteNode.style.setProperty("--character-motion-x", `${motion.x.toFixed(2)}px`);
    this.spriteNode.style.setProperty("--character-motion-y", `${motion.y.toFixed(2)}px`);
    this.spriteNode.style.setProperty("--character-motion-scale", Number(motion.scale || 1).toFixed(3));

    if (this.shadowNode) {
      this.shadowNode.style.setProperty("--character-motion-x", `${motion.x.toFixed(2)}px`);
      this.shadowNode.style.setProperty("--character-shadow-scale", Number(motion.shadowScale || 1).toFixed(3));
      this.shadowNode.style.setProperty("--character-shadow-opacity", Number(motion.shadowOpacity ?? 1).toFixed(3));
    }
  }

  preloadEnabledAssets() {
    Object.values(this.config.actions)
      .filter((action) => action.enabled && action.src)
      .forEach((action) => {
        this.preloadSpriteAsset(action.src);
      });
  }

  preloadSpriteAsset(src) {
    if (!src || this.assetCache.has(src)) {
      return this.assetCache.get(src) || Promise.resolve(null);
    }

    const resolvedSrc = this.context.assets?.resolveRaw ? this.context.assets.resolveRaw(src) : src;
    const image = new Image();
    const loadPromise = new Promise((resolve) => {
      image.onload = () => resolve(image);
      image.onerror = () => resolve(null);
      image.src = resolvedSrc;
    }).then(async (loadedImage) => {
      if (loadedImage) {
        this.assetDimensions.set(src, {
          width: loadedImage.naturalWidth || loadedImage.width || DEFAULT_FRAME_WIDTH,
          height: loadedImage.naturalHeight || loadedImage.height || DEFAULT_FRAME_HEIGHT
        });
        if (this.config.actions[this.currentActionId]?.src === src) {
          this.renderPreview();
        }
      }

      if (loadedImage?.decode) {
        try {
          await loadedImage.decode();
        } catch (error) {
          this.context.logger?.debug?.("Character sprite decode skipped", resolvedSrc, error);
        }
      }

      return loadedImage;
    });

    this.assetCache.set(src, loadPromise);
    return loadPromise;
  }

  play(actionId = this.config.defaultActionId, options = {}) {
    const { forceRestart = false, triggerEvent = true } = options;
    const action = this.config.actions[actionId];
    if (!action || !action.enabled) {
      return;
    }

    const isNewAction = this.currentActionId !== actionId;
    const previousActionId = this.currentActionId || this.config.defaultActionId;
    if (isNewAction) {
      this.previousActionId = previousActionId;
    }
    this.currentActionId = actionId;

    if (forceRestart || isNewAction) {
      this.frameIndex = 0;
      this.lastFrameTime = 0;
    }

    if (!this.spriteNode?.isConnected) {
      this.renderPreview();
    } else {
      this.applyPreviewStyles();
    }

    this.applyFrame();
    this.startLoop();

    if (triggerEvent) {
      this.context.events.emit("character:action-played", {
        actionId,
        action: cloneValue(action)
      });
    }

    this.context.events.emit("character:preview-updated", {
      actionId: this.getCurrentActionId(),
      config: this.getConfig()
    });
  }

  startLoop() {
    if (this.animationFrameId) {
      return;
    }

    this.animationFrameId = window.requestAnimationFrame(this.boundTick);
  }

  stopLoop() {
    if (!this.animationFrameId) {
      return;
    }

    window.cancelAnimationFrame(this.animationFrameId);
    this.animationFrameId = null;
  }

  tick(timestamp) {
    const action = this.config.actions[this.currentActionId];
    if (!action) {
      this.stopLoop();
      return;
    }

    if (!this.lastFrameTime) {
      this.lastFrameTime = timestamp;
    }

    const frameDuration = 1000 / Math.max(1, action.fps);
    if (timestamp - this.lastFrameTime >= frameDuration) {
      this.lastFrameTime = timestamp;
      this.frameIndex += 1;

      if (this.frameIndex >= action.frameCount) {
        if (action.loop) {
          this.frameIndex = 0;
        } else {
          const returnActionId = this.resolveActionReturnTarget(action);
          const fallbackAction = returnActionId ? this.config.actions[returnActionId] : null;

          if (returnActionId && this.currentActionId !== returnActionId && fallbackAction?.enabled) {
            this.currentActionId = returnActionId;
            this.frameIndex = 0;
            this.lastFrameTime = timestamp;
            this.applyFrame();
            this.context.events.emit("character:preview-updated", {
              actionId: this.getCurrentActionId(),
              config: this.getConfig()
            });
          } else {
            this.frameIndex = action.frameCount - 1;
            this.applyFrame();
            this.stopLoop();
            return;
          }
        }
      }

      this.applyFrame();
    }

    this.animationFrameId = window.requestAnimationFrame(this.boundTick);
  }

  applyFrame() {
    const action = this.config.actions[this.currentActionId];
    if (!action || !this.spriteNode) {
      return;
    }

    this.spriteNode.style.width = `${action.frameWidth}px`;
    this.spriteNode.style.height = `${action.frameHeight}px`;

    const spriteSrc = this.context.assets?.resolveRaw ? this.context.assets.resolveRaw(action.src) : action.src;
    if (this.appliedSpriteSrc !== spriteSrc) {
      this.spriteNode.style.backgroundImage = `url("${spriteSrc}")`;
      this.appliedSpriteSrc = spriteSrc;
    }

    const isStaticImage = Number(action.frameCount) <= 1;
    const dimensions = this.assetDimensions.get(action.src);
    const frameCount = Math.max(1, Number(action.frameCount || 1));
    const naturalFrameWidth = dimensions?.width ? Math.max(1, dimensions.width / frameCount) : null;
    const naturalFrameHeight = dimensions?.height ? Math.max(1, dimensions.height) : null;
    if (isStaticImage) {
      const width = Number(dimensions?.width || action.frameWidth);
      const height = Number(dimensions?.height || action.frameHeight);
      this.spriteNode.style.width = `${width}px`;
      this.spriteNode.style.height = `${height}px`;
      this.spriteNode.style.backgroundPosition = "center";
      this.spriteNode.style.backgroundSize = "contain";
      this.spriteNode.style.backgroundRepeat = "no-repeat";
    } else {
      const frameWidth = naturalFrameWidth || action.frameWidth;
      const frameHeight = naturalFrameHeight || action.frameHeight;
      this.spriteNode.style.width = `${frameWidth}px`;
      this.spriteNode.style.height = `${frameHeight}px`;
      this.spriteNode.style.backgroundRepeat = "no-repeat";
      this.spriteNode.style.backgroundPosition = `-${this.frameIndex * frameWidth}px 0px`;
      this.spriteNode.style.backgroundSize = `${frameCount * frameWidth}px ${frameHeight}px`;
    }
    this.applyMotion(action);
  }
}

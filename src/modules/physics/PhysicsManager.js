export const moduleName = "PhysicsManager";

const normalizeConfig = (config = {}) => {
  const presets = {
    gravity: {
      space: 0.16,
      moon: 0.36,
      earth: 1,
      jupiter: 2.4,
      ...(config.presets?.gravity || {})
    },
    weight: {
      stone: 2.4,
      car: 1.8,
      man: 1,
      bird: 0.45,
      cloud: 0.15,
      ...(config.presets?.weight || {})
    }
  };

  const gravityPreset = config.gravityPreset || "earth";
  const sampleBodyProfile = config.sampleBodyProfile || "man";

  return {
    presets,
    gravityPreset,
    drag: Number(config.drag ?? 0),
    terminalVelocity: Number(config.terminalVelocity ?? 24),
    worldScrollSpeed: Number(config.worldScrollSpeed ?? 420),
    sampleBodyProfile
  };
};

export default class PhysicsManager {
  constructor(context) {
    this.context = context;
    this.config = normalizeConfig();
  }

  start() {
    this.config = normalizeConfig(this.context.db?.get("physics", {}));
    this.context.events.emit("physics:ready", { config: this.config });
  }

  getConfig() {
    return this.config;
  }

  updateConfig(patch = {}) {
    this.config = normalizeConfig({
      ...this.config,
      ...patch
    });
    this.context.db?.merge("physics", this.config);
    this.context.events.emit("physics:changed", { config: this.config });
    return this.config;
  }

  getGravityValue() {
    return Number(this.config.presets.gravity[this.config.gravityPreset] ?? 1);
  }

  getWeightValue(profile = this.config.sampleBodyProfile) {
    return Number(this.config.presets.weight[profile] ?? 1);
  }

  getAcceleration(profile = this.config.sampleBodyProfile) {
    return Number((this.getGravityValue() * this.getWeightValue(profile)).toFixed(3));
  }

  step(body = {}, delta = 1) {
    const velocityY = Number(body.velocityY || 0);
    const positionY = Number(body.positionY || 0);
    const profile = body.weightProfile || this.config.sampleBodyProfile;
    const acceleration = this.getAcceleration(profile);
    const dragFactor = Math.max(0, 1 - this.config.drag);

    const nextVelocity = Math.min(
      (velocityY + acceleration * delta) * dragFactor,
      this.config.terminalVelocity
    );

    return {
      ...body,
      velocityY: Number(nextVelocity.toFixed(3)),
      positionY: Number((positionY + nextVelocity * delta).toFixed(3)),
      acceleration,
      weightProfile: profile
    };
  }
}

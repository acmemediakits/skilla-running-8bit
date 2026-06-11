const importVersioned = (path, runtimeSettings) => {
  const version = runtimeSettings?.build?.version || "dev";
  const queryKey = runtimeSettings?.assets?.queryKey || "v";
  const url = new URL(path, import.meta.url);
  url.searchParams.set(queryKey, version);
  return import(url.toString());
};

export const bootJsmii = async (runtimeSettings) => {
  const { Kernel } = await importVersioned("./core/Kernel.js", runtimeSettings);
  const kernel = new Kernel(runtimeSettings);

  kernel.registerModule("audio", () => importVersioned("./modules/audio/AudioManager-overall-volume.js", runtimeSettings));
  kernel.registerModule("character", () => importVersioned("./modules/character/SpriteAnimator.js", runtimeSettings));
  kernel.registerModule("data", () => importVersioned("./modules/data/DataFetcher.js", runtimeSettings));
  kernel.registerModule("db", () => importVersioned("./modules/db/JsonDbManager.js", runtimeSettings));
  kernel.registerModule("debug", () => importVersioned("./modules/debug/GameBuilder.js", runtimeSettings));
  kernel.registerModule("gameplay", () => importVersioned("./modules/gameplay/ArcadeRunner.js", runtimeSettings));
  kernel.registerModule("interface", () => importVersioned("./modules/interface/LoadingOverlay.js", runtimeSettings));
  kernel.registerModule("location", () => importVersioned("./modules/location/LayerManager.js", runtimeSettings));
  kernel.registerModule("physics", () => importVersioned("./modules/physics/PhysicsManager.js", runtimeSettings));
  kernel.registerModule("screens", () => importVersioned("./modules/screens/ScreenRepository-sound-nongame.js", runtimeSettings));

  await kernel.boot();

  return kernel;
};

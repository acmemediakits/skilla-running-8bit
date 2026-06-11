export class ModuleLoader {
  constructor(logger) {
    this.logger = logger;
    this.registry = new Map();
    this.instances = new Map();
  }

  register(id, resolver) {
    this.registry.set(id, resolver);
  }

  async load(id, context) {
    if (this.instances.has(id)) {
      return this.instances.get(id);
    }

    const resolver = this.registry.get(id);
    if (!resolver) {
      throw new Error(`Module '${id}' is not registered.`);
    }

    this.logger.debug("Lazy loading module", id);
    const importedModule = await resolver();
    const ModuleClass = importedModule.default || importedModule[importedModule.moduleName] || Object.values(importedModule)[0];
    const instance = new ModuleClass(context);

    this.instances.set(id, instance);

    return instance;
  }
}

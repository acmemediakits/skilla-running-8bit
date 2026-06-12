export const moduleName = "JsonDbManager";

const isPlainObject = (value) => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const mergeListById = (baseItems = [], overrideItems = []) => {
  const baseById = new Map();
  baseItems.forEach((item) => {
    const id = isPlainObject(item) ? item.id : "";
    if (id) {
      baseById.set(id, item);
    }
  });

  const seenIds = new Set();
  const mergedItems = overrideItems.map((item) => {
    const id = isPlainObject(item) ? item.id : "";
    if (id) {
      seenIds.add(id);
    }

    return id && baseById.has(id)
      ? deepMerge(baseById.get(id), item)
      : item;
  });

  baseItems.forEach((item) => {
    const id = isPlainObject(item) ? item.id : "";
    if (!id || !seenIds.has(id)) {
      mergedItems.push(item);
    }
  });

  return mergedItems;
};

const deepMerge = (base, override, path = []) => {
  if (Array.isArray(base) && Array.isArray(override) && path.join(".") === "assets.pipeline.roles") {
    return mergeListById(base, override);
  }

  if (!isPlainObject(base) || !isPlainObject(override)) {
    return override;
  }

  const result = { ...base };

  Object.entries(override).forEach(([key, value]) => {
    if (isPlainObject(value) && isPlainObject(result[key])) {
      result[key] = deepMerge(result[key], value, [...path, key]);
      return;
    }

    result[key] = deepMerge(result[key], value, [...path, key]);
  });

  return result;
};

const cloneValue = (value) => {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value));
};

export default class JsonDbManager {
  constructor(context) {
    this.context = context;
    this.data = {};
    this.loaded = false;
    this.bootstrapPath = context.runtimeSettings?.db?.bootstrapPath || "/settings/game.json";
    this.overridePaths = Array.isArray(context.runtimeSettings?.db?.overridePaths)
      ? context.runtimeSettings.db.overridePaths
      : [];
    this.projectSettingsApi = context.runtimeSettings?.db?.projectSettingsApi || "";
    this.cacheEnabled = context.runtimeSettings?.db?.cacheEnabled !== false;
  }

  async load() {
    if (this.loaded && this.cacheEnabled) {
      return this.data;
    }

    const fetcher = await this.context.kernel.getModule("data");
    const payload = await fetcher.fetchJson(this.bootstrapPath);
    let nextData = cloneValue(payload);

    for (const overridePath of this.overridePaths) {
      try {
        const overridePayload = await fetcher.fetchJson(overridePath);
        nextData = deepMerge(nextData, overridePayload);
        this.context.logger.info("Game settings override loaded", overridePath);
      } catch (error) {
        const message = String(error?.message || error);
        if (message.includes("status 404") || message.includes("status 401") || message.includes("status 403")) {
          this.context.logger.debug("Optional game settings override unavailable", overridePath);
          continue;
        }

        throw error;
      }
    }

    const projectId = nextData?.authoring?.activeProjectId;
    if (this.projectSettingsApi && projectId) {
      const projectSettingsPath = this.projectSettingsApi.replace("{projectId}", encodeURIComponent(projectId));
      try {
        const projectPayload = await fetcher.fetchJson(projectSettingsPath);
        nextData = deepMerge(nextData, projectPayload);
        this.context.logger.info("Project settings loaded", projectSettingsPath);
      } catch (error) {
        const message = String(error?.message || error);
        if (message.includes("status 404") || message.includes("status 401") || message.includes("status 403")) {
          this.context.logger.debug("Optional project settings unavailable", projectSettingsPath);
        } else {
          throw error;
        }
      }
    }

    this.data = nextData;
    this.loaded = true;

    this.context.events.emit("db:loaded", {
      path: this.bootstrapPath,
      namespaces: Object.keys(this.data),
      overridePaths: this.overridePaths,
      projectSettingsApi: this.projectSettingsApi
    });

    this.context.logger.info("Game settings loaded", this.bootstrapPath);

    return this.data;
  }

  get(path, fallback = undefined) {
    if (!path) {
      return this.data;
    }

    const segments = path.split(".");
    let cursor = this.data;

    for (const segment of segments) {
      if (cursor == null || !(segment in cursor)) {
        return fallback;
      }
      cursor = cursor[segment];
    }

    return cursor;
  }

  has(path) {
    return this.get(path) !== undefined;
  }

  set(path, value) {
    const segments = path.split(".");
    let cursor = this.data;

    segments.forEach((segment, index) => {
      const isLast = index === segments.length - 1;
      if (isLast) {
        cursor[segment] = value;
        return;
      }

      if (!isPlainObject(cursor[segment])) {
        cursor[segment] = {};
      }

      cursor = cursor[segment];
    });

    this.context.events.emit("db:changed", { path, value });
    return value;
  }

  merge(namespace, payload = {}) {
    const current = this.get(namespace, {});
    const nextValue = deepMerge(current, payload);
    this.set(namespace, nextValue);
    return nextValue;
  }

  namespace(namespace) {
    return this.get(namespace, {});
  }
}

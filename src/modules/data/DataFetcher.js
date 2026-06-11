export const moduleName = "DataFetcher";

const isRoutableRequestPath = (path = "") => {
  const value = String(path || "");
  return value.startsWith("/api/") || /^[a-z][a-z0-9+.-]*:/i.test(value);
};

export default class DataFetcher {
  constructor(context) {
    this.context = context;
    this.defaultCache = context.runtimeSettings?.fetch?.defaultCache || "no-store";
    this.timeoutMs = context.runtimeSettings?.fetch?.timeoutMs || 8000;
  }

  async request(path, options = {}) {
    const controller = new AbortController();
    const {
      timeoutMs = this.timeoutMs,
      ...fetchOptions
    } = options;
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const requestPath = this.context.assets?.resolveRaw && !isRoutableRequestPath(path)
      ? this.context.assets.resolveRaw(path)
      : path;
    const authHeader = globalThis.window?.__JSMII_AUTH_HEADER__ || "";
    const requestHeaders = {
      ...(authHeader ? { Authorization: authHeader } : {}),
      ...(options.headers || {})
    };
    const requestOptions = {
      cache: this.defaultCache,
      credentials: "include",
      signal: controller.signal,
      ...fetchOptions,
      headers: requestHeaders
    };

    this.context.logger.debug("Fetch request", requestPath, requestOptions);

    try {
      const response = await fetch(requestPath, requestOptions);
      if (!response.ok) {
        throw new Error(`Fetch failed for '${requestPath}' with status ${response.status}`);
      }

      return response;
    } finally {
      clearTimeout(timeout);
    }
  }

  async fetchJson(path, options = {}) {
    const response = await this.request(path, options);
    return response.json();
  }

  async fetchText(path, options = {}) {
    const response = await this.request(path, options);
    return response.text();
  }

  async fetchHtml(path, options = {}) {
    return this.fetchText(path, options);
  }
}

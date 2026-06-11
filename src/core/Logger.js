export class Logger {
  constructor(debugSettings = {}) {
    this.enabled = Boolean(debugSettings.enabled);
    this.verbose = Boolean(debugSettings.verbose);
  }

  info(...args) {
    if (this.enabled) {
      console.info("[jsmii]", ...args);
    }
  }

  debug(...args) {
    if (this.enabled && this.verbose) {
      console.debug("[jsmii:debug]", ...args);
    }
  }

  warn(...args) {
    console.warn("[jsmii:warn]", ...args);
  }

  error(...args) {
    console.error("[jsmii:error]", ...args);
  }
}

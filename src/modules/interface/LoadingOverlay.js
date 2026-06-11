export const moduleName = "LoadingOverlay";

export default class LoadingOverlay {
  constructor(context) {
    this.context = context;
    this.overlay = document.getElementById("loading-overlay");
    this.message = document.getElementById("loading-message");
    this.progress = document.getElementById("loading-progress");
    this.mountedAt = Date.now();
  }

  mount() {
    this.overlay?.classList.add("is-visible");
  }

  update(message, progress) {
    if (this.message && message) {
      this.message.textContent = message;
    }

    if (this.progress && typeof progress === "number") {
      this.progress.style.width = `${Math.max(0, Math.min(progress, 100))}%`;
    }
  }

  async release(minVisibleMs = 0) {
    const elapsed = Date.now() - this.mountedAt;
    const remaining = Math.max(0, minVisibleMs - elapsed);

    if (remaining > 0) {
      await new Promise((resolve) => window.setTimeout(resolve, remaining));
    }

    this.overlay?.classList.remove("is-visible");
  }
}

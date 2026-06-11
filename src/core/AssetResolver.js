export class AssetResolver {
  constructor(runtimeSettings = {}) {
    this.runtimeSettings = runtimeSettings;
    this.version = runtimeSettings?.build?.version || "dev";
    this.queryKey = runtimeSettings?.assets?.queryKey || "v";
    this.baseUrl = new URL(runtimeSettings?.app?.baseUrl || "/", window.location.origin);
    this.previewSettingsApiEnabled = new URLSearchParams(window.location.search || "").get("previewSettingsApi") === "1";
    this.manifest = null;
  }

  setManifest(manifest) {
    this.manifest = manifest;
  }

  resolve(path) {
    const normalizedPath = String(path || "").startsWith("/")
      ? String(path).slice(1)
      : path;
    const url = new URL(normalizedPath, this.baseUrl);
    const manifestVersion = this.manifest?.files?.[path];
    url.searchParams.set(this.queryKey, manifestVersion || this.version);
    return url.toString();
  }

  resolveRaw(path) {
    const projectAssetUrl = this.resolveProjectAssetFile(path);
    if (projectAssetUrl) {
      return projectAssetUrl;
    }

    const normalizedPath = String(path || "").startsWith("/")
      ? String(path).slice(1)
      : path;
    return new URL(normalizedPath, this.baseUrl).toString();
  }

  resolveProjectAssetFile(path) {
    const value = String(path || "").replaceAll("\\", "/").replace(/^\/+/, "");
    if (!value || (!this.runtimeSettings?.db?.projectSettingsApi && !this.previewSettingsApiEnabled)) {
      return "";
    }

    const uploadMatch = value.match(/^raw-sources\/uploads\/([^/]+)\/(.+)$/);
    if (uploadMatch) {
      const [, projectId, assetPath] = uploadMatch;
      const url = new URL(`/api/projects/${encodeURIComponent(projectId)}/assets/file`, window.location.origin);
      url.searchParams.set("root", "uploads");
      url.searchParams.set("path", assetPath);
      return url.toString();
    }

    const sourceMatch = value.match(/^project-sources\/([^/]+)\/assets\/source\/(.+)$/);
    if (!sourceMatch) {
      return "";
    }

    const [, projectId, assetPath] = sourceMatch;
    const url = new URL(`/api/projects/${encodeURIComponent(projectId)}/assets/file`, window.location.origin);
    url.searchParams.set("root", "source");
    url.searchParams.set("path", assetPath);
    return url.toString();
  }
}

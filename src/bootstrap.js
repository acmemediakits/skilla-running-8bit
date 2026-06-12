const waitForDom = () => {
  if (document.readyState === "loading") {
    return new Promise((resolve) => {
      document.addEventListener("DOMContentLoaded", resolve, { once: true });
    });
  }

  return Promise.resolve();
};

const getRuntimeBaseUrl = () => {
  return new URL(
    window.__JSMII_BASE_URL__ || "../",
    import.meta.url
  );
};

const buildVersionedUrl = (path, version, queryKey = "v", baseUrl = getRuntimeBaseUrl()) => {
  const normalizedPath = String(path || "").startsWith("/")
    ? String(path).slice(1)
    : path;
  const url = new URL(normalizedPath, baseUrl);
  if (version) {
    url.searchParams.set(queryKey, version);
  }
  return url.toString();
};

const updateBootstrapMessage = (message, progress) => {
  const messageNode = document.getElementById("loading-message");
  const progressNode = document.getElementById("loading-progress");

  if (messageNode) {
    messageNode.textContent = message;
  }

  if (progressNode && typeof progress === "number") {
    progressNode.style.width = `${Math.max(0, Math.min(progress, 100))}%`;
  }
};

const injectStylesheet = (href) => {
  if (document.querySelector(`link[href="${href}"]`)) {
    return;
  }

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  document.head.appendChild(link);
};

export const bootstrap = async () => {
  await waitForDom();

  updateBootstrapMessage("Loading runtime settings", 8);

  const baseUrl = getRuntimeBaseUrl();
  const settingsResponse = await fetch(new URL("settings/runtime.json", baseUrl), {
    cache: "no-store",
    credentials: "include"
  });
  const runtimeSettings = await settingsResponse.json();
  const configuredBaseUrl = runtimeSettings.app?.baseUrl
    ? new URL(runtimeSettings.app.baseUrl, baseUrl).toString()
    : baseUrl.toString();
  runtimeSettings.app = {
    ...(runtimeSettings.app || {}),
    baseUrl: configuredBaseUrl
  };

  const version = runtimeSettings?.build?.version || "dev";
  const queryKey = runtimeSettings?.assets?.queryKey || "v";

  updateBootstrapMessage("Loading styles", 24);
  const stylesheetPath = runtimeSettings?.assets?.stylesheetPath ?? "/css/main.css";
  if (stylesheetPath) {
    injectStylesheet(buildVersionedUrl(stylesheetPath, version, queryKey, baseUrl));
  }

  updateBootstrapMessage("Loading runtime modules", 52);

  const { bootJsmii } = await import(buildVersionedUrl("/src/main.js", version, queryKey, baseUrl));

  updateBootstrapMessage("Starting framework", 72);
  await bootJsmii(runtimeSettings);

  updateBootstrapMessage("Framework ready", 100);
};

const DEFAULT_TONES = {
  progress: "#43d9b8",
  start: "#ffce4f",
  advance: "#58a6ff",
  success: "#8be66f",
  retry: "#c792ea",
  restart: "#b79cff",
  fail: "#ff8b8b",
  lead: "#38e2ff",
  skip: "#9aa7b5",
  close: "#9aa7b5"
};

const DEFAULT_OPTIONS = {
  gridSize: 12,
  defaultCollapsed: false,
  defaultCanvasWidth: 1180,
  defaultCanvasHeight: 820,
  nodeWidth: 230,
  nodeHeight: 92,
  collapsedNodeWidth: 190,
  collapsedNodeHeight: 70,
  canvasPadding: 180,
  storagePrefix: "jsmii:flow-controller:layout:v1",
  tones: DEFAULT_TONES
};

const SVG_NS = "http://www.w3.org/2000/svg";

function makeEl(tag, className, text) {
  const node = document.createElement(tag);
  if (className) {
    node.className = className;
  }
  if (text !== undefined) {
    node.textContent = text;
  }
  return node;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function normalizeLayout(rawLayout) {
  if (!rawLayout || typeof rawLayout !== "object") {
    return { nodes: {}, canvas: {} };
  }

  return {
    nodes: rawLayout.nodes && typeof rawLayout.nodes === "object" ? rawLayout.nodes : rawLayout,
    canvas: rawLayout.canvas && typeof rawLayout.canvas === "object" ? rawLayout.canvas : {}
  };
}

function safeSelector(value) {
  if (globalThis.CSS?.escape) {
    return CSS.escape(value);
  }
  return String(value).replaceAll('"', '\\"');
}

export class FlowController {
  constructor(options = {}) {
    if (!options.board) {
      throw new Error("FlowController requires a board element.");
    }

    this.options = {
      ...DEFAULT_OPTIONS,
      ...options,
      tones: { ...DEFAULT_TONES, ...(options.tones || {}) }
    };
    this.board = options.board;
    this.flow = null;
    this.dragState = null;
    this.onSaveLayout = options.onSaveLayout || null;
    this.onNodeToggle = options.onNodeToggle || null;
    this.markerPrefix = `fc-${Math.random().toString(36).slice(2)}`;
    this.boundUpdateLines = () => this.updateLines();
    this.boundFullscreenChange = () => {
      this.syncFullscreenLabel();
      requestAnimationFrame(this.boundUpdateLines);
    };

    window.addEventListener("resize", this.boundUpdateLines);
    document.addEventListener("fullscreenchange", this.boundFullscreenChange);

    if (options.flow) {
      this.setFlow(options.flow);
    }
  }

  destroy() {
    window.removeEventListener("resize", this.boundUpdateLines);
    document.removeEventListener("fullscreenchange", this.boundFullscreenChange);
    this.board.replaceChildren();
  }

  setFlow(nextFlow) {
    this.flow = this.withSavedLayout(nextFlow);
    return this;
  }

  render(nextFlow) {
    if (nextFlow) {
      this.setFlow(nextFlow);
    }
    if (!this.flow) {
      return;
    }

    this.board.classList.add("fc-board");
    this.board.replaceChildren();

    const canvas = makeEl("div", "fc-canvas");
    this.applyCanvasSize(canvas);

    const svg = document.createElementNS(SVG_NS, "svg");
    svg.classList.add("fc-lines");
    canvas.appendChild(svg);

    const fullscreenExit = makeEl("button", "fc-fullscreen-exit", "Exit fullscreen");
    fullscreenExit.type = "button";
    fullscreenExit.addEventListener("click", () => this.toggleFullscreen());
    canvas.appendChild(fullscreenExit);

    for (const node of this.flow.nodes) {
      canvas.appendChild(this.renderNode(node));
    }

    const legend = makeEl("div", "fc-legend");
    for (const [tone, color] of Object.entries(this.options.tones)) {
      const item = makeEl("span", "fc-legend-item", tone);
      item.style.setProperty("--fc-color", color);
      legend.appendChild(item);
    }
    canvas.appendChild(legend);

    this.board.appendChild(canvas);
    requestAnimationFrame(this.boundUpdateLines);
  }

  renderNode(node) {
    const card = makeEl("article", `fc-node fc-node--${node.kind || "step"}`);
    card.dataset.nodeId = node.id;
    Object.entries(node.dataset || {}).forEach(([key, value]) => {
      card.dataset[key] = value;
    });
    card.style.left = `${node.x}px`;
    card.style.top = `${node.y}px`;
    card.classList.toggle("is-collapsed", Boolean(node.collapsed));
    card.classList.toggle("is-active", Boolean(node.active));
    card.innerHTML = node.html || `
      <div class="fc-node-head">
        <span class="fc-node-kind">${escapeHtml(node.kind || "step")}</span>
        <button class="fc-node-toggle" type="button" aria-label="${node.collapsed ? "Expand card" : "Collapse card"}">${node.collapsed ? "+" : "-"}</button>
      </div>
      <strong>${escapeHtml(node.title)}</strong>
      <span class="fc-node-summary">${escapeHtml(node.summary || "")}</span>
    `;

    const toggleButton = card.querySelector(".fc-node-toggle");
    if (toggleButton) {
      toggleButton.textContent = node.collapsed ? "+" : "-";
      toggleButton.setAttribute("aria-label", node.collapsed ? "Expand card" : "Collapse card");
    }
    toggleButton?.addEventListener("click", (event) => {
      event.stopPropagation();
      this.toggleNode(node.id);
    });
    card.addEventListener("pointerdown", (event) => this.startDrag(event));
    return card;
  }

  storageKey(flowId) {
    return `${this.options.storagePrefix}:${flowId}`;
  }

  readLocalLayout(flowId) {
    try {
      return JSON.parse(localStorage.getItem(this.storageKey(flowId)) || "{}");
    } catch {
      return {};
    }
  }

  snap(value) {
    return Math.round(value / this.options.gridSize) * this.options.gridSize;
  }

  withSavedLayout(nextFlow) {
    const serverLayout = normalizeLayout(nextFlow.layout);
    const localLayout = normalizeLayout(this.readLocalLayout(nextFlow.id));
    const saved = Object.keys(serverLayout.nodes).length ? serverLayout : localLayout;
    const nodes = nextFlow.nodes.map((node) => {
      const savedNode = saved.nodes[node.id] || {};
      const defaultX = this.snap(Number.isFinite(node.x)
        ? node.x
        : ((Number(node.xPercent || 0) / 100) * this.options.defaultCanvasWidth));
      const defaultY = this.snap(Number.isFinite(node.y)
        ? node.y
        : ((Number(node.yPercent || 0) / 100) * this.options.defaultCanvasHeight));
      return {
        ...node,
        x: Number.isFinite(savedNode.x) ? this.snap(savedNode.x) : defaultX,
        y: Number.isFinite(savedNode.y) ? this.snap(savedNode.y) : defaultY,
        collapsed: Object.prototype.hasOwnProperty.call(savedNode, "collapsed")
          ? Boolean(savedNode.collapsed)
          : Boolean(node.collapsed ?? this.options.defaultCollapsed)
      };
    });
    const bounds = this.canvasBounds(nodes, saved.canvas);
    return { ...nextFlow, nodes, canvasWidth: bounds.width, canvasHeight: bounds.height };
  }

  canvasBounds(nodes, savedCanvas = {}) {
    const widthFromNodes = Math.max(
      ...nodes.map((node) => Number(node.x || 0) + this.options.nodeWidth + this.options.canvasPadding),
      this.options.defaultCanvasWidth
    );
    const heightFromNodes = Math.max(
      ...nodes.map((node) => Number(node.y || 0) + this.options.nodeHeight + this.options.canvasPadding),
      this.options.defaultCanvasHeight
    );
    return {
      width: Math.max(this.options.defaultCanvasWidth, this.snap(Number(savedCanvas.width) || 0), this.snap(widthFromNodes)),
      height: Math.max(this.options.defaultCanvasHeight, this.snap(Number(savedCanvas.height) || 0), this.snap(heightFromNodes))
    };
  }

  applyCanvasSize(canvas) {
    const bounds = this.canvasBounds(this.flow.nodes, { width: this.flow.canvasWidth, height: this.flow.canvasHeight });
    this.flow.canvasWidth = bounds.width;
    this.flow.canvasHeight = bounds.height;
    canvas.style.width = `${bounds.width}px`;
    canvas.style.height = `${bounds.height}px`;
  }

  currentLayout() {
    const layout = {
      version: 1,
      canvas: {
        width: this.flow.canvasWidth || this.options.defaultCanvasWidth,
        height: this.flow.canvasHeight || this.options.defaultCanvasHeight
      },
      nodes: {}
    };

    for (const node of this.flow.nodes) {
      layout.nodes[node.id] = { x: node.x, y: node.y, collapsed: Boolean(node.collapsed) };
    }

    return layout;
  }

  async saveLayout() {
    if (!this.flow?.id) {
      return;
    }
    const layout = this.currentLayout();
    localStorage.setItem(this.storageKey(this.flow.id), JSON.stringify(layout));
    if (this.onSaveLayout) {
      await this.onSaveLayout({ flowId: this.flow.id, layout, flow: this.flow });
    }
  }

  toggleNode(nodeId) {
    const node = this.flow.nodes.find((item) => item.id === nodeId);
    if (!node) {
      return;
    }
    node.collapsed = !node.collapsed;
    const card = this.board.querySelector(`[data-node-id="${safeSelector(nodeId)}"]`);
    if (card) {
      card.classList.toggle("is-collapsed", node.collapsed);
      const button = card.querySelector(".fc-node-toggle");
      if (button) {
        button.textContent = node.collapsed ? "+" : "-";
        button.setAttribute("aria-label", node.collapsed ? "Expand card" : "Collapse card");
      }
    }
    this.onNodeToggle?.({ node, flow: this.flow });
    this.saveLayout();
    requestAnimationFrame(this.boundUpdateLines);
  }

  anchors(box) {
    const middleX = box.left + box.width / 2;
    const middleY = box.top + box.height / 2;
    const sideY = clamp(box.top + 48, box.top + 18, box.top + box.height - 18);
    return [
      { side: "top", x: middleX, y: box.top, vx: 0, vy: -1 },
      { side: "right", x: box.left + box.width, y: sideY, vx: 1, vy: 0 },
      { side: "bottom", x: middleX, y: box.top + box.height, vx: 0, vy: 1 },
      { side: "left", x: box.left, y: sideY, vx: -1, vy: 0 }
    ];
  }

  routeSelfEdge(box, edgeIndex = 0) {
    const offset = edgeIndex * 16;
    const start = { x: box.left + box.width, y: box.top + box.height * 0.58 };
    const end = { x: box.left + box.width * 0.72, y: box.top + box.height + 6 };
    const loopX = box.left + box.width + 96 + offset;
    const loopY = box.top + box.height + 58 + offset * 0.5;
    return `M ${start.x} ${start.y} C ${loopX} ${start.y}, ${loopX} ${loopY}, ${end.x} ${end.y}`;
  }

  routeEdge(from, to, bounds, edgeIndex = 0) {
    if (from === to) {
      return this.routeSelfEdge(from, edgeIndex);
    }

    let best = null;
    for (const start of this.anchors(from)) {
      for (const end of this.anchors(to)) {
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const alignmentPenalty = start.side === end.side ? 1200 : 0;
        const score = dx * dx + dy * dy + alignmentPenalty;
        if (!best || score < best.score) {
          best = { start, end, score };
        }
      }
    }

    const { start, end } = best;
    const dx = Math.abs(end.x - start.x);
    const dy = Math.abs(end.y - start.y);
    const bend = Math.max(56, Math.min(190, dx * 0.48 + dy * 0.18));
    const controlA = {
      x: clamp(start.x + bend * start.vx, 10, bounds.width - 10),
      y: clamp(start.y + bend * start.vy, 10, bounds.height - 10)
    };
    const controlB = {
      x: clamp(end.x + bend * end.vx, 10, bounds.width - 10),
      y: clamp(end.y + bend * end.vy, 10, bounds.height - 10)
    };
    return `M ${start.x} ${start.y} C ${controlA.x} ${controlA.y}, ${controlB.x} ${controlB.y}, ${end.x} ${end.y}`;
  }

  updateLines() {
    const canvas = this.board.querySelector(".fc-canvas");
    const svg = this.board.querySelector(".fc-lines");
    if (!this.flow || !canvas || !svg) {
      return;
    }

    const rect = canvas.getBoundingClientRect();
    svg.setAttribute("viewBox", `0 0 ${rect.width} ${rect.height}`);
    svg.replaceChildren();

    const defs = document.createElementNS(SVG_NS, "defs");
    for (const [tone, color] of Object.entries(this.options.tones)) {
      const marker = document.createElementNS(SVG_NS, "marker");
      marker.setAttribute("id", `${this.markerPrefix}-arrow-${tone}`);
      marker.setAttribute("viewBox", "0 0 10 10");
      marker.setAttribute("refX", "8");
      marker.setAttribute("refY", "5");
      marker.setAttribute("markerWidth", "6");
      marker.setAttribute("markerHeight", "6");
      marker.setAttribute("orient", "auto-start-reverse");
      const path = document.createElementNS(SVG_NS, "path");
      path.setAttribute("d", "M 0 0 L 10 5 L 0 10 z");
      path.setAttribute("fill", color);
      marker.appendChild(path);
      defs.appendChild(marker);
    }
    svg.appendChild(defs);

    const nodes = new Map();
    this.board.querySelectorAll(".fc-node").forEach((node) => {
      const box = node.getBoundingClientRect();
      nodes.set(node.dataset.nodeId, {
        left: box.left - rect.left,
        top: box.top - rect.top,
        width: box.width,
        height: box.height
      });
    });

    (this.flow.edges || []).forEach((edge, index) => {
      const from = nodes.get(edge.from);
      const to = nodes.get(edge.to);
      if (!from || !to) {
        return;
      }
      const tone = edge.tone || "progress";
      const path = document.createElementNS(SVG_NS, "path");
      path.setAttribute("d", this.routeEdge(from, to, rect, index));
      path.setAttribute("class", "fc-line");
      path.setAttribute("stroke", this.options.tones[tone] || this.options.tones.progress);
      path.setAttribute("marker-end", `url(#${this.markerPrefix}-arrow-${tone})`);
      svg.appendChild(path);
    });
  }

  startDrag(event) {
    if (event.button !== 0 || !this.flow) {
      return;
    }
    if (event.target.closest("button,a,input,select,textarea,[data-design-modal],[data-flow-action]")) {
      return;
    }
    const node = event.currentTarget;
    const canvas = this.board.querySelector(".fc-canvas");
    const nodeRect = node.getBoundingClientRect();
    this.dragState = {
      node,
      id: node.dataset.nodeId,
      pointerId: event.pointerId,
      offsetX: event.clientX - nodeRect.left,
      offsetY: event.clientY - nodeRect.top,
      canvas,
      moved: false,
      startX: event.clientX,
      startY: event.clientY
    };
    node.setPointerCapture?.(event.pointerId);
    node.classList.add("is-dragging");
    node.addEventListener("pointermove", this);
    node.addEventListener("pointerup", this);
    node.addEventListener("pointercancel", this);
  }

  handleEvent(event) {
    if (event.type === "pointermove") {
      this.moveDrag(event);
    }
    if (event.type === "pointerup" || event.type === "pointercancel") {
      this.stopDrag(event);
    }
  }

  moveDrag(event) {
    if (!this.dragState || event.pointerId !== this.dragState.pointerId) {
      return;
    }

    let rect = this.dragState.canvas.getBoundingClientRect();
    const nodeRect = this.dragState.node.getBoundingClientRect();
    const rawX = Math.max(event.clientX - rect.left - this.dragState.offsetX, 12);
    const rawY = Math.max(event.clientY - rect.top - this.dragState.offsetY, 12);
    const neededWidth = rawX + nodeRect.width + this.options.canvasPadding;
    const neededHeight = rawY + nodeRect.height + this.options.canvasPadding;
    if (neededWidth > rect.width || neededHeight > rect.height) {
      this.flow.canvasWidth = Math.max(this.flow.canvasWidth || this.options.defaultCanvasWidth, this.snap(neededWidth));
      this.flow.canvasHeight = Math.max(this.flow.canvasHeight || this.options.defaultCanvasHeight, this.snap(neededHeight));
      this.applyCanvasSize(this.dragState.canvas);
      rect = this.dragState.canvas.getBoundingClientRect();
    }
    const x = clamp(this.snap(rawX), 12, rect.width - nodeRect.width - 12);
    const y = clamp(this.snap(rawY), 12, rect.height - nodeRect.height - 12);
    const moveDistance = Math.hypot(event.clientX - this.dragState.startX, event.clientY - this.dragState.startY);
    this.dragState.moved = this.dragState.moved || moveDistance > 4;
    this.dragState.node.style.left = `${x}px`;
    this.dragState.node.style.top = `${y}px`;
    const modelNode = this.flow.nodes.find((item) => item.id === this.dragState.id);
    if (modelNode) {
      modelNode.x = x;
      modelNode.y = y;
    }
    this.applyCanvasSize(this.dragState.canvas);
    this.updateLines();
    event.preventDefault();
  }

  stopDrag(event) {
    if (!this.dragState || event.pointerId !== this.dragState.pointerId) {
      return;
    }
    const wasMoved = this.dragState.moved;
    this.dragState.node.classList.remove("is-dragging");
    this.dragState.node.releasePointerCapture?.(event.pointerId);
    this.dragState.node.removeEventListener("pointermove", this);
    this.dragState.node.removeEventListener("pointerup", this);
    this.dragState.node.removeEventListener("pointercancel", this);
    if (wasMoved) {
      this.saveLayout();
    }
    this.dragState = null;
  }

  autoLayout(positions) {
    if (!this.flow) {
      return;
    }
    const defaultPositions = positions || this.flow.nodes.map((_, index) => [48 + index * 216, index % 2 ? 384 : 168]);
    this.flow.nodes.forEach((node, index) => {
      node.x = this.snap(defaultPositions[index]?.[0] ?? 48 + index * 216);
      node.y = this.snap(defaultPositions[index]?.[1] ?? 288);
      node.collapsed = this.options.defaultCollapsed;
    });
    const bounds = this.canvasBounds(this.flow.nodes);
    this.flow.canvasWidth = bounds.width;
    this.flow.canvasHeight = bounds.height;
    this.saveLayout();
    this.render();
  }

  fullscreenActive() {
    return document.fullscreenElement === this.board || this.board.classList.contains("is-fullscreen-fallback");
  }

  syncFullscreenLabel() {
    const button = this.options.fullscreenButton;
    if (!button) {
      return;
    }
    button.textContent = this.fullscreenActive() ? "×" : "⤢";
    button.setAttribute("aria-pressed", String(this.fullscreenActive()));
  }

  async toggleFullscreen() {
    if (this.fullscreenActive()) {
      if (document.fullscreenElement === this.board) {
        await document.exitFullscreen?.();
      }
      this.board.classList.remove("is-fullscreen-fallback");
      this.syncFullscreenLabel();
      requestAnimationFrame(this.boundUpdateLines);
      return;
    }

    try {
      await this.board.requestFullscreen?.();
    } catch {
      this.board.classList.add("is-fullscreen-fallback");
    }
    this.syncFullscreenLabel();
    requestAnimationFrame(this.boundUpdateLines);
  }
}

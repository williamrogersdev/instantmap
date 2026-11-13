const TILE = 512;
const MAX_ZOOM = 18;
const MAX_TILE_ZOOM = 15;
const CLUSTER = 28;

const mercX = (lng) => (lng + 180) / 360;
const mercY = (lat) => {
  const s = Math.sin((Math.max(-85.0511, Math.min(85.0511, lat)) * Math.PI) / 180);
  return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI);
};
const lngOf = (x) => x * 360 - 180;
const latOf = (y) => (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI;

const css = `instant-map{display:block;position:relative;overflow:hidden;background:#d0dee8;touch-action:none;user-select:none;-webkit-user-select:none;contain:strict}
instant-map>img,instant-map .im-tiles,instant-map canvas{position:absolute;inset:0;width:100%;height:100%}
instant-map>img{object-fit:cover;z-index:2;transition:opacity .2s}
instant-map .im-tiles img{position:absolute;left:0;top:0;width:512px;height:512px;transform-origin:0 0;pointer-events:none}
instant-map canvas{z-index:3;pointer-events:none}
instant-map .im-credit{position:absolute;right:0;bottom:0;z-index:4;font:11px/1.6 system-ui,sans-serif;padding:0 6px;background:#f3f1ecd9;color:#5c564e}
instant-map .im-credit a{color:inherit}
instant-map .im-zoom{position:absolute;right:10px;top:10px;z-index:4;display:flex;flex-direction:column;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px #2b241833}
instant-map .im-zoom button{width:44px;height:44px;border:0;background:#fff;font:500 20px system-ui;color:#3d3a35;cursor:pointer}
instant-map .im-zoom button+button{border-top:1px solid #e6e1d8}
instant-map:focus-visible{outline:2px solid #ee7904;outline-offset:2px}`;

function parseMarkers(value) {
  return (value || "").split(";").filter(Boolean).map((entry) => {
    const [lng, lat, label] = entry.split(",");
    return { lng: +lng, lat: +lat, label: label || "" };
  });
}

class InstantMap extends HTMLElement {
  connectedCallback() {
    if (this.ready) return;
    if (!document.getElementById("im-style")) {
      const style = document.createElement("style");
      style.id = "im-style";
      style.textContent = css;
      document.head.append(style);
    }
    const [lng, lat] = (this.getAttribute("center") || "0,0").split(",").map(Number);
    this.x = mercX(lng);
    this.y = mercY(lat);
    this.zoom = +(this.getAttribute("zoom") || 2);
    this.base = this.getAttribute("src") || "";
    this.markers = parseMarkers(this.getAttribute("markers"));
    this.tiles = new Map();
    this.listeners = new Set();
    this.pointers = new Map();
    this.tabIndex = 0;
    this.setAttribute("role", "region");
    if (!this.hasAttribute("aria-label")) this.setAttribute("aria-label", "Map");
    this.poster = this.querySelector("img") || this.insertPoster();
    const credit = document.createElement("div");
    credit.className = "im-credit";
    credit.innerHTML = '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · <a href="https://protomaps.com">Protomaps</a>';
    this.append(credit);
    const wake = () => this.activate();
    for (const type of ["pointerenter", "pointerdown", "touchstart", "focus", "wheel"]) this.addEventListener(type, wake, { once: true, passive: true });
    this.ready = true;
  }

  insertPoster() {
    const img = document.createElement("img");
    img.alt = this.getAttribute("aria-label") || "Map";
    img.decoding = "async";
    img.src = this.staticUrl();
    this.prepend(img);
    return img;
  }

  staticUrl() {
    const ratio = Math.min(2, Math.round(devicePixelRatio || 1));
    const params = new URLSearchParams({
      center: `${lngOf(this.x).toFixed(5)},${latOf(this.y).toFixed(5)}`,
      zoom: String(this.zoom),
      size: `${Math.min(1280, this.clientWidth || 640)}x${Math.min(1280, this.clientHeight || 400)}`,
      r: String(ratio),
    });
    if (this.getAttribute("markers")) params.set("markers", this.getAttribute("markers"));
    return `${this.base}/static?${params}`;
  }

  activate() {
    if (this.layer) return;
    this.layer = document.createElement("div");
    this.layer.className = "im-tiles";
    this.canvas = document.createElement("canvas");
    this.prepend(this.layer);
    this.layer.after(this.canvas);
    const zoom = document.createElement("div");
    zoom.className = "im-zoom";
    zoom.innerHTML = '<button type="button" aria-label="Zoom in">+</button><button type="button" aria-label="Zoom out">−</button>';
    zoom.addEventListener("pointerdown", (event) => event.stopPropagation());
    zoom.children[0].onclick = () => this.zoomAt(1, this.clientWidth / 2, this.clientHeight / 2, true);
    zoom.children[1].onclick = () => this.zoomAt(-1, this.clientWidth / 2, this.clientHeight / 2, true);
    this.append(zoom);
    this.addEventListener("pointerdown", this);
    this.addEventListener("pointermove", this);
    this.addEventListener("pointerup", this);
    this.addEventListener("pointercancel", this);
    this.addEventListener("wheel", this, { passive: false });
    this.addEventListener("keydown", this);
    this.addEventListener("dblclick", this);
    new ResizeObserver(() => this.schedule()).observe(this);
    this.schedule();
  }

  handleEvent(event) {
    const rect = this.getBoundingClientRect();
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;
    switch (event.type) {
      case "pointerdown":
        this.setPointerCapture(event.pointerId);
        this.pointers.set(event.pointerId, [px, py]);
        this.gesture = null;
        break;
      case "pointermove": {
        const previous = this.pointers.get(event.pointerId);
        if (!previous) return;
        this.pointers.set(event.pointerId, [px, py]);
        const points = [...this.pointers.values()];
        if (points.length === 1) {
          this.panBy(previous[0] - px, previous[1] - py);
        } else {
          const [a, b] = points;
          const distance = Math.hypot(a[0] - b[0], a[1] - b[1]);
          const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
          if (this.gesture) {
            this.panBy(this.gesture.mid[0] - mid[0], this.gesture.mid[1] - mid[1]);
            this.zoomAt(Math.log2(distance / this.gesture.distance), mid[0], mid[1]);
          }
          this.gesture = { distance, mid };
        }
        break;
      }
      case "pointerup":
      case "pointercancel":
        this.pointers.delete(event.pointerId);
        if (this.gesture) this.settleLater(this.gesture.mid[0], this.gesture.mid[1]);
        this.gesture = null;
        break;
      case "wheel":
        event.preventDefault();
        this.zoomAt(-event.deltaY * (event.deltaMode ? 0.05 : 0.002), px, py);
        this.settleLater(px, py);
        break;
      case "dblclick":
        this.zoomAt(1, px, py, true);
        break;
      case "keydown": {
        const step = 80;
        const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
        if (moves[event.key]) this.panBy(...moves[event.key]);
        else if (event.key === "+" || event.key === "=") this.zoomAt(1, this.clientWidth / 2, this.clientHeight / 2, true);
        else if (event.key === "-") this.zoomAt(-1, this.clientWidth / 2, this.clientHeight / 2, true);
        else return;
        event.preventDefault();
      }
    }
  }

  get world() {
    return TILE * 2 ** this.zoom;
  }

  panBy(dx, dy) {
    this.x = (((this.x + dx / this.world) % 1) + 1) % 1;
    this.y = Math.max(0, Math.min(1, this.y + dy / this.world));
    this.schedule();
  }

  zoomAt(delta, px, py, snap) {
    const before = this.world;
    const target = snap ? Math.round(this.zoom + delta) : this.zoom + delta;
    this.zoom = Math.max(0, Math.min(MAX_ZOOM, target));
    const after = this.world;
    const ox = px - this.clientWidth / 2;
    const oy = py - this.clientHeight / 2;
    this.x += ox / before - ox / after;
    this.y += oy / before - oy / after;
    this.schedule();
  }

  settleLater(px, py) {
    clearTimeout(this.settleTimer);
    this.settleTimer = setTimeout(() => {
      const start = this.zoom;
      const end = Math.round(start);
      const began = performance.now();
      const step = (now) => {
        const progress = Math.min(1, (now - began) / 160);
        this.zoomAt(start + (end - start) * progress - this.zoom, px, py);
        if (progress < 1) requestAnimationFrame(step);
      };
      if (end !== start) requestAnimationFrame(step);
    }, 180);
  }

  get camera() {
    return { center: [lngOf(this.x), latOf(this.y)], zoom: this.zoom };
  }

  setCamera({ center, zoom }) {
    if (center) {
      this.x = mercX(center[0]);
      this.y = mercY(center[1]);
    }
    if (zoom !== undefined) this.zoom = zoom;
    this.activate();
    this.schedule();
  }

  project(lng, lat) {
    const world = this.world;
    let dx = (mercX(lng) - this.x) * world;
    if (dx > world / 2) dx -= world;
    if (dx < -world / 2) dx += world;
    return [this.clientWidth / 2 + dx, this.clientHeight / 2 + (mercY(lat) - this.y) * world];
  }

  whenIdle() {
    if (!this.layer) return this.poster.complete ? Promise.resolve() : new Promise((resolve) => this.poster.addEventListener("load", resolve, { once: true }));
    return this.idle && !this.frame ? Promise.resolve() : new Promise((resolve) => this.addEventListener("idle", resolve, { once: true }));
  }

  onMove(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  schedule() {
    if (!this.layer || this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.draw();
      for (const listener of this.listeners) listener(this.camera);
      this.dispatchEvent(new CustomEvent("move", { detail: this.camera }));
    });
  }

  draw() {
    const width = this.clientWidth;
    const height = this.clientHeight;
    const z = Math.min(MAX_TILE_ZOOM, Math.max(0, Math.floor(this.zoom)));
    const count = 2 ** z;
    const size = TILE * 2 ** (this.zoom - z);
    const left = this.x * this.world - width / 2;
    const top = this.y * this.world - height / 2;
    const suffix = devicePixelRatio > 1 ? "@2x" : "";
    const wanted = new Set();
    let pending = 0;
    for (let row = Math.max(0, Math.floor(top / size)); row <= Math.min(count - 1, Math.floor((top + height) / size)); row++) {
      for (let column = Math.floor(left / size); column <= Math.floor((left + width) / size); column++) {
        const key = `${z}/${((column % count) + count) % count}/${row}:${column}`;
        wanted.add(key);
        let img = this.tiles.get(key);
        if (!img) {
          img = new Image();
          img.decoding = "async";
          img.alt = "";
          img.onload = img.onerror = () => {
            img.loaded = true;
            this.schedule();
          };
          img.src = `${this.base}/tiles/${key.split(":")[0]}${suffix}.jpg`;
          img.z = z;
          this.tiles.set(key, img);
          this.layer.append(img);
        }
        if (!img.loaded) pending++;
        img.style.zIndex = 1;
        img.style.transform = `translate(${column * size - left}px,${row * size - top}px) scale(${size / TILE})`;
      }
    }
    for (const [key, img] of this.tiles) {
      if (wanted.has(key)) continue;
      if (pending === 0 || img.z === z) {
        img.remove();
        this.tiles.delete(key);
      } else {
        const scale = 2 ** (this.zoom - img.z);
        const [row, column] = key.split("/")[2].split(":").map(Number);
        img.style.zIndex = 0;
        img.style.transform = `translate(${column * TILE * scale - left}px,${row * TILE * scale - top}px) scale(${scale})`;
      }
    }
    this.idle = pending === 0;
    if (this.idle) this.dispatchEvent(new Event("idle"));
    if (pending === 0 && this.poster) {
      this.poster.style.opacity = 0;
      const poster = this.poster;
      this.poster = null;
      setTimeout(() => poster.remove(), 250);
    }
    this.drawMarkers(width, height);
  }

  drawMarkers(width, height) {
    const ratio = devicePixelRatio || 1;
    const canvas = this.canvas;
    if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
    }
    const context = canvas.getContext("2d");
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);
    const groups = [];
    const cells = new Map();
    for (const marker of this.markers) {
      const [x, y] = this.project(marker.lng, marker.lat);
      if (x < -40 || y < -40 || x > width + 40 || y > height + 40) continue;
      const cell = `${Math.floor(x / CLUSTER)},${Math.floor(y / CLUSTER)}`;
      let group = null;
      for (let i = -1; i <= 1 && !group; i++) {
        for (let j = -1; j <= 1 && !group; j++) {
          const near = cells.get(`${Math.floor(x / CLUSTER) + i},${Math.floor(y / CLUSTER) + j}`) || [];
          group = near.find((candidate) => Math.hypot(candidate.x - x, candidate.y - y) < CLUSTER) || null;
        }
      }
      if (group) {
        group.count++;
        group.x += (x - group.x) / group.count;
        group.y += (y - group.y) / group.count;
      } else {
        group = { x, y, count: 1, label: marker.label };
        groups.push(group);
        if (!cells.has(cell)) cells.set(cell, []);
        cells.get(cell).push(group);
      }
    }
    context.font = "500 12px system-ui,sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    for (const group of groups) {
      const label = group.count > 1 ? String(group.count) : group.label;
      const radius = group.count > 1 ? 10 + 3 * Math.min(5, Math.log2(group.count)) : label ? 16 : 5;
      context.shadowColor = "#2b24183c";
      context.shadowBlur = 3;
      context.shadowOffsetY = 1.5;
      context.beginPath();
      context.arc(group.x, group.y, radius, 0, Math.PI * 2);
      context.fillStyle = "#ee7904";
      context.fill();
      context.shadowColor = "transparent";
      context.lineWidth = radius > 5 ? 2 : 1.5;
      context.strokeStyle = "#fff";
      context.stroke();
      if (label) {
        context.fillStyle = "#fff";
        context.fillText(label, group.x, group.y + 0.5);
      }
    }
  }
}

customElements.define("instant-map", InstantMap);

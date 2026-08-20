/**
 * <holo-stage> — a self-contained three.js hologram viewport.
 * Holographic material adapted from Anderson Mancini's HolographicMaterial (MIT),
 * https://github.com/ektogamat/threejs-vanilla-holographic-material
 */
import * as THREE from "https://esm.sh/three@0.161.0";

class HolographicMaterial extends THREE.ShaderMaterial {
  constructor(parameters = {}) {
    super();
    this.vertexShader = /* glsl */ `
      #define STANDARD
      varying vec3 vViewPosition;
      varying vec2 vUv;
      varying vec4 vPos;
      varying vec3 vNormalW;
      varying vec3 vPositionW;

      #include <common>
      #include <uv_pars_vertex>
      #include <color_pars_vertex>
      #include <morphtarget_pars_vertex>
      #include <skinning_pars_vertex>
      #include <logdepthbuf_pars_vertex>
      #include <clipping_planes_pars_vertex>

      void main() {
        #include <uv_vertex>
        #include <color_vertex>
        #include <morphcolor_vertex>
        #include <begin_vertex>
        #include <morphtarget_vertex>
        #include <skinning_vertex>
        #include <project_vertex>
        #include <logdepthbuf_vertex>
        #include <clipping_planes_vertex>
        #include <worldpos_vertex>

        mat4 modelViewProjectionMatrix = projectionMatrix * modelViewMatrix;
        vUv = uv;
        vPos = projectionMatrix * modelViewMatrix * vec4( transformed, 1.0 );
        vPositionW = vec3( vec4( transformed, 1.0 ) * modelMatrix);
        vNormalW = normalize( vec3( vec4( normal, 0.0 ) * modelMatrix ) );
        gl_Position = modelViewProjectionMatrix * vec4( transformed, 1.0 );
      }`;

    this.fragmentShader = /* glsl */ `
      varying vec2 vUv;
      varying vec3 vPositionW;
      varying vec4 vPos;
      varying vec3 vNormalW;

      uniform float time;
      uniform float fresnelOpacity;
      uniform float scanlineSize;
      uniform float fresnelAmount;
      uniform float signalSpeed;
      uniform float hologramBrightness;
      uniform float hologramOpacity;
      uniform bool blinkFresnelOnly;
      uniform bool enableBlinking;
      uniform vec3 hologramColor;

      float flicker( float amt, float time ) { return clamp( fract( cos( time ) * 43758.5453123 ), amt, 1.0 ); }
      float random(in float a, in float b) { return fract((cos(dot(vec2(a,b), vec2(12.9898,78.233))) * 43758.5453)); }

      void main() {
        vec2 vCoords = vPos.xy;
        vCoords /= vPos.w;
        vCoords = vCoords * 0.5 + 0.5;
        vec2 myUV = fract( vCoords );

        vec4 holoColor = vec4(hologramColor, mix(hologramBrightness, vUv.y, 0.5));

        float scanlines = 10.;
        scanlines += 20. * sin(time * signalSpeed * 20.8 - myUV.y * 60. * scanlineSize);
        scanlines *= smoothstep(1.3 * cos(time * signalSpeed + myUV.y * scanlineSize), 0.78, 0.9);
        scanlines *= max(0.25, sin(time * signalSpeed) * 1.0);

        float r = random(vUv.x, vUv.y);
        float g = random(vUv.y * 20.2, vUv.y * .2);
        float b = random(vUv.y * .9, vUv.y * .2);

        holoColor += vec4(r * scanlines, b * scanlines, r, 1.0) / 84.;
        vec4 scanlineMix = mix(vec4(0.0), holoColor, holoColor.a);

        vec3 viewDirectionW = normalize(cameraPosition - vPositionW);
        float fresnelEffect = dot(viewDirectionW, vNormalW) * (1.6 - fresnelOpacity / 2.);
        fresnelEffect = clamp(fresnelAmount - fresnelEffect, 0., fresnelOpacity);

        float blinkValue = enableBlinking ? 0.6 - signalSpeed : 1.0;
        float blink = flicker(blinkValue, time * signalSpeed * .02);

        vec3 finalColor;
        if (blinkFresnelOnly) {
          finalColor = scanlineMix.rgb + fresnelEffect * blink;
        } else {
          finalColor = scanlineMix.rgb * blink + fresnelEffect;
        }

        gl_FragColor = vec4( finalColor, hologramOpacity );
      }`;

    const p = parameters;
    const u = (v, d) => new THREE.Uniform(v !== undefined ? v : d);
    this.uniforms = {
      time: new THREE.Uniform(0),
      fresnelOpacity: u(p.fresnelOpacity, 1.0),
      fresnelAmount: u(p.fresnelAmount, 0.45),
      scanlineSize: u(p.scanlineSize, 8.0),
      hologramBrightness: u(p.hologramBrightness, 1.0),
      signalSpeed: u(p.signalSpeed, 1.0),
      hologramColor: new THREE.Uniform(new THREE.Color(p.hologramColor || "#00d5ff")),
      enableBlinking: u(p.enableBlinking, true),
      blinkFresnelOnly: u(p.blinkFresnelOnly, true),
      hologramOpacity: u(p.hologramOpacity, 1.0),
    };
    this.depthTest = false;
    this.blending = THREE.AdditiveBlending;
    this.transparent = true;
    this.side = p.side !== undefined ? p.side : THREE.FrontSide;
  }
}

const GEOMETRY = {
  knot: () => new THREE.TorusKnotGeometry(0.82, 0.26, 200, 28),
  ico: () => new THREE.IcosahedronGeometry(1.15, 1),
  octa: () => new THREE.OctahedronGeometry(1.2, 0),
  dodeca: () => new THREE.DodecahedronGeometry(1.15, 0),
  torus: () => new THREE.TorusGeometry(0.95, 0.3, 20, 80),
  sphere: () => new THREE.SphereGeometry(1.1, 48, 28),
  box: () => new THREE.BoxGeometry(1.35, 1.35, 1.35, 3, 3, 3),
  capsule: () => new THREE.CapsuleGeometry(0.6, 1.0, 10, 28),
  cone: () => new THREE.ConeGeometry(1.0, 1.6, 6, 3),
  cylinder: () => new THREE.CylinderGeometry(0.8, 0.8, 1.5, 32, 3),
};

const WIRE = new Set(["ico", "octa", "dodeca", "box", "cone", "cylinder"]);

class HoloStage extends HTMLElement {
  static get observedAttributes() { return ["color", "shape", "speed"]; }

  connectedCallback() {
    if (this._booted) return;
    this._booted = true;
    this._build();
  }

  disconnectedCallback() { this._teardown(); }

  attributeChangedCallback(name, oldV, newV) {
    if (!this._booted || oldV === newV) return;
    if (name === "color" && this.material) this.material.uniforms.hologramColor.value.set(newV || "#9184d9");
    if (name === "speed" && this.material) this.material.uniforms.signalSpeed.value = parseFloat(newV) || 0.7;
    if (name === "shape") this._setShape(newV);
  }

  _build() {
    const root = this.attachShadow({ mode: "open" });
    root.innerHTML = `<style>
      :host { display:block; position:relative; width:100%; height:100%; }
      .glow { position:absolute; inset:-10%; pointer-events:none;
        background: radial-gradient(closest-side, var(--holo-glow, rgba(145,132,217,.22)), transparent 72%); }
      canvas { display:block; position:absolute; inset:0; width:100%; height:100%; }
    </style><div class="glow"></div><canvas></canvas>`;

    const canvas = root.querySelector("canvas");
    this.canvas = canvas;

    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearAlpha(0);
    this.renderer = renderer;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
    this.camera.position.set(0, 0, parseFloat(this.getAttribute("distance")) || 5.0);

    this.material = new HolographicMaterial({
      hologramColor: this.getAttribute("color") || "#9184d9",
      signalSpeed: parseFloat(this.getAttribute("speed")) || 0.7,
      hologramBrightness: parseFloat(this.getAttribute("brightness")) || 0.85,
      scanlineSize: parseFloat(this.getAttribute("scanline")) || 6.0,
      fresnelAmount: 0.5,
      fresnelOpacity: 0.9,
      blinkFresnelOnly: true,
      enableBlinking: true,
      side: THREE.DoubleSide,
    });

    this.group = new THREE.Group();
    this.scene.add(this.group);
    this._setShape(this.getAttribute("shape") || "knot");

    const s = parseFloat(this.getAttribute("scale"));
    if (s) this.group.scale.setScalar(s);

    this._clock = new THREE.Clock();
    this._spin = 0;
    this._vel = 0.0;
    this._tilt = { x: 0, y: 0 };
    this._target = { x: 0, y: 0 };
    this._visible = false;

    this._ro = new ResizeObserver(() => this._resize());
    this._ro.observe(this);
    this._resize();

    this._io = new IntersectionObserver((es) => {
      this._visible = es.some((e) => e.isIntersecting);
      this._visible ? this._start() : this._stop();
    }, { rootMargin: "120px" });
    this._io.observe(this);

    const pointerHost = this.getAttribute("track") === "window" ? window : this;
    this._onMove = (e) => {
      const r = this.getBoundingClientRect();
      const nx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
      const ny = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
      this._target.y = Math.max(-1.6, Math.min(1.6, nx)) * 0.42;
      this._target.x = Math.max(-1.6, Math.min(1.6, ny)) * 0.28;
    };
    pointerHost.addEventListener("pointermove", this._onMove, { passive: true });
    this._pointerHost = pointerHost;

    if (this.hasAttribute("draggable-spin")) {
      this.style.cursor = "grab";
      let last = null;
      this.addEventListener("pointerdown", (e) => { last = e.clientX; this.setPointerCapture(e.pointerId); this.style.cursor = "grabbing"; });
      this.addEventListener("pointerup", (e) => { last = null; this.style.cursor = "grab"; try { this.releasePointerCapture(e.pointerId); } catch (_) {} });
      this.addEventListener("pointermove", (e) => {
        if (last === null) return;
        this._vel += (e.clientX - last) * 0.00035;
        last = e.clientX;
      });
    }
  }

  _setShape(shape) {
    if (!this.group) return;
    while (this.group.children.length) {
      const c = this.group.children.pop();
      if (c.geometry) c.geometry.dispose();
    }
    const make = GEOMETRY[shape] || GEOMETRY.knot;
    const geo = make();
    this.group.add(new THREE.Mesh(geo, this.material));
    if (WIRE.has(shape)) {
      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(geo, 12),
        new THREE.LineBasicMaterial({
          color: new THREE.Color(this.getAttribute("color") || "#9184d9"),
          transparent: true, opacity: 0.55, depthTest: false, blending: THREE.AdditiveBlending,
        })
      );
      this.group.add(edges);
    }
  }

  _resize() {
    if (!this.renderer) return;
    const w = this.clientWidth || 1, h = this.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (!this._raf) this._render();
  }

  _start() {
    if (this._raf) return;
    this._clock.getDelta();
    const loop = () => { this._raf = requestAnimationFrame(loop); this._render(); };
    this._raf = requestAnimationFrame(loop);
  }

  _stop() { if (this._raf) { cancelAnimationFrame(this._raf); this._raf = null; } }

  _render() {
    const dt = Math.min(this._clock.getDelta(), 0.05);
    this.material.uniforms.time.value = this._clock.getElapsedTime();
    const base = parseFloat(this.getAttribute("rotate"));
    this._spin += (isNaN(base) ? 0.22 : base) * dt + this._vel;
    this._vel *= 0.92;
    this._tilt.x += (this._target.x - this._tilt.x) * 0.06;
    this._tilt.y += (this._target.y - this._tilt.y) * 0.06;
    this.group.rotation.y = this._spin + this._tilt.y;
    this.group.rotation.x = this._tilt.x + Math.sin(this._clock.getElapsedTime() * 0.25) * 0.08;
    this.renderer.render(this.scene, this.camera);
  }

  _teardown() {
    this._stop();
    if (this._ro) this._ro.disconnect();
    if (this._io) this._io.disconnect();
    if (this._pointerHost && this._onMove) this._pointerHost.removeEventListener("pointermove", this._onMove);
    if (this.renderer) this.renderer.dispose();
  }
}

if (!customElements.get("holo-stage")) customElements.define("holo-stage", HoloStage);

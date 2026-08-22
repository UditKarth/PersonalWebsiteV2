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

function lineMat(color) {
  return new THREE.LineBasicMaterial({
    color: new THREE.Color(color || "#9184d9"),
    transparent: true,
    opacity: 0.5,
    depthTest: false,
    blending: THREE.AdditiveBlending,
  });
}

function addSolid(parent, geometry, holo, line, opts = {}) {
  const wrap = new THREE.Group();
  wrap.add(new THREE.Mesh(geometry, holo));
  if (line) wrap.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry, opts.threshold ?? 18), line));
  if (opts.pos) wrap.position.copy(opts.pos);
  if (opts.scale) wrap.scale.set(opts.scale.x, opts.scale.y, opts.scale.z);
  if (opts.rot) wrap.rotation.set(opts.rot.x || 0, opts.rot.y || 0, opts.rot.z || 0);
  parent.add(wrap);
  return wrap;
}

/** Classical bust: lathed herm silhouette, greek nose, laurel. */
function makeHead(holo, color) {
  const line = lineMat(color);
  const root = new THREE.Group();
  const profile = [
    [0.00, 0.90], [0.18, 0.88], [0.34, 0.78], [0.44, 0.62],
    [0.47, 0.44], [0.45, 0.30], [0.43, 0.18], [0.40, 0.06],
    [0.34, -0.06], [0.24, -0.16], [0.17, -0.24], [0.15, -0.48],
    [0.18, -0.58], [0.50, -0.66], [0.82, -0.76], [0.94, -0.90],
    [0.90, -1.04], [0.00, -1.08],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const bustGeo = new THREE.LatheGeometry(profile, 32);
  addSolid(root, bustGeo, holo, line, { scale: { x: 0.9, y: 1, z: 1.06 }, threshold: 24 });
  addSolid(root, new THREE.IcosahedronGeometry(0.46, 1), holo, line, {
    pos: new THREE.Vector3(0, 0.54, -0.1),
    scale: { x: 1.05, y: 0.72, z: 0.95 },
  });
  addSolid(root, new THREE.ConeGeometry(0.09, 0.26, 5), holo, line, {
    pos: new THREE.Vector3(0, 0.1, 0.4),
    rot: { x: Math.PI / 2 },
  });
  addSolid(root, new THREE.BoxGeometry(0.36, 0.05, 0.1), holo, line, {
    pos: new THREE.Vector3(0, 0.32, 0.32),
  });
  addSolid(root, new THREE.IcosahedronGeometry(0.055, 0), holo, line, {
    pos: new THREE.Vector3(-0.14, 0.22, 0.34),
  });
  addSolid(root, new THREE.IcosahedronGeometry(0.055, 0), holo, line, {
    pos: new THREE.Vector3(0.14, 0.22, 0.34),
  });
  const wreath = addSolid(root, new THREE.TorusGeometry(0.42, 0.032, 8, 28), holo, line, {
    pos: new THREE.Vector3(0, 0.54, 0.02),
    rot: { x: Math.PI / 2 + 0.18 },
  });
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    addSolid(wreath, new THREE.ConeGeometry(0.035, 0.11, 4), holo, line, {
      pos: new THREE.Vector3(Math.cos(a) * 0.42, Math.sin(a) * 0.42, 0),
      rot: { z: a + Math.PI / 2, x: 0.4 },
    });
  }
  addSolid(root, new THREE.CylinderGeometry(0.55, 0.62, 0.08, 16), holo, line, {
    pos: new THREE.Vector3(0, -1.08, 0),
  });
  root.position.y = 0.08;
  root.scale.setScalar(0.9);
  return { object: root };
}

/** Serial 6-DOF manipulator with animated joints and a gripper. */
function makeArm(holo, color) {
  const line = lineMat(color);
  const root = new THREE.Group();
  addSolid(root, new THREE.CylinderGeometry(0.4, 0.44, 0.1, 20), holo, line, {
    pos: new THREE.Vector3(0, -0.92, 0),
  });
  addSolid(root, new THREE.CylinderGeometry(0.16, 0.2, 0.16, 12), holo, line, {
    pos: new THREE.Vector3(0, -0.8, 0),
  });

  const j1 = new THREE.Group();
  j1.position.y = -0.7;
  root.add(j1);
  addSolid(j1, new THREE.CylinderGeometry(0.2, 0.2, 0.14, 14), holo, line);
  addSolid(j1, new THREE.BoxGeometry(0.34, 0.18, 0.22), holo, line, {
    pos: new THREE.Vector3(0, 0.14, 0),
  });

  const j2 = new THREE.Group();
  j2.position.y = 0.16;
  j1.add(j2);
  addSolid(j2, new THREE.CylinderGeometry(0.12, 0.12, 0.26, 12), holo, line, {
    rot: { x: Math.PI / 2 },
  });
  addSolid(j2, new THREE.BoxGeometry(0.13, 0.62, 0.13), holo, line, {
    pos: new THREE.Vector3(0, 0.37, 0),
  });

  const j3 = new THREE.Group();
  j3.position.y = 0.7;
  j2.add(j3);
  addSolid(j3, new THREE.CylinderGeometry(0.1, 0.1, 0.22, 12), holo, line, {
    rot: { x: Math.PI / 2 },
  });
  addSolid(j3, new THREE.BoxGeometry(0.11, 0.5, 0.11), holo, line, {
    pos: new THREE.Vector3(0, 0.3, 0),
  });

  const j4 = new THREE.Group();
  j4.position.y = 0.56;
  j3.add(j4);
  addSolid(j4, new THREE.CylinderGeometry(0.08, 0.08, 0.16, 12), holo, line);

  const j5 = new THREE.Group();
  j5.position.y = 0.14;
  j4.add(j5);
  addSolid(j5, new THREE.CylinderGeometry(0.08, 0.08, 0.18, 12), holo, line, {
    rot: { x: Math.PI / 2 },
  });

  const j6 = new THREE.Group();
  j6.position.y = 0.1;
  j5.add(j6);
  addSolid(j6, new THREE.CylinderGeometry(0.07, 0.09, 0.1, 12), holo, line);
  const fingerL = addSolid(j6, new THREE.BoxGeometry(0.04, 0.22, 0.05), holo, line, {
    pos: new THREE.Vector3(-0.06, 0.14, 0),
  });
  const fingerR = addSolid(j6, new THREE.BoxGeometry(0.04, 0.22, 0.05), holo, line, {
    pos: new THREE.Vector3(0.06, 0.14, 0),
  });

  root.scale.setScalar(0.92);
  root.rotation.x = 0.12;
  return {
    object: root,
    tick(t) {
      j1.rotation.y = t * 0.4;
      j2.rotation.z = 0.45 + Math.sin(t * 0.75) * 0.38;
      j3.rotation.z = 0.7 + Math.sin(t * 0.95 + 0.8) * 0.42;
      j4.rotation.y = t * 0.85;
      j5.rotation.z = Math.sin(t * 1.2) * 0.5;
      j6.rotation.y = t * 1.05;
      const g = 0.045 + (Math.sin(t * 2) * 0.5 + 0.5) * 0.05;
      fingerL.position.x = -g;
      fingerR.position.x = g;
    },
  };
}

const NET_NOISE = `
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(vec3 v) {
  const vec2 C = vec2(1.0/6.0, 1.0/3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(
    i.z + vec4(0.0, i1.z, i2.z, 1.0))
    + i.y + vec4(0.0, i1.y, i2.y, 1.0))
    + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}`;

const NET_NODE_VERT = `${NET_NOISE}
attribute float nodeSize;
attribute float nodeType;
attribute vec3 nodeColor;
attribute float distanceFromRoot;
uniform float uTime;
uniform float uBaseNodeSize;
varying vec3 vColor;
varying float vNodeType;
varying vec3 vPosition;
varying float vDistanceFromRoot;
varying float vGlow;
void main() {
  vNodeType = nodeType;
  vColor = nodeColor;
  vDistanceFromRoot = distanceFromRoot;
  vec3 worldPos = (modelMatrix * vec4(position, 1.0)).xyz;
  vPosition = worldPos;
  float breathe = sin(uTime * 0.7 + distanceFromRoot * 0.15) * 0.15 + 0.85;
  float pulseSize = nodeSize * breathe;
  vGlow = 0.5 + 0.5 * sin(uTime * 0.5 + distanceFromRoot * 0.2);
  vec3 modifiedPosition = position;
  if (nodeType > 0.5) {
    float noise = snoise(position * 0.08 + uTime * 0.08);
    modifiedPosition += normalize(position + vec3(0.001)) * noise * 0.15;
  }
  vec4 mvPosition = modelViewMatrix * vec4(modifiedPosition, 1.0);
  gl_PointSize = pulseSize * uBaseNodeSize * (140.0 / max(0.001, -mvPosition.z));
  gl_Position = projectionMatrix * mvPosition;
}`;

const NET_NODE_FRAG = `
uniform float uTime;
varying vec3 vColor;
varying float vNodeType;
varying vec3 vPosition;
varying float vDistanceFromRoot;
varying float vGlow;
void main() {
  vec2 center = 2.0 * gl_PointCoord - 1.0;
  float dist = length(center);
  if (dist > 1.0) discard;
  float glow1 = 1.0 - smoothstep(0.0, 0.5, dist);
  float glow2 = 1.0 - smoothstep(0.0, 1.0, dist);
  float glowStrength = pow(glow1, 1.2) + glow2 * 0.3;
  float breatheColor = 0.9 + 0.1 * sin(uTime * 0.6 + vDistanceFromRoot * 0.25);
  vec3 finalColor = vColor * breatheColor;
  float coreBrightness = smoothstep(0.4, 0.0, dist);
  finalColor += vec3(1.0) * coreBrightness * 0.3;
  float alpha = glowStrength * (0.95 - 0.3 * dist);
  if (vNodeType > 0.5) { finalColor *= 1.1; alpha *= 0.9; }
  finalColor *= (1.0 + vGlow * 0.1);
  gl_FragColor = vec4(finalColor, alpha);
}`;

const NET_CONN_VERT = `${NET_NOISE}
attribute vec3 startPoint;
attribute vec3 endPoint;
attribute float connectionStrength;
attribute float pathIndex;
attribute vec3 connectionColor;
uniform float uTime;
varying vec3 vColor;
varying float vConnectionStrength;
varying float vPathPosition;
void main() {
  float t = position.x;
  vPathPosition = t;
  vec3 midPoint = mix(startPoint, endPoint, 0.5);
  vec3 dir = normalize(endPoint - startPoint);
  vec3 perpendicular = normalize(cross(dir, vec3(0.0, 1.0, 0.0)));
  if (length(perpendicular) < 0.1) perpendicular = vec3(1.0, 0.0, 0.0);
  midPoint += perpendicular * sin(t * 3.14159) * 0.15;
  vec3 p0 = mix(startPoint, midPoint, t);
  vec3 p1 = mix(midPoint, endPoint, t);
  vec3 finalPos = mix(p0, p1, t);
  float noise = snoise(vec3(pathIndex * 0.08, t * 0.6, uTime * 0.15));
  finalPos += perpendicular * noise * 0.12;
  vColor = connectionColor;
  vConnectionStrength = connectionStrength;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(finalPos, 1.0);
}`;

const NET_CONN_FRAG = `
uniform float uTime;
varying vec3 vColor;
varying float vConnectionStrength;
varying float vPathPosition;
void main() {
  float flowPattern1 = sin(vPathPosition * 25.0 - uTime * 4.0) * 0.5 + 0.5;
  float flowPattern2 = sin(vPathPosition * 15.0 - uTime * 2.5 + 1.57) * 0.5 + 0.5;
  float combinedFlow = (flowPattern1 + flowPattern2 * 0.5) / 1.5;
  vec3 baseColor = vColor * (0.8 + 0.2 * sin(uTime * 0.6 + vPathPosition * 12.0));
  float flowIntensity = 0.4 * combinedFlow * vConnectionStrength;
  vec3 finalColor = baseColor * (0.7 + flowIntensity + vConnectionStrength * 0.5);
  float alpha = 0.7 * vConnectionStrength + combinedFlow * 0.3;
  gl_FragColor = vec4(finalColor, alpha);
}`;

class NetNode {
  constructor(position, level = 0, type = 0) {
    this.position = position;
    this.connections = [];
    this.level = level;
    this.type = type;
    this.size = type === 0 ? THREE.MathUtils.randFloat(0.8, 1.4) : THREE.MathUtils.randFloat(0.5, 1.0);
    this.distanceFromRoot = 0;
  }
  addConnection(node, strength = 1) {
    if (this.isConnectedTo(node)) return;
    this.connections.push({ node, strength });
    node.connections.push({ node: this, strength });
  }
  isConnectedTo(node) {
    return this.connections.some((c) => c.node === node);
  }
}

function generateCrystalNet() {
  const nodes = [];
  const root = new NetNode(new THREE.Vector3(0, 0, 0), 0, 0);
  root.size = 2;
  nodes.push(root);
  const layers = 4;
  const golden = (1 + Math.sqrt(5)) / 2;
  for (let layer = 1; layer <= layers; layer++) {
    const radius = layer * 4;
    const numPoints = Math.floor(layer * 11);
    for (let i = 0; i < numPoints; i++) {
      const phi = Math.acos(1 - 2 * (i + 0.5) / numPoints);
      const theta = 2 * Math.PI * i / golden;
      const pos = new THREE.Vector3(
        radius * Math.sin(phi) * Math.cos(theta),
        radius * Math.sin(phi) * Math.sin(theta),
        radius * Math.cos(phi)
      );
      const isLeaf = layer === layers || Math.random() < 0.3;
      const node = new NetNode(pos, layer, isLeaf ? 1 : 0);
      node.distanceFromRoot = radius;
      nodes.push(node);
      if (layer === 1) {
        root.addConnection(node, 0.9);
      } else {
        const prev = nodes.filter((n) => n.level === layer - 1 && n !== root);
        prev.sort((a, b) => pos.distanceTo(a.position) - pos.distanceTo(b.position));
        for (let j = 0; j < Math.min(3, prev.length); j++) {
          const dist = pos.distanceTo(prev[j].position);
          node.addConnection(prev[j], Math.max(0.3, 1 - dist / (radius * 2)));
        }
      }
    }
    const layerNodes = nodes.filter((n) => n.level === layer);
    for (const node of layerNodes) {
      const nearby = layerNodes.filter((n) => n !== node)
        .sort((a, b) => node.position.distanceTo(a.position) - node.position.distanceTo(b.position))
        .slice(0, 5);
      for (const near of nearby) {
        const dist = node.position.distanceTo(near.position);
        if (dist < radius * 0.8 && !node.isConnectedTo(near)) node.addConnection(near, 0.6);
      }
    }
  }
  const outer = nodes.filter((n) => n.level >= 3);
  for (let i = 0; i < Math.min(14, outer.length); i++) {
    const a = outer[(Math.random() * outer.length) | 0];
    const b = outer[(Math.random() * outer.length) | 0];
    if (a !== b && !a.isConnectedTo(b) && Math.abs(a.level - b.level) > 1) a.addConnection(b, 0.4);
  }
  return nodes;
}

/** Purple crystalline-sphere neural net (no UI / pulses / camera controls). */
function makeNet() {
  const palette = [
    new THREE.Color(0x667eea),
    new THREE.Color(0x764ba2),
    new THREE.Color(0xf093fb),
    new THREE.Color(0x9d50bb),
    new THREE.Color(0x6e48aa),
  ];
  const nodes = generateCrystalNet();
  const nodePositions = [];
  const nodeTypes = [];
  const nodeSizes = [];
  const nodeColors = [];
  const distancesFromRoot = [];
  nodes.forEach((node) => {
    nodePositions.push(node.position.x, node.position.y, node.position.z);
    nodeTypes.push(node.type);
    nodeSizes.push(node.size);
    distancesFromRoot.push(node.distanceFromRoot);
    const base = palette[Math.min(node.level, palette.length - 1)].clone();
    base.offsetHSL(THREE.MathUtils.randFloatSpread(0.03), THREE.MathUtils.randFloatSpread(0.08), THREE.MathUtils.randFloatSpread(0.08));
    nodeColors.push(base.r, base.g, base.b);
  });

  const nodesGeo = new THREE.BufferGeometry();
  nodesGeo.setAttribute("position", new THREE.Float32BufferAttribute(nodePositions, 3));
  nodesGeo.setAttribute("nodeType", new THREE.Float32BufferAttribute(nodeTypes, 1));
  nodesGeo.setAttribute("nodeSize", new THREE.Float32BufferAttribute(nodeSizes, 1));
  nodesGeo.setAttribute("nodeColor", new THREE.Float32BufferAttribute(nodeColors, 3));
  nodesGeo.setAttribute("distanceFromRoot", new THREE.Float32BufferAttribute(distancesFromRoot, 1));
  const nodesMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uBaseNodeSize: { value: 0.5 } },
    vertexShader: NET_NODE_VERT,
    fragmentShader: NET_NODE_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const connectionColors = [];
  const connectionStrengths = [];
  const connectionPositions = [];
  const startPoints = [];
  const endPoints = [];
  const pathIndices = [];
  const seen = new Set();
  let pathIndex = 0;
  nodes.forEach((node, nodeIndex) => {
    node.connections.forEach((connection) => {
      const connectedIndex = nodes.indexOf(connection.node);
      if (connectedIndex === -1) return;
      const key = [Math.min(nodeIndex, connectedIndex), Math.max(nodeIndex, connectedIndex)].join("-");
      if (seen.has(key)) return;
      seen.add(key);
      const start = node.position;
      const end = connection.node.position;
      const avgLevel = Math.min(Math.floor((node.level + connection.node.level) / 2), palette.length - 1);
      const base = palette[avgLevel].clone();
      base.offsetHSL(THREE.MathUtils.randFloatSpread(0.03), THREE.MathUtils.randFloatSpread(0.08), THREE.MathUtils.randFloatSpread(0.08));
      const segs = 10;
      for (let i = 0; i < segs - 1; i++) {
        const t0 = i / (segs - 1);
        const t1 = (i + 1) / (segs - 1);
        for (const t of [t0, t1]) {
          connectionPositions.push(t, 0, 0);
          startPoints.push(start.x, start.y, start.z);
          endPoints.push(end.x, end.y, end.z);
          pathIndices.push(pathIndex);
          connectionStrengths.push(connection.strength);
          connectionColors.push(base.r, base.g, base.b);
        }
      }
      pathIndex++;
    });
  });

  const connGeo = new THREE.BufferGeometry();
  connGeo.setAttribute("position", new THREE.Float32BufferAttribute(connectionPositions, 3));
  connGeo.setAttribute("startPoint", new THREE.Float32BufferAttribute(startPoints, 3));
  connGeo.setAttribute("endPoint", new THREE.Float32BufferAttribute(endPoints, 3));
  connGeo.setAttribute("connectionStrength", new THREE.Float32BufferAttribute(connectionStrengths, 1));
  connGeo.setAttribute("connectionColor", new THREE.Float32BufferAttribute(connectionColors, 3));
  connGeo.setAttribute("pathIndex", new THREE.Float32BufferAttribute(pathIndices, 1));
  const connMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: NET_CONN_VERT,
    fragmentShader: NET_CONN_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const group = new THREE.Group();
  group.add(new THREE.Points(nodesGeo, nodesMat));
  group.add(new THREE.LineSegments(connGeo, connMat));
  group.scale.setScalar(0.13);
  return {
    object: group,
    tick(t) {
      nodesMat.uniforms.uTime.value = t;
      connMat.uniforms.uTime.value = t;
      group.rotation.y = Math.sin(t * 0.04) * 0.05;
    },
  };
}

function buildShape(name, holo, color) {
  if (name === "head") return makeHead(holo, color);
  if (name === "arm") return makeArm(holo, color);
  if (name === "net") return makeNet(holo, color);
  const geo = (GEOMETRY[name] || GEOMETRY.knot)();
  const object = new THREE.Group();
  object.add(new THREE.Mesh(geo, holo));
  if (WIRE.has(name)) {
    object.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 12), lineMat(color)));
  }
  return { object };
}

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
    this._tickShape = null;
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

    if (this.hasAttribute("draggable-spin") || this.hasAttribute("draggablespin")) {
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

  _disposeGroup() {
    if (!this.group) return;
    const keep = this.material;
    const seen = new Set(keep ? [keep] : []);
    this.group.traverse((c) => {
      if (c.geometry) c.geometry.dispose();
      const mats = c.material ? [].concat(c.material) : [];
      for (const m of mats) {
        if (m && !seen.has(m)) {
          seen.add(m);
          m.dispose();
        }
      }
    });
    while (this.group.children.length) this.group.remove(this.group.children[0]);
  }

  _setShape(shape) {
    if (!this.group) return;
    this._disposeGroup();
    this._tickShape = null;
    const built = buildShape(shape, this.material, this.getAttribute("color") || "#9184d9");
    this.group.add(built.object);
    this._tickShape = built.tick || null;
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
    if (this._tickShape) this._tickShape(this._clock.getElapsedTime(), dt);
    this.renderer.render(this.scene, this.camera);
  }

  _teardown() {
    this._stop();
    this._disposeGroup();
    if (this._ro) this._ro.disconnect();
    if (this._io) this._io.disconnect();
    if (this._pointerHost && this._onMove) this._pointerHost.removeEventListener("pointermove", this._onMove);
    if (this.renderer) this.renderer.dispose();
  }
}

if (!customElements.get("holo-stage")) customElements.define("holo-stage", HoloStage);

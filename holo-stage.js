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

/* Additive blending means every overlapping surface stacks toward white. Bulky
   shapes therefore draw their masses with a dimmed clone of the shared material,
   keeping edges and fine detail readable. Clones are collected so the element can
   keep their time/color/speed uniforms in sync with the original. */
function dimMat(holo, mats, opacity = 0.5, brightness = 0.45) {
  const m = holo.clone();
  m.uniforms.hologramOpacity.value = opacity;
  m.uniforms.hologramBrightness.value = holo.uniforms.hologramBrightness.value * brightness;
  m.depthTest = false;
  m.transparent = true;
  m.blending = THREE.AdditiveBlending;
  mats.push(m);
  return m;
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

/* ---------- shared helpers for the hand-built shapes ---------- */

function lineSegs(points, color, opacity = 0.5) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
  const m = lineMat(color);
  m.opacity = opacity;
  return new THREE.LineSegments(g, m);
}

/** Flat XZ grid of `div` cells per side, centred on the origin. */
function gridLines(size, div, color, opacity = 0.42) {
  const pts = [];
  const half = size / 2;
  for (let i = 0; i <= div; i++) {
    const t = -half + (size * i) / div;
    pts.push(-half, 0, t, half, 0, t, t, 0, -half, t, 0, half);
  }
  return lineSegs(pts, color, opacity);
}

/** Closed ring in the XY plane, as a line loop. */
function ringLine(radius, segments, color, opacity = 0.5) {
  const pts = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const b = ((i + 1) / segments) * Math.PI * 2;
    pts.push(Math.cos(a) * radius, Math.sin(a) * radius, 0, Math.cos(b) * radius, Math.sin(b) * radius, 0);
  }
  return lineSegs(pts, color, opacity);
}

/** Shaft-and-head arrow pointing along +Y, ready to be rotated into place. */
function arrow(len, holo, line, thickness = 1) {
  const g = new THREE.Group();
  addSolid(g, new THREE.CylinderGeometry(0.022 * thickness, 0.022 * thickness, len, 6), holo, null, {
    pos: new THREE.Vector3(0, len / 2, 0),
  });
  addSolid(g, new THREE.ConeGeometry(0.07 * thickness, 0.19, 8), holo, line, {
    pos: new THREE.Vector3(0, len + 0.095, 0),
  });
  return g;
}

/** X / Y / Z triad — the primitive every other transform is drawn against. */
function triad(len, holo, line, thickness = 1) {
  const g = new THREE.Group();
  const y = arrow(len, holo, line, thickness);
  const x = arrow(len, holo, line, thickness);
  x.rotation.z = -Math.PI / 2;
  const z = arrow(len, holo, line, thickness);
  z.rotation.x = Math.PI / 2;
  g.add(x, y, z);
  return g;
}

/** Classical marble bust: faceted cranium, carved profile, laurel, plinth. */
function makeHead(holo, color, mats) {
  const line = lineMat(color);
  const stone = dimMat(holo, mats, 0.55, 0.44);
  const root = new THREE.Group();
  const head = new THREE.Group();
  head.position.y = 0.34;
  root.add(head);

  // Cranium and the face mass below it, overlapping into one egg.
  addSolid(head, new THREE.IcosahedronGeometry(0.46, 1), stone, line, {
    pos: new THREE.Vector3(0, 0.12, -0.02),
    scale: { x: 1.0, y: 1.12, z: 1.04 },
    threshold: 20,
  });
  addSolid(head, new THREE.CylinderGeometry(0.36, 0.19, 0.42, 7), stone, line, {
    pos: new THREE.Vector3(0, -0.16, 0.01),
    scale: { x: 0.9, y: 1, z: 0.98 },
  });

  // Hair as a shell hugging the back and crown, not a ring of beads.
  addSolid(head, new THREE.SphereGeometry(0.52, 14, 9, Math.PI * 0.34, Math.PI * 1.32, 0, Math.PI * 0.66), stone, line, {
    pos: new THREE.Vector3(0, 0.12, -0.02),
    scale: { x: 1.0, y: 1.12, z: 1.02 },
    threshold: 34,
  });
  // Fringe curls along the hairline.
  for (let i = 0; i < 7; i++) {
    const a = -0.9 + (i / 6) * 1.8;
    addSolid(head, new THREE.IcosahedronGeometry(0.075, 0), stone, line, {
      pos: new THREE.Vector3(Math.sin(a) * 0.4, 0.36, Math.cos(a) * 0.4),
      threshold: 30,
    });
  }

  // Brow ridge and the straight Grecian nose running down from it.
  for (const sx of [-1, 1]) {
    addSolid(head, new THREE.BoxGeometry(0.15, 0.04, 0.075), holo, line, {
      pos: new THREE.Vector3(sx * 0.13, 0.15, 0.27),
      rot: { x: -0.2, z: sx * 0.12 },
    });
  }
  addSolid(head, new THREE.ConeGeometry(0.05, 0.32, 3), holo, line, {
    pos: new THREE.Vector3(0, -0.01, 0.3),
    rot: { x: Math.PI + 0.16, y: Math.PI / 4 },
    scale: { x: 1, y: 1, z: 0.72 },
  });

  // Hollow eyes — pupil-less, the way the marble is cut.
  for (const sx of [-1, 1]) {
    addSolid(head, new THREE.TorusGeometry(0.055, 0.013, 6, 12), stone, null, {
      pos: new THREE.Vector3(sx * 0.145, 0.085, 0.275),
      rot: { x: -0.24, y: sx * 0.34 },
    });
  }

  // Lips.
  addSolid(head, new THREE.BoxGeometry(0.13, 0.028, 0.05), holo, line, {
    pos: new THREE.Vector3(0, -0.19, 0.26),
  });

  // Laurel wreath, banded around the hairline with the leaves lying flat.
  addSolid(head, new THREE.TorusGeometry(0.35, 0.015, 6, 28), holo, null, {
    pos: new THREE.Vector3(0, 0.36, -0.04),
    rot: { x: Math.PI / 2 + 0.3 },
  });
  // Two laurel leaves at the brow, where a real wreath is tied off.
  for (const sx of [-1, 1]) {
    addSolid(head, new THREE.ConeGeometry(0.035, 0.15, 3), holo, null, {
      pos: new THREE.Vector3(sx * 0.19, 0.38, 0.24),
      rot: { x: 1.2, y: 0, z: sx * 0.7 },
      scale: { x: 1, y: 1, z: 0.35 },
    });
  }

  // Neck, shoulders, plinth.
  addSolid(root, new THREE.CylinderGeometry(0.15, 0.19, 0.24, 8), stone, line, {
    pos: new THREE.Vector3(0, -0.05, 0),
  });
  addSolid(root, new THREE.CylinderGeometry(0.26, 0.45, 0.32, 10), stone, line, {
    pos: new THREE.Vector3(0, -0.32, 0),
    scale: { x: 1, y: 1, z: 0.7 },
  });
  addSolid(root, new THREE.CylinderGeometry(0.37, 0.41, 0.09, 12), stone, line, {
    pos: new THREE.Vector3(0, -0.52, 0),
  });

  root.position.y = 0.04;
  root.scale.setScalar(1.12);
  return { object: root };
}

/** SE(3): a child frame chained off a parent, carrying a body with it. */
function makeAxes(holo, color, mats) {
  const line = lineMat(color);
  const root = new THREE.Group();

  root.add(triad(0.86, holo, line, 1.15));
  const floor = gridLines(2.0, 6, color, 0.22);
  floor.position.y = -0.9;
  root.add(floor);

  const child = new THREE.Group();
  root.add(child);
  const body = new THREE.BoxGeometry(0.44, 0.44, 0.44);
  child.add(new THREE.Mesh(body, holo));
  child.add(new THREE.LineSegments(new THREE.EdgesGeometry(body), line));
  child.add(triad(0.5, holo, line, 0.75));

  // The transform itself, drawn as the vector from parent origin to child.
  const linkGeo = new THREE.BufferGeometry().setAttribute(
    "position", new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 3));
  const linkMat = lineMat(color);
  linkMat.opacity = 0.75;
  root.add(new THREE.Line(linkGeo, linkMat));

  return {
    object: root,
    tick(t) {
      const r = 0.95;
      child.position.set(Math.cos(t * 0.5) * r, Math.sin(t * 0.37) * 0.42, Math.sin(t * 0.5) * r);
      child.rotation.set(t * 0.5, t * 0.7, Math.sin(t * 0.4) * 0.6);
      const pos = linkGeo.attributes.position;
      pos.setXYZ(1, child.position.x, child.position.y, child.position.z);
      pos.needsUpdate = true;
    },
  };
}

/** Wireframe globe with graticule, publication markers, and great-circle arcs. */
function makeGlobe(holo, color, mats) {
  const root = new THREE.Group();
  const R = 1.02;

  addSolid(root, new THREE.SphereGeometry(R * 0.985, 20, 14), dimMat(holo, mats, 0.3, 0.3), null, {});

  for (let i = 1; i < 7; i++) {
    const lat = -Math.PI / 2 + (i / 7) * Math.PI;
    const ring = ringLine(Math.cos(lat) * R, 48, color, 0.32);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = Math.sin(lat) * R;
    root.add(ring);
  }
  for (let i = 0; i < 8; i++) {
    const ring = ringLine(R, 48, color, 0.26);
    ring.rotation.y = (i / 8) * Math.PI;
    root.add(ring);
  }

  // Markers: publication sites, clustered rather than uniform.
  const markers = new THREE.Group();
  root.add(markers);
  const sites = [];
  for (let i = 0; i < 26; i++) {
    const lat = (Math.random() * 0.9 - 0.25) * Math.PI * 0.5;
    const lon = Math.random() * Math.PI * 2;
    const v = new THREE.Vector3(
      Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon));
    sites.push(v);
    const h = 0.06 + Math.random() * 0.26;
    const bar = addSolid(markers, new THREE.CylinderGeometry(0.018, 0.018, h, 5), holo, null, {});
    bar.position.copy(v).multiplyScalar(R + h / 2);
    bar.lookAt(0, 0, 0);
    bar.rotateX(Math.PI / 2);
    bar.userData.base = h;
  }

  // Arcs between a few of them — collaboration links.
  for (let i = 0; i < 5; i++) {
    const a = sites[(Math.random() * sites.length) | 0];
    const b = sites[(Math.random() * sites.length) | 0];
    if (a === b) continue;
    const mid = a.clone().add(b).normalize().multiplyScalar(R * 1.42);
    const curve = new THREE.QuadraticBezierCurve3(
      a.clone().multiplyScalar(R), mid, b.clone().multiplyScalar(R));
    const pts = curve.getPoints(24);
    const flat = [];
    for (let j = 0; j < pts.length - 1; j++) {
      flat.push(pts[j].x, pts[j].y, pts[j].z, pts[j + 1].x, pts[j + 1].y, pts[j + 1].z);
    }
    root.add(lineSegs(flat, color, 0.6));
  }

  root.scale.setScalar(0.95);
  return {
    object: root,
    tick(t) {
      markers.children.forEach((bar, i) => {
        const s = 1 + Math.sin(t * 1.4 + i) * 0.22;
        bar.scale.y = s;
      });
    },
  };
}

/** A rover on a simulation ground plane, sweeping a LiDAR fan. */
function makeGrid(holo, color, mats) {
  const line = lineMat(color);
  const root = new THREE.Group();

  const floor = gridLines(2.4, 8, color, 0.34);
  floor.position.y = -0.55;
  root.add(floor);
  // Plane border, so the ground reads as a bounded stage.
  const edge = gridLines(2.4, 1, color, 0.6);
  edge.position.y = -0.549;
  root.add(edge);

  const rover = new THREE.Group();
  rover.scale.setScalar(1.4);
  rover.position.y = -0.55;
  root.add(rover);
  addSolid(rover, new THREE.BoxGeometry(0.46, 0.16, 0.62), holo, line, {
    pos: new THREE.Vector3(0, 0.19, 0),
  });
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      addSolid(rover, new THREE.CylinderGeometry(0.1, 0.1, 0.07, 10), holo, line, {
        pos: new THREE.Vector3(sx * 0.26, 0.1, sz * 0.2),
        rot: { z: Math.PI / 2 },
      });
    }
  }
  // Sensor mast.
  addSolid(rover, new THREE.CylinderGeometry(0.035, 0.035, 0.22, 6), holo, null, {
    pos: new THREE.Vector3(0, 0.38, -0.05),
  });
  const sensor = new THREE.Group();
  sensor.position.set(0, 0.5, -0.05);
  rover.add(sensor);
  addSolid(sensor, new THREE.CylinderGeometry(0.1, 0.1, 0.09, 12), holo, line, {});

  // LiDAR fan — a wedge of rays leaving the sensor.
  const rays = [];
  for (let i = -6; i <= 6; i++) {
    const a = (i / 6) * 0.5;
    rays.push(0, 0, 0, Math.sin(a) * 1.15, -0.12, Math.cos(a) * 1.15);
  }
  const fan = lineSegs(rays, color, 0.4);
  sensor.add(fan);

  // A couple of obstacles for it to see.
  addSolid(root, new THREE.BoxGeometry(0.3, 0.44, 0.3), holo, line, {
    pos: new THREE.Vector3(0.82, -0.33, -0.7),
  });
  addSolid(root, new THREE.CylinderGeometry(0.2, 0.2, 0.36, 10), holo, line, {
    pos: new THREE.Vector3(-0.85, -0.37, 0.5),
  });

  root.rotation.x = 0.28;
  root.scale.setScalar(1.02);
  return {
    object: root,
    tick(t) {
      const r = 0.6;
      rover.position.x = Math.cos(t * 0.45) * r;
      rover.position.z = Math.sin(t * 0.45) * r;
      rover.rotation.y = -t * 0.45 + Math.PI / 2;
      sensor.rotation.y = Math.sin(t * 1.6) * 0.7;
      fan.material.opacity = 0.28 + (Math.sin(t * 3) * 0.5 + 0.5) * 0.22;
    },
  };
}

/** A turned chess king on a board corner. */
function makeChess(holo, color, mats) {
  const line = lineMat(color);
  const root = new THREE.Group();

  const profile = [
    [0.00, -0.86], [0.40, -0.86], [0.40, -0.78], [0.31, -0.72],
    [0.27, -0.62], [0.21, -0.42], [0.17, -0.16], [0.155, 0.06],
    [0.20, 0.14], [0.30, 0.20], [0.315, 0.26], [0.24, 0.31],
    [0.20, 0.38], [0.26, 0.46], [0.30, 0.58], [0.24, 0.66],
    [0.12, 0.71], [0.00, 0.72],
  ].map(([x, y]) => new THREE.Vector2(x, y));

  const piece = new THREE.Group();
  root.add(piece);
  const body = new THREE.LatheGeometry(profile, 16);
  piece.add(new THREE.Mesh(body, dimMat(holo, mats, 0.74, 0.62)));
  piece.add(new THREE.LineSegments(new THREE.EdgesGeometry(body, 26), line));

  // Cross finial.
  addSolid(piece, new THREE.BoxGeometry(0.05, 0.26, 0.05), holo, line, {
    pos: new THREE.Vector3(0, 0.86, 0),
  });
  addSolid(piece, new THREE.BoxGeometry(0.17, 0.05, 0.05), holo, line, {
    pos: new THREE.Vector3(0, 0.88, 0),
  });

  // Board underneath.
  const board = new THREE.Group();
  board.position.y = -0.88;
  root.add(board);
  board.add(gridLines(1.9, 6, color, 0.34));
  // Alternating squares, to make it unmistakably a board.
  const cell = 1.9 / 6;
  const squares = dimMat(holo, mats, 0.6, 0.5);
  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < 6; j++) {
      if ((i + j) % 2) continue;
      addSolid(board, new THREE.PlaneGeometry(cell * 0.86, cell * 0.86), squares, null, {
        pos: new THREE.Vector3(-0.95 + cell * (i + 0.5), 0.002, -0.95 + cell * (j + 0.5)),
        rot: { x: -Math.PI / 2 },
      });
    }
  }

  root.scale.setScalar(0.98);
  return {
    object: root,
    tick(t) {
      piece.position.y = Math.sin(t * 1.1) * 0.05;
      board.rotation.y = Math.sin(t * 0.2) * 0.12;
    },
  };
}

/** Depth capture: a camera frustum, the point cloud it returns, and a scan plane. */
function makeCloud(holo, color, mats) {
  const line = lineMat(color);
  const root = new THREE.Group();

  // The scanned object, as a cloud rather than a surface.
  const pts = [];
  const count = 900;
  for (let i = 0; i < count; i++) {
    const u = Math.random() * Math.PI * 2;
    const v = Math.acos(2 * Math.random() - 1);
    const wobble = 0.78 + Math.sin(u * 3) * 0.1 + Math.cos(v * 4) * 0.08;
    pts.push(
      Math.sin(v) * Math.cos(u) * wobble,
      Math.cos(v) * wobble * 0.92,
      Math.sin(v) * Math.sin(u) * wobble);
  }
  const cloudGeo = new THREE.BufferGeometry();
  cloudGeo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
  const cloudMat = new THREE.PointsMaterial({
    color: new THREE.Color(color || "#9184d9"),
    size: 0.035,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.85,
    depthTest: false,
    blending: THREE.AdditiveBlending,
  });
  root.add(new THREE.Points(cloudGeo, cloudMat));

  // Reconstructed surface, hinted at underneath the cloud.
  addSolid(root, new THREE.IcosahedronGeometry(0.7, 1), dimMat(holo, mats, 0.42, 0.4), line, { threshold: 24 });

  // Capture rig: a frustum looking in from one side.
  const cam = new THREE.Group();
  cam.position.set(1.32, 0.5, 0.42);
  cam.lookAt(0, 0, 0);
  root.add(cam);
  addSolid(cam, new THREE.BoxGeometry(0.18, 0.14, 0.12), holo, line, {});
  const f = 0.62, w = 0.3, h = 0.22;
  const corners = [[w, h], [-w, h], [-w, -h], [w, -h]];
  const frustum = [];
  corners.forEach(([x, y], i) => {
    const [nx, ny] = corners[(i + 1) % 4];
    frustum.push(0, 0, 0.06, x, y, f, x, y, f, nx, ny, f);
  });
  cam.add(lineSegs(frustum, color, 0.45));

  // Scan plane sweeping through the volume.
  const scan = gridLines(1.9, 8, color, 0.5);
  root.add(scan);

  return {
    object: root,
    tick(t) {
      scan.position.y = Math.sin(t * 0.7) * 0.86;
      scan.material.opacity = 0.2 + (Math.cos(t * 0.7) * 0.5 + 0.5) * 0.35;
      const a = Math.sin(t * 0.35) * 0.9;
      cam.position.set(Math.cos(a) * 1.42, 0.5, Math.sin(a) * 1.42);
      cam.lookAt(0, 0, 0);
      cloudMat.opacity = 0.6 + Math.sin(t * 1.5) * 0.18;
    },
  };
}

/** A stack of papers with the top sheet lifting off — the ranked recommendation. */
function makePaper(holo, color, mats) {
  const line = lineMat(color);
  const root = new THREE.Group();
  const W = 0.86, H = 1.12, T = 0.03;
  const page = dimMat(holo, mats, 0.62, 0.52);

  const sheet = (y, rot, opacity) => {
    const g = new THREE.Group();
    const geo = new THREE.BoxGeometry(W, T, H);
    g.add(new THREE.Mesh(geo, page));
    g.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), line));
    // Text ruling, so it reads as a page and not a slab.
    const rule = [];
    for (let i = 0; i < 6; i++) {
      const z = -H / 2 + 0.18 + i * 0.15;
      const w = (i === 0 ? 0.22 : 0.34) * W;
      rule.push(-w, T / 2 + 0.001, z, w, T / 2 + 0.001, z);
    }
    g.add(lineSegs(rule, color, opacity));
    g.position.y = y;
    g.rotation.y = rot;
    root.add(g);
    return g;
  };

  const stack = [];
  for (let i = 0; i < 4; i++) {
    stack.push(sheet(-0.5 + i * 0.09, (i - 1.5) * 0.09, 0.35));
  }
  const top = sheet(0.16, 0, 0.75);

  root.rotation.x = 0.42;
  root.scale.setScalar(1.04);
  return {
    object: root,
    tick(t) {
      const p = (Math.sin(t * 0.8) * 0.5 + 0.5);
      top.position.y = 0.1 + p * 0.42;
      top.rotation.y = p * 0.5;
      top.rotation.z = Math.sin(t * 0.8) * 0.12;
      stack.forEach((s, i) => { s.rotation.y = (i - 1.5) * 0.09 + Math.sin(t * 0.5 + i) * 0.04; });
    },
  };
}

/** A house on its parcel — the thing being valued. */
function makeHouse(holo, color, mats) {
  const line = lineMat(color);
  const root = new THREE.Group();

  const parcel = gridLines(2.3, 6, color, 0.3);
  parcel.position.y = -0.62;
  root.add(parcel);
  const bound = gridLines(2.3, 1, color, 0.6);
  bound.position.y = -0.619;
  root.add(bound);

  const walls = dimMat(holo, mats, 0.62, 0.5);
  addSolid(root, new THREE.BoxGeometry(0.94, 0.6, 0.78), walls, line, {
    pos: new THREE.Vector3(0, -0.3, 0),
  });
  addSolid(root, new THREE.CylinderGeometry(0.001, 0.78, 0.42, 4), walls, line, {
    pos: new THREE.Vector3(0, 0.21, 0),
    rot: { y: Math.PI / 4 },
    scale: { x: 1, y: 1, z: 0.86 },
  });
  addSolid(root, new THREE.BoxGeometry(0.13, 0.3, 0.13), holo, line, {
    pos: new THREE.Vector3(-0.3, 0.28, 0.12),
  });
  // Door and windows, as cut lines on the facade.
  const facade = [];
  const z = 0.393;
  facade.push(-0.1, -0.6, z, -0.1, -0.24, z, 0.1, -0.6, z, 0.1, -0.24, z, -0.1, -0.24, z, 0.1, -0.24, z);
  for (const cx of [-0.31, 0.31]) {
    facade.push(cx - 0.11, -0.34, z, cx + 0.11, -0.34, z, cx - 0.11, -0.12, z, cx + 0.11, -0.12, z,
                cx - 0.11, -0.34, z, cx - 0.11, -0.12, z, cx + 0.11, -0.34, z, cx + 0.11, -0.12, z);
  }
  root.add(lineSegs(facade, color, 0.65));

  // Valuation ring pulsing around the plot.
  const halo = ringLine(1.02, 40, color, 0.5);
  halo.rotation.x = Math.PI / 2;
  halo.position.y = -0.615;
  root.add(halo);

  root.rotation.x = 0.2;
  root.scale.setScalar(0.98);
  return {
    object: root,
    tick(t) {
      const p = (t * 0.5) % 1;
      halo.scale.setScalar(0.7 + p * 0.55);
      halo.material.opacity = 0.55 * (1 - p);
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

const CUSTOM = {
  head: makeHead, arm: makeArm, net: makeNet, axes: makeAxes, globe: makeGlobe,
  grid: makeGrid, chess: makeChess, cloud: makeCloud, paper: makePaper, house: makeHouse,
};

function buildShape(name, holo, color) {
  if (CUSTOM[name]) {
    const mats = [];
    const built = CUSTOM[name](holo, color, mats);
    return { ...built, mats };
  }
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
    if (name === "color" && this.material) {
      for (const m of this._mats()) m.uniforms.hologramColor.value.set(newV || "#9184d9");
    }
    if (name === "speed" && this.material) {
      for (const m of this._mats()) m.uniforms.signalSpeed.value = parseFloat(newV) || 0.7;
    }
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
    this._shapeMats = built.mats || [];
  }

  /** The shared material plus any dimmed clones the current shape created. */
  _mats() {
    return this.material ? [this.material, ...(this._shapeMats || [])] : [];
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
    const now = this._clock.getElapsedTime();
    for (const m of this._mats()) m.uniforms.time.value = now;
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

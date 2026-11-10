// Costruisce il modello 3D del "Grillo parlante" (il giocattolo rosso anni '80) e lo esporta in GLB.
// Gira dentro Chromium (serve il canvas 2D per disegnare le texture): lo lancia build.cjs.
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

// Misure in unità (1 unità ≈ 10 cm). Il fronte guarda verso +Z.
const W = 1.7;
const H = 2.44;
const FRONT = 0.15;
const BACK = -0.15;
const BEVEL = 0.04;

const RED = 0xc9151b;

function roundedRect(target, x0, y0, x1, y1, r) {
  target.moveTo(x0 + r, y0);
  target.lineTo(x1 - r, y0);
  target.quadraticCurveTo(x1, y0, x1, y0 + r);
  target.lineTo(x1, y1 - r);
  target.quadraticCurveTo(x1, y1, x1 - r, y1);
  target.lineTo(x0 + r, y1);
  target.quadraticCurveTo(x0, y1, x0, y1 - r);
  target.lineTo(x0, y0 + r);
  target.quadraticCurveTo(x0, y0, x0 + r, y0);
  return target;
}

/** Estrusione con spigoli arrotondati: la sagoma resta della misura data, da zBack a zFront. */
function slab(shape, zBack, zFront, bevel = BEVEL, segments = 5) {
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: zFront - zBack - bevel * 2,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelOffset: -bevel,
    bevelSegments: segments,
    curveSegments: 10
  });
  geometry.translate(0, 0, zBack + bevel);
  return geometry;
}

/** Lastra piatta con angoli arrotondati e UV 0..1 sul suo rettangolo. */
function plate(x0, y0, x1, y1, r, z) {
  const geometry = new THREE.ShapeGeometry(roundedRect(new THREE.Shape(), x0, y0, x1, y1, r), 8);
  const pos = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    uv.setXY(i, (pos.getX(i) - x0) / (x1 - x0), (pos.getY(i) - y0) / (y1 - y0));
  }
  geometry.translate(0, 0, z);
  return geometry;
}

function canvasTexture(canvas) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

// --- Texture: pannello con la tastiera ---------------------------------------

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function drawCricket(ctx, cx, cy, s) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(s, s);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const dark = "#14532d";
  ctx.strokeStyle = dark;
  ctx.lineWidth = 0.05;
  // zampe posteriori
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * 0.14, 0.2);
    ctx.lineTo(side * 0.5, -0.08);
    ctx.lineTo(side * 0.44, 0.52);
    ctx.stroke();
    ctx.fillStyle = "#e2342c";
    ctx.beginPath();
    ctx.ellipse(side * 0.5, 0.55, 0.13, 0.06, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  // braccia
  ctx.beginPath();
  ctx.moveTo(-0.2, 0.02);
  ctx.quadraticCurveTo(-0.5, -0.05, -0.56, -0.32);
  ctx.moveTo(0.2, 0.02);
  ctx.quadraticCurveTo(0.42, 0.14, 0.6, 0.02);
  ctx.stroke();
  // corpo
  ctx.fillStyle = "#f8fafc";
  ctx.beginPath();
  ctx.ellipse(0, 0.14, 0.24, 0.32, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#3db54a";
  ctx.beginPath();
  ctx.ellipse(0, 0.2, 0.13, 0.22, 0, 0, Math.PI * 2);
  ctx.fill();
  // antenne
  ctx.beginPath();
  ctx.moveTo(-0.1, -0.52);
  ctx.quadraticCurveTo(-0.22, -0.9, -0.48, -0.84);
  ctx.moveTo(0.1, -0.52);
  ctx.quadraticCurveTo(0.22, -0.9, 0.48, -0.84);
  ctx.stroke();
  // testa
  ctx.fillStyle = "#4cc15a";
  ctx.beginPath();
  ctx.ellipse(0, -0.36, 0.3, 0.25, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // occhi e sorriso
  for (const side of [-1, 1]) {
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.ellipse(side * 0.11, -0.41, 0.09, 0.11, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#111";
    ctx.beginPath();
    ctx.arc(side * 0.11 + 0.02, -0.39, 0.04, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(0, -0.3, 0.13, 0.25 * Math.PI, 0.75 * Math.PI);
  ctx.stroke();
  ctx.restore();
}

function keyboardCanvas() {
  const k = 16 / 3; // pixel del canvas per "punto" del pannello (264 x 186 punti)
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(264 * k);
  canvas.height = Math.round(186 * k);
  const ctx = canvas.getContext("2d");
  ctx.scale(k, k);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // fondo giallo con le fasce verdi che partono da sinistra
  ctx.fillStyle = "#f7d117";
  ctx.fillRect(0, 0, 264, 186);
  ctx.save();
  ctx.lineCap = "butt";
  const stripes = [
    ["#3aa845", 15],
    ["#b9d531", 7]
  ];
  let offset = 0;
  for (const [color, width] of stripes) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(-5, 124 + offset);
    ctx.bezierCurveTo(60, 116 + offset, 150, 128 + offset, 182, 200);
    ctx.stroke();
    offset += 12;
  }
  ctx.restore();

  // etichette dei tasti funzione
  const xs = Array.from({ length: 10 }, (_, i) => 23.5 + i * 24.1);
  const labels = ["STOP", "VIA", "RITORNO", "REPLICA", "AIUTO", "INDOVINA", "CODICE", "ALFABETO", "RIPETI", "SCRIVI"];
  ctx.fillStyle = "#4a3200";
  ctx.font = "700 3.9px Inter, sans-serif";
  labels.forEach((label, i) => ctx.fillText(label, xs[i], 19.5, 23));

  // campo verde della tastiera a membrana
  ctx.fillStyle = "#2f9e44";
  rr(ctx, 9, 25, 246, 89, 5);
  ctx.fill();
  ctx.strokeStyle = "#1c6b2c";
  ctx.lineWidth = 0.8;
  ctx.stroke();

  const key = (x, y, fill, stroke) => {
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    rr(ctx, x - 9.6, y - 7.2, 20, 16.4, 3);
    ctx.fill();
    ctx.fillStyle = fill;
    rr(ctx, x - 9.6, y - 8, 19.2, 16, 3);
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 0.9;
    ctx.stroke();
    // riflesso in alto: dà l'idea del rilievo del tasto
    ctx.fillStyle = "rgba(255,255,255,0.22)";
    rr(ctx, x - 8, y - 6.8, 16, 4, 2);
    ctx.fill();
  };

  // riga 1: funzioni
  const icons = ["–", "▶", "↩", "◀◀", "SOS", "?", "Ω", "ABC", "⟳", "+"];
  xs.forEach((x, i) => {
    const fill = i === 0 ? "#ee6a1f" : i === 9 ? "#4cba3c" : "#f6b51c";
    key(x, 36, fill, "#3b2a00");
    ctx.fillStyle = "#2b1d00";
    ctx.font = `800 ${icons[i].length > 2 ? 5.6 : 9}px Inter, "DejaVu Sans", sans-serif`;
    ctx.fillText(icons[i], x, 36.4, 16);
  });

  // righe 2-4: lettere
  const rows = ["ABCDEFGHIJ", "KLMNOPQRST", "UVWXYZ"];
  rows.forEach((row, r) => {
    [...row].forEach((letter, i) => {
      const y = 57.5 + r * 21;
      key(xs[i], y, "#35ace4", "#eaf7ff");
      ctx.fillStyle = "#0b2e4a";
      ctx.font = "800 10px Inter, sans-serif";
      ctx.fillText(letter, xs[i], y + 0.6);
    });
  });
  // tasti rossi in basso a destra
  ["’", "#", "✕", "●"].forEach((glyph, i) => {
    const x = xs[6 + i];
    key(x, 99.5, "#e2342c", "#ffe1dc");
    ctx.fillStyle = "#3a0906";
    ctx.font = `800 ${glyph === "’" ? 14 : 9.5}px Inter, "DejaVu Sans", sans-serif`;
    ctx.fillText(glyph, x, glyph === "’" ? 103 : 100);
  });

  ctx.fillStyle = "#4a3200";
  ctx.font = "700 3.9px Inter, sans-serif";
  ["MODULI", "CANCELLA", "CONTROLLO"].forEach((label, i) => ctx.fillText(label, xs[7 + i], 119.5, 23));

  // scritta "grillo PARLANTE"
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.font = "900 41px Inter, sans-serif";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#14532d";
  ctx.lineWidth = 5;
  ctx.strokeText("grillo", 7, 166);
  ctx.strokeStyle = "#f7d117";
  ctx.lineWidth = 2;
  ctx.strokeText("grillo", 7, 166);
  ctx.fillStyle = "#3db54a";
  ctx.fillText("grillo", 7, 166);
  ctx.font = "800 6.4px Inter, sans-serif";
  ctx.fillStyle = "#14532d";
  ctx.fillText("PARLANTE", 80, 135.5);

  drawCricket(ctx, 156, 152, 36);

  // bordo scuro sottile del pannello
  ctx.strokeStyle = "rgba(60,40,0,0.55)";
  ctx.lineWidth = 1.2;
  rr(ctx, 0.6, 0.6, 262.8, 184.8, 8);
  ctx.stroke();
  return canvas;
}

// --- Texture: display fluorescente --------------------------------------------

function displayCanvas(text) {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 400;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.font = "500 74px 'JetBrains Mono', 'DejaVu Sans Mono', monospace";
  ctx.textBaseline = "middle";
  ctx.letterSpacing = "16px";
  ctx.fillStyle = "#3dffb0";
  ctx.shadowColor = "#19e58f";
  for (const blur of [28, 10, 0]) {
    ctx.shadowBlur = blur;
    ctx.fillText(text, 330, 205);
  }
  return canvas;
}

// --- Modello ------------------------------------------------------------------

export function buildModel() {
  const root = new THREE.Group();
  root.name = "GrilloParlante";

  const red = new THREE.MeshStandardMaterial({ name: "PlasticaRossa", color: RED, roughness: 0.36, metalness: 0 });
  const redDark = new THREE.MeshStandardMaterial({ name: "PlasticaRossaScura", color: 0x8f1212, roughness: 0.5 });
  const black = new THREE.MeshStandardMaterial({ name: "PlasticaNera", color: 0x121212, roughness: 0.55 });
  const grille = new THREE.MeshStandardMaterial({ name: "Griglia", color: 0x2a2a2a, roughness: 0.7 });

  const add = (name, geometry, material) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    root.add(mesh);
    return mesh;
  };

  // Scocca con il foro della maniglia.
  const outline = roundedRect(new THREE.Shape(), -W / 2, -H / 2, W / 2, H / 2, 0.15);
  outline.holes.push(roundedRect(new THREE.Path(), -0.6, 0.8, 0.6, 1.1, 0.13));
  add("Scocca", slab(outline, BACK, FRONT), red);

  // Parte bassa più spessa sul retro (vano pile e altoparlante).
  const BULGE = BACK - 0.075;
  add("Retro", slab(roundedRect(new THREE.Shape(), -W / 2, -H / 2, W / 2, 0.16, 0.15), BULGE, 0), red);

  // Fascia nera: avvolge il fronte e i fianchi.
  const e = 0.004;
  add(
    "FasciaNera",
    slab(roundedRect(new THREE.Shape(), -W / 2 - e, 0.2, W / 2 + e, 0.68, 0.012), -0.03, FRONT + e, BEVEL, 5),
    black
  );

  // Griglia dell'altoparlante: lamelle in rilievo.
  for (let i = 0; i < 8; i++) {
    const bar = new THREE.BoxGeometry(0.44, 0.011, 0.012);
    bar.translate(-0.56, 0.645 - i * 0.024, FRONT + e + 0.004);
    add(`Lamella${i + 1}`, bar, grille);
  }

  // Display: vetro scuro lucido con la scritta verde che si illumina.
  const displayMap = canvasTexture(displayCanvas("SCRIVI A"));
  const glass = new THREE.MeshStandardMaterial({
    name: "Display",
    color: 0x030303,
    roughness: 0.08,
    emissive: 0xffffff,
    emissiveMap: displayMap,
    emissiveIntensity: 1.6
  });
  add("Display", plate(-0.28, 0.225, 0.79, 0.655, 0.02, FRONT + e + 0.002), glass);

  // Pannello giallo con la tastiera.
  const panel = new THREE.MeshStandardMaterial({
    name: "Tastiera",
    map: canvasTexture(keyboardCanvas()),
    roughness: 0.42
  });
  add("Tastiera", plate(-0.733, -0.926, 0.733, 0.108, 0.045, FRONT + 0.003), panel);

  // --- Retro ---
  const box = (name, w, h, d, x, y, z, material) => {
    const geometry = new THREE.BoxGeometry(w, h, d);
    geometry.translate(x, y, z);
    return add(name, geometry, material);
  };
  // sportello delle pile: cornice scura + sportello + linguetta
  box("VanoPile", 0.56, 0.5, 0.01, 0.24, -0.92, BULGE + 0.002, redDark);
  add("SportelloPile", slab(roundedRect(new THREE.Shape(), -0.025, -1.155, 0.505, -0.685, 0.02), BULGE - 0.008, BULGE + 0.01, 0.006, 2), red);
  box("Linguetta", 0.14, 0.035, 0.012, 0.24, -1.12, BULGE - 0.008, redDark);
  // fessura e incavi delle viti
  box("Fessura", 0.14, 0.022, 0.01, 0.25, -0.41, BULGE + 0.002, redDark);
  [
    [-0.72, 0.92, BACK],
    [0.72, 0.92, BACK],
    [-0.72, 0.3, BACK],
    [0.72, 0.3, BACK],
    [-0.62, -0.95, BULGE],
    [0.66, -0.4, BULGE]
  ].forEach(([x, y, z], i) => box(`Vite${i + 1}`, 0.045, 0.045, 0.01, x, y, z + 0.002, redDark));
  // giunzione orizzontale dietro la maniglia
  box("Giunzione", W - 0.16, 0.008, 0.01, 0, 0.74, BACK + 0.003, redDark);

  return root;
}

export async function exportGlb() {
  await document.fonts.load("900 40px Inter");
  await document.fonts.load("500 74px 'JetBrains Mono'");
  const glb = await new GLTFExporter().parseAsync(buildModel(), { binary: true });
  let binary = "";
  const bytes = new Uint8Array(glb);
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/** Anteprima di controllo: ricarica il GLB esportato e lo disegna da un certo angolo. */
export async function preview(base64, angle, background = "#ffffff") {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer, "");
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(700, 900);
  renderer.toneMapping = THREE.NeutralToneMapping;
  document.body.replaceChildren(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(background);
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.55;
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(2, 3, 4);
  scene.add(key, gltf.scene);
  gltf.scene.rotation.y = angle;
  const camera = new THREE.PerspectiveCamera(30, 700 / 900, 0.1, 50);
  camera.position.set(0, 0.5, 6.4);
  camera.lookAt(0, 0, 0);
  renderer.render(scene, camera);
  return renderer.domElement.toDataURL("image/png");
}

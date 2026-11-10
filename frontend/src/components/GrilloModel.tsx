import { useEffect, useRef } from "react";
import {
  DirectionalLight,
  NeutralToneMapping,
  PerspectiveCamera,
  PMREMGenerator,
  Scene,
  WebGLRenderer,
  type Object3D
} from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
// Il modello viaggia dentro il bundle (vedi il plugin base64Files in vite.config.ts).
// Si rigenera con `node scripts/model/build.cjs`.
import modelBase64 from "../assets/grillo.glb?base64";

function modelBytes() {
  const binary = atob(modelBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

/** Il Grillo parlante in 3D che gira su se stesso. Si può anche trascinare per ruotarlo. */
export default function GrilloModel({ size = 150 }: { size?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    let renderer: WebGLRenderer;
    try {
      renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
    } catch {
      return; // niente WebGL: resta lo spazio vuoto, l'app funziona lo stesso
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(size, size, false);
    renderer.toneMapping = NeutralToneMapping;

    const scene = new Scene();
    const pmrem = new PMREMGenerator(renderer);
    const environment = pmrem.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = environment.texture;
    scene.environmentIntensity = 0.55;
    const light = new DirectionalLight(0xffffff, 1.6);
    light.position.set(2, 3, 4);
    scene.add(light);

    const camera = new PerspectiveCamera(26, 1, 0.1, 50);
    camera.position.set(0, 0.45, 6.6);
    camera.lookAt(0, 0, 0);

    let model: Object3D | null = null;
    let disposed = false;
    new GLTFLoader().parse(modelBytes(), "", (gltf) => {
      if (disposed) return;
      model = gltf.scene;
      model.rotation.y = -0.5;
      scene.add(model);
      canvas.style.opacity = "1";
    });

    // Trascinamento: ruota a mano, poi riprende a girare da solo.
    let dragX: number | null = null;
    const down = (event: PointerEvent) => {
      dragX = event.clientX;
      canvas.setPointerCapture(event.pointerId);
    };
    const move = (event: PointerEvent) => {
      if (dragX === null || !model) return;
      model.rotation.y += (event.clientX - dragX) * 0.02;
      dragX = event.clientX;
    };
    const up = () => (dragX = null);
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);

    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let last = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      frame = requestAnimationFrame(tick);
      const dt = Math.min(now - last, 100) / 1000;
      last = now;
      if (model && dragX === null && !still) model.rotation.y += dt * 0.7;
      renderer.render(scene, camera);
    });

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", up);
      environment.dispose();
      pmrem.dispose();
      renderer.dispose();
    };
  }, [size]);

  return (
    <canvas
      ref={canvasRef}
      aria-label="Il Grillo parlante"
      className="cursor-grab touch-none opacity-0 transition-opacity duration-500 active:cursor-grabbing"
      style={{ width: size, height: size }}
    />
  );
}

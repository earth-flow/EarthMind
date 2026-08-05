import { useEffect, useRef, useState } from "react";
import { frameObject } from "../../utils/three-frame-object";

type ThreeModule = typeof import("three");

type ThreeCanvasProps = {
  /** Parses/builds the scene-ready object for the current data. Re-run whenever the identity of this function changes (callers should memoize/inline based on their own data deps). */
  load: (THREE: ThreeModule) => Promise<import("three").Object3D>;
  /** Deps that should trigger a reload -- mirrors a manual useEffect dep array, since `load` itself is a fresh closure every render. */
  deps: unknown[];
  unavailableMessage: string;
};

/**
 * Shared Three.js canvas shell: scene/camera/renderer/OrbitControls setup,
 * bounding-box auto-framing, a requestAnimationFrame render loop, a
 * ResizeObserver keeping the canvas sized to its container, and cleanup --
 * everything mesh-widget and pointcloud-widget need identically, differing
 * only in how they parse their input bytes into an Object3D (the `load`
 * callback). Originally lived inline in mesh-widget.tsx; pulled out once
 * pointcloud-widget needed the exact same shell a second time.
 */
export function ThreeCanvas({
  load,
  deps,
  unavailableMessage,
}: ThreeCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    let cancelled = false;
    let renderer: import("three").WebGLRenderer | undefined;
    let controls:
      | import("three/addons/controls/OrbitControls.js").OrbitControls
      | undefined;
    let frameId: number | undefined;
    let resizeObserver: ResizeObserver | undefined;

    setLoadError(false);

    // Dynamically imported (like mammoth/xlsx/maplibre-gl in sibling
    // widgets) so this dependency only ships to a client that actually
    // renders a mesh or point cloud.
    Promise.all([
      import("three"),
      import("three/addons/controls/OrbitControls.js"),
    ])
      .then(async ([THREE, { OrbitControls }]) => {
        if (cancelled || !containerRef.current) return;

        const object = await load(THREE);
        if (cancelled || !containerRef.current) return;

        const scene = new THREE.Scene();
        scene.add(object);
        scene.add(new THREE.AmbientLight(0xffffff, 0.6));
        const directional = new THREE.DirectionalLight(0xffffff, 1.2);
        directional.position.set(1, 1.5, 1);
        scene.add(directional);

        const camera = new THREE.PerspectiveCamera(
          50,
          container.clientWidth / container.clientHeight,
          0.01,
          1000,
        );

        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.setSize(container.clientWidth, container.clientHeight);
        container.appendChild(renderer.domElement);

        controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;

        frameObject(THREE, object, camera, controls);

        const renderLoop = () => {
          controls?.update();
          if (renderer) renderer.render(scene, camera);
          frameId = requestAnimationFrame(renderLoop);
        };
        renderLoop();

        resizeObserver = new ResizeObserver(() => {
          if (!renderer || !container.clientWidth || !container.clientHeight)
            return;
          camera.aspect = container.clientWidth / container.clientHeight;
          camera.updateProjectionMatrix();
          renderer.setSize(container.clientWidth, container.clientHeight);
        });
        resizeObserver.observe(container);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });

    return () => {
      cancelled = true;
      if (frameId !== undefined) cancelAnimationFrame(frameId);
      resizeObserver?.disconnect();
      controls?.dispose();
      renderer?.dispose();
      renderer?.domElement.remove();
    };
  }, deps);

  if (loadError) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {unavailableMessage}
      </div>
    );
  }

  return <div ref={containerRef} className="h-full w-full" />;
}

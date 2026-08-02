import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import Loading from "@/components/ui/loading";
import type { WidgetContentProps } from "@/types/appPage/widget";
import { useWidgetFileBytes } from "../../utils/file-ref";
import { extensionOf, extractFileRef } from "../../utils/resolve-widget-kind";

type ThreeModule = typeof import("three");
type LoadedMesh = import("three").Object3D;

/** Parses mesh bytes into a scene-ready Object3D, dispatching on file extension since mesh formats don't share one parser. */
async function parseMesh(
  THREE: ThreeModule,
  extension: string,
  data: ArrayBuffer,
): Promise<LoadedMesh> {
  if (extension === "gltf" || extension === "glb") {
    const { GLTFLoader } = await import(
      "three/addons/loaders/GLTFLoader.js"
    );
    const loader = new GLTFLoader();
    return new Promise((resolve, reject) => {
      loader.parse(data, "", (gltf) => resolve(gltf.scene), reject);
    });
  }

  if (extension === "stl") {
    const { STLLoader } = await import("three/addons/loaders/STLLoader.js");
    const geometry = new STLLoader().parse(data);
    geometry.computeVertexNormals();
    return new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({ color: 0x9ca3af }),
    );
  }

  // .obj: OBJLoader.parse takes text, not bytes -- no MTL/material fetch,
  // so this always renders with a default material.
  const { OBJLoader } = await import("three/addons/loaders/OBJLoader.js");
  const text = new TextDecoder().decode(data);
  return new OBJLoader().parse(text);
}

/** Centers the object at the origin, scaled/positioned so a fixed camera distance frames it regardless of its native units. */
function frameObject(
  THREE: ThreeModule,
  object: LoadedMesh,
  camera: import("three").PerspectiveCamera,
  controls: import("three/addons/controls/OrbitControls.js").OrbitControls,
): void {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  object.position.sub(center);

  const maxDimension = Math.max(size.x, size.y, size.z, 1e-6);
  const distance = maxDimension * 2.2;
  camera.position.set(distance, distance * 0.6, distance);
  camera.near = maxDimension / 100;
  camera.far = maxDimension * 100;
  camera.updateProjectionMatrix();
  controls.target.set(0, 0, 0);
  controls.update();
}

function MeshCanvas({
  extension,
  data,
}: {
  extension: string;
  data: ArrayBuffer;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const { t } = useTranslation();
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    let cancelled = false;
    let renderer: import("three").WebGLRenderer | undefined;
    let controls: import("three/addons/controls/OrbitControls.js").OrbitControls | undefined;
    let frameId: number | undefined;
    let resizeObserver: ResizeObserver | undefined;

    // Dynamically imported (like maplibre-gl/mammoth/xlsx in sibling widgets)
    // so this dependency only ships to a client that actually renders a mesh.
    Promise.all([
      import("three"),
      import("three/addons/controls/OrbitControls.js"),
    ])
      .then(async ([THREE, { OrbitControls }]) => {
        if (cancelled || !containerRef.current) return;

        const object = await parseMesh(THREE, extension, data);
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
  }, [extension, data]);

  if (loadError) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {t("app.widgets.meshUnavailable")}
      </div>
    );
  }

  return <div ref={containerRef} className="h-full w-full" />;
}

/** Renders glTF/GLB, OBJ, and STL meshes via Three.js with orbit controls. Point cloud formats (LAS/LAZ, PLY, PCD) are a deferred fast-follow. */
export function MeshWidget({ output }: WidgetContentProps) {
  const { t } = useTranslation();
  const fileRef = extractFileRef(output.message);
  const { data, status } = useWidgetFileBytes(fileRef);

  if (!fileRef || status === "loading" || status === "idle") {
    return (
      <div className="flex h-full items-center justify-center">
        <Loading />
      </div>
    );
  }
  if (status === "error" || !data) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {t("app.widgets.meshUnavailable")}
      </div>
    );
  }

  return <MeshCanvas extension={extensionOf(fileRef.name)} data={data} />;
}

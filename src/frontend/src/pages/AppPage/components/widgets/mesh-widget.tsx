import { useTranslation } from "react-i18next";
import Loading from "@/components/ui/loading";
import type { WidgetContentProps } from "@/types/appPage/widget";
import { useWidgetFileBytes } from "../../utils/file-ref";
import { extensionOf, extractFileRef } from "../../utils/resolve-widget-kind";
import { ThreeCanvas } from "./three-canvas";

type ThreeModule = typeof import("three");
type LoadedMesh = import("three").Object3D;

/** Parses mesh bytes into a scene-ready Object3D, dispatching on file extension since mesh formats don't share one parser. */
async function parseMesh(
  THREE: ThreeModule,
  extension: string,
  data: ArrayBuffer,
): Promise<LoadedMesh> {
  if (extension === "gltf" || extension === "glb") {
    const { GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js");
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

/** Renders glTF/GLB, OBJ, and STL meshes via Three.js with orbit controls. Point cloud formats render through pointcloud-widget.tsx instead. */
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

  const extension = extensionOf(fileRef.name);
  return (
    <ThreeCanvas
      load={(THREE) => parseMesh(THREE, extension, data)}
      deps={[extension, data]}
      unavailableMessage={t("app.widgets.meshUnavailable")}
    />
  );
}

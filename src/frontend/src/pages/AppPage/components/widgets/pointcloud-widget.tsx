import { useTranslation } from "react-i18next";
import Loading from "@/components/ui/loading";
import type { WidgetContentProps } from "@/types/appPage/widget";
import { useWidgetFileBytes } from "../../utils/file-ref";
import { extensionOf, extractFileRef } from "../../utils/resolve-widget-kind";
import { ThreeCanvas } from "./three-canvas";

type ThreeModule = typeof import("three");
type LoadedObject = import("three").Object3D;

/**
 * Parses point cloud bytes into a scene-ready Object3D. .pcd always yields a
 * genuine point cloud (PCDLoader returns a ready-to-use THREE.Points). .ply
 * is ambiguous -- it's used for both point clouds and ordinary meshes, so a
 * geometry with face indices renders as a lit mesh, and one without renders
 * as points (with per-vertex color if the file has it, a flat color
 * otherwise). See the POINTCLOUD_EXTENSIONS comment in resolve-widget-kind.ts
 * for why gaussian-splat .ply files also land here rather than the "gs"
 * widget -- extension alone can't distinguish the two.
 */
async function parsePointCloud(
  THREE: ThreeModule,
  extension: string,
  data: ArrayBuffer,
): Promise<LoadedObject> {
  if (extension === "pcd") {
    const { PCDLoader } = await import("three/addons/loaders/PCDLoader.js");
    const points = new PCDLoader().parse(data);
    const material = points.material as import("three").PointsMaterial;
    if (!material.size || material.size < 0.005) material.size = 0.02;
    return points;
  }

  const { PLYLoader } = await import("three/addons/loaders/PLYLoader.js");
  const geometry = new PLYLoader().parse(data);
  const hasColor = !!geometry.getAttribute("color");

  if (geometry.index !== null) {
    geometry.computeVertexNormals();
    return new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({
        color: hasColor ? 0xffffff : 0x9ca3af,
        vertexColors: hasColor,
      }),
    );
  }

  return new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      size: 0.02,
      vertexColors: hasColor,
      color: hasColor ? 0xffffff : 0x60a5fa,
    }),
  );
}

/** Renders PLY/PCD point clouds (and mesh-shaped PLY files) via Three.js with orbit controls. LAS/LAZ LiDAR point clouds are a deferred fast-follow. */
export function PointCloudWidget({ output }: WidgetContentProps) {
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
        {t("app.widgets.pointcloudUnavailable")}
      </div>
    );
  }

  const extension = extensionOf(fileRef.name);
  return (
    <ThreeCanvas
      load={(THREE) => parsePointCloud(THREE, extension, data)}
      deps={[extension, data]}
      unavailableMessage={t("app.widgets.pointcloudUnavailable")}
    />
  );
}

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import Loading from "@/components/ui/loading";
import type { WidgetContentProps } from "@/types/appPage/widget";
import { useWidgetFileBytes } from "../../utils/file-ref";
import { extensionOf, extractFileRef } from "../../utils/resolve-widget-kind";

const GS_FORMAT_NAME_BY_EXTENSION: Record<string, string> = {
  ply: "Ply",
  splat: "Splat",
  ksplat: "KSplat",
  spz: "Spz",
};

/**
 * Renders gaussian-splat scenes via @mkkellogg/gaussian-splats-3d, the
 * established Three.js-integrated viewer for this format (an actual splat
 * renderer needs tile/depth sorting and a specialized shader -- not
 * something to hand-roll). Supplies its own renderer/camera/OrbitControls
 * (mirroring mesh-widget/pointcloud-widget's manual render loop) rather than
 * letting the library create its own: passing a custom `renderer` sets its
 * internal `usingExternalRenderer` flag, which is what makes its `dispose()`
 * skip document.body/rootElement teardown it otherwise assumes it owns --
 * without that, dispose() throws trying to remove a container div it never
 * actually appended to document.body itself.
 *
 * `sharedMemoryForWorkers`/`gpuAcceleratedSort` are both forced off: they
 * depend on SharedArrayBuffer, which requires cross-origin-isolation
 * response headers (COOP/COEP) this deployment doesn't set -- forcing them
 * off trades some sort performance for not depending on server config this
 * widget has no way to verify at runtime.
 */
function GsCanvas({
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
    let controls:
      | import("three/addons/controls/OrbitControls.js").OrbitControls
      | undefined;
    // No published types for this package -- see the WidgetKind "gs" case.
    // biome-ignore lint/suspicious/noExplicitAny: untyped third-party viewer instance.
    let viewer: any;
    let frameId: number | undefined;
    let resizeObserver: ResizeObserver | undefined;
    let blobUrl: string | undefined;

    setLoadError(false);

    Promise.all([
      import("three"),
      import("three/addons/controls/OrbitControls.js"),
      import("@mkkellogg/gaussian-splats-3d"),
    ])
      .then(async ([THREE, { OrbitControls }, GaussianSplats3D]) => {
        if (cancelled || !containerRef.current) return;

        const camera = new THREE.PerspectiveCamera(
          50,
          container.clientWidth / container.clientHeight,
          0.1,
          1000,
        );
        camera.position.set(0, 0, 4);

        renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.setSize(container.clientWidth, container.clientHeight);
        container.appendChild(renderer.domElement);

        controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;

        viewer = new GaussianSplats3D.Viewer({
          selfDrivenMode: false,
          renderer,
          camera,
          useBuiltInControls: false,
          sharedMemoryForWorkers: false,
          gpuAcceleratedSort: false,
          logLevel: GaussianSplats3D.LogLevel.None,
        });

        const formatName = GS_FORMAT_NAME_BY_EXTENSION[extension] ?? "Ply";
        const format = GaussianSplats3D.SceneFormat[formatName];
        blobUrl = URL.createObjectURL(new Blob([data]));

        await viewer.addSplatScene(blobUrl, { format, showLoadingUI: false });
        if (cancelled || !containerRef.current) return;

        const renderLoop = () => {
          controls?.update();
          viewer?.update();
          viewer?.render();
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
      viewer?.dispose();
      renderer?.dispose();
      renderer?.domElement.remove();
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [extension, data]);

  if (loadError) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {t("app.widgets.gsUnavailable")}
      </div>
    );
  }

  return <div ref={containerRef} className="h-full w-full" />;
}

/** Renders .splat/.ksplat/.spz gaussian-splat scenes (and .ply as a best-effort fallback -- see resolve-widget-kind.ts's POINTCLOUD_EXTENSIONS comment on the .ply ambiguity). */
export function GaussianSplatWidget({ output }: WidgetContentProps) {
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
        {t("app.widgets.gsUnavailable")}
      </div>
    );
  }

  return <GsCanvas extension={extensionOf(fileRef.name)} data={data} />;
}

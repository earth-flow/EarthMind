import { useTranslation } from "react-i18next";
import ForwardedIconComponent from "@/components/common/genericIconComponent";
import { Button } from "@/components/ui/button";
import { useGetDownloadFileV2 } from "@/controllers/API/queries/file-management";
import { useGetDownloadSandboxFile } from "@/controllers/API/queries/file-management/use-get-sandbox-files";
import { useGetDownloadFileMutation } from "@/controllers/API/queries/files";
import type {
  ResolvedFileRef,
  WidgetContentProps,
} from "@/types/appPage/widget";
import { extractFileRef } from "../../utils/resolve-widget-kind";

function DownloadTrigger({ fileRef }: { fileRef: ResolvedFileRef }) {
  const extension = fileRef.name.split(".").pop() ?? "";
  const { mutate: downloadV1 } = useGetDownloadFileMutation({
    path: fileRef.source === "v1" ? fileRef.path : "",
    filename: fileRef.name,
  });
  const { mutate: downloadV2 } = useGetDownloadFileV2({
    id: fileRef.source === "v2" ? fileRef.fileId : "",
    filename: fileRef.name.replace(/\.[^.]+$/, ""),
    type: extension,
  });
  const { mutate: downloadSandbox } = useGetDownloadSandboxFile({
    path: fileRef.source === "sandbox" ? fileRef.path : "",
    name: fileRef.name,
  });

  const handleDownload = () => {
    if (fileRef.source === "v1") return downloadV1(undefined);
    if (fileRef.source === "v2") return downloadV2(undefined);
    return downloadSandbox();
  };

  return (
    <Button variant="outline" size="sm" onClick={handleDownload}>
      <ForwardedIconComponent name="Download" className="h-4 w-4" />
      {fileRef.name}
    </Button>
  );
}

/** Generic fallback for file references with no dedicated preview widget (e.g. raster GeoTIFF, shapefiles, zips). */
export function FileWidget({ output }: WidgetContentProps) {
  const { t } = useTranslation();
  const fileRef = extractFileRef(output.message);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
      <ForwardedIconComponent
        name="File"
        className="h-8 w-8 text-muted-foreground"
      />
      {fileRef ? (
        <DownloadTrigger fileRef={fileRef} />
      ) : (
        <span className="text-sm text-muted-foreground">
          {t("app.widgets.fileUnavailable")}
        </span>
      )}
    </div>
  );
}

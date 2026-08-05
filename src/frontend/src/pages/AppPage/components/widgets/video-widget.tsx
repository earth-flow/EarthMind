import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import Loading from "@/components/ui/loading";
import type { WidgetContentProps } from "@/types/appPage/widget";
import { useWidgetFileBytes } from "../../utils/file-ref";
import { extensionOf, extractFileRef } from "../../utils/resolve-widget-kind";

const VIDEO_MIME_BY_EXTENSION: Record<string, string> = {
  mp4: "video/mp4",
  m4v: "video/x-m4v",
  webm: "video/webm",
  ogv: "video/ogg",
  ogg: "video/ogg",
  mov: "video/quicktime",
  avi: "video/x-msvideo",
  mkv: "video/x-matroska",
  wmv: "video/x-ms-wmv",
};

/**
 * Native <video> playback -- the browser's own decoder is the "existing
 * solution" here, no player library needed. mp4/webm/ogv play in every
 * modern browser; mov/avi/mkv/wmv depend on the container's actual codec and
 * commonly fail to decode (e.g. most avi files use codecs no browser ships),
 * in which case the video element's error event drives the same
 * "unavailable, download to view" fallback every other widget uses.
 */
function VideoPlayer({
  extension,
  data,
}: {
  extension: string;
  data: ArrayBuffer;
}) {
  const { t } = useTranslation();
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [playbackError, setPlaybackError] = useState(false);

  useEffect(() => {
    const mimeType = VIDEO_MIME_BY_EXTENSION[extension] ?? "video/mp4";
    const url = URL.createObjectURL(new Blob([data], { type: mimeType }));
    setObjectUrl(url);
    setPlaybackError(false);
    return () => URL.revokeObjectURL(url);
  }, [extension, data]);

  if (playbackError) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {t("app.widgets.videoUnavailable")}
      </div>
    );
  }

  if (!objectUrl) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loading />
      </div>
    );
  }

  return (
    <div className="flex h-full items-center justify-center bg-black/5 dark:bg-black/40">
      <video
        key={objectUrl}
        src={objectUrl}
        controls
        className="max-h-full max-w-full"
        onError={() => setPlaybackError(true)}
      />
    </div>
  );
}

export function VideoWidget({ output }: WidgetContentProps) {
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
        {t("app.widgets.videoUnavailable")}
      </div>
    );
  }

  return <VideoPlayer extension={extensionOf(fileRef.name)} data={data} />;
}

import { useTranslation } from "react-i18next";
import type { WidgetContentProps } from "@/types/appPage/widget";
import { getFileRefUrl } from "../../utils/file-ref";
import { extractFileRef } from "../../utils/resolve-widget-kind";

/** Renders an image file reference, reusing the same crossOrigin="use-credentials" trick file-card.tsx uses for chat images. */
export function ImageWidget({ output }: WidgetContentProps) {
  const { t } = useTranslation();
  const fileRef = extractFileRef(output.message);
  if (!fileRef) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {t("app.widgets.imageUnavailable")}
      </div>
    );
  }

  return (
    <img
      crossOrigin="use-credentials"
      src={getFileRefUrl(fileRef, { image: true })}
      alt={fileRef.name}
      className="h-full w-full object-contain"
    />
  );
}

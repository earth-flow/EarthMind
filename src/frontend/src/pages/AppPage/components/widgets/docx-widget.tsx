import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import SanitizedHTMLWrapper from "@/components/common/sanitizedHTMLWrapper";
import Loading from "@/components/ui/loading";
import type { WidgetContentProps } from "@/types/appPage/widget";
import { useWidgetFileBytes } from "../../utils/file-ref";
import { extractFileRef } from "../../utils/resolve-widget-kind";

/** Renders a Word document inline by converting it to HTML client-side with mammoth. */
export function DocxWidget({ output }: WidgetContentProps) {
  const { t } = useTranslation();
  const fileRef = extractFileRef(output.message);
  const { data, status } = useWidgetFileBytes(fileRef);
  const [html, setHtml] = useState<string | null>(null);
  const [convertError, setConvertError] = useState(false);

  useEffect(() => {
    if (!data) {
      setHtml(null);
      return;
    }
    let cancelled = false;
    import("mammoth")
      .then((mammoth) => mammoth.convertToHtml({ arrayBuffer: data }))
      .then((result) => {
        if (!cancelled) setHtml(result.value);
      })
      .catch(() => {
        if (!cancelled) setConvertError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [data]);

  if (
    status === "loading" ||
    status === "idle" ||
    (status === "ready" && !html && !convertError)
  ) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loading />
      </div>
    );
  }
  if (status === "error" || convertError || !html) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {t("app.widgets.documentUnavailable")}
      </div>
    );
  }

  return (
    <SanitizedHTMLWrapper
      content={html}
      className="prose prose-sm max-w-none dark:prose-invert"
    />
  );
}

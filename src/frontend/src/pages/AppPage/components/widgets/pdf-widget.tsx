import { lazy, Suspense } from "react";
import { useTranslation } from "react-i18next";
import Loading from "@/components/ui/loading";
import type { WidgetContentProps } from "@/types/appPage/widget";
import { useWidgetFileBytes } from "../../utils/file-ref";
import { extractFileRef } from "../../utils/resolve-widget-kind";

// Lazy-loaded: react-pdf pulls in pdfjs-dist, an ESM-only, ~1MB+ dependency
// that shouldn't ship to (or even be resolved for) a client/test that never
// renders a PDF widget.
const PdfViewer = lazy(() => import("@/components/core/pdfViewer"));

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Renders a PDF file reference. Bytes are fetched with credentials first
 * (see useWidgetFileBytes) and handed to react-pdf as a data: URL rather than
 * a bare authenticated URL, since pdf.js's internal fetch doesn't carry the
 * session cookie the way an <img crossOrigin="use-credentials"> does.
 */
export function PdfWidget({ output }: WidgetContentProps) {
  const { t } = useTranslation();
  const fileRef = extractFileRef(output.message);
  const { data, status } = useWidgetFileBytes(fileRef);

  if (status === "loading" || status === "idle") {
    return (
      <div className="flex h-full items-center justify-center">
        <Loading />
      </div>
    );
  }
  if (status === "error" || !data) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {t("app.widgets.pdfUnavailable")}
      </div>
    );
  }

  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center">
          <Loading />
        </div>
      }
    >
      <PdfViewer
        pdf={`data:application/pdf;base64,${arrayBufferToBase64(data)}`}
      />
    </Suspense>
  );
}

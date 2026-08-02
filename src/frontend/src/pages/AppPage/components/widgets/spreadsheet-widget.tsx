import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import DataOutputComponent from "@/components/core/dataOutputComponent";
import Loading from "@/components/ui/loading";
import type { WidgetContentProps } from "@/types/appPage/widget";
import { useWidgetFileBytes } from "../../utils/file-ref";
import { extractFileRef } from "../../utils/resolve-widget-kind";

/**
 * Renders xlsx/xls/csv file references as a table, via SheetJS parsing the
 * first sheet into row objects and handing them to the same ag-grid table
 * component the "table" widget kind uses — one table renderer, not two.
 */
export function SpreadsheetWidget({ output }: WidgetContentProps) {
  const { t } = useTranslation();
  const fileRef = extractFileRef(output.message);
  const { data, status } = useWidgetFileBytes(fileRef);
  const [rows, setRows] = useState<Record<string, unknown>[] | null>(null);
  const [parseError, setParseError] = useState(false);

  useEffect(() => {
    if (!data) {
      setRows(null);
      return;
    }
    let cancelled = false;
    import("xlsx")
      .then((XLSX) => {
        const workbook = XLSX.read(new Uint8Array(data), { type: "array" });
        const firstSheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[firstSheetName];
        return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
      })
      .then((parsedRows) => {
        if (!cancelled) setRows(parsedRows);
      })
      .catch(() => {
        if (!cancelled) setParseError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [data]);

  if (
    status === "loading" ||
    status === "idle" ||
    (status === "ready" && !rows && !parseError)
  ) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loading />
      </div>
    );
  }
  if (status === "error" || parseError || !rows) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {t("app.widgets.spreadsheetUnavailable")}
      </div>
    );
  }

  return <DataOutputComponent rows={rows} pagination columnMode="union" />;
}

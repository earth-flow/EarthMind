import type { ComponentType } from "react";
import type { WidgetContentProps, WidgetKind } from "@/types/appPage/widget";
import { DocxWidget } from "../components/widgets/docx-widget";
import { ErrorWidget } from "../components/widgets/error-widget";
import { FileWidget } from "../components/widgets/file-widget";
import { ImageWidget } from "../components/widgets/image-widget";
import { JsonWidget } from "../components/widgets/json-widget";
import { MapWidget } from "../components/widgets/map-widget";
import { PdfWidget } from "../components/widgets/pdf-widget";
import { SpreadsheetWidget } from "../components/widgets/spreadsheet-widget";
import { TableWidget } from "../components/widgets/table-widget";
import { TextWidget } from "../components/widgets/text-widget";

/** Maps a resolved widget kind to the component that renders it. The single seam new preview types plug into. */
export const WIDGET_REGISTRY: Partial<
  Record<WidgetKind, ComponentType<WidgetContentProps>>
> = {
  image: ImageWidget,
  pdf: PdfWidget,
  docx: DocxWidget,
  xlsx: SpreadsheetWidget,
  geojson: MapWidget,
  json: JsonWidget,
  table: TableWidget,
  text: TextWidget,
  file: FileWidget,
  error: ErrorWidget,
};

import type { ModelOption } from "@/components/core/parameterRenderComponent/components/modelInputComponent";

export interface KnowledgeBaseUploadModalProps {
  open?: boolean;
  setOpen?: (open: boolean) => void;
  onSubmit?: (data: KnowledgeBaseFormData) => void;
  existingKnowledgeBase?: {
    name: string;
    embeddingProvider?: string;
    embeddingModel?: string;
    chunkSize?: number;
    chunkOverlap?: number;
    separator?: string;
    parserStrategy?: string;
    chunkStrategy?: string;
    ocrProvider?: string;
    columnConfig?: ColumnConfigRow[];
    backendType?: string;
    backendConfig?: Record<string, unknown>;
  };
  hideAdvanced?: boolean;
  existingKnowledgeBaseNames?: string[];
}


export interface ColumnConfigRow {
  column_name: string;
  vectorize: boolean;
  identifier: boolean;
}

export interface KnowledgeBaseFormData {
  sourceName: string;
  files: File[];
  embeddingModel: ModelOption[] | null;
  chunkSize?: number;
  chunkOverlap?: number;
  separator?: string;
  ocrProvider?: string;
  columnConfig?: ColumnConfigRow[];
  chunkCount?: number;
  backendType?: string;
  backendConfig?: Record<string, unknown>;
}

export interface ChunkPreview {
  content: string;
  index: number;
  metadata: {
    source: string;
    start: number;
    end: number;
    title?: string;
    level?: number;
    sectionPath?: string;
    parserStrategy?: string;
    chunkStrategy?: string;
  };
}

export type WizardStep = 1 | 2;

import {
  useEffect,
  type MouseEvent,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import ForwardedIconComponent from "@/components/common/genericIconComponent";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ChunkInfo } from "@/controllers/API/queries/knowledge-bases/use-get-knowledge-base-chunks";
import { isReservedKbMetadataKey } from "@/utils/kbReservedKeys";
import { cn } from "@/utils/utils";

interface ChunkCardProps {
  chunk: ChunkInfo;
  index: number;
  onCopy: (content: string) => void;
  isSelected?: boolean;
  onSelect?: () => void;
}

interface ParsedChunkMetadata {
  fileName: string | null;
  sectionPath: string | null;
  userTags: Array<{ key: string; value: string }>;
}

const formatTagValue = (value: unknown): string => {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry)).join(", ");
  }
  if (value === null || value === undefined) return "";
  return String(value);
};

const parseChunkMetadata = (
  metadata: Record<string, unknown> | null,
): ParsedChunkMetadata => {
  const empty: ParsedChunkMetadata = {
    fileName: null,
    sectionPath: null,
    userTags: [],
  };
  if (!metadata) return empty;

  const fileName =
    typeof metadata.file_name === "string" ? metadata.file_name : null;
  const sectionPath =
    typeof metadata.section_path === "string" && metadata.section_path.length > 0
      ? metadata.section_path
      : null;

  const raw = metadata.source_metadata;
  let parsed: Record<string, unknown> | null = null;
  if (typeof raw === "string" && raw.length > 0) {
    try {
      const decoded = JSON.parse(raw);
      if (decoded && typeof decoded === "object" && !Array.isArray(decoded)) {
        parsed = decoded as Record<string, unknown>;
      }
    } catch {
      parsed = null;
    }
  } else if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    parsed = raw as Record<string, unknown>;
  }

  if (!parsed) return { fileName, sectionPath, userTags: [] };

  const userTags = Object.entries(parsed)
    .filter(([key]) => !isReservedKbMetadataKey(key))
    .map(([key, value]) => ({ key, value: formatTagValue(value) }))
    .filter((entry) => entry.value !== "");

  return { fileName, sectionPath, userTags };
};

const ChunkCard = ({
  chunk,
  index,
  onCopy,
  isSelected = false,
  onSelect,
}: ChunkCardProps) => {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const contentRef = useRef<HTMLParagraphElement>(null);

  const { fileName, sectionPath, userTags } = useMemo(
    () => parseChunkMetadata(chunk.metadata),
    [chunk.metadata],
  );

  useEffect(() => {
    const el = contentRef.current;
    if (el) {
      setIsOverflowing(el.scrollHeight > el.clientHeight);
    }
  }, [chunk.content]);

  const handleCopy = (e: MouseEvent) => {
    e.stopPropagation();
    onCopy(chunk.content);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleCardClick = () => {
    onSelect?.();
    if (isOverflowing) {
      setIsExpanded((current) => !current);
    }
  };

  return (
    <div
      className={cn(
        "rounded-lg border p-3 transition-all duration-200",
        isSelected
          ? "border-primary/50 bg-background shadow-[0_0_0_1px_rgba(59,130,246,0.18)]"
          : "border-muted bg-muted",
        isOverflowing && "cursor-pointer",
      )}
      onClick={handleCardClick}
    >
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium">
            {t("knowledge.chunkLabel", { index })}
          </span>
          <Badge
            variant="secondary"
            size="sq"
            className="text-xs text-muted-foreground"
          >
            {chunk.char_count} {t("knowledge.charsSuffix")}
          </Badge>
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "group h-6 w-6 transition-colors",
              isCopied && "text-accent-emerald-foreground",
            )}
            onClick={handleCopy}
          >
            <ForwardedIconComponent
              name={isCopied ? "Check" : "Copy"}
              className={cn(
                "h-3.5 w-3.5 transition-colors",
                isCopied
                  ? "text-accent-emerald-foreground"
                  : "text-muted-foreground group-hover:text-foreground",
              )}
            />
          </Button>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-4">
            {isOverflowing && (
              <ForwardedIconComponent
                name={isExpanded ? "ChevronUp" : "ChevronDown"}
                className="h-4 w-4 text-muted-foreground transition-transform duration-200"
              />
            )}
          </div>
        </div>
      </div>
      {fileName && (
        <div
          className="mb-1.5 flex items-center gap-1 text-xs text-muted-foreground"
          data-testid="chunk-card-file-name"
        >
          <ForwardedIconComponent name="File" className="h-3 w-3" />
          <span className="truncate">{fileName}</span>
        </div>
      )}
      {sectionPath && (
        <div className="mb-2 text-xs text-muted-foreground/90">
          {sectionPath}
        </div>
      )}
      <p
        ref={contentRef}
        className={cn(
          "text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap break-words",
          !isExpanded && "line-clamp-2",
        )}
      >
        {chunk.content}
      </p>
      {userTags.length > 0 && (
        <div
          className="mt-2 flex flex-wrap gap-1"
          data-testid="chunk-card-metadata-tags"
        >
          {userTags.map(({ key, value }) => (
            <span
              key={`${key}=${value}`}
              className="inline-flex items-center gap-1 rounded-full bg-background px-2 py-0.5 text-[11px]"
              data-testid={`chunk-card-metadata-tag-${key}`}
            >
              <span className="font-medium text-muted-foreground">{key}:</span>
              <span className="text-foreground">{value}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

export default ChunkCard;

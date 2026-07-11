import type { ChunkPreview } from "../types";

export function ChunkPreviewCard({
  chunk,
  index,
}: {
  chunk: ChunkPreview;
  index: number;
}) {
  return (
    <div className="flex flex-col rounded-lg border bg-muted/30 p-3 h-full">
      <div className="mb-2 flex items-center justify-between shrink-0 gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            Chunk {index + 1}
          </span>
          {typeof chunk.metadata.level === "number" && chunk.metadata.level > 0 && (
            <span className="rounded-full bg-background px-2 py-0.5 text-[11px] text-muted-foreground">
              H{chunk.metadata.level}
            </span>
          )}
        </div>
        {chunk.metadata.parserStrategy && (
          <span className="text-[11px] text-muted-foreground">
            {chunk.metadata.parserStrategy} / {chunk.metadata.chunkStrategy}
          </span>
        )}
      </div>
      {(chunk.metadata.title || chunk.metadata.sectionPath) && (
        <div className="mb-2 rounded bg-background/70 px-2 py-1 text-[11px] text-muted-foreground">
          {chunk.metadata.title ? <div className="font-medium text-foreground">{chunk.metadata.title}</div> : null}
          {chunk.metadata.sectionPath ? <div>{chunk.metadata.sectionPath}</div> : null}
        </div>
      )}
      <div className="overflow-y-auto rounded bg-background p-2 text-xs font-mono flex-1 min-h-0 whitespace-pre-wrap break-words">
        {chunk.content}
      </div>
    </div>
  );
}

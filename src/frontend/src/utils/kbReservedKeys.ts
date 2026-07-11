// Mirrors `KB_METADATA_RESERVED_KEYS` in
// `src/backend/base/earthmind/utils/kb_constants.py`. Keep both lists in sync —
// this set is used to hide ingestion-internal keys when rendering chunk
// metadata in the UI so that user-facing chips only show user-supplied tags.
export const KB_METADATA_RESERVED_KEYS = new Set<string>([
  "source",
  "file_name",
  "chunk_index",
  "total_chunks",
  "ingested_at",
  "job_id",
  "source_type",
  "source_metadata",
  "heading_title",
  "heading_level",
  "section_path",
  "parser_strategy",
  "chunk_strategy",
  "source_format",
]);

export const isReservedKbMetadataKey = (key: string): boolean =>
  KB_METADATA_RESERVED_KEYS.has(key);

import type { UseQueryResult } from "@tanstack/react-query";
import type { useQueryFunctionType } from "@/types/api";
import { api } from "../../api";
import { getURL } from "../../helpers/constants";
import { UseRequestProcessor } from "../../services/request-processor";

export interface KnowledgeGraphNode {
  id: string;
  label: string;
  type: string;
  weight: number;
  chunk_ids: string[];
  metadata: Record<string, unknown>;
}

export interface KnowledgeGraphEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  label: string;
  weight: number;
  chunk_ids: string[];
  metadata: Record<string, unknown>;
}

export interface KnowledgeGraphResponse {
  nodes: KnowledgeGraphNode[];
  edges: KnowledgeGraphEdge[];
  matched_chunks: number;
  included_chunks: number;
  total_files: number;
  total_entities: number;
  total_relations: number;
  total_topics: number;
  total_tags: number;
  truncated: boolean;
}

export interface GetKnowledgeBaseGraphParams {
  kb_name: string;
  full_graph?: boolean;
  quality_mode?: "standard" | "high";
  graph_mode?: "generic_entity" | "default";
  search?: string;
  source_type?: string;
  file_name?: string;
  job_id?: string;
  sample_limit?: number;
  max_nodes?: number;
  max_edges?: number;
  chunk_ids?: string[];
  metadata_filter?: Record<string, string[]>;
}

export const buildKnowledgeGraphQueryKey = (
  params: GetKnowledgeBaseGraphParams,
) => [
  "useGetKnowledgeBaseGraph",
  params?.kb_name,
  params?.full_graph ?? false,
  params?.quality_mode ?? "high",
  params?.graph_mode ?? "default",
  params?.search,
  params?.source_type,
  params?.file_name,
  params?.job_id,
  params?.sample_limit,
  params?.max_nodes,
  params?.max_edges,
  params?.chunk_ids,
  params?.metadata_filter,
] as const;

export const useGetKnowledgeBaseGraph: useQueryFunctionType<
  GetKnowledgeBaseGraphParams,
  KnowledgeGraphResponse
> = (params, options?) => {
  const { query } = UseRequestProcessor();

  const getGraphFn = async (): Promise<KnowledgeGraphResponse> => {
    const queryParams = new URLSearchParams();
    if (params?.full_graph) {
      queryParams.append("full_graph", "true");
    }
    if (params?.quality_mode) {
      queryParams.append("quality_mode", params.quality_mode);
    }
    if (params?.graph_mode) {
      queryParams.append("graph_mode", params.graph_mode);
    }
    if (params?.search) {
      queryParams.append("search", params.search);
    }
    if (params?.source_type) {
      queryParams.append("source_type", params.source_type);
    }
    if (params?.file_name) {
      queryParams.append("file_name", params.file_name);
    }
    if (params?.job_id) {
      queryParams.append("job_id", params.job_id);
    }
    if (params?.sample_limit) {
      queryParams.append("sample_limit", params.sample_limit.toString());
    }
    if (params?.max_nodes) {
      queryParams.append("max_nodes", params.max_nodes.toString());
    }
    if (params?.max_edges) {
      queryParams.append("max_edges", params.max_edges.toString());
    }
    for (const chunkId of params?.chunk_ids ?? []) {
      queryParams.append("chunk_id", chunkId);
    }
    if (params?.metadata_filter) {
      for (const [key, values] of Object.entries(params.metadata_filter)) {
        for (const value of values) {
          queryParams.append(`meta_${key}`, value);
        }
      }
    }

    const url = `${getURL("KNOWLEDGE_BASES")}/${params?.kb_name}/graph${
      queryParams.toString() ? `?${queryParams.toString()}` : ""
    }`;
    const res = await api.get<KnowledgeGraphResponse>(url);
    return res.data;
  };

  const queryResult: UseQueryResult<KnowledgeGraphResponse, Error> = query(
    buildKnowledgeGraphQueryKey(params),
    getGraphFn,
    {
      enabled: !!params?.kb_name,
      retry: (failureCount, error: unknown) => {
        const status = (error as { response?: { status?: unknown } })?.response
          ?.status;
        if (typeof status === "number") {
          return status >= 500 && failureCount < 3;
        }
        return failureCount < 3;
      },
      refetchOnWindowFocus: false,
      ...options,
    },
  );

  return queryResult;
};

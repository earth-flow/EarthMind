import type { UseMutationResult } from "@tanstack/react-query";
import type { useMutationFunctionType } from "@/types/api";
import { api } from "../../api";
import { getURL } from "../../helpers/constants";
import { UseRequestProcessor } from "../../services/request-processor";
import type { KnowledgeGraphResponse } from "./use-get-knowledge-base-graph";

export interface RefreshKnowledgeBaseGraphParams {
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

export const useRefreshKnowledgeBaseGraphCache: useMutationFunctionType<
  undefined,
  RefreshKnowledgeBaseGraphParams,
  KnowledgeGraphResponse
> = (options?) => {
  const { mutate } = UseRequestProcessor();

  const refreshGraphFn = async (
    params: RefreshKnowledgeBaseGraphParams,
  ): Promise<KnowledgeGraphResponse> => {
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

    const url = `${getURL("KNOWLEDGE_BASES")}/${params.kb_name}/graph/refresh${
      queryParams.toString() ? `?${queryParams.toString()}` : ""
    }`;
    const res = await api.post<KnowledgeGraphResponse>(url);
    return res.data;
  };

  const mutation: UseMutationResult<
    KnowledgeGraphResponse,
    Error,
    RefreshKnowledgeBaseGraphParams
  > = mutate(["useRefreshKnowledgeBaseGraphCache"], refreshGraphFn, {
    ...options,
  });

  return mutation;
};

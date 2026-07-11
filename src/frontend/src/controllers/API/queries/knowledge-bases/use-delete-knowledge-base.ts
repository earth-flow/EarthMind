import type { UseMutationResult } from "@tanstack/react-query";
import type { useMutationFunctionType } from "@/types/api";
import { api } from "../../api";
import { getURL } from "../../helpers/constants";
import { UseRequestProcessor } from "../../services/request-processor";

interface DeleteKnowledgeBaseParams {
  /** Single KB name or array of KB names for bulk delete */
  kb_names: string | string[];
}

interface DeleteKnowledgeBaseResponse {
  deleted_count?: number;
  message?: string;
}

export const useDeleteKnowledgeBase: useMutationFunctionType<
  undefined,
  DeleteKnowledgeBaseParams,
  DeleteKnowledgeBaseResponse
> = (options?) => {
  const { mutate, queryClient } = UseRequestProcessor();

  const deleteKnowledgeBaseFn = async (
    params: DeleteKnowledgeBaseParams,
  ): Promise<DeleteKnowledgeBaseResponse> => {
    const names = Array.isArray(params.kb_names)
      ? params.kb_names
      : [params.kb_names];

    // Use bulk endpoint for all deletes (works for single or multiple)
    const response = await api.delete<DeleteKnowledgeBaseResponse>(
      `${getURL("KNOWLEDGE_BASES")}/`,
      {
        data: { kb_names: names },
      },
    );
    return response.data;
  };

  const mutation: UseMutationResult<
    DeleteKnowledgeBaseResponse,
    Error,
    DeleteKnowledgeBaseParams
  > = mutate(["useDeleteKnowledgeBase"], deleteKnowledgeBaseFn, {
    onMutate: async (variables) => {
      const names = new Set(
        Array.isArray(variables.kb_names)
          ? variables.kb_names
          : [variables.kb_names],
      );

      await queryClient.cancelQueries({
        queryKey: ["useGetKnowledgeBases"],
      });

      const previousKnowledgeBases = queryClient.getQueryData<
        KnowledgeBaseInfo[]
      >(["useGetKnowledgeBases"]);

      queryClient.setQueryData<KnowledgeBaseInfo[]>(
        ["useGetKnowledgeBases"],
        (old) =>
          old?.filter((knowledgeBase) => !names.has(knowledgeBase.dir_name)),
      );

      const defaultContext = { previousKnowledgeBases };
      const userContext = await options?.onMutate?.(variables);

      return {
        ...defaultContext,
        ...(userContext && typeof userContext === "object" ? userContext : {}),
      };
    },
    onError: (error, variables, context, ...rest) => {
      if (context?.previousKnowledgeBases) {
        queryClient.setQueryData(
          ["useGetKnowledgeBases"],
          context.previousKnowledgeBases,
        );
      }
      options?.onError?.(error, variables, context, ...rest);
    },
    onSettled: (data, error, variables, context, ...rest) => {
      queryClient.invalidateQueries({
        queryKey: ["useGetKnowledgeBases"],
      });
      options?.onSettled?.(data, error, variables, context, ...rest);
    },
    ...options,
  });

  return mutation;
};

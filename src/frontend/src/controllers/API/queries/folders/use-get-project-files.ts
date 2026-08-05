import { keepPreviousData } from "@tanstack/react-query";
import type { useQueryFunctionType } from "../../../../types/api";
import { api } from "../../api";
import { getURL } from "../../helpers/constants";
import { UseRequestProcessor } from "../../services/request-processor";

export type ProjectFileEntry = {
  flow_id: string;
  flow_name: string;
  file_name: string;
};

export type ProjectFilesResponse = {
  files: ProjectFileEntry[];
};

interface IGetProjectFiles {
  projectId: string;
}

/**
 * Lists v1 flow-scoped files (chat attachments, run outputs) across every
 * flow in a project. v1 file storage has no project-level grouping itself
 * (`storage_service.list_files` is per-flow only), so the backend aggregates
 * across the project's flows -- see `GET /projects/{project_id}/files`.
 */
export const useGetProjectFiles: useQueryFunctionType<
  IGetProjectFiles,
  ProjectFilesResponse
> = (params, config) => {
  const { query } = UseRequestProcessor();

  const getProjectFilesFn = async () => {
    const { data } = await api.get<ProjectFilesResponse>(
      `${getURL("PROJECTS")}/${params.projectId}/files`,
    );
    return data ?? { files: [] };
  };

  const queryResult = query(
    ["useGetProjectFiles", params.projectId],
    getProjectFilesFn,
    {
      placeholderData: keepPreviousData,
      enabled: !!params.projectId,
      ...config,
    },
  );

  return queryResult;
};

import { keepPreviousData } from "@tanstack/react-query";
import { getFetchCredentials } from "@/customization/utils/get-fetch-credentials";
import type {
  useMutationFunctionType,
  useQueryFunctionType,
} from "../../../../types/api";
import { api } from "../../api";
import { getURL } from "../../helpers/constants";
import { UseRequestProcessor } from "../../services/request-processor";

export type SandboxFileEntry = {
  path: string;
  name: string;
  size: number;
  modified_at: number;
};

export type SandboxFilesResponse = {
  files: SandboxFileEntry[];
};

/**
 * Lists files in the shared FileSystemTool sandbox -- the on-disk location
 * FileSystemTool/WordDocumentTool/CommandExecutionTool write to, which
 * previously had no browsing UI at all (see `api/v1/sandbox_files.py`).
 */
export const useGetSandboxFiles: useQueryFunctionType<
  undefined,
  SandboxFilesResponse
> = (config) => {
  const { query } = UseRequestProcessor();

  const getSandboxFilesFn = async () => {
    const response = await api.get<SandboxFilesResponse>(
      `${getURL("SANDBOX_FILES")}/`,
    );
    return response["data"] ?? { files: [] };
  };

  const queryResult = query(["useGetSandboxFiles"], getSandboxFilesFn, {
    placeholderData: keepPreviousData,
    ...config,
  });

  return queryResult;
};

interface DownloadSandboxFileParams {
  path: string;
  name: string;
}

/**
 * Downloads a single sandbox file. Uses `fetch` (not axios) -- axios
 * converts blob data to a string, which corrupts binary files like the
 * .docx output this feature exists to make reachable in the first place.
 * Mirrors `useGetDownloadFileMutation` (v1 files) / `useGetDownloadFileV2`.
 */
export const useGetDownloadSandboxFile: useMutationFunctionType<
  DownloadSandboxFileParams,
  void
> = (params, options) => {
  const { mutate } = UseRequestProcessor();

  const downloadFn = async () => {
    if (!params) return;
    const response = await fetch(
      `${getURL("SANDBOX_FILES")}/download?path=${encodeURIComponent(params.path)}`,
      {
        headers: { Accept: "*/*" },
        credentials: getFetchCredentials(),
      },
    );
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", params.name);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);
  };

  const queryResult = mutate(
    ["useGetDownloadSandboxFile", params.path],
    downloadFn,
    options,
  );

  return queryResult;
};

import { useEffect, useState } from "react";
import { getURL } from "@/controllers/API/helpers/constants";
import { getFetchCredentials } from "@/customization/utils/get-fetch-credentials";

/**
 * EarthMind has two independent file storage systems, discovered while
 * building this widget layer:
 *  - "v1" flow-scoped files (Message.files / Image), served at
 *    `files/download|images/{flow_id}/{file_name}` — used by native
 *    chat/file components.
 *  - "v2" user-scoped files (file_id UUID), served at
 *    `/api/v2/files/{file_id}` — used by SaveToFileComponent and by the
 *    Terrabox file bridge (see GeneratedFileRef / bridge_generated_files).
 * Widgets need to render either kind identically, so every widget goes
 * through this one abstraction rather than hard-coding a URL scheme.
 */
export type ResolvedFileRef =
  | { source: "v1"; path: string; name: string }
  | { source: "v2"; fileId: string; name: string };

export function getFileRefUrl(
  ref: ResolvedFileRef,
  opts: { image?: boolean } = {},
): string {
  if (ref.source === "v2") {
    return getURL("FILE_MANAGEMENT", { id: ref.fileId }, true);
  }
  const encodedPath = ref.path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `${getURL("FILES")}/${opts.image ? "images" : "download"}/${encodedPath}`;
}

type FetchStatus = "idle" | "loading" | "ready" | "error";

/**
 * Fetches a file reference's raw bytes with credentialed fetch() rather than
 * axios, mirroring use-download-files.ts / useGetDownloadFileV2 — axios
 * converts blob data to string internally, which corrupts binary content
 * (the exact bug those hooks were written to avoid).
 */
export function useWidgetFileBytes(ref: ResolvedFileRef | null): {
  data: ArrayBuffer | null;
  status: FetchStatus;
} {
  const [data, setData] = useState<ArrayBuffer | null>(null);
  const [status, setStatus] = useState<FetchStatus>("idle");

  useEffect(() => {
    if (!ref) {
      setData(null);
      setStatus("idle");
      return;
    }

    let cancelled = false;
    setStatus("loading");
    setData(null);

    fetch(getFileRefUrl(ref), {
      headers: { Accept: "*/*" },
      credentials: getFetchCredentials(),
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Failed to fetch file (${response.status})`);
        }
        return response.arrayBuffer();
      })
      .then((buffer) => {
        if (!cancelled) {
          setData(buffer);
          setStatus("ready");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setStatus("error");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [ref?.source, ref?.source === "v2" ? ref.fileId : ref?.path]);

  return { data, status };
}

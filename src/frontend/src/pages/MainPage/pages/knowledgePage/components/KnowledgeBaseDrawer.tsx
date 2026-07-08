import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import ForwardedIconComponent from "@/components/common/genericIconComponent";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { buildKnowledgeGraphQueryKey } from "@/controllers/API/queries/knowledge-bases/use-get-knowledge-base-graph";
import type { KnowledgeBaseInfo } from "@/controllers/API/queries/knowledge-bases/use-get-knowledge-bases";
import { useRefreshKnowledgeBaseGraphCache } from "@/controllers/API/queries/knowledge-bases/use-refresh-knowledge-base-graph-cache";
import useAlertStore from "@/stores/alertStore";
import {
  getKnowledgeBaseBackendLabel,
  getKnowledgeBaseBackendTarget,
} from "../utils/backendMetadata";
import IngestionRunsSection from "./IngestionRunsSection";
import KnowledgeGraphPanel from "./KnowledgeGraphPanel";

interface KnowledgeBaseDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  knowledgeBase: KnowledgeBaseInfo | null;
}

const KnowledgeBaseDrawer = ({
  isOpen,
  onClose,
  knowledgeBase,
}: KnowledgeBaseDrawerProps) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const refreshGraphCache = useRefreshKnowledgeBaseGraphCache();
  const { setSuccessData, setErrorData } = useAlertStore((state) => ({
    setSuccessData: state.setSuccessData,
    setErrorData: state.setErrorData,
  }));
  if (!isOpen || !knowledgeBase) {
    return null;
  }

  const backendLabel = getKnowledgeBaseBackendLabel(
    knowledgeBase.backend_type,
    knowledgeBase.backend_config as Record<string, unknown> | undefined,
  );
  const backendTarget = getKnowledgeBaseBackendTarget(knowledgeBase);

  const handleRefreshGraphCache = async () => {
    if (!knowledgeBase) return;
    const graphParams = {
      kb_name: knowledgeBase.dir_name,
      quality_mode: "standard" as const,
      sample_limit: 80,
    };
    try {
      const response = await refreshGraphCache.mutateAsync(graphParams);
      queryClient.setQueryData(
        buildKnowledgeGraphQueryKey(graphParams),
        response,
      );
      await queryClient.invalidateQueries({
        queryKey: ["useGetKnowledgeBaseGraph", knowledgeBase.dir_name],
      });
      setSuccessData({
        title: t("knowledge.graphRefreshSuccess", {
          defaultValue: "Knowledge graph cache rebuilt.",
        }),
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : t("knowledge.failedToLoadGraph", {
              defaultValue: "Failed to load the knowledge graph.",
            });
      setErrorData({
        title: t("knowledge.graphRefreshFailed", {
          defaultValue: "Failed to rebuild knowledge graph cache.",
        }),
        list: [message],
      });
    }
  };

  return (
    <div className="flex h-full w-80 flex-col border-l bg-background">
      <div className="flex items-center justify-between pt-4 px-4">
        <h3 className="font-semibold">{knowledgeBase.name}</h3>
        <Button variant="ghost" size="iconSm" onClick={onClose}>
          <ForwardedIconComponent name="X" className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto pt-3">
        <div className="flex flex-col gap-4">
          <div className="px-4">
            <div className="text-sm text-muted-foreground">
              {t("knowledge.noDescription")}
            </div>
          </div>

          <Separator />

          <div className="space-y-2 px-4">
            <label className="text-sm font-medium">
              {t("knowledge.embeddingProviderLabel")}
            </label>
            <div className="text-sm font-medium text-muted-foreground">
              {knowledgeBase.embedding_provider || t("knowledge.unknown")}
            </div>
          </div>

          <div className="space-y-2 px-4">
            <label className="text-sm font-medium">
              {t("knowledge.embeddingModelLabel")}
            </label>
            <div className="text-sm font-medium text-muted-foreground">
              {knowledgeBase.embedding_model || t("knowledge.unknown")}
            </div>
          </div>

          <div className="space-y-2 px-4">
            <label className="text-sm font-medium">
              {t("knowledge.vectorStoreLabel")}
            </label>
            <div className="text-sm font-medium text-muted-foreground">
              {backendLabel}
            </div>
          </div>

          {backendTarget && (
            <div className="space-y-2 px-4">
              <label className="text-sm font-medium">
                {t("knowledge.targetLabel")}
              </label>
              <div className="text-sm font-medium text-muted-foreground">
                {backendTarget}
              </div>
            </div>
          )}

          <div className="space-y-2 px-4">
            <label className="text-sm font-medium">
              {t("knowledge.statusLabel")}
            </label>
            <div className="text-sm font-medium text-muted-foreground">
              {knowledgeBase.status || t("knowledge.unknown")}
            </div>
          </div>

          <div className="space-y-2 px-4">
            <label className="text-sm font-medium">
              {t("knowledge.parserStrategyLabel")}
            </label>
            <div className="text-sm font-medium text-muted-foreground">
              {t(
                `knowledge.parserStrategyValue.${knowledgeBase.parser_strategy || "auto"}`,
              )}
            </div>
          </div>

          <div className="space-y-2 px-4">
            <label className="text-sm font-medium">
              {t("knowledge.chunkStrategyLabel")}
            </label>
            <div className="text-sm font-medium text-muted-foreground">
              {t(
                `knowledge.chunkStrategyValue.${knowledgeBase.chunk_strategy || "auto"}`,
              )}
            </div>
          </div>

          <Separator />

          <IngestionRunsSection kbName={knowledgeBase.dir_name} />

          <div className="space-y-3 px-4 pb-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium">
                {t("knowledge.graphTitle", { defaultValue: "Knowledge Graph" })}
              </h4>
              <Button
                variant="outline"
                size="xs"
                loading={refreshGraphCache.isPending}
                className="rounded-full border-border bg-background text-muted-foreground hover:bg-muted"
                onClick={handleRefreshGraphCache}
              >
                {!refreshGraphCache.isPending && (
                  <ForwardedIconComponent
                    name="RefreshCcw"
                    className="h-3.5 w-3.5"
                  />
                )}
                {t("knowledge.graphRefreshButton", {
                  defaultValue: "Rebuild Graph",
                })}
              </Button>
            </div>

            <div className="aspect-square w-full">
              <KnowledgeGraphPanel
                kbName={knowledgeBase.dir_name}
                sampleLimit={80}
                compact
                fitProfile="drawer"
                hideHeader
                hideLegend
                autoRefreshOnMount={false}
                className="h-full w-full"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default KnowledgeBaseDrawer;

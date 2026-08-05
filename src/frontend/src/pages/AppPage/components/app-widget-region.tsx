import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import ForwardedIconComponent from "@/components/common/genericIconComponent";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import useFlowsManagerStore from "@/stores/flowsManagerStore";
import useFlowStore from "@/stores/flowStore";
import { useFolderStore } from "@/stores/foldersStore";
import { useMessagesStore } from "@/stores/messagesStore";
import type {
  OpenedFileWidgetLayoutItem,
  ProjectFilesWidgetLayoutItem,
  ResolvedFileRef,
} from "@/types/appPage/widget";
import { deriveDefaultWidgetLayout } from "../utils/derive-widget-layout";
import { KIND_ICON } from "./widget-card";
import { resolveItemWidgetKind, WidgetHost } from "./widget-host";

function openedFileRefId(ref: ResolvedFileRef): string {
  const key = ref.source === "v2" ? ref.fileId : ref.path;
  return `opened:${ref.source}:${key}`;
}

const PROJECT_FILES_TAB_ID = "project_files" as const;

type AppWidgetRegionProps = {
  isChatOpen: boolean;
  onShowChat: () => void;
};

/**
 * Host region for the App page's visual widgets.
 *
 * The widget layout is auto-derived from the flow's current shape and run
 * data (see deriveDefaultWidgetLayout) rather than persisted -- persistence
 * and a manual widget picker are M4 scope. With no eligible outputs yet
 * (fresh/never-run flow), this falls back to the original M1 empty state.
 *
 * Widgets render as tabs -- one full-height pane at a time, selected by the
 * user -- rather than a grid of small cards: a generated Word doc, map, or
 * spreadsheet needs real screen space to be usable, and a grid of every
 * output at once doesn't give any single one of them that.
 */
export function AppWidgetRegion({
  isChatOpen,
  onShowChat,
}: AppWidgetRegionProps): JSX.Element {
  const { t } = useTranslation();
  const nodes = useFlowStore((state) => state.nodes);
  const flowPool = useFlowStore((state) => state.flowPool);
  const currentFlowId = useFlowsManagerStore((state) => state.currentFlowId);
  const currentFlow = useFlowsManagerStore((state) => state.currentFlow);
  const myCollectionId = useFolderStore((state) => state.myCollectionId);
  const messages = useMessagesStore((state) => state.messages);

  const flowMessages = useMemo(
    () => messages.filter((message) => message.flow_id === currentFlowId),
    [messages, currentFlowId],
  );

  const derivedLayout = useMemo(
    () => deriveDefaultWidgetLayout(nodes, flowPool, flowMessages),
    [nodes, flowPool, flowMessages],
  );

  // Tabs opened by double-clicking a file in the Project Files tree (see
  // FileTree.tsx). Unlike derivedLayout, these are never re-derived from
  // flow shape/run data -- they're purely user-initiated and stay open
  // until explicitly closed.
  const [openedFiles, setOpenedFiles] = useState<OpenedFileWidgetLayoutItem[]>(
    [],
  );

  // Tabs the user has explicitly closed. The derived layout is never
  // persisted/manually placed (see file doc comment), so "closing" a tab
  // is a view-only dismissal, not a mutation of the derived layout -- if
  // the same id disappears from a later re-derive (e.g. its node was
  // deleted), it's dropped from this set too rather than staying closed
  // forever for an id that no longer means anything. openedFiles items are
  // included in "live" here too, even though they're never re-derived --
  // otherwise a closed opened-file tab would immediately un-close itself on
  // the next derivedLayout change, since it's absent from derivedLayout by
  // definition.
  const [closedIds, setClosedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    setClosedIds((prev) => {
      if (prev.size === 0) return prev;
      const liveIds = new Set([
        ...derivedLayout.map((item) => item.id),
        ...openedFiles.map((item) => item.id),
      ]);
      const next = new Set(Array.from(prev).filter((id) => liveIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [derivedLayout, openedFiles]);

  // Project-wide files: unlike every other widget kind, this one is not
  // derived from flow shape/run data, isn't subject to closedIds filtering,
  // and is always the first tab -- it's the same content regardless of which
  // flow in the project you're viewing (see components/common/projectFilesTab).
  const projectId = currentFlow?.folder_id ?? myCollectionId;
  const projectFilesItem: ProjectFilesWidgetLayoutItem | undefined = projectId
    ? {
        source: "project_files",
        id: PROJECT_FILES_TAB_ID,
        projectId,
        title: t("app.widgets.projectFilesTitle"),
      }
    : undefined;

  const layout = useMemo(() => {
    const visible = [...derivedLayout, ...openedFiles].filter(
      (item) => !closedIds.has(item.id),
    );
    return projectFilesItem ? [projectFilesItem, ...visible] : visible;
  }, [derivedLayout, openedFiles, closedIds, projectFilesItem]);

  const [activeId, setActiveId] = useState<string | undefined>(layout[0]?.id);

  // Opens (or re-focuses) a tab for a file double-clicked in the Project
  // Files tree. Reopening a previously closed file must actually show it
  // again, not stay suppressed by a stale closedIds entry.
  const openFileTab = useCallback((ref: ResolvedFileRef, title: string) => {
    const id = openedFileRefId(ref);
    setOpenedFiles((prev) =>
      prev.some((item) => item.id === id)
        ? prev
        : [
            ...prev,
            { source: "opened_file" as const, id, fileRef: ref, title },
          ],
    );
    setClosedIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setActiveId(id);
  }, []);

  // Keep the active tab stable across re-derives (e.g. a new run adding
  // another widget); only fall back to the first tab when the previously
  // selected one has actually disappeared from the layout (including by
  // having just been closed).
  useEffect(() => {
    if (activeId && layout.some((item) => item.id === activeId)) return;
    setActiveId(layout[0]?.id);
  }, [layout, activeId]);

  const handleCloseTab = (id: string, event: React.MouseEvent) => {
    // Otherwise this bubbles up to the TabsTrigger and re-selects the tab
    // being closed.
    event.stopPropagation();
    setClosedIds((prev) => new Set(prev).add(id));
  };

  return (
    <div
      className="flex h-full w-full flex-col overflow-hidden"
      data-testid="app-widget-region"
    >
      {/* Toolbar. The chat panel owns its own close control, so this is the
          only way back once it has been dismissed. */}
      <div className="flex h-12 shrink-0 items-center justify-end px-4">
        {!isChatOpen && (
          <Button
            variant="outline"
            size="md"
            onClick={onShowChat}
            data-testid="app_show_chat_button"
          >
            <ForwardedIconComponent name="MessageSquare" className="h-4 w-4" />
            {t("app.chat.show")}
          </Button>
        )}
      </div>

      {layout.length === 0 ? (
        <div className="flex flex-1 items-center justify-center p-8">
          <div className="flex max-w-sm flex-col items-center gap-2 text-center">
            <ForwardedIconComponent
              name="LayoutDashboard"
              className="h-8 w-8 text-muted-foreground"
            />
            <span className="text-sm font-medium">
              {t("app.widgets.emptyTitle")}
            </span>
            <span className="text-xs text-muted-foreground">
              {t("app.widgets.emptyDescription")}
            </span>
          </div>
        </div>
      ) : (
        <Tabs
          value={activeId}
          onValueChange={setActiveId}
          className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 pb-4"
        >
          <TabsList className="h-auto w-full shrink-0 justify-start gap-1 overflow-x-auto">
            {layout.map((item) => {
              // The project-files tab is permanent -- see file doc comment --
              // so it gets no close control, unlike every other widget tab.
              const isClosable = item.source !== "project_files";
              return (
                // TabsTrigger renders a native <button>, so the close control
                // has to be a sibling rather than nested inside it -- a
                // <button> can't validly contain another interactive element.
                <div key={item.id} className="group relative flex items-center">
                  <TabsTrigger
                    value={item.id}
                    className={isClosable ? "gap-1.5 pr-6" : "gap-1.5"}
                    data-testid={`app-widget-tab-${item.id}`}
                  >
                    <ForwardedIconComponent
                      name={KIND_ICON[resolveItemWidgetKind(item, flowPool)]}
                      className="h-3.5 w-3.5 shrink-0"
                    />
                    <span className="max-w-[12rem] truncate" title={item.title}>
                      {item.title}
                    </span>
                  </TabsTrigger>
                  {isClosable && (
                    <button
                      type="button"
                      onClick={(event) => handleCloseTab(item.id, event)}
                      aria-label={t("app.widgets.closeTab")}
                      data-testid={`app-widget-tab-close-${item.id}`}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground opacity-0 hover:bg-muted hover:text-foreground group-hover:opacity-100 group-focus-within:opacity-100"
                    >
                      <ForwardedIconComponent name="X" className="h-3 w-3" />
                    </button>
                  )}
                </div>
              );
            })}
          </TabsList>
          {layout.map((item) => (
            <TabsContent
              key={item.id}
              value={item.id}
              className="mt-2 min-h-0 flex-1 overflow-hidden"
            >
              <WidgetHost item={item} onOpenFile={openFileTab} />
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  );
}

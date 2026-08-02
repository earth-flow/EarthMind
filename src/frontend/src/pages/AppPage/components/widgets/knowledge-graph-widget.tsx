import { lazy, Suspense } from "react";
import Loading from "@/components/ui/loading";

// Lazy-loaded: pulls in echarts + echarts-for-react, a heavy dependency that
// shouldn't ship to (or be resolved for) a client/test whose flow doesn't
// read from a Knowledge Base, mirroring the pdf/map/docx widgets' pattern.
const KnowledgeGraphPanel = lazy(
  () =>
    import(
      "@/pages/MainPage/pages/knowledgePage/components/KnowledgeGraphPanel"
    ),
);

/**
 * Renders the entity graph of a Knowledge Base the flow reads from, reusing
 * the same panel the Knowledge Base page uses rather than forking it. Not
 * bound to a node output -- the graph is a property of the KB itself, so
 * this is driven directly by kbName (see derive-widget-layout.ts).
 */
export function KnowledgeGraphWidget({ kbName }: { kbName: string }) {
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center">
          <Loading />
        </div>
      }
    >
      <KnowledgeGraphPanel
        kbName={kbName}
        fullGraph
        hideHeader
        className="h-full rounded-none border-0"
      />
    </Suspense>
  );
}

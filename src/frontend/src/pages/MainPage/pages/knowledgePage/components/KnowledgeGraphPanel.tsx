import { useQueryClient } from "@tanstack/react-query";
import * as echarts from "echarts";
import ReactECharts from "echarts-for-react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import ForwardedIconComponent from "@/components/common/genericIconComponent";
import { Button } from "@/components/ui/button";
import Loading from "@/components/ui/loading";
import {
  buildKnowledgeGraphQueryKey,
  type KnowledgeGraphEdge,
  type KnowledgeGraphNode,
  useGetKnowledgeBaseGraph,
} from "@/controllers/API/queries/knowledge-bases/use-get-knowledge-base-graph";
import { useRefreshKnowledgeBaseGraphCache } from "@/controllers/API/queries/knowledge-bases/use-refresh-knowledge-base-graph-cache";
import useAlertStore from "@/stores/alertStore";
import { cn } from "@/utils/utils";

const GENERIC_GRAPH_MODE = "generic_entity" as const;

interface KnowledgeGraphPanelProps {
  kbName: string;
  search?: string;
  sourceType?: string;
  fileName?: string;
  jobId?: string;
  sampleLimit?: number;
  metadataFilter?: Record<string, string[]>;
  chunkIds?: string[];
  selectedChunkId?: string | null;
  fullGraph?: boolean;
  qualityMode?: "standard" | "high";
  graphMode?: typeof GENERIC_GRAPH_MODE;
  maxNodes?: number;
  maxEdges?: number;
  hideLegend?: boolean;
  fitProfile?: KnowledgeGraphFitProfile;
  nodeSizeScale?: number;
  autoRefreshOnMount?: boolean;
  floatingNodeDetails?: boolean;
  compact?: boolean;
  hideHeader?: boolean;
  onRequestClose?: (() => void) | null;
  externalRefreshToken?: number;
  onRefreshPendingChange?: ((pending: boolean) => void) | null;
  className?: string;
}

// ── Entity type -> color mapping (matches backend _categorize_entity) ────────
// Backend assigns type: technology | method | organization | metric | dataset | event | document | other
interface CatDef {
  color: string; // main color (used for node fill + edge color)
  dark: string; // darker shade for gradient end
  glow: string; // glow shadow rgba
  label: string; // legend label
}
const TYPE_ORDER = [
  "technology",
  "method",
  "organization",
  "metric",
  "dataset",
  "event",
  "document",
  "other",
] as const;
const CATEGORY_DEFS: Record<string, CatDef> = {
  technology: {
    color: "#2f80ed",
    dark: "#1455b8",
    glow: "rgba(47,128,237,0.32)",
    label: "Technology",
  },
  method: {
    color: "#f59e0b",
    dark: "#b45309",
    glow: "rgba(245,158,11,0.32)",
    label: "Method",
  },
  organization: {
    color: "#e84a8a",
    dark: "#a81d5f",
    glow: "rgba(232,74,138,0.32)",
    label: "Organization",
  },
  metric: {
    color: "#13b981",
    dark: "#047857",
    glow: "rgba(19,185,129,0.32)",
    label: "Metric",
  },
  dataset: {
    color: "#8b5cf6",
    dark: "#5b21b6",
    glow: "rgba(139,92,246,0.32)",
    label: "Dataset",
  },
  event: {
    color: "#f97316",
    dark: "#9a3412",
    glow: "rgba(249,115,22,0.32)",
    label: "Event",
  },
  document: {
    color: "#06b6d4",
    dark: "#155e75",
    glow: "rgba(6,182,212,0.30)",
    label: "Document",
  },
  other: {
    color: "#64748b",
    dark: "#334155",
    glow: "rgba(100,116,139,0.28)",
    label: "Other",
  },
};

const GRAPH_BACKGROUND = "#F4F8FF";
const GRAPH_LINK_COLOR = "rgba(99,132,186,0.42)";
const GRAPH_LINK_SHADOW = "rgba(61,106,173,0.12)";

type KnowledgeGraphFitProfile = "drawer" | "chunks" | "default";

interface FitProfileConfig {
  viewportRatioX: number;
  viewportRatioY: number;
  minZoom: number;
  maxZoom: number;
  initialZoom: number;
  paddingX: number;
  paddingY: number;
  repulsion: number;
  edgeLength: [number, number];
  gravity: number;
}

const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v));

const toNumber = (v: unknown, fallback = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const getFitProfileConfig = (
  profile: KnowledgeGraphFitProfile,
  nodeCount: number,
): FitProfileConfig => {
  const densityBoost = clamp(Math.sqrt(Math.max(nodeCount, 1) / 48), 1, 1.85);
  if (profile === "drawer") {
    return {
      viewportRatioX: 0.58,
      viewportRatioY: 0.56,
      minZoom: 0.12,
      maxZoom: 0.78,
      initialZoom: 0.34,
      paddingX: 64,
      paddingY: 68,
      repulsion: Math.round(460 * densityBoost),
      edgeLength: [
        Math.round(118 * densityBoost),
        Math.round(292 * densityBoost),
      ],
      gravity: 0.035,
    };
  }
  if (profile === "chunks") {
    return {
      viewportRatioX: 0.72,
      viewportRatioY: 0.7,
      minZoom: 0.14,
      maxZoom: 0.92,
      initialZoom: 0.7,
      paddingX: 56,
      paddingY: 62,
      repulsion: Math.round(390 * densityBoost),
      edgeLength: [
        Math.round(108 * densityBoost),
        Math.round(268 * densityBoost),
      ],
      gravity: 0.045,
    };
  }
  return {
    viewportRatioX: 0.82,
    viewportRatioY: 0.8,
    minZoom: 0.22,
    maxZoom: 1.08,
    initialZoom: 0.58,
    paddingX: 34,
    paddingY: 46,
    repulsion: Math.round(270 * densityBoost),
    edgeLength: [Math.round(72 * densityBoost), Math.round(184 * densityBoost)],
    gravity: 0.08,
  };
};

const escapeHtml = (value: unknown) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const rgbaFromHex = (hex: string, alpha: number) => {
  const normalized = hex.replace("#", "");
  if (normalized.length !== 6) return `rgba(15,23,42,${alpha})`;
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
};

// ── Data formatting ──────────────────────────────────────────────────────────
interface EChartsNode {
  id: string;
  name: string;
  category: number;
  value: number;
  symbolSize: number;
  symbol?: string;
  itemStyle: Record<string, unknown>;
  label: Record<string, unknown>;
  emphasis?: Record<string, unknown>;
  fixed?: boolean;
  x?: number;
  y?: number;
  rawLabel: string;
  type: string;
  weight: number;
  chunkIds: string[];
  mentions: number;
  filesCount: number;
  fileLabels: string[];
  degree: number;
  importance: number;
}

interface EChartsLink {
  source: string;
  target: string;
  value: number;
  label: Record<string, unknown>;
  lineStyle: Record<string, unknown>;
  chunkIds: string[];
  relation: string;
  accentColor: string;
  glowColor: string;
  emphasis?: Record<string, unknown>;
  blur?: Record<string, unknown>;
}

interface FormattedGraph {
  nodes: EChartsNode[];
  links: EChartsLink[];
  categories: { name: string }[];
}

interface EChartsFormatterParams<TData> {
  data?: TData;
  dataType?: string;
}

type EChartsLayoutPoint = number[] | { x?: number; y?: number };

interface EChartsSeriesDataAccessor {
  getItemLayout: (index: number) => EChartsLayoutPoint | null | undefined;
}

interface EChartsGraphSeriesModel {
  getData?: () => EChartsSeriesDataAccessor | null | undefined;
}

interface EChartsGraphModel {
  getSeriesByIndex: (
    index: number,
  ) => EChartsGraphSeriesModel | null | undefined;
}

interface EChartsGraphModelAccessor {
  getModel: () => EChartsGraphModel;
}

type EChartsDispatchPayload = Parameters<
  echarts.EChartsType["dispatchAction"]
>[0];

function formatGraphData(
  nodes: KnowledgeGraphNode[],
  edges: KnowledgeGraphEdge[],
  maxNodes: number,
  maxEdges: number,
  nodeSizeScale = 1,
): FormattedGraph {
  if (!nodes || nodes.length === 0) {
    return { nodes: [], links: [], categories: [] };
  }

  // Sort all nodes by importance score (descending) - scans ALL chunks' entities
  const sortedNodes = [...nodes].sort(
    (a, b) =>
      toNumber(b.metadata?.importance_score, b.weight) -
      toNumber(a.metadata?.importance_score, a.weight),
  );

  const limitedNodes = sortedNodes.slice(0, maxNodes);
  const allowedIds = new Set(limitedNodes.map((n) => n.id));

  const candidateEdges = edges
    .filter((e) => allowedIds.has(e.source) && allowedIds.has(e.target))
    .sort(
      (a, b) =>
        b.weight * 4 +
        toNumber(b.metadata?.mentions, b.weight) -
        (a.weight * 4 + toNumber(a.metadata?.mentions, a.weight)),
    )
    .slice(0, maxEdges);

  const connectedNodes = limitedNodes;
  const connectedEdges = candidateEdges;

  const importances = connectedNodes.map((n) =>
    toNumber(n.metadata?.importance_score, n.weight),
  );
  const minImp = Math.min(...importances, 0);
  const maxImp = Math.max(...importances, 1);
  const impSpan = Math.max(maxImp - minImp, 1);

  const degreeMap = new Map<string, number>();
  connectedEdges.forEach((e) => {
    degreeMap.set(e.source, (degreeMap.get(e.source) ?? 0) + 1);
    degreeMap.set(e.target, (degreeMap.get(e.target) ?? 0) + 1);
  });

  // Build categories list from TYPE_ORDER — each category gets a solid color
  // so the legend icon color matches the actual node color.
  const categories = TYPE_ORDER.map((t) => ({
    name: CATEGORY_DEFS[t].label,
    itemStyle: { color: CATEGORY_DEFS[t].color },
  }));

  // Map backend type string -> category index
  const typeToIndex: Record<string, number> = {};
  TYPE_ORDER.forEach((t, i) => {
    typeToIndex[t] = i;
  });

  // Build a lookup: nodeId -> category color (for edge coloring)
  const nodeColorMap = new Map<string, string>();
  const defaultVisibleLabelCount = clamp(
    Math.round(Math.sqrt(connectedNodes.length) + 2),
    5,
    8,
  );
  const defaultVisibleLabelIds = new Set(
    connectedNodes
      .slice(0, defaultVisibleLabelCount)
      .map((node) => node.id),
  );

  const echartsNodes: EChartsNode[] = connectedNodes.map((node) => {
    const importance = toNumber(node.metadata?.importance_score, node.weight);
    const normalized = (importance - minImp) / impSpan;

    const entityType = node.type || "other";
    const catIdx = typeToIndex[entityType] ?? typeToIndex["other"];
    const cat = CATEGORY_DEFS[entityType] ?? CATEGORY_DEFS.other;

    const symbolSize = clamp(
      (24 + normalized * 11) * nodeSizeScale,
      24 * nodeSizeScale,
      35 * nodeSizeScale,
    );

    const mentions = toNumber(node.metadata?.mentions, node.weight);
    const filesCount = toNumber(node.metadata?.files_count, 0);
    const fileLabels = Array.isArray(node.metadata?.file_labels)
      ? node.metadata.file_labels
          .map((label) => String(label).trim())
          .filter(Boolean)
          .slice(0, 6)
      : [];
    const degree = degreeMap.get(node.id) ?? toNumber(node.metadata?.degree, 0);

    const nodeGlow = rgbaFromHex(cat.color, 0.28);
    const nodeShadow = "rgba(46,58,89,0.16)";

    // Glass bead fill: high white specular highlight with a saturated lower rim.
    const fillColor = new echarts.graphic.RadialGradient(0.32, 0.24, 1, [
      { offset: 0, color: "rgba(255,255,255,1)" },
      { offset: 0.18, color: "rgba(255,255,255,0.96)" },
      { offset: 0.58, color: rgbaFromHex(cat.color, 0.9) },
      { offset: 1, color: cat.dark },
    ]);

    nodeColorMap.set(node.id, cat.color);

    return {
      id: node.id,
      name: node.label,
      category: catIdx,
      value: importance,
      symbolSize,
      symbol: "circle",
      itemStyle: {
        color: fillColor,
        borderWidth: 1.4,
        borderColor: "rgba(255,255,255,0.98)",
        shadowBlur: 28,
        shadowColor: nodeShadow,
        shadowOffsetY: 10,
        shadowOffsetX: 0,
        opacity: 0.98,
      },
      label: {
        show: defaultVisibleLabelIds.has(node.id),
        position: "bottom",
        distance: 8,
        fontSize: 10,
        color: "#122033",
        fontWeight: 600,
        backgroundColor: "rgba(255,255,255,0.66)",
        padding: [3, 8],
        borderRadius: 999,
        borderColor: rgbaFromHex(cat.color, 0.18),
        borderWidth: 1,
        shadowBlur: 14,
        shadowColor: rgbaFromHex(cat.color, 0.12),
        shadowOffsetY: 4,
        formatter: (params: EChartsFormatterParams<EChartsNode>) => {
          const name = params.data?.rawLabel ?? params.data?.name ?? "";
          const chars = Array.from(String(name));
          return chars.length <= 9 ? name : chars.slice(0, 9).join("") + "...";
        },
      },
      emphasis: {
        itemStyle: {
          borderColor: "#ffffff",
          borderWidth: 2.4,
          shadowBlur: 42,
          shadowColor: nodeGlow,
          shadowOffsetY: 12,
          opacity: 1,
        },
        label: {
          show: true,
          color: "#0f172a",
          fontWeight: 800,
          backgroundColor: "rgba(255,255,255,0.9)",
        },
      },
      rawLabel: node.label,
      type: entityType,
      weight: node.weight,
      chunkIds: node.chunk_ids ?? [],
      mentions,
      filesCount,
      fileLabels,
      degree,
      importance,
    };
  });

  const echartsLinks: EChartsLink[] = connectedEdges.map((edge) => {
    const weight = Math.max(1, edge.weight);
    const sourceColor = nodeColorMap.get(edge.source) ?? "#94a3b8";
    const glowColor = rgbaFromHex(sourceColor, 0.34);
    return {
      source: edge.source,
      target: edge.target,
      value: weight,
      label: {
        show: false,
        formatter: edge.label || "related",
        fontSize: 10,
        color: "#334155",
        backgroundColor: "rgba(255,255,255,0.82)",
        padding: [3, 7],
        borderRadius: 6,
        borderColor: "rgba(255,255,255,0.9)",
        borderWidth: 1,
      },
      lineStyle: {
        width: clamp(0.65 + Math.log2(weight + 1) * 0.26, 0.7, 1.55),
        color: new echarts.graphic.LinearGradient(0, 0, 1, 1, [
          { offset: 0, color: rgbaFromHex(sourceColor, 0.18) },
          { offset: 0.5, color: rgbaFromHex(sourceColor, 0.42) },
          { offset: 1, color: "rgba(148,163,184,0.22)" },
        ]),
        opacity: 0.72,
        curveness: clamp(0.16 + weight * 0.013, 0.16, 0.32),
        shadowBlur: 6,
        shadowColor: GRAPH_LINK_SHADOW,
      },
      emphasis: {
        lineStyle: {
          width: clamp(1.8 + Math.log2(weight + 1) * 0.45, 2.1, 4),
          color: sourceColor,
          opacity: 0.96,
          shadowBlur: 16,
          shadowColor: glowColor,
        },
        label: {
          show: true,
          color: "#0f172a",
          fontWeight: 700,
          backgroundColor: "rgba(255,255,255,0.9)",
        },
      },
      blur: {
        lineStyle: { opacity: 0.015 },
      },
      chunkIds: edge.chunk_ids ?? [],
      relation: edge.label || "related",
      accentColor: sourceColor,
      glowColor,
    };
  });

  return {
    nodes: echartsNodes,
    links: echartsLinks,
    categories,
  };
}

// ── Build ECharts option ─────────────────────────────────────────────────────
function buildEChartsOption(
  graph: FormattedGraph,
  selectedChunkId?: string | null,
  hideLegend = false,
  fitProfile: KnowledgeGraphFitProfile = "default",
): echarts.EChartsOption {
  if (graph.nodes.length === 0) {
    return { series: [] };
  }

  const fitConfig = getFitProfileConfig(fitProfile, graph.nodes.length);
  let highlightedNodes: EChartsNode[] = graph.nodes;
  let highlightedLinks: EChartsLink[] = graph.links;

  if (selectedChunkId) {
    highlightedNodes = graph.nodes.map((node) => {
      const isHi = node.chunkIds.includes(selectedChunkId);
      const cat = CATEGORY_DEFS[node.type] ?? CATEGORY_DEFS.other;
      return {
        ...node,
        itemStyle: {
          ...node.itemStyle,
          borderWidth: isHi ? 3 : node.itemStyle.borderWidth,
          borderColor: isHi ? "#ffffff" : node.itemStyle.borderColor,
          shadowBlur: isHi ? 56 : node.itemStyle.shadowBlur,
          shadowColor: isHi ? cat.glow : node.itemStyle.shadowColor,
          shadowOffsetY: isHi ? 14 : node.itemStyle.shadowOffsetY,
        },
        label: { ...node.label, show: isHi ? true : node.label.show },
      };
    });
    highlightedLinks = graph.links.map((link) => {
      const isHi = link.chunkIds.includes(selectedChunkId);
      return {
        ...link,
        lineStyle: {
          ...link.lineStyle,
          width: isHi ? 2.8 : link.lineStyle.width,
          color: isHi ? link.accentColor : link.lineStyle.color,
          opacity: isHi ? 0.92 : link.lineStyle.opacity,
          shadowBlur: isHi ? 14 : link.lineStyle.shadowBlur,
          shadowColor: isHi ? link.glowColor : link.lineStyle.shadowColor,
        },
      };
    });
  }

  return {
    backgroundColor: GRAPH_BACKGROUND,
    graphic: [
      {
        type: "rect",
        left: 0,
        top: 0,
        shape: { width: "100%", height: "100%" },
        silent: true,
        z: -12,
        style: {
          fill: new echarts.graphic.LinearGradient(0, 0, 1, 1, [
            { offset: 0, color: "rgba(247,250,255,0.98)" },
            { offset: 0.5, color: "rgba(240,247,255,0.98)" },
            { offset: 1, color: "rgba(235,244,255,0.98)" },
          ]),
        },
      },
      {
        type: "circle",
        left: "12%",
        top: "10%",
        shape: { r: 180 },
        silent: true,
        z: -11,
        style: { fill: "rgba(59,130,246,0.06)" },
      },
      {
        type: "circle",
        right: "10%",
        bottom: "12%",
        shape: { r: 160 },
        silent: true,
        z: -11,
        style: { fill: "rgba(16,185,129,0.05)" },
      },
      {
        type: "rect",
        left: 0,
        top: 0,
        shape: { width: "100%", height: "100%" },
        silent: true,
        z: -10,
        style: {
          fill: {
            image: `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120"><path d="M0 0H120V120H0Z" fill="none"/><path d="M0 0H120M0 30H120M0 60H120M0 90H120M0 120H120M0 0V120M30 0V120M60 0V120M90 0V120M120 0V120" stroke="rgba(99,132,186,0.08)" stroke-width="1"/></svg>`)}`,
            repeat: "repeat",
          },
          opacity: 1,
        },
      },
    ],
    tooltip: {
      renderMode: "html",
      confine: true,
      appendToBody: true,
      formatter: (
        params: EChartsFormatterParams<EChartsNode | EChartsLink>,
      ) => {
        if (params.dataType === "node") {
          const node = params.data as EChartsNode;
          const cat = CATEGORY_DEFS[node.type] ?? CATEGORY_DEFS.other;
          const fileSources =
            node.fileLabels.length > 0
              ? `<div style="margin-top:8px;padding-top:8px;border-top:1px solid rgba(148,163,184,0.16)">
                  <div style="margin-bottom:4px;font-size:10px;color:#64748b">Sources</div>
                  <div style="display:flex;flex-direction:column;gap:3px">${node.fileLabels
                    .map(
                      (label) =>
                        `<div style="color:#334155;font-size:11px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(label)}</div>`,
                    )
                    .join("")}</div>
                </div>`
              : "";
          return `<div style="min-width:180px;max-width:240px;font-size:11px;line-height:1.45;color:#334155">
            <div style="display:flex;align-items:center;gap:7px;margin-bottom:6px">
              <span style="width:9px;height:9px;border-radius:999px;background:${cat.color};box-shadow:0 0 14px ${cat.glow};display:inline-block"></span>
              <div style="font-weight:800;font-size:12px;color:#0f172a;letter-spacing:0">${escapeHtml(node.rawLabel)}</div>
            </div>
            <div style="display:grid;grid-template-columns:auto auto;gap:3px 10px;color:#64748b">
              <span>Type</span><b style="color:#334155;font-weight:700">${escapeHtml(cat.label)}</b>
              <span>Mentions</span><b style="color:#334155;font-weight:700">${node.mentions}</b>
              <span>Relations</span><b style="color:#334155;font-weight:700">${node.degree}</b>
              <span>Files</span><b style="color:#334155;font-weight:700">${node.filesCount}</b>
            </div>
            ${fileSources}
          </div>`;
        }
        if (params.dataType === "edge") {
          const link = params.data as EChartsLink;
          return `<div style="min-width:140px;font-size:11px;line-height:1.45;color:#64748b">
            <div style="font-weight:800;color:#0f172a;margin-bottom:3px">${escapeHtml(link.relation)}</div>
            <div>Weight <b style="color:#334155">${link.value}</b></div>
          </div>`;
        }
        return "";
      },
      backgroundColor: "rgba(255,255,255,0.62)",
      borderColor: "rgba(255,255,255,0.9)",
      borderWidth: 1,
      padding: [9, 11],
      textStyle: {
        color: "#0f172a",
        fontFamily: "Inter, system-ui, sans-serif",
      },
      extraCssText:
        "box-shadow:0 20px 54px rgba(55,95,170,0.16);border-radius:16px;backdrop-filter:blur(18px) saturate(155%);-webkit-backdrop-filter:blur(18px) saturate(155%);",
    } as echarts.TooltipComponentOption,
    legend: [
      {
        show: !hideLegend,
        data: graph.categories.map((c) => c.name),
        orient: "horizontal",
        bottom: 6,
        left: "center",
        itemWidth: 10,
        itemHeight: 10,
        itemGap: 10,
        textStyle: { fontSize: 10, color: "#64748b" },
        inactiveColor: "#cbd5e1",
      },
    ],
    animationDuration: 1200,
    animationDurationUpdate: 1400,
    animationEasing: "quarticOut",
    animationEasingUpdate: "cubicOut",
    series: [
      {
        type: "graph",
        layout: "force",
        data: highlightedNodes,
        links: highlightedLinks,
        categories: graph.categories,
        roam: true,
        draggable: true,
        center: ["50%", "50%"],
        zoom: fitConfig.initialZoom,
        top: "middle",
        left: "center",
        width: "100%",
        height: "100%",
        force: {
          repulsion: fitConfig.repulsion,
          edgeLength: fitConfig.edgeLength,
          gravity: fitConfig.gravity,
          friction: 0.88,
          layoutAnimation: true,
        },
        label: {
          position: "bottom",
          distance: 6,
          fontSize: 10,
          fontWeight: 560,
          color: "#172033",
          backgroundColor: "rgba(255,255,255,0.74)",
          padding: [3, 7],
          borderRadius: 6,
          borderColor: "rgba(255,255,255,0.92)",
          borderWidth: 1,
          shadowBlur: 10,
          shadowColor: "rgba(15,23,42,0.08)",
          shadowOffsetY: 3,
          formatter: (params: EChartsFormatterParams<EChartsNode>) => {
            const name = params.data?.rawLabel ?? params.data?.name ?? "";
            const chars = Array.from(String(name));
            return chars.length <= 9
              ? name
              : chars.slice(0, 9).join("") + "...";
          },
        },
        // Edge labels hidden by default; shown on hover via emphasis
        edgeLabel: {
          show: false,
          fontSize: 10,
          color: "#334155",
          backgroundColor: "rgba(255,255,255,0.86)",
          padding: [3, 7],
          borderRadius: 6,
          formatter: (params: EChartsFormatterParams<EChartsLink>) =>
            params.data?.relation ?? "",
        },
        edgeSymbol: ["none", "none"],
        edgeSymbolSize: [0, 0],
        lineStyle: {
          color: GRAPH_LINK_COLOR,
          curveness: 0.2,
          opacity: 0.5,
          width: 0.8,
          shadowBlur: 2,
          shadowColor: GRAPH_LINK_SHADOW,
        },
        // Hover creates depth: unrelated items fade while adjacency lights up.
        emphasis: {
          focus: "adjacency",
          scale: true,
          lineStyle: { opacity: 0.96, shadowBlur: 16 },
          label: {
            show: true,
            fontSize: 12,
            fontWeight: 800,
            backgroundColor: "rgba(255,255,255,0.92)",
          },
          edgeLabel: {
            show: true,
            fontSize: 10,
            fontWeight: 700,
            backgroundColor: "rgba(255,255,255,0.92)",
            padding: [3, 7],
            borderRadius: 6,
            color: "#0f172a",
          },
          itemStyle: {
            shadowBlur: 60,
            shadowOffsetY: 15,
            opacity: 1,
          },
        },
        blur: {
          itemStyle: { opacity: 0.055 },
          lineStyle: { opacity: 0.015 },
          label: { opacity: 0.08 },
          edgeLabel: { opacity: 0.02 },
        },
        select: {
          itemStyle: { borderWidth: 0 },
        },
        scaleLimit: { min: 0.12, max: 3 },
      } as echarts.GraphSeriesOption,
    ],
  };
}

// ── Main Component ───────────────────────────────────────────────────────────
const KnowledgeGraphPanel = ({
  kbName,
  search,
  sourceType,
  fileName,
  jobId,
  sampleLimit,
  metadataFilter,
  chunkIds,
  selectedChunkId,
  fullGraph = false,
  qualityMode = "standard",
  graphMode = GENERIC_GRAPH_MODE,
  maxNodes = 96,
  maxEdges = 180,
  hideLegend = false,
  fitProfile = "default",
  nodeSizeScale = 1,
  autoRefreshOnMount = true,
  compact = false,
  hideHeader = false,
  onRequestClose = null,
  externalRefreshToken = 0,
  onRefreshPendingChange = null,
  className,
}: KnowledgeGraphPanelProps) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { setSuccessData, setErrorData } = useAlertStore((state) => ({
    setSuccessData: state.setSuccessData,
    setErrorData: state.setErrorData,
  }));

  const graphParams = useMemo(
    () => ({
      kb_name: kbName,
      full_graph: fullGraph,
      quality_mode: qualityMode,
      graph_mode: graphMode,
      search,
      source_type: sourceType,
      file_name: fileName,
      job_id: jobId,
      sample_limit: sampleLimit,
      max_nodes: maxNodes,
      max_edges: maxEdges,
      metadata_filter: metadataFilter,
      chunk_ids: chunkIds,
    }),
    [
      chunkIds,
      fileName,
      fullGraph,
      graphMode,
      jobId,
      kbName,
      maxEdges,
      maxNodes,
      metadataFilter,
      qualityMode,
      sampleLimit,
      search,
      sourceType,
    ],
  );

  const { data, isLoading, isError, isFetching } = useGetKnowledgeBaseGraph(
    graphParams,
    {
      enabled: !!kbName,
      placeholderData: (previousData) => previousData,
    },
  );

  const refreshGraphCache = useRefreshKnowledgeBaseGraphCache();
  const chartRef = useRef<ReactECharts | null>(null);
  const rebuildRequestKeysRef = useRef<Set<string>>(new Set());
  const lastExternalRefreshTokenRef = useRef(externalRefreshToken);

  const refreshGraph = useCallback(async () => {
    const response = await refreshGraphCache.mutateAsync(graphParams);
    queryClient.setQueryData(
      buildKnowledgeGraphQueryKey(graphParams),
      response,
    );
    return response;
  }, [graphParams, queryClient, refreshGraphCache]);

  const handleRefreshGraphCache = useCallback(async (): Promise<boolean> => {
    try {
      await refreshGraph();
      // Invalidate and refetch to ensure the React Query cache is fresh
      queryClient.invalidateQueries({
        queryKey: buildKnowledgeGraphQueryKey(graphParams),
      });
      setSuccessData({
        title: t("knowledge.graphRefreshSuccess", {
          defaultValue: "Knowledge graph rebuilt.",
        }),
      });
      return true;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : t("knowledge.failedToLoadGraph", {
              defaultValue: "Failed to load the knowledge graph.",
            });
      setErrorData({
        title: t("knowledge.graphRefreshFailure", {
          defaultValue: "Failed to rebuild the knowledge graph.",
        }),
        list: [message],
      });
      return false;
    }
  }, [refreshGraph, setErrorData, setSuccessData, t]);

  const graphRequestKey = useMemo(
    () => JSON.stringify(buildKnowledgeGraphQueryKey(graphParams)),
    [graphParams],
  );

  useEffect(() => {
    onRefreshPendingChange?.(refreshGraphCache.isPending);
  }, [onRefreshPendingChange, refreshGraphCache.isPending]);

  useEffect(() => {
    if (externalRefreshToken === lastExternalRefreshTokenRef.current) {
      return;
    }
    lastExternalRefreshTokenRef.current = externalRefreshToken;
    void handleRefreshGraphCache();
  }, [externalRefreshToken, handleRefreshGraphCache]);

  useEffect(() => {
    if (!autoRefreshOnMount || !kbName || refreshGraphCache.isPending) {
      return;
    }
    if (rebuildRequestKeysRef.current.has(graphRequestKey)) {
      return;
    }
    rebuildRequestKeysRef.current.add(graphRequestKey);
    void refreshGraph().catch(() => {
      rebuildRequestKeysRef.current.delete(graphRequestKey);
    });
  }, [
    autoRefreshOnMount,
    graphRequestKey,
    kbName,
    refreshGraph,
    refreshGraphCache.isPending,
  ]);

  const formattedGraph = useMemo(
    () =>
      formatGraphData(
        data?.nodes ?? [],
        data?.edges ?? [],
        maxNodes,
        maxEdges,
        nodeSizeScale,
      ),
    [data?.nodes, data?.edges, maxNodes, maxEdges, nodeSizeScale],
  );

  const chartOption = useMemo(
    () =>
      buildEChartsOption(
        formattedGraph,
        selectedChunkId,
        hideLegend,
        fitProfile,
      ),
    [fitProfile, formattedGraph, hideLegend, selectedChunkId],
  );

  const graphReady = formattedGraph.nodes.length > 0;
  const showLoading = !data && isLoading;
  const visibleNodeCount = formattedGraph.nodes.length;
  const visibleEdgeCount = formattedGraph.links.length;

  const fitGraphIntoViewport = useCallback(() => {
    if (!chartRef.current || !graphReady) return;
    const chart = chartRef.current.getEchartsInstance();
    const fitConfig = getFitProfileConfig(fitProfile, formattedGraph.nodes.length);

    chart.resize();
    chart.dispatchAction({ type: "restore" });
    chart.setOption(
      {
        series: [
          {
            center: ["50%", "50%"],
            zoom: fitConfig.initialZoom,
          },
        ],
      },
      false,
    );

    try {
      const seriesModel = (chart as unknown as EChartsGraphModelAccessor)
        .getModel()
        .getSeriesByIndex(0);
      const seriesData = seriesModel?.getData?.();
      if (!seriesData || formattedGraph.nodes.length === 0) {
        return;
      }

      let minX = Number.POSITIVE_INFINITY;
      let minY = Number.POSITIVE_INFINITY;
      let maxX = Number.NEGATIVE_INFINITY;
      let maxY = Number.NEGATIVE_INFINITY;

      for (let index = 0; index < formattedGraph.nodes.length; index += 1) {
        const layout = seriesData.getItemLayout(index);
        const nodeX = Array.isArray(layout) ? layout[0] : layout?.x;
        const nodeY = Array.isArray(layout) ? layout[1] : layout?.y;
        const nodeSize = Number(formattedGraph.nodes[index]?.symbolSize ?? 0);
        if (
          typeof nodeX !== "number" ||
          !Number.isFinite(nodeX) ||
          typeof nodeY !== "number" ||
          !Number.isFinite(nodeY)
        ) {
          continue;
        }

        minX = Math.min(minX, nodeX - nodeSize / 2 - fitConfig.paddingX);
        minY = Math.min(minY, nodeY - nodeSize / 2 - fitConfig.paddingY);
        maxX = Math.max(maxX, nodeX + nodeSize / 2 + fitConfig.paddingX);
        maxY = Math.max(maxY, nodeY + nodeSize / 2 + fitConfig.paddingY);
      }

      if (
        !Number.isFinite(minX) ||
        !Number.isFinite(minY) ||
        !Number.isFinite(maxX) ||
        !Number.isFinite(maxY)
      ) {
        return;
      }

      const chartWidth = chart.getWidth();
      const chartHeight = chart.getHeight();
      if (chartWidth <= 0 || chartHeight <= 0) {
        return;
      }

      const graphWidth = Math.max(maxX - minX, 1);
      const graphHeight = Math.max(maxY - minY, 1);
      const graphCenterX = (minX + maxX) / 2;
      const graphCenterY = (minY + maxY) / 2;
      const fitScale = Math.min(
        (chartWidth * fitConfig.viewportRatioX) / graphWidth,
        (chartHeight * fitConfig.viewportRatioY) / graphHeight,
      );
      const targetZoom = Math.min(
        fitConfig.maxZoom,
        Math.max(fitConfig.minZoom, fitScale),
      );

      if (Math.abs(targetZoom - fitConfig.initialZoom) > 0.02) {
        chart.dispatchAction({
          type: "graphRoam",
          zoom: targetZoom,
          originX: graphCenterX,
          originY: graphCenterY,
        } as EChartsDispatchPayload);
      }

      const dx = chartWidth / 2 - graphCenterX;
      const dy = chartHeight / 2 - graphCenterY;
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
        chart.dispatchAction({
          type: "graphRoam",
          dx,
          dy,
        } as EChartsDispatchPayload);
      }
    } catch {
      // Keep the default restored view if fit-and-center fails.
    }
  }, [fitProfile, formattedGraph.nodes, graphReady]);

  // Fit the full graph into the viewport and keep its bounding box centered.
  useEffect(() => {
    if (!graphReady) return;
    const timers = [0, 80, 320, 900, 1800, 3200, 5000].map((delay) =>
      setTimeout(fitGraphIntoViewport, delay),
    );
    return () => timers.forEach((timer) => clearTimeout(timer));
  }, [
    fitGraphIntoViewport,
    fitProfile,
    graphReady,
    formattedGraph.nodes.length,
    formattedGraph.links.length,
  ]);

  return (
    <div
      className={cn(
        "flex min-h-0 flex-col overflow-hidden border bg-background",
        compact ? "h-[440px] rounded-[1.2rem]" : "h-full rounded-[1.8rem]",
        className,
      )}
      style={{
        backgroundColor: GRAPH_BACKGROUND,
        borderColor: "rgba(255,255,255,0.8)",
        boxShadow: "0 24px 70px rgba(15,23,42,0.10)",
      }}
    >
      {!hideHeader ? (
        <div
          className="border-b px-5 py-2.5 backdrop-blur-md"
          style={{
            backgroundColor: "rgba(255,255,255,0.7)",
            borderColor: "rgba(255,255,255,0.8)",
          }}
        >
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-foreground">
              Knowledge Graph
            </div>
            <div className="flex items-center gap-2">
              {data?.truncated ? (
                <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[10px] text-muted-foreground">
                  Trimmed
                </span>
              ) : null}
              {isFetching && graphReady ? (
                <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Loading size={11} /> Updating...
                </span>
              ) : null}
              {refreshGraphCache.isPending ? (
                <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Loading size={11} /> Rebuilding...
                </span>
              ) : null}
              {onRequestClose && fullGraph ? (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={onRequestClose}
                >
                  <ForwardedIconComponent name="X" className="h-3.5 w-3.5" />
                </Button>
              ) : null}
              <Button
                variant="outline"
                size="xs"
                loading={refreshGraphCache.isPending}
                className="h-7 rounded-full text-[11px]"
                onClick={() => void handleRefreshGraphCache()}
              >
                {!refreshGraphCache.isPending ? (
                  <ForwardedIconComponent
                    name="RefreshCcw"
                    className="h-3 w-3"
                  />
                ) : null}
                {t("knowledge.graphRefreshButton", { defaultValue: "Rebuild" })}
              </Button>
            </div>
          </div>
          {!compact && !hideLegend ? (
            <div className="mt-1.5 flex flex-wrap gap-1.5 text-[10px] text-muted-foreground">
              <span className="rounded-full border border-border bg-background px-2 py-0.5">
                {visibleNodeCount} nodes
              </span>
              <span className="rounded-full border border-border bg-background px-2 py-0.5">
                {visibleEdgeCount} edges
              </span>
            </div>
          ) : null}
        </div>
      ) : null}

      <div
        className="relative min-h-0 flex-1"
        style={{ backgroundColor: GRAPH_BACKGROUND }}
      >
        {showLoading ? (
          <div className="flex h-full items-center justify-center gap-3 text-sm text-muted-foreground">
            <Loading size={28} />
            <span>Loading knowledge graph...</span>
          </div>
        ) : isError ? (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-destructive">
            {t("knowledge.failedToLoadGraph", {
              defaultValue: "Failed to load the knowledge graph.",
            })}
          </div>
        ) : !graphReady ? (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
            No entity relations were found for the current filters.
          </div>
        ) : (
          <ReactECharts
            ref={(instance) => {
              chartRef.current = instance;
            }}
            onChartReady={() => {
              setTimeout(fitGraphIntoViewport, 0);
            }}
            option={chartOption}
            style={{ height: "100%", width: "100%" }}
            opts={{ renderer: "canvas" }}
            notMerge={false}
            lazyUpdate={true}
          />
        )}
      </div>
    </div>
  );
};

export default KnowledgeGraphPanel;

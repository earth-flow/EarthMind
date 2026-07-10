import { useQueryClient } from "@tanstack/react-query";
import * as echarts from "echarts";
import ReactECharts from "echarts-for-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  showNodeLabels?: boolean;
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

// ── Entity type -> color mapping ───────────────────────────────────────────
// Backend assigns type: technology | method | organization | metric | dataset | event | document | other
interface CatDef {
  color: string;
  label: string;
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
  technology: { color: "#5070dd", label: "Technology" },
  method: { color: "#b6d634", label: "Method" },
  organization: { color: "#505372", label: "Organization" },
  metric: { color: "#ff994d", label: "Metric" },
  dataset: { color: "#0ca8df", label: "Dataset" },
  event: { color: "#ffd10a", label: "Event" },
  document: { color: "#fb628b", label: "Document" },
  other: { color: "#785db0", label: "Other" },
};

const GRAPH_BACKGROUND = "#ffffff";
const GRAPH_LABEL_COLOR = "#334155";
const GRAPH_LINK_SHADOW = "rgba(15,23,42,0.05)";

type GraphEntityType = (typeof TYPE_ORDER)[number];

interface ClusterShapeConfig {
  x: number;
  y: number;
  baseRadius: number;
  ringGap: number;
  stretchX: number;
  stretchY: number;
  collisionPadding: number;
}

interface ClusterLayoutRuntimeConfig {
  centerScale: number;
  baseRadiusScale: number;
  ringGapScale: number;
  collisionPaddingScale: number;
}

const CLUSTER_RUNTIME_BY_PROFILE: Record<KnowledgeGraphFitProfile, ClusterLayoutRuntimeConfig> = {
  drawer: {
    centerScale: 0.3,
    baseRadiusScale: 0.5,
    ringGapScale: 0.5,
    collisionPaddingScale: 0.9,
  },
  chunks: {
    centerScale: 1,
    baseRadiusScale: 1,
    ringGapScale: 1,
    collisionPaddingScale: 1,
  },
  default: {
    centerScale: 0.9,
    baseRadiusScale: 0.92,
    ringGapScale: 0.92,
    collisionPaddingScale: 0.94,
  },
};

const CLUSTER_LAYOUTS: Record<GraphEntityType, ClusterShapeConfig> = {
  technology: {
    x: -700,
    y: -320,
    baseRadius: 110,
    ringGap: 126,
    stretchX: 1.42,
    stretchY: 1.06,
    collisionPadding: 38,
  },
  method: {
    x: -470,
    y: 520,
    baseRadius: 90,
    ringGap: 108,
    stretchX: 1.2,
    stretchY: 0.98,
    collisionPadding: 32,
  },
  organization: {
    x: -940,
    y: 120,
    baseRadius: 96,
    ringGap: 112,
    stretchX: 1.22,
    stretchY: 0.98,
    collisionPadding: 34,
  },
  metric: {
    x: 470,
    y: 520,
    baseRadius: 88,
    ringGap: 108,
    stretchX: 1.18,
    stretchY: 0.96,
    collisionPadding: 32,
  },
  dataset: {
    x: 940,
    y: -300,
    baseRadius: 122,
    ringGap: 136,
    stretchX: 1.5,
    stretchY: 1.12,
    collisionPadding: 42,
  },
  event: {
    x: 860,
    y: 140,
    baseRadius: 96,
    ringGap: 112,
    stretchX: 1.22,
    stretchY: 0.98,
    collisionPadding: 34,
  },
  document: {
    x: 0,
    y: 0,
    baseRadius: 54,
    ringGap: 64,
    stretchX: 0.92,
    stretchY: 0.78,
    collisionPadding: 24,
  },
  other: {
    x: 220,
    y: -610,
    baseRadius: 92,
    ringGap: 108,
    stretchX: 1.16,
    stretchY: 0.94,
    collisionPadding: 34,
  },
};

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
      minZoom: 0.16,
      maxZoom: 0.92,
      initialZoom: 0.8,
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
      initialZoom: 1.15,
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
    initialZoom: 0.42,
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

const getDisplayNodeLabel = (
  displayLabel: string | null | undefined,
  fallbackLabel: string,
) => String(displayLabel || fallbackLabel || "").trim();

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
  displayLabel: string;
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
  sourceType: string;
  targetType: string;
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

function formatGraphData(
  nodes: KnowledgeGraphNode[],
  edges: KnowledgeGraphEdge[],
  maxNodes: number,
  maxEdges: number,
  nodeSizeScale = 1,
  fitProfile: KnowledgeGraphFitProfile = "default",
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

  const typeBuckets = new Map<string, KnowledgeGraphNode[]>();
  sortedNodes.forEach((node) => {
    const entityType = node.type || "other";
    if (!typeBuckets.has(entityType)) {
      typeBuckets.set(entityType, []);
    }
    typeBuckets.get(entityType)!.push(node);
  });
  const limitedNodes: KnowledgeGraphNode[] = [];
  TYPE_ORDER.forEach((type) => {
    const bucket = typeBuckets.get(type) ?? [];
    limitedNodes.push(...bucket.slice(0, 10));
  });
  if (limitedNodes.length < maxNodes) {
    const selectedIds = new Set(limitedNodes.map((node) => node.id));
    for (const node of sortedNodes) {
      if (selectedIds.has(node.id)) {
        continue;
      }
      limitedNodes.push(node);
      selectedIds.add(node.id);
      if (limitedNodes.length >= maxNodes) {
        break;
      }
    }
  }
  const trimmedNodes = limitedNodes.slice(0, maxNodes);
  const allowedIds = new Set(trimmedNodes.map((n) => n.id));

  const candidateEdges = edges
    .filter((e) => allowedIds.has(e.source) && allowedIds.has(e.target))
    .sort(
      (a, b) =>
        b.weight * 4 +
        toNumber(b.metadata?.mentions, b.weight) -
        (a.weight * 4 + toNumber(a.metadata?.mentions, a.weight)),
    )
    .slice(0, maxEdges);

  const connectedIds = new Set<string>();
  candidateEdges.forEach((edge) => {
    connectedIds.add(edge.source);
    connectedIds.add(edge.target);
  });
  const connectedNodes = trimmedNodes.filter((node) => connectedIds.has(node.id));
  const connectedEdges = candidateEdges.filter(
    (edge) => connectedIds.has(edge.source) && connectedIds.has(edge.target),
  );

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
  const nodeTypeMap = new Map<string, string>();
  const nodesByType = new Map<string, KnowledgeGraphNode[]>();
  connectedNodes.forEach((node) => {
    const entityType = node.type || "other";
    if (!nodesByType.has(entityType)) {
      nodesByType.set(entityType, []);
    }
    nodesByType.get(entityType)!.push(node);
  });
  const typeOffsets = new Map<string, number>();
  const placedNodes: Array<{
    x: number;
    y: number;
    radius: number;
    labelWidth: number;
    labelHeight: number;
  }> = [];
  const clusterRuntime = CLUSTER_RUNTIME_BY_PROFILE[fitProfile];

  const echartsNodes: EChartsNode[] = connectedNodes.map((node) => {
    const importance = toNumber(node.metadata?.importance_score, node.weight);
    const normalized = (importance - minImp) / impSpan;

    const entityType = node.type || "other";
    const catIdx = typeToIndex[entityType] ?? typeToIndex["other"];
    const cat = CATEGORY_DEFS[entityType] ?? CATEGORY_DEFS.other;

    const symbolSize = clamp(
      (10 + normalized * 30) * nodeSizeScale,
      10 * nodeSizeScale,
      48 * nodeSizeScale,
    );
    const typeIndex = typeOffsets.get(entityType) ?? 0;
    typeOffsets.set(entityType, typeIndex + 1);
    const clusterNodes = Math.max(nodesByType.get(entityType)?.length ?? 1, 1);
    const clusterLayout = CLUSTER_LAYOUTS[entityType as GraphEntityType] ?? CLUSTER_LAYOUTS.other;
    const displayLabel = getDisplayNodeLabel(
      node.display_label,
      node.label,
    );
    const labelWidth = Math.max(42, Array.from(displayLabel).length * 8 + 10);
    const labelHeight = 18;
    let x = clusterLayout.x;
    let y = clusterLayout.y;
    const collisionRadius = symbolSize * 1.08 + clusterLayout.collisionPadding;

    const resolveRingSlot = (nodeIndex: number) => {
      let remaining = nodeIndex;
      let ring = 0;
      let ringCapacity = 1;
      while (remaining >= ringCapacity) {
        remaining -= ringCapacity;
        ring += 1;
        ringCapacity = 6 + ring * 4;
      }
      return { ring, slot: remaining, ringCapacity };
    };

    for (let attempt = 0; attempt < 320; attempt += 1) {
      const candidateIndex = typeIndex + attempt;
      const { ring, slot, ringCapacity } = resolveRingSlot(candidateIndex);
      const baseAngle = (slot / ringCapacity) * Math.PI * 2 + catIdx * 0.16;
      const radius =
        clusterLayout.baseRadius * clusterRuntime.baseRadiusScale +
        ring * clusterLayout.ringGap * clusterRuntime.ringGapScale +
        normalized * 30 +
        (slot % 2) * 10;
      const jitterX = ((typeIndex * 17 + attempt * 13) % 13) - 6;
      const jitterY = ((typeIndex * 23 + attempt * 9) % 11) - 5;
      const candidateX =
        clusterLayout.x * clusterRuntime.centerScale +
        Math.cos(baseAngle) * radius * clusterLayout.stretchX +
        jitterX;
      const candidateY =
        clusterLayout.y * clusterRuntime.centerScale +
        Math.sin(baseAngle) * radius * clusterLayout.stretchY +
        jitterY;
      const overlaps = placedNodes.some((placed) => {
        const dx = candidateX - placed.x;
        const dy = candidateY - placed.y;
        const minDistance = collisionRadius + placed.radius;
        if (dx * dx + dy * dy < minDistance * minDistance) {
          return true;
        }
        const labelDx = candidateX + collisionRadius + 8 + labelWidth / 2 - placed.x;
        const labelDy = candidateY - placed.y;
        return (
          Math.abs(labelDx) < labelWidth / 2 + placed.radius &&
          Math.abs(labelDy) < labelHeight / 2 + placed.radius
        );
      });
      if (!overlaps || attempt === 319) {
        x = candidateX;
        y = candidateY;
        break;
      }
    }
    placedNodes.push({ x, y, radius: collisionRadius, labelWidth, labelHeight });

    const labelPosition = "right";
    const mentions = toNumber(node.metadata?.mentions, node.weight);
    const filesCount = toNumber(node.metadata?.files_count, 0);
    const fileLabels = Array.isArray(node.metadata?.file_labels)
      ? node.metadata.file_labels
          .map((label) => String(label).trim())
          .filter(Boolean)
          .slice(0, 6)
      : [];
    const degree = degreeMap.get(node.id) ?? toNumber(node.metadata?.degree, 0);

    nodeColorMap.set(node.id, cat.color);
    nodeTypeMap.set(node.id, entityType);

    return {
      id: node.id,
      name: displayLabel,
      category: catIdx,
      value: importance,
      symbolSize,
      symbol: "circle",
      x,
      y,
      itemStyle: {
        color: cat.color,
        borderWidth: 0.8,
        borderColor: "#ffffff",
        opacity: 0.9,
      },
      fixed: true,
      label: {
        show: true,
        position: labelPosition,
        distance: 8,
        fontSize: 11,
        color: GRAPH_LABEL_COLOR,
        fontWeight: 500,
        backgroundColor: "rgba(255,255,255,0.92)",
        padding: [1, 4],
        borderRadius: 3,
        width: labelWidth,
        overflow: "break",
        formatter: displayLabel,
      },
      emphasis: {
        focus: "adjacency",
        itemStyle: {
          borderColor: cat.color,
          borderWidth: 1.6,
          shadowBlur: 14,
          shadowColor: rgbaFromHex(cat.color, 0.22),
          opacity: 1,
        },
        label: {
          show: true,
          color: "#111827",
          fontWeight: 700,
        },
      },
      rawLabel: node.full_label || node.label,
      displayLabel,
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
    const sourceColor = nodeColorMap.get(edge.source) ?? "#00d4ff";
    const glowColor = rgbaFromHex(sourceColor, 0.50);
    return {
      source: edge.source,
      target: edge.target,
      sourceType: nodeTypeMap.get(edge.source) ?? "other",
      targetType: nodeTypeMap.get(edge.target) ?? "other",
      value: weight,
      label: {
        show: false,
        formatter: edge.label || "related",
        fontSize: 10,
        color: rgbaFromHex(sourceColor, 0.9),
        backgroundColor: "rgba(6,9,18,0.82)",
        padding: [3, 7],
        borderRadius: 3,
        borderColor: rgbaFromHex(sourceColor, 0.3),
        borderWidth: 1,
      },
      lineStyle: {
        width: clamp(0.8 + Math.log2(weight + 1) * 0.18, 0.9, 1.8),
        color: sourceColor,
        opacity: 0.5,
        curveness: 0.3,
      },
      emphasis: {
        lineStyle: {
          width: 1.6,
          color: sourceColor,
          opacity: 0.9,
        },
        label: {
          show: true,
          color: "#0f172a",
          fontWeight: 700,
          backgroundColor: "rgba(255,255,255,0.9)",
        },
      },
      blur: {
        lineStyle: { opacity: 0.01 },
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
  activeCategories: Set<string> | null = null,
  legendSelected: Record<string, boolean> = {},
  showNodeLabels = true,
): echarts.EChartsOption {
  if (graph.nodes.length === 0) {
    return { series: [] };
  }

  const fitConfig = getFitProfileConfig(fitProfile, graph.nodes.length);
  let highlightedNodes: EChartsNode[] = graph.nodes;
  let highlightedLinks: EChartsLink[] = graph.links;

  if (selectedChunkId) {
    highlightedNodes = graph.nodes.map((node) => ({
      ...node,
      itemStyle: {
        ...node.itemStyle,
        opacity: node.chunkIds.includes(selectedChunkId) ? 1 : 0.9,
      },
    }));
    highlightedLinks = graph.links.map((link) => ({
      ...link,
      lineStyle: {
        ...link.lineStyle,
        opacity: link.chunkIds.includes(selectedChunkId)
          ? 0.85
          : link.lineStyle.opacity,
      },
    }));
  }

  if (!showNodeLabels) {
    highlightedNodes = highlightedNodes.map((node) => ({
      ...node,
      label: {
        ...node.label,
        show: false,
      },
      emphasis: {
        ...node.emphasis,
        label: {
          ...(node.emphasis?.label ?? {}),
          show: false,
        },
      },
    }));
  }

  if (activeCategories && activeCategories.size > 0) {
    highlightedNodes = highlightedNodes.map((node) => ({
      ...node,
      itemStyle: {
        ...node.itemStyle,
        opacity: activeCategories.has(node.type) ? 1 : 0.14,
      },
      label: {
        ...node.label,
        opacity: activeCategories.has(node.type) ? 1 : 0.1,
      },
    }));
    highlightedLinks = highlightedLinks.map((link) => {
      const isActive =
        activeCategories.has(link.sourceType) ||
        activeCategories.has(link.targetType);
      return {
        ...link,
        lineStyle: {
          ...link.lineStyle,
          opacity: isActive ? 0.82 : 0.04,
          width: isActive ? 1.8 : link.lineStyle.width,
        },
      };
    });
  }

  return {
    backgroundColor: GRAPH_BACKGROUND,
    tooltip: {
      trigger: "item",
      confine: true,
      renderMode: "html",
      formatter: (params: EChartsFormatterParams<EChartsNode | EChartsLink>) => {
        if (params.dataType === "node") {
          const node = params.data as EChartsNode;
          const cat = CATEGORY_DEFS[node.type] ?? CATEGORY_DEFS.other;
          const sources = node.fileLabels.length
            ? `<div style="margin-top:6px;color:#64748b;white-space:normal;overflow-wrap:anywhere;word-break:break-word">${node.fileLabels
                .slice(0, 4)
                .map((label) => escapeHtml(label))
                .join("<br/>")}</div>`
            : "";
          return `<div style="max-width:220px;font-size:12px;line-height:1.5;color:#6d6e73;white-space:normal;overflow-wrap:anywhere;word-break:break-word">
            <div style="font-weight:600;color:#111827;margin-bottom:4px">${escapeHtml(node.rawLabel)}</div>
            <div style="color:#475569">${escapeHtml(cat.label)}</div>
            <div style="color:#64748b">Mentions ${node.mentions} · Relations ${node.degree}</div>
            ${sources}
          </div>`;
        }
        if (params.dataType === "edge") {
          const link = params.data as EChartsLink;
          return `${escapeHtml(link.relation)} (${link.value})`;
        }
        return "";
      },
      backgroundColor: "#fff",
      borderColor: "#b7b9be",
      borderWidth: 1,
      borderRadius: 4,
      shadowBlur: 10,
      shadowColor: "rgba(0, 0, 0, .2)",
      shadowOffsetX: 1,
      shadowOffsetY: 2,
      textStyle: {
        color: "#6d6e73",
        fontSize: 14,
      },
    } as echarts.TooltipComponentOption,
    legend: [
      {
        show: !hideLegend,
        data: graph.categories.map((c) => c.name),
        orient: "horizontal",
        left: "center",
        bottom: 15,
        itemGap: 8,
        itemWidth: 25,
        itemHeight: 14,
        textStyle: {
          color: "#6d6e73",
          fontSize: 12,
        },
        inactiveColor: "#cfd2d7",
        selected: legendSelected,
      },
    ],
    animationDuration: 800,
    animationDurationUpdate: 800,
    series: [
      {
        name: "Knowledge Graph",
        type: "graph",
        layout: "none",
        data: highlightedNodes,
        links: highlightedLinks,
        categories: graph.categories,
        roam: true,
        draggable: false,
        label: {
          show: showNodeLabels,
          position: "right",
          formatter: "{b}",
          color: GRAPH_LABEL_COLOR,
          fontSize: 12,
        },
        labelLayout: {
          hideOverlap: false,
          moveOverlap: "shiftY",
          draggable: false,
        },
        scaleLimit: {
          min: 0.4,
          max: 2,
        },
        lineStyle: {
          color: "source",
          curveness: 0.3,
          width: 1,
          opacity: 0.5,
          shadowBlur: 0,
          shadowColor: GRAPH_LINK_SHADOW,
        },
        edgeSymbol: ["none", "none"],
        edgeSymbolSize: [0, 0],
        emphasis: {
          focus: "adjacency",
          label: {
            show: showNodeLabels,
            fontWeight: 700,
          },
          lineStyle: {
            width: 1.8,
            opacity: 1,
          },
        },
        blur: {
          lineStyle: { opacity: 0.08 },
          itemStyle: { opacity: 0.25 },
          label: { opacity: 0.16 },
        },
        center: ["50%", "50%"],
        zoom: fitConfig.initialZoom,
        nodeScaleRatio: 0.6,
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
  maxNodes = 64,
  maxEdges = 180,
  hideLegend = false,
  fitProfile = "default",
  showNodeLabels = true,
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
  const [activeCategories, setActiveCategories] = useState<Set<string> | null>(null);
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
        fitProfile,
      ),
    [data?.nodes, data?.edges, fitProfile, maxNodes, maxEdges, nodeSizeScale],
  );

  const graphReady = formattedGraph.nodes.length > 0;
  const showLoading = (!data && isLoading) || refreshGraphCache.isPending;
  const visibleNodeCount = formattedGraph.nodes.length;
  const visibleEdgeCount = formattedGraph.links.length;
  const legendSelected = useMemo(() => {
    const selectedMap: Record<string, boolean> = {};
    formattedGraph.categories.forEach((category) => {
      selectedMap[category.name] =
        activeCategories == null || activeCategories.has(category.name.toLowerCase()) ||
        activeCategories.has(
          TYPE_ORDER.find((type) => CATEGORY_DEFS[type].label === category.name) ?? category.name,
        );
    });
    return selectedMap;
  }, [activeCategories, formattedGraph.categories]);

  const chartOption = useMemo(
    () =>
      buildEChartsOption(
        formattedGraph,
        selectedChunkId,
        hideLegend,
        fitProfile,
        activeCategories,
        legendSelected,
        showNodeLabels,
      ),
    [
      activeCategories,
      fitProfile,
      formattedGraph,
      hideLegend,
      legendSelected,
      selectedChunkId,
      showNodeLabels,
    ],
  );

  const chartEvents = useMemo(
    () => ({
      legendselectchanged: (params: { selected?: Record<string, boolean> }) => {
        const selected = params.selected ?? {};
        const nextTypes = TYPE_ORDER.filter(
          (type) => selected[CATEGORY_DEFS[type].label] !== false,
        );
        setActiveCategories(
          nextTypes.length === TYPE_ORDER.length ? null : new Set(nextTypes),
        );
      },
    }),
    [],
  );

  return (
    <div
      className={cn(
        "flex min-h-0 flex-col overflow-hidden border bg-background",
        compact ? "h-[440px] rounded-[1.2rem]" : "h-full rounded-[1.8rem]",
        className,
      )}
      style={{
        backgroundColor: GRAPH_BACKGROUND,
        borderColor: "rgba(226,232,240,0.9)",
        boxShadow: "0 8px 24px rgba(15,23,42,0.06)",
      }}
    >
      {!hideHeader ? (
        <div
          className="border-b px-5 py-2.5 backdrop-blur-md"
          style={{
            backgroundColor: "rgba(255,255,255,0.88)",
            borderColor: "rgba(226,232,240,0.9)",
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
              {isFetching && graphReady && !refreshGraphCache.isPending ? (
                <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Loading size={11} /> Updating...
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
            option={chartOption}
            onEvents={chartEvents}
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

from __future__ import annotations

import hashlib
import json
import re
from collections import Counter
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from uuid import UUID

from fastapi import Request
from filelock import FileLock

from earthmind.schema.knowledge_base import (
    KnowledgeGraphEdge,
    KnowledgeGraphNode,
    KnowledgeGraphResponse,
)

KB_GRAPH_TARGET_MIN_NODES = 40
KB_GRAPH_TARGET_MAX_NODES = 80
KB_GRAPH_MAX_EDGES = 180
KB_GRAPH_MODE_DEFAULT = "default"
KB_GRAPH_MODE_GENERIC_ENTITY = "generic_entity"
KB_GRAPH_MAX_ENTITIES_PER_CHUNK = 12
KB_GRAPH_MAX_ENTITIES_PER_SENTENCE = 5
KB_GRAPH_MAX_RELATIONS_PER_SENTENCE = 4
KB_GRAPH_MIN_ENTITY_LENGTH = 2
KB_GRAPH_MAX_ENTITY_LENGTH = 24
KB_GRAPH_MIN_TOKEN_FREQ = 2
KB_GRAPH_PERSISTED_CACHE_VERSION = 16
# Backward-compatible alias for tests
KB_GRAPH_MAX_NODES = KB_GRAPH_TARGET_MAX_NODES
KB_GRAPH_FULL_CACHE_FILE = ".earthmind_kg_graph_cache.json"
KB_GRAPH_FULL_CACHE_LOCK_FILE = ".earthmind_kg_graph_cache.lock"
KB_GRAPH_FULL_CACHE_MAX_ENTRIES = 48
KB_GRAPH_PREVIEW_SCAN_MULTIPLIER = 8
KB_GRAPH_PREVIEW_MIN_SCAN_LIMIT = 80
KB_GRAPH_PREVIEW_MAX_SCAN_LIMIT = 500

_GRAPH_MARKDOWN_ARTIFACTS_RE = re.compile(r"[`*_>#\[\]{}|]")
_GRAPH_WHITESPACE_RE = re.compile(r"\s+")
_GRAPH_SENTENCE_SPLIT_RE = re.compile(r"[\n\r。！？!?；;]+")
_GRAPH_CJK_RE = re.compile(r"[\u4e00-\u9fff]")
_GRAPH_ASCII_RE = re.compile(r"[A-Za-z]")
_GRAPH_ID_SAFE_RE = re.compile(r"[^a-z0-9\u4e00-\u9fff]+", re.IGNORECASE)
_ENTITY_ACRONYM_RE = re.compile(r"\b[A-Z]{2,}(?:[-_/][A-Z0-9]{1,})*\b")
_ENTITY_MIXED_RE = re.compile(
    r"\b(?:[A-Za-z]+(?:[-_][A-Za-z0-9]+){1,4}|[A-Za-z]*\d+[A-Za-z0-9]*(?:[-_][A-Za-z0-9]+)*)\b"
)
_ENTITY_TITLE_RE = re.compile(r"\b[A-Z][A-Za-z0-9]*(?:\s+(?:of|for|and|the|in|on|to|with|[A-Z][A-Za-z0-9]*)){0,5}\b")
_ENTITY_CJK_SUFFIX_RE = re.compile(
    r"[\u4e00-\u9fffA-Za-z0-9·\-]{2,28}(?:公司|大学|学院|研究院|研究所|中心|部门|组织|机构|团队|委员会|"
    r"模型|算法|方法|系统|平台|工具|框架|协议|标准|规范|项目|计划|理论|服务|产品|数据库|数据集|报告|"
    r"论文|会议|城市|国家|语言|技术|流程|策略|指标|任务|方案|应用|模块|组件)"
)
_ENTITY_CJK_BRACKET_RE = re.compile(r"[《“\"']([^》”\"'\n]{2,40})[》”\"']")
_ENTITY_PAREN_RE = re.compile(r"[\(（]([A-Za-z][A-Za-z0-9 _\-/]{1,40}|[\u4e00-\u9fff]{2,24})[\)）]")
_TOKEN_RE = re.compile(r"[A-Za-z][A-Za-z0-9-]{2,}|[\u4e00-\u9fff]{2,8}")

_EN_STOPWORDS = frozenset(
    {
        "about",
        "above",
        "after",
        "again",
        "against",
        "almost",
        "also",
        "although",
        "among",
        "another",
        "because",
        "before",
        "being",
        "between",
        "could",
        "during",
        "every",
        "first",
        "from",
        "have",
        "into",
        "more",
        "most",
        "other",
        "over",
        "same",
        "should",
        "some",
        "such",
        "than",
        "that",
        "their",
        "there",
        "these",
        "they",
        "this",
        "those",
        "through",
        "under",
        "using",
        "when",
        "where",
        "which",
        "while",
        "with",
        "would",
    }
)

_TITLECASE_NOISE = frozenset(
    {
        "Abstract",
        "Introduction",
        "Conclusion",
        "References",
        "Figure",
        "Table",
        "Section",
        "Chapter",
        "Appendix",
        "The",
        "This",
        "That",
        "These",
        "Those",
        "There",
        "When",
        "Where",
        "Because",
    }
)

_CJK_NOISE = frozenset(
    {
        "我们",
        "他们",
        "这些",
        "那些",
        "其中",
        "因此",
        "以及",
        "同时",
        "通过",
        "进行",
        "具有",
        "包括",
        "用于",
        "相关",
        "本文",
        "本章",
        "方法",
        "结果",
        "结论",
    }
)

_RELATION_PATTERNS: tuple[tuple[re.Pattern[str], str, bool], ...] = (
    (re.compile(r"\b(is|are|was|were|becomes?|represents?)\b", re.IGNORECASE), "is", False),
    (re.compile(r"\b(includes?|contains?|comprises?|consists of)\b", re.IGNORECASE), "includes", False),
    (re.compile(r"\b(uses?|utilizes?|adopts?|applies?)\b", re.IGNORECASE), "uses", False),
    (re.compile(r"\b(enables?|supports?|provides?|powers?)\b", re.IGNORECASE), "supports", False),
    (re.compile(r"\b(causes?|leads to|results in|drives?)\b", re.IGNORECASE), "causes", False),
    (re.compile(r"\b(improves?|enhances?|increases?)\b", re.IGNORECASE), "improves", False),
    (re.compile(r"\b(reduces?|decreases?|limits?)\b", re.IGNORECASE), "reduces", False),
    (re.compile(r"\b(depends on|relies on|based on|built on)\b", re.IGNORECASE), "depends on", False),
    (re.compile(r"\b(part of|belongs to)\b", re.IGNORECASE), "part of", False),
    (re.compile(r"\b(located in|deployed in|used in)\b", re.IGNORECASE), "located in", False),
    (re.compile(r"\b(creates?|develops?|builds?|generates?|produces?)\b", re.IGNORECASE), "creates", False),
    (re.compile(r"\b(connects?|links?|integrates?|combines?)\b", re.IGNORECASE), "connects", True),
    (
        re.compile(r"\b(affects?|influences?|correlates with|related to|associated with)\b", re.IGNORECASE),
        "related to",
        True,
    ),
    (re.compile(r"依赖于|依赖|基于"), "基于", False),
    (re.compile(r"包括|包含|由.*组成|组成"), "包含", False),
    (re.compile(r"使用|采用|应用"), "使用", False),
    (re.compile(r"支持|提供|驱动|赋能"), "支持", False),
    (re.compile(r"导致|引起|产生|带来"), "导致", False),
    (re.compile(r"影响|关联|相关|连接|结合|融合"), "相关", True),
    (re.compile(r"提升|增强|提高|增加"), "提升", False),
    (re.compile(r"降低|减少|限制"), "降低", False),
    (re.compile(r"属于|隶属于|是.*一部分"), "属于", False),
    (re.compile(r"位于|部署于|用于"), "位于", False),
    (re.compile(r"创建|开发|构建|生成|产生|发布|提出"), "创建", False),
    (re.compile(r"是|为|代表|表示"), "是", False),
)


@dataclass(frozen=True)
class ExtractedTriple:
    source: str
    relation: str
    target: str
    symmetric: bool = False


@dataclass
class _EntityStats:
    label: str
    canonical: str
    mentions: int = 0
    score: float = 0.0
    entity_type: str = "other"
    title_hits: int = 0
    chunk_ids: set[str] | None = None
    file_labels: set[str] | None = None
    snippets: list[str] | None = None

    def __post_init__(self) -> None:
        if self.chunk_ids is None:
            self.chunk_ids = set()
        if self.file_labels is None:
            self.file_labels = set()
        if self.snippets is None:
            self.snippets = list()


@dataclass(frozen=True)
class _ChunkGraphContext:
    chunk_id: str
    content: str
    metadata: dict[str, Any]
    file_label: str
    snippet: str
    sentences: list[str]
    entities: list[str]
    title_text: str


@dataclass(frozen=True)
class _GraphTopology:
    degree_by_entity: Counter[str]
    edge_weight_by_entity: Counter[str]
    adjacency: dict[str, list[dict[str, Any]]]
    importance_by_entity: dict[str, float]


# ── Entity type classification ───────────────────────────────────────────────
_ENTITY_TYPE_PATTERNS: tuple[tuple[re.Pattern[str], str], ...] = (
    # Technology: models, algorithms, frameworks, systems, tools, sensors, satellites, instruments
    (
        re.compile(
            r"model|algorithm|framework|technolog|tool|platform|system|network|architecture|engine|sensor|satellite|remote\s*sens|imag|spectromet|radiomet|thermomet|IRMSS|MODIS|LANDSAT|SENTINEL|camera|scanner|detector|GPT|BERT|transformer|CNN|RNN|LSTM|GAN|模型|算法|框架|技术|工具|平台|系统|网络|架构|引擎|传感器|卫星|遥感|成像|光谱|辐射|通道|载荷|仪器|设备|通道",
            re.IGNORECASE,
        ),
        "technology",
    ),
    # Method: approaches, strategies, calibration, correction, inversion, classification, detection
    (
        re.compile(
            r"method|approach|strategy|process|calibration|correction|inversion|classif|detect|segment|fusion|registration|validation|verification|optimization|training|fine-?tun|preprocess|postprocess|normaliz|定标|校正|反演|分类|检测|分割|融合|配准|验证|优化|训练|预处理|后处理|归一化|方法|策略|流程|方案|处理|变换|提取|估计|重建",
            re.IGNORECASE,
        ),
        "method",
    ),
    # Organization: companies, universities, institutes, teams, publishers
    (
        re.compile(
            r"organization|organisation|company|corporation|university|institute|academy|agency|team|committee|center|centre|laborator|lab|IEEE|ACM|journal|transactions|proceedings|press|出版|期刊|学报|公司|大学|学院|研究院|研究所|机构|团队|委员会|中心|实验室",
            re.IGNORECASE,
        ),
        "organization",
    ),
    # Metric: scores, accuracy, benchmarks, errors, coefficients
    (
        re.compile(
            r"metric|measure|score|accuracy|precision|recall|f1|bleu|rouge|loss|perplexity|benchmark|evaluation|error|rmse|mae|psnr|ssim|snr|correlation|coefficient|variance|deviation|signal.?to.?noise|resolution|指标|精度|准确率|误差|方差|偏差|信噪比|分辨率|系数",
            re.IGNORECASE,
        ),
        "metric",
    ),
    # Dataset: data collections, corpora
    (
        re.compile(r"dataset|corpus|database|sample|data\s*source|数据集|语料|数据库|样本|数据源|数据", re.IGNORECASE),
        "dataset",
    ),
    # Event: conferences, workshops, releases
    (
        re.compile(
            r"conference|workshop|symposium|seminar|release|launch|会议|研讨会|发布|发表|召开|举办", re.IGNORECASE
        ),
        "event",
    ),
)


def _categorize_entity(label: str) -> str:
    """Classify an entity label into one of the predefined types."""
    for pattern, entity_type in _ENTITY_TYPE_PATTERNS:
        if pattern.search(label):
            return entity_type
    return "other"


def _sanitize_label(value: str, *, max_length: int = 24) -> str:
    cleaned = _GRAPH_MARKDOWN_ARTIFACTS_RE.sub(" ", value or "")
    cleaned = _GRAPH_WHITESPACE_RE.sub(" ", cleaned).strip(" -_.,:;，。；：")
    # Truncate at word boundary for ASCII, character boundary for CJK
    if len(cleaned) > max_length:
        # Try to cut at a natural boundary
        cut = cleaned[:max_length]
        # If there's a space near the end, cut there
        last_space = cut.rfind(" ")
        if last_space > max_length // 2:
            cut = cut[:last_space]
        cleaned = cut.rstrip() + "..."
    return cleaned


def _canonical_label(value: str) -> str:
    cleaned = _sanitize_label(value, max_length=120)
    cleaned = cleaned.casefold()
    cleaned = _GRAPH_ID_SAFE_RE.sub("", cleaned)
    return cleaned


def _graph_id(prefix: str, value: str) -> str:
    digest = hashlib.sha1(value.encode("utf-8", errors="ignore")).hexdigest()[:16]
    return f"{prefix}:{digest}"


def _parse_source_metadata(metadata: dict[str, Any] | None) -> dict[str, Any]:
    meta = metadata or {}
    raw = meta.get("source_metadata")
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str) and raw.strip():
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            return {}
        if isinstance(parsed, dict):
            return parsed
    return {}


def _iter_sentences(content: str) -> list[str]:
    content = _GRAPH_WHITESPACE_RE.sub(" ", content or "").strip()
    if not content:
        return []
    sentences: list[str] = []
    for part in _GRAPH_SENTENCE_SPLIT_RE.split(content):
        part = part.strip()
        if len(part) < 8:
            continue
        if len(part) > 520:
            for index in range(0, len(part), 360):
                segment = part[index : index + 420].strip()
                if len(segment) >= 8:
                    sentences.append(segment)
        else:
            sentences.append(part)
    return sentences[:80]


def _metadata_title_stem(value: Any) -> str:
    if not isinstance(value, str) or not value.strip():
        return ""
    stem = value.strip().rsplit("/", 1)[-1].rsplit("\\", 1)[-1]
    if "." in stem:
        stem = stem.rsplit(".", 1)[0]
    if "_" in stem:
        prefix, suffix = stem.rsplit("_", 1)
        if re.fullmatch(r"[\u4e00-\u9fff·]{2,6}", suffix.strip()):
            stem = prefix
    return _GRAPH_WHITESPACE_RE.sub(" ", stem).strip()


def _build_title_text(metadata: dict[str, Any] | None) -> str:
    meta = metadata or {}
    source_metadata = _parse_source_metadata(meta)
    title_parts: list[str] = []
    for candidate in (
        meta.get("file_name"),
        source_metadata.get("file_name"),
        meta.get("source"),
        source_metadata.get("source"),
    ):
        stem = _metadata_title_stem(candidate)
        if stem:
            title_parts.append(stem)
            break

    for key in ("heading_title", "section_path"):
        value = meta.get(key) or source_metadata.get(key) or ""
        if isinstance(value, str) and value.strip() and value != "Document Start":
            title_parts.append(value.strip())

    return _GRAPH_WHITESPACE_RE.sub(" ", " ".join(title_parts)).casefold()


def _label_in_title(label: str, title_text: str) -> bool:
    normalized = _GRAPH_WHITESPACE_RE.sub(" ", label or "").strip().casefold()
    if len(normalized) < 2 or not title_text:
        return False
    if _GRAPH_CJK_RE.search(normalized):
        return normalized in title_text
    return bool(re.search(r"\b" + re.escape(normalized) + r"\b", title_text))


def _build_chunk_graph_context(
    chunk_id: str,
    content: str,
    metadata: dict[str, Any] | None,
) -> _ChunkGraphContext:
    normalized_content = content or ""
    normalized_metadata = dict(metadata or {})
    sentences = _iter_sentences(normalized_content)
    snippet = sentences[0][:260] if sentences else normalized_content[:260]
    return _ChunkGraphContext(
        chunk_id=chunk_id,
        content=normalized_content,
        metadata=normalized_metadata,
        file_label=extract_file_label(normalized_metadata),
        snippet=snippet,
        sentences=sentences,
        entities=_extract_entities_from_text(normalized_content),
        title_text=_build_title_text(normalized_metadata),
    )


def _looks_like_noise(label: str) -> bool:
    if not label or len(label) < 2:
        return True
    if len(label) > 80:
        return True
    if label in _TITLECASE_NOISE or label in _CJK_NOISE:
        return True
    lowered = label.casefold()
    if lowered in _EN_STOPWORDS:
        return True
    if re.fullmatch(r"[\d\W_]+", label):
        return True
    cjk_count = len(_GRAPH_CJK_RE.findall(label))
    ascii_count = len(_GRAPH_ASCII_RE.findall(label))
    if cjk_count == 0 and ascii_count == 0:
        return True
    return False


def _entity_score(label: str, *, in_title_case: bool = False) -> float:
    cjk_count = len(_GRAPH_CJK_RE.findall(label))
    ascii_count = len(_GRAPH_ASCII_RE.findall(label))
    digit_count = sum(char.isdigit() for char in label)
    score = min(len(label), 36) / 8
    if cjk_count:
        score += min(cjk_count, 10) * 0.45
    if ascii_count:
        score += min(ascii_count, 18) * 0.16
    if digit_count:
        score += 0.8
    if any(char.isupper() for char in label):
        score += 0.7
    if "-" in label or "_" in label or "/" in label:
        score += 0.7
    if in_title_case:
        score += 1.2
    if len(label.split()) > 1:
        score += 1.0
    return score


def _extract_entities_from_text(text: str, *, max_entities: int = KB_GRAPH_MAX_ENTITIES_PER_CHUNK) -> list[str]:
    candidates: dict[str, tuple[str, float]] = {}

    def add(label: str, score: float) -> None:
        sanitized = _sanitize_label(label)
        if _looks_like_noise(sanitized):
            return
        canonical = _canonical_label(sanitized)
        if not canonical:
            return
        previous = candidates.get(canonical)
        if previous is None or score > previous[1]:
            candidates[canonical] = (sanitized, score)

    for pattern in (_ENTITY_CJK_BRACKET_RE, _ENTITY_PAREN_RE):
        for match in pattern.finditer(text):
            add(match.group(1), _entity_score(match.group(1)) + 2.8)
    for match in _ENTITY_ACRONYM_RE.finditer(text):
        add(match.group(0), _entity_score(match.group(0)) + 2.2)
    for match in _ENTITY_MIXED_RE.finditer(text):
        add(match.group(0), _entity_score(match.group(0)) + 1.5)
    for match in _ENTITY_TITLE_RE.finditer(text):
        label = match.group(0).strip()
        if label in _TITLECASE_NOISE or len(label) <= 2:
            continue
        add(label, _entity_score(label, in_title_case=True))
    for match in _ENTITY_CJK_SUFFIX_RE.finditer(text):
        add(match.group(0), _entity_score(match.group(0)) + 1.8)

    token_counts: Counter[str] = Counter()
    for token in _TOKEN_RE.findall(text):
        token = _sanitize_label(token, max_length=40)
        if _looks_like_noise(token) or token.casefold() in _EN_STOPWORDS:
            continue
        token_counts[token] += 1
    for token, count in token_counts.most_common(30):
        if count >= 2 or len(token) >= 5:
            add(token, _entity_score(token) + min(count, 5) * 0.35)

    ranked = sorted(candidates.values(), key=lambda item: (item[1], len(item[0])), reverse=True)
    return [label for label, _score in ranked[:max_entities]]


def _entities_in_sentence(sentence: str, known_entities: Sequence[str]) -> list[str]:
    seen: set[str] = set()
    entities: list[tuple[int, str]] = []
    for label in known_entities:
        position = sentence.find(label)
        if position < 0:
            continue
        canonical = _canonical_label(label)
        if canonical and canonical not in seen:
            seen.add(canonical)
            entities.append((position, label))
    for label in _extract_entities_from_text(sentence, max_entities=KB_GRAPH_MAX_ENTITIES_PER_SENTENCE):
        position = sentence.find(label)
        if position < 0:
            continue
        canonical = _canonical_label(label)
        if canonical and canonical not in seen:
            seen.add(canonical)
            entities.append((position, label))
    entities.sort(key=lambda item: item[0])
    return [label for _position, label in entities[:KB_GRAPH_MAX_ENTITIES_PER_SENTENCE]]


def _relation_between(sentence: str, source: str, target: str) -> tuple[str, bool] | None:
    source_index = sentence.find(source)
    target_index = sentence.find(target)
    if source_index < 0 or target_index < 0 or source_index == target_index:
        return None
    if target_index < source_index:
        source_index, target_index = target_index, source_index
    between = sentence[source_index + len(source) : target_index]
    window = between[-80:] if len(between) > 80 else between
    for pattern, label, symmetric in _RELATION_PATTERNS:
        if pattern.search(window):
            return label, symmetric
    return None


def _fallback_relation_label(sentence: str) -> str:
    cjk_count = len(_GRAPH_CJK_RE.findall(sentence))
    ascii_count = len(_GRAPH_ASCII_RE.findall(sentence))
    return "相关" if cjk_count >= ascii_count else "related to"


def _extract_chunk_triples(
    content: str,
    *,
    language_mode: str | None = None,
    known_entities: Sequence[str] | None = None,
    sentences: Sequence[str] | None = None,
) -> list[ExtractedTriple]:
    del language_mode
    chunk_entities = list(known_entities) if known_entities is not None else _extract_entities_from_text(content)
    chunk_sentences = list(sentences) if sentences is not None else _iter_sentences(content)
    triples: list[ExtractedTriple] = []
    seen: set[tuple[str, str, str]] = set()

    for sentence in chunk_sentences:
        entities = _entities_in_sentence(sentence, chunk_entities)
        if len(entities) < 2:
            continue
        relation_count = 0
        for left_index, source in enumerate(entities[:-1]):
            for target in entities[left_index + 1 :]:
                inferred = _relation_between(sentence, source, target)
                if inferred is None:
                    if relation_count > 0:
                        continue
                    relation_label = _fallback_relation_label(sentence)
                    symmetric = True
                else:
                    relation_label, symmetric = inferred
                source_key = _canonical_label(source)
                target_key = _canonical_label(target)
                if not source_key or not target_key or source_key == target_key:
                    continue
                triple_key = (
                    min(source_key, target_key) if symmetric else source_key,
                    relation_label.casefold(),
                    max(source_key, target_key) if symmetric else target_key,
                )
                if triple_key in seen:
                    continue
                seen.add(triple_key)
                triples.append(
                    ExtractedTriple(
                        source=source,
                        relation=relation_label,
                        target=target,
                        symmetric=symmetric,
                    )
                )
                relation_count += 1
                if relation_count >= KB_GRAPH_MAX_RELATIONS_PER_SENTENCE:
                    break
            if relation_count >= KB_GRAPH_MAX_RELATIONS_PER_SENTENCE:
                break
    return triples


async def extract_model_assisted_triples(
    entries: Sequence[tuple[str, str, dict[str, Any]]],
    *,
    user_id: UUID,
    kb_path: Path,
    quality_mode: str = "standard",
) -> dict[str, list[ExtractedTriple]]:
    del user_id, kb_path, quality_mode
    return {chunk_id: _extract_chunk_triples(content) for chunk_id, content, _metadata in entries}


def _register_entity(
    entities: dict[str, _EntityStats],
    *,
    label: str,
    chunk_id: str,
    file_label: str,
    snippet: str,
    score: float,
    in_title: bool = False,
) -> str:
    canonical = _canonical_label(label)
    if not canonical:
        return ""
    current = entities.get(canonical)
    if current is None:
        current = _EntityStats(
            label=_sanitize_label(label),
            canonical=canonical,
            entity_type=_categorize_entity(label),
        )
        entities[canonical] = current
    elif len(label) > len(current.label) and label.casefold() != current.label.casefold():
        current.label = _sanitize_label(label)
    # Upgrade type from "other" to a specific category if the new label matches
    if current.entity_type == "other":
        cat = _categorize_entity(label)
        if cat != "other":
            current.entity_type = cat
    if current.chunk_ids is None:
        current.chunk_ids = set()
    if current.file_labels is None:
        current.file_labels = set()
    if current.snippets is None:
        current.snippets = []
    current.mentions += 1
    current.score += score
    if in_title:
        current.title_hits += 1
    current.chunk_ids.add(chunk_id)
    if file_label:
        current.file_labels.add(file_label)
    if snippet and len(current.snippets) < 3:
        current.snippets.append(snippet)
    return canonical


def _register_edge(
    edges: dict[tuple[str, str, str], dict[str, Any]],
    *,
    source: str,
    target: str,
    relation: str,
    symmetric: bool,
    chunk_id: str,
    file_label: str,
) -> None:
    if not source or not target or source == target:
        return
    if symmetric and target < source:
        source, target = target, source
    edge_key = (source, relation.casefold(), target)
    edge = edges.setdefault(
        edge_key,
        {
            "source": source,
            "target": target,
            "label": relation,
            "type": "relation",
            "weight": 0,
            "chunk_ids": set(),
            "file_labels": set(),
            "symmetric": symmetric,
        },
    )
    edge["weight"] += 1
    edge["chunk_ids"].add(chunk_id)
    if file_label:
        edge["file_labels"].add(file_label)


def _node_score(entity: _EntityStats, degree: int, edge_weight: int) -> float:
    return (
        entity.score
        + entity.mentions * 1.8
        + len(entity.chunk_ids or set()) * 2.4
        + len(entity.file_labels or set()) * 1.3
        + degree * 3.5
        + edge_weight * 0.7
        + entity.title_hits * 4.0
    )


def _finalize_node(entity: _EntityStats, *, degree: int, edge_weight: int) -> KnowledgeGraphNode:
    score = _node_score(entity, degree, edge_weight)
    weight = max(1, min(100, round(score)))
    chunk_ids = sorted(entity.chunk_ids or set())
    file_labels = sorted(entity.file_labels or set())
    return KnowledgeGraphNode(
        id=_graph_id("entity", entity.canonical),
        label=entity.label,
        type=entity.entity_type,
        weight=weight,
        chunk_ids=chunk_ids[:24],
        metadata={
            "mentions": entity.mentions,
            "degree": degree,
            "importance": round(score, 2),
            "chunks_count": len(chunk_ids),
            "files_count": len(file_labels),
            "file_labels": file_labels[:12],
            "snippets": (entity.snippets or [])[:3],
            "title_hits": entity.title_hits,
        },
    )


def _finalize_edge(edge: dict[str, Any], canonical_to_id: dict[str, str]) -> KnowledgeGraphEdge | None:
    source_id = canonical_to_id.get(edge["source"])
    target_id = canonical_to_id.get(edge["target"])
    if not source_id or not target_id or source_id == target_id:
        return None
    chunk_ids = sorted(edge["chunk_ids"])
    file_labels = sorted(edge["file_labels"])
    label = _sanitize_label(edge["label"], max_length=48) or "related to"
    return KnowledgeGraphEdge(
        id=_graph_id("edge", f"{source_id}|{label}|{target_id}"),
        source=source_id,
        target=target_id,
        type="relation",
        label=label,
        weight=max(1, int(edge["weight"])),
        chunk_ids=chunk_ids[:24],
        metadata={
            "mentions": int(edge["weight"]),
            "files_count": len(file_labels),
            "file_labels": file_labels[:12],
            "symmetric": bool(edge.get("symmetric")),
        },
    )


def _register_context_entity(
    entities: dict[str, _EntityStats],
    context: _ChunkGraphContext,
    label: str,
    *,
    score_bonus: float = 0.0,
) -> str:
    return _register_entity(
        entities,
        label=label,
        chunk_id=context.chunk_id,
        file_label=context.file_label,
        snippet=context.snippet,
        score=_entity_score(label) + score_bonus,
        in_title=_label_in_title(label, context.title_text),
    )


def _register_context_entities(
    entities: dict[str, _EntityStats],
    context: _ChunkGraphContext,
) -> None:
    for label in context.entities:
        _register_context_entity(entities, context, label)


def _register_context_triples(
    entities: dict[str, _EntityStats],
    edges: dict[tuple[str, str, str], dict[str, Any]],
    context: _ChunkGraphContext,
    triples: Sequence[ExtractedTriple],
) -> None:
    for triple in triples:
        source = _register_context_entity(entities, context, triple.source, score_bonus=1.2)
        target = _register_context_entity(entities, context, triple.target, score_bonus=1.2)
        _register_edge(
            edges,
            source=source,
            target=target,
            relation=triple.relation,
            symmetric=triple.symmetric,
            chunk_id=context.chunk_id,
            file_label=context.file_label,
        )


def _build_graph_topology(
    entities: dict[str, _EntityStats],
    edges: dict[tuple[str, str, str], dict[str, Any]],
) -> _GraphTopology:
    degree_by_entity: Counter[str] = Counter()
    edge_weight_by_entity: Counter[str] = Counter()
    adjacency: dict[str, list[dict[str, Any]]] = {entity.canonical: [] for entity in entities.values()}
    for edge in edges.values():
        degree_by_entity[edge["source"]] += 1
        degree_by_entity[edge["target"]] += 1
        edge_weight_by_entity[edge["source"]] += int(edge["weight"])
        edge_weight_by_entity[edge["target"]] += int(edge["weight"])
        adjacency.setdefault(edge["source"], []).append(edge)
        adjacency.setdefault(edge["target"], []).append(edge)

    importance_by_entity = {
        entity.canonical: _node_score(
            entity,
            degree_by_entity[entity.canonical],
            edge_weight_by_entity[entity.canonical],
        )
        for entity in entities.values()
    }
    return _GraphTopology(
        degree_by_entity=degree_by_entity,
        edge_weight_by_entity=edge_weight_by_entity,
        adjacency=adjacency,
        importance_by_entity=importance_by_entity,
    )


def _rank_entities(
    entities: dict[str, _EntityStats],
    topology: _GraphTopology,
) -> list[_EntityStats]:
    return sorted(
        entities.values(),
        key=lambda entity: (
            topology.importance_by_entity[entity.canonical],
            entity.mentions,
            entity.label,
        ),
        reverse=True,
    )


def _resolve_graph_limits(max_nodes: int | None, max_edges: int | None) -> tuple[int, int]:
    return max_nodes or KB_GRAPH_TARGET_MAX_NODES, max_edges or KB_GRAPH_MAX_EDGES


def _resolve_keep_limit(total_entities: int, max_nodes: int) -> int:
    return min(max_nodes, max(KB_GRAPH_TARGET_MIN_NODES, total_entities))


def _select_kept_entities(
    ranked_entities: Sequence[_EntityStats],
    *,
    graph_mode: str,
    keep_limit: int,
    entities: dict[str, _EntityStats],
    topology: _GraphTopology,
) -> tuple[list[_EntityStats], set[str]]:
    if graph_mode != KB_GRAPH_MODE_GENERIC_ENTITY or len(ranked_entities) <= keep_limit:
        kept_entities = list(ranked_entities[:keep_limit])
        return kept_entities, {entity.canonical for entity in kept_entities}

    seed_count = min(max(30, keep_limit // 2), keep_limit)
    keep_canonicals = {entity.canonical for entity in ranked_entities[:seed_count]}
    frontier = list(ranked_entities[:seed_count])
    while frontier and len(keep_canonicals) < keep_limit:
        next_frontier: list[_EntityStats] = []
        for entity in frontier:
            candidate_edges = sorted(
                topology.adjacency.get(entity.canonical, []),
                key=lambda edge: (
                    int(edge["weight"]),
                    topology.importance_by_entity.get(edge["source"], 0.0)
                    + topology.importance_by_entity.get(edge["target"], 0.0),
                ),
                reverse=True,
            )
            for edge in candidate_edges:
                for peer in (edge["source"], edge["target"]):
                    if peer == entity.canonical or peer in keep_canonicals:
                        continue
                    peer_entity = entities.get(peer)
                    if peer_entity is None:
                        continue
                    keep_canonicals.add(peer)
                    next_frontier.append(peer_entity)
                    if len(keep_canonicals) >= keep_limit:
                        break
                if len(keep_canonicals) >= keep_limit:
                    break
            if len(keep_canonicals) >= keep_limit:
                break
        frontier = next_frontier

    if len(keep_canonicals) < keep_limit:
        for entity in ranked_entities:
            keep_canonicals.add(entity.canonical)
            if len(keep_canonicals) >= keep_limit:
                break

    return [entity for entity in ranked_entities if entity.canonical in keep_canonicals], keep_canonicals


def _select_core_canonicals(
    kept_entities: Sequence[_EntityStats],
    topology: _GraphTopology,
) -> set[str]:
    if not kept_entities:
        return set()
    kept_by_importance = sorted(
        kept_entities,
        key=lambda entity: (
            topology.importance_by_entity[entity.canonical],
            entity.title_hits,
            topology.degree_by_entity[entity.canonical],
        ),
        reverse=True,
    )
    max_importance = topology.importance_by_entity[kept_by_importance[0].canonical]
    importance_threshold = max_importance * 0.5
    core_canonicals: set[str] = set()
    for entity in kept_by_importance:
        if len(core_canonicals) >= 3:
            break
        importance = topology.importance_by_entity[entity.canonical]
        degree = topology.degree_by_entity[entity.canonical]
        if importance >= importance_threshold and degree >= 5:
            core_canonicals.add(entity.canonical)
    return core_canonicals


def _build_graph_nodes(
    kept_entities: Sequence[_EntityStats],
    entities: dict[str, _EntityStats],
    topology: _GraphTopology,
    core_canonicals: set[str],
) -> tuple[list[KnowledgeGraphNode], dict[str, str]]:
    canonical_to_id: dict[str, str] = {}
    nodes: list[KnowledgeGraphNode] = []
    for entity in kept_entities:
        node = _finalize_node(
            entity,
            degree=topology.degree_by_entity[entity.canonical],
            edge_weight=topology.edge_weight_by_entity[entity.canonical],
        )
        metadata = dict(node.metadata)
        metadata["importance_score"] = round(topology.importance_by_entity[entity.canonical], 3)
        metadata["is_core"] = entity.canonical in core_canonicals
        local_preview = []
        for edge in sorted(
            topology.adjacency.get(entity.canonical, []),
            key=lambda item: (int(item["weight"]), item["label"]),
            reverse=True,
        )[:12]:
            peer_canonical = edge["target"] if edge["source"] == entity.canonical else edge["source"]
            peer_entity = entities.get(peer_canonical)
            if peer_entity is None:
                continue
            local_preview.append(
                {
                    "relation": edge["label"],
                    "peer_id": _graph_id("entity", peer_canonical),
                    "peer_label": peer_entity.label,
                    "weight": int(edge["weight"]),
                }
            )
        metadata["local_relations_preview"] = local_preview
        node.metadata = metadata
        canonical_to_id[entity.canonical] = node.id
        nodes.append(node)
    return nodes, canonical_to_id


def _select_graph_edges(
    edges: dict[tuple[str, str, str], dict[str, Any]],
    *,
    keep_canonicals: set[str],
    max_edges: int,
    canonical_to_id: dict[str, str],
    topology: _GraphTopology,
) -> tuple[list[KnowledgeGraphEdge], bool]:
    retained_edge_payloads = [
        edge for edge in edges.values() if edge["source"] in keep_canonicals and edge["target"] in keep_canonicals
    ]
    retained_edge_payloads.sort(
        key=lambda edge: (
            int(edge["weight"]) * 5
            + len(edge["chunk_ids"]) * 2
            + topology.degree_by_entity[edge["source"]]
            + topology.degree_by_entity[edge["target"]],
            edge["label"],
        ),
        reverse=True,
    )
    graph_edges = [
        finalized
        for edge in retained_edge_payloads[:max_edges]
        if (finalized := _finalize_edge(edge, canonical_to_id)) is not None
    ]
    return graph_edges, len(retained_edge_payloads) > max_edges


def _sort_graph_nodes(
    nodes: list[KnowledgeGraphNode],
    graph_edges: Sequence[KnowledgeGraphEdge],
) -> list[KnowledgeGraphNode]:
    connected_ids = {edge.source for edge in graph_edges} | {edge.target for edge in graph_edges}
    if connected_ids:
        isolated_nodes = [node for node in nodes if node.id not in connected_ids]
        connected_nodes = [node for node in nodes if node.id in connected_ids]
        nodes = connected_nodes + isolated_nodes
    nodes.sort(
        key=lambda node: (
            float(node.metadata.get("importance_score", 0)),
            node.weight,
            len(node.chunk_ids),
            node.label,
        ),
        reverse=True,
    )
    return nodes


def build_knowledge_graph_response(
    entries: Sequence[tuple[str, str, dict[str, Any]]],
    *,
    matched_chunks: int,
    total_files: int,
    truncated: bool,
    full_graph: bool = False,
    graph_mode: str = KB_GRAPH_MODE_DEFAULT,
    max_nodes: int | None = None,
    max_edges: int | None = None,
    precomputed_triples_by_chunk: dict[str, list[ExtractedTriple]] | None = None,
) -> KnowledgeGraphResponse:
    del full_graph
    entities: dict[str, _EntityStats] = {}
    edges: dict[tuple[str, str, str], dict[str, Any]] = {}
    triple_map = precomputed_triples_by_chunk or {}

    for chunk_id, content, metadata in entries:
        context = _build_chunk_graph_context(chunk_id, content, metadata)
        _register_context_entities(entities, context)
        triples = triple_map.get(context.chunk_id) or _extract_chunk_triples(
            context.content,
            known_entities=context.entities,
            sentences=context.sentences,
        )
        _register_context_triples(entities, edges, context, triples)

    if not entities:
        return KnowledgeGraphResponse(
            matched_chunks=matched_chunks,
            included_chunks=len(entries),
            total_files=total_files,
            total_entities=0,
            total_relations=0,
            total_topics=0,
            total_tags=0,
            truncated=truncated,
        )

    topology = _build_graph_topology(entities, edges)
    ranked_entities = _rank_entities(entities, topology)
    total_entities = len(ranked_entities)
    resolved_max_nodes, resolved_max_edges = _resolve_graph_limits(max_nodes, max_edges)
    keep_limit = _resolve_keep_limit(total_entities, resolved_max_nodes)
    kept_entities, keep_canonicals = _select_kept_entities(
        ranked_entities,
        graph_mode=graph_mode,
        keep_limit=keep_limit,
        entities=entities,
        topology=topology,
    )

    response_truncated = truncated or len(ranked_entities) > len(kept_entities)
    core_canonicals = _select_core_canonicals(kept_entities, topology)
    nodes, canonical_to_id = _build_graph_nodes(
        kept_entities,
        entities,
        topology,
        core_canonicals,
    )
    graph_edges, edges_truncated = _select_graph_edges(
        edges,
        keep_canonicals=keep_canonicals,
        max_edges=resolved_max_edges,
        canonical_to_id=canonical_to_id,
        topology=topology,
    )
    nodes = _sort_graph_nodes(nodes, graph_edges)

    return KnowledgeGraphResponse(
        nodes=nodes,
        edges=graph_edges,
        matched_chunks=matched_chunks,
        included_chunks=len(entries),
        total_files=total_files,
        total_entities=total_entities,
        total_relations=len(edges),
        total_topics=0,
        total_tags=0,
        truncated=response_truncated or edges_truncated,
    )


def build_graph_cache_signature(
    *,
    full_graph: bool,
    quality_mode: str,
    graph_mode: str,
    search: str,
    source_type: str | None,
    file_name: str | None,
    job_id: str | None,
    metadata_filter_dict: dict[str, list[str]] | None,
    chunk_ids: Sequence[str] | None,
    sample_limit: int | None,
    max_nodes: int | None,
    max_edges: int | None,
) -> str:
    payload = {
        "full_graph": bool(full_graph),
        "quality_mode": quality_mode,
        "graph_mode": graph_mode,
        "search": (search or "").strip(),
        "source_type": source_type or "",
        "file_name": file_name or "",
        "job_id": job_id or "",
        "metadata_filter": {
            key: sorted(str(value) for value in values) for key, values in sorted((metadata_filter_dict or {}).items())
        },
        "chunk_ids": sorted(str(chunk_id) for chunk_id in (chunk_ids or [])),
        "sample_limit": sample_limit,
        "max_nodes": max_nodes,
        "max_edges": max_edges,
        "version": KB_GRAPH_PERSISTED_CACHE_VERSION,
    }
    normalized = json.dumps(payload, sort_keys=True, ensure_ascii=False)
    return hashlib.sha1(normalized.encode("utf-8", errors="ignore")).hexdigest()


def build_graph_cache_fingerprint(kb_path: Path) -> str:
    metadata_path = kb_path / "embedding_metadata.json"
    hasher = hashlib.sha1()
    hasher.update(str(KB_GRAPH_PERSISTED_CACHE_VERSION).encode("utf-8"))
    if metadata_path.exists():
        stat = metadata_path.stat()
        hasher.update(str(stat.st_mtime_ns).encode("utf-8"))
        hasher.update(str(stat.st_size).encode("utf-8"))
        try:
            hasher.update(metadata_path.read_bytes())
        except OSError:
            pass
    else:
        hasher.update(str(kb_path).encode("utf-8"))
    return hasher.hexdigest()


def _get_full_graph_cache_path(kb_path: Path) -> Path:
    return kb_path / KB_GRAPH_FULL_CACHE_FILE


def _get_full_graph_cache_lock_path(kb_path: Path) -> Path:
    return kb_path / KB_GRAPH_FULL_CACHE_LOCK_FILE


def load_persisted_graph_cache(
    kb_path: Path,
    *,
    signature: str,
    fingerprint: str,
) -> KnowledgeGraphResponse | None:
    cache_path = _get_full_graph_cache_path(kb_path)
    if not cache_path.exists():
        return None
    lock = FileLock(str(_get_full_graph_cache_lock_path(kb_path)))
    with lock:
        try:
            payload = json.loads(cache_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return None
    if payload.get("version") != KB_GRAPH_PERSISTED_CACHE_VERSION:
        return None
    entries = payload.get("entries", {})
    if not isinstance(entries, dict):
        return None
    entry = entries.get(signature)
    if not isinstance(entry, dict) or entry.get("fingerprint") != fingerprint:
        return None
    response_payload = entry.get("response")
    if not isinstance(response_payload, dict):
        return None
    try:
        return KnowledgeGraphResponse(**response_payload)
    except Exception:
        return None


def persist_graph_cache(
    kb_path: Path,
    *,
    signature: str,
    fingerprint: str,
    response: KnowledgeGraphResponse,
) -> None:
    cache_path = _get_full_graph_cache_path(kb_path)
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    lock = FileLock(str(_get_full_graph_cache_lock_path(kb_path)))
    with lock:
        if cache_path.exists():
            try:
                payload = json.loads(cache_path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                payload = {}
        else:
            payload = {}
        if payload.get("version") != KB_GRAPH_PERSISTED_CACHE_VERSION:
            payload = {"version": KB_GRAPH_PERSISTED_CACHE_VERSION, "entries": {}}
        entries = payload.setdefault("entries", {})
        if not isinstance(entries, dict):
            entries = {}
            payload["entries"] = entries
        entries[signature] = {
            "fingerprint": fingerprint,
            "response": response.model_dump(),
        }
        while len(entries) > KB_GRAPH_FULL_CACHE_MAX_ENTRIES:
            oldest_key = next(iter(entries), None)
            if oldest_key is None:
                break
            entries.pop(oldest_key, None)
        temp_path = cache_path.with_suffix(cache_path.suffix + ".tmp")
        temp_path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
        temp_path.replace(cache_path)


def extract_chunk_identifier(metadata: dict[str, Any] | None) -> str:
    meta = metadata or {}
    raw = meta.get("_id") or meta.get("id") or meta.get("chunk_id")
    return str(raw) if raw else ""


def build_chunk_identifier(
    metadata: dict[str, Any] | None,
    content: str = "",
) -> str:
    raw = extract_chunk_identifier(metadata)
    if raw:
        return raw
    meta = metadata or {}
    seed_parts = [
        str(meta.get("file_name") or ""),
        str(meta.get("chunk_index") or ""),
        str(meta.get("heading_title") or ""),
        str(meta.get("section_path") or ""),
        (content or "")[:120],
    ]
    return _graph_id("chunk", "|".join(seed_parts))


def extract_file_label(metadata: dict[str, Any] | None) -> str:
    meta = metadata or {}
    source_metadata = _parse_source_metadata(meta)
    candidates = (
        meta.get("file_name"),
        source_metadata.get("file_name"),
        meta.get("source"),
    )
    for candidate in candidates:
        if isinstance(candidate, str) and candidate.strip():
            return _sanitize_label(candidate, max_length=64)
    return "Untitled source"


def parse_kb_metadata_filters(request: Request) -> dict[str, list[str]]:
    metadata_filter_dict: dict[str, list[str]] = {}
    for key, value in request.query_params.multi_items():
        if not key.startswith("meta_"):
            continue
        metadata_key = key[len("meta_") :]
        if metadata_key:
            metadata_filter_dict.setdefault(metadata_key, []).append(value)
    return metadata_filter_dict


def build_kb_chunk_matcher(
    *,
    search_term: str = "",
    source_type: str | None = None,
    file_name: str | None = None,
    job_id: str | None = None,
    metadata_filter_dict: dict[str, list[str]] | None = None,
    chunk_ids: set[str] | None = None,
) -> Callable[[dict[str, Any] | None, str], bool]:
    search_term = search_term.strip().lower()
    metadata_filter_dict = metadata_filter_dict or {}
    chunk_ids = {chunk_id for chunk_id in (chunk_ids or set()) if chunk_id}

    def _user_metadata_matches(meta: dict[str, Any]) -> bool:
        if not metadata_filter_dict:
            return True
        raw = meta.get("source_metadata")
        if not raw:
            return False
        try:
            stored = json.loads(raw) if isinstance(raw, str) else raw
        except json.JSONDecodeError:
            return False
        if not isinstance(stored, dict):
            return False
        for key, expected_values in metadata_filter_dict.items():
            actual = stored.get(key)
            if actual is None:
                return False
            actual_set = {str(entry) for entry in actual} if isinstance(actual, list) else {str(actual)}
            expected_set = {str(value) for value in expected_values}
            if not actual_set & expected_set:
                return False
        return True

    def _matches(metadata: dict[str, Any] | None, content: str) -> bool:
        meta = metadata or {}
        if chunk_ids:
            entry_id = build_chunk_identifier(meta, content)
            if entry_id not in chunk_ids:
                return False
        if source_type and meta.get("source_type") != source_type:
            return False
        if file_name and extract_file_label(meta) != file_name:
            return False
        if job_id and meta.get("job_id") != job_id:
            return False
        if not _user_metadata_matches(meta):
            return False
        return not (search_term and search_term not in (content or "").lower())

    return _matches


def get_graph_preview_scan_limit(sample_limit: int | None, *, full_graph: bool = False) -> int | None:
    if sample_limit is None or full_graph:
        return sample_limit
    return max(
        sample_limit,
        min(
            KB_GRAPH_PREVIEW_MAX_SCAN_LIMIT,
            max(KB_GRAPH_PREVIEW_MIN_SCAN_LIMIT, sample_limit * KB_GRAPH_PREVIEW_SCAN_MULTIPLIER),
        ),
    )


def select_knowledge_graph_sample_entries(
    entries: Sequence[tuple[str, str, dict[str, Any]]],
    *,
    sample_limit: int | None,
    full_graph: bool = False,
) -> list[tuple[str, str, dict[str, Any]]]:
    if sample_limit is None or full_graph or len(entries) <= sample_limit:
        return list(entries)

    ranked = sorted(
        entries,
        key=lambda entry: (
            len(_extract_chunk_triples(entry[1])),
            len(_extract_entities_from_text(entry[1])),
            len(entry[1] or ""),
        ),
        reverse=True,
    )
    return ranked[:sample_limit]

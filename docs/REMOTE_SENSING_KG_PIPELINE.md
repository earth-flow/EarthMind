# Remote Sensing KG Pipeline

## Scope
This pipeline is designed for remote sensing Earth observation materials:
- papers
- project reports
- scholar profiles
- institute introductions
- dataset descriptions
- satellite / sensor / mission briefs

## Text cleaning
1. Parse source documents into structured blocks.
2. Keep title, abstract, headings, captions, affiliations, funding, dataset mentions, project mentions.
3. Remove page numbers, repeated headers/footers, citation-only fragments, formula-only fragments, reference-only lines.
4. Normalize whitespace, punctuation, and bilingual alias forms.
5. Preserve domain strings such as `Sentinel-2`, `GF-6`, `SAR`, `NDVI`, `FAIR1M`, `RSCLIP`.

## Entity recognition
Use hybrid extraction.

### Rule-first entities
High-value dictionaries and patterns should cover:
- satellite series and satellites
- sensors and platforms
- remote sensing models and model families
- institutes and labs
- scholars
- datasets
- projects and programs
- companies
- products and variables
- band / index entities
- tasks and application domains

### LLM补全
Use zero-shot extraction only for long-tail entities not caught by rules.
LLM output must be constrained by controlled types and relations.

## Relation extraction
1. Run pattern-based relation detection first.
2. Run LLM constrained triple extraction per chunk.
3. Post-process all triples with remote-sensing controlled vocabulary.
4. Coerce weak generic relations into ontology-safe relations where context is sufficient.

## Entity disambiguation
1. Canonicalize names.
2. Merge aliases.
3. Validate type consistency.
4. Use document metadata such as year, affiliation, project, dataset source.
5. If ambiguity remains, keep separate entities and mark low confidence.

## Controlled remote sensing relations
Preferred vocabulary:
- 获取
- 观测
- 指示
- 表征
- 用于
- 分类
- 分割
- 检测
- 来源于
- 计算得到
- 融合
- 验证于
- 对比

## Hub-oriented graph assembly
1. Aggregate entity mention counts and relation counts.
2. Score hub importance by weighted degree + source diversity.
3. Promote a small set of hub nodes such as:
- high-resolution satellite series
- Transformer remote sensing model families
- top institutes / labs
4. Attach secondary nodes around hubs to form a radial graph.

## Front-end display goal
- multiple hub nodes
- radial star topology
- category colors
- relation-colored links
- lightweight JSON-driven rendering
- no graph database

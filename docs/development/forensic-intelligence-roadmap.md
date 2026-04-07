# Forensic Intelligence Roadmap

## Goal

Expand Veritas from a strong narrative and actor analysis platform into a full forensic investigation system that can:

- start from explicit evidence seeds, not just search queries
- build durable project and case dossiers
- extract and compare wallets, domains, socials, channels, contracts, and actors
- apply reusable mental models or investigative tradecraft to a live dossier
- surface cross-project overlap and likely operator linkage
- support high-confidence scam and influence-operation demos with evidence-first reporting

## Primary Demo Targets

- `Rexas Finance`
- `Dawgz.ai`

The near-term demo objective is not just "show suspicious chatter." It is:

1. ingest known evidence and historical discussion
2. build a structured dossier for each project
3. surface overlap in promoters, infrastructure, wallets, and claims
4. apply an extracted scam-sleuth mental model to score suspicious signals
5. produce a clear, evidence-backed case report

## Product Tracks

### 1. Evidence Intake

Turn investigations into containers for explicit starting evidence.

Sources:

- YouTube URLs
- websites / landing pages
- X / Reddit / Telegram / Threads / Bluesky post URLs
- PDFs / docs / whitepapers
- wallet addresses
- contract addresses
- domains
- manual notes / hypotheses

Required capabilities:

- persist evidence seeds on an investigation
- classify seed type and status
- capture fetched text, metadata, extracted entities, and provenance
- pin high-value evidence so later analysis can reference it directly

### 2. Structured Forensic Extraction

Extract entities and infrastructure from all seed and scan text.

Targets:

- wallets
- contracts
- token tickers
- domains
- invite links
- social handles
- repos / orgs
- emails / contact channels
- quoted claims
- named projects / protocols / entities

Required capabilities:

- normalized entity extraction across posts, transcripts, descriptions, sites, and docs
- canonicalization and deduplication
- evidence-to-entity traceability

### 3. Dossier System

Create first-class case objects beyond raw investigations.

Dossier types:

- project dossier
- actor dossier
- evidence dossier
- mental model dossier

Project dossier contents:

- names and aliases
- official socials and discovered platform accounts
- domains and site snapshots
- wallets and contracts
- promoters and repeat amplifiers
- evidence bundle
- claims, refutations, and open leads
- overlap links to other dossiers

### 4. Cross-Project Overlap Engine

Compare dossiers and score likely shared operators.

Overlap dimensions:

- wallets and downstream recipients
- contracts and deployers
- domains, registrar, hosting, page structure
- repeated promoter accounts
- same channels, docs, or bios
- linguistic and copy-pattern similarity
- same external explainer / warning sources

Outputs:

- overlap score
- top shared evidence
- unresolved ambiguity list
- confidence and reasons

### 5. On-Chain Correlation

Move from single-address evidence lookup to actual linkage analysis.

Required capabilities:

- wallet graph expansion
- transfer-path clustering
- common recipient detection
- deployer / treasury / funding path inference
- token-pair and liquidity history context
- address labeling and attribution notes

Non-goal for the first pass:

- full generalized blockchain analytics platform

Goal for first pass:

- enough wallet and contract correlation to support case reports about likely shared operators or suspicious fund paths

### 6. Mental Model / Tradecraft Extraction

Create a new feature family distinct from MAGI profiles.

Purpose:

- model how a person or group thinks in a domain
- capture repeatable heuristics and decision rules
- apply those heuristics to a dossier

Examples:

- crypto scam sleuth model
- geopolitical professor model
- intelligence analyst model
- activist / propagandist playbook model

Mental model contents:

- domain
- core theses
- heuristics
- decision rules
- preferred evidence types
- workflow steps
- signature phrases
- confidence thresholds
- blind spots
- example applications

### 7. Applied Lens

Apply a mental model to a case dossier.

Examples:

- apply Net Crypto scam heuristics to Rexas
- compare default Veritas model vs extracted sleuth model
- apply geopolitical game-theory lens to a narrative cluster

Outputs:

- matched heuristics
- missing evidence needed by that model
- model-specific risk score
- disagreements between lenses

### 8. Evidence Graph and Reporting

Visual and report layer for operator-facing use.

Evidence graph nodes:

- dossiers
- evidence seeds
- wallets
- domains
- channels
- handles
- claims
- contracts

Edge types:

- `promoted_by`
- `links_to`
- `controlled_by`
- `funds_to`
- `shares_infrastructure_with`
- `same_promoter_as`
- `cites`
- `supports_claim`
- `contradicts_claim`

Reports must be:

- evidence-first
- bounded in language
- explicit about confidence
- clear about what is inferred vs directly observed

## Current Strengths

- custom historical time windows already exist
- investigation pipeline already supports actor, coordination, credibility, bot, and identity analysis
- YouTube transcript ingestion already exists via `yt-dlp`
- claim verification already includes Etherscan and DexScreener adapters
- Sherlock-based cross-platform discovery now has tiered output

## Main Gaps

- no first-class evidence seed system
- no first-class project dossier
- no overlap engine across projects
- no wallet-flow / cluster analysis
- no direct "apply mental model to dossier" system
- no evidence graph centered on projects and infrastructure

## Build Phases

## Phase 0. Foundation and Tracking

Deliverables:

- roadmap doc
- milestone checklist
- investigation evidence seed schema
- basic evidence seed API

Success criteria:

- an investigation can store explicit evidence sources and metadata

## Phase 1. Evidence Intake

Deliverables:

- URL and manual evidence seed ingestion
- typed seeds for video, site, wallet, contract, post, note
- fetched content persistence
- extraction pipeline kickoff from seeds

Success criteria:

- a user can attach the Rexas explainer video and other source links directly to an investigation

## Phase 2. Extraction and Normalization

Deliverables:

- wallet / contract / domain / handle extraction across seeds and posts
- canonical entity normalization
- evidence-to-entity linkage

Success criteria:

- the system can produce a structured list of candidate wallets, domains, socials, and contracts from dossier evidence

## Phase 3. Project Dossiers

Deliverables:

- project dossier schema and repository
- dossier creation from investigations and evidence
- dossier compare primitive

Success criteria:

- `Rexas Finance` and `Dawgz.ai` can each be represented as durable dossiers

## Phase 4. Overlap Analysis

Deliverables:

- overlap scoring engine
- explanations for why two dossiers overlap
- UI panel or report block for shared infrastructure / actors / wallets

Success criteria:

- operator can compare two dossiers and see ranked overlap evidence

## Phase 5. On-Chain Correlation

Deliverables:

- wallet graph expansion service
- cluster and common-recipient heuristics
- transaction-path reporting

Success criteria:

- system can move beyond single-address inspection and make evidence-backed linkage claims

## Phase 6. Mental Models

Deliverables:

- mental model schema
- extraction pipeline from repeated content sources
- model application engine

Success criteria:

- a YouTube investigator's scam heuristics can be extracted and applied to a project dossier

## Phase 7. Evidence Graph and Reports

Deliverables:

- graph visualization for dossiers and evidence
- case report templates
- operator-ready export

Success criteria:

- end-to-end demo produces a coherent evidence-backed investigation report

## Implementation Order

1. investigation evidence seeds
2. seed ingestion for URL/manual inputs
3. extraction + normalization
4. project dossier schema
5. overlap engine
6. wallet-flow analysis
7. mental model extraction
8. applied lens
9. evidence graph and reporting

## Progress Checklist

### Phase 0

- [x] Create tracked roadmap doc
- [x] Add investigation evidence seed schema
- [x] Add evidence seed API
- [x] Add client types and API methods

### Phase 1

- [x] Add seed ingestion for YouTube URLs
- [x] Add seed ingestion for websites and article URLs
- [x] Add manual wallet / contract / domain seeds
- [x] Persist fetched seed content and extraction status

### Phase 2

- [x] Add normalized wallet extraction
- [x] Add normalized contract extraction
- [x] Add normalized domain extraction
- [x] Add normalized handle extraction
- [x] Link extracted entities back to evidence sources

### Phase 3

- [x] Create project dossier schema
- [x] Build dossier assembly service
- [x] Attach evidence bundles to dossiers

### Phase 4

- [x] Build overlap scoring engine
- [x] Compare shared promoters
- [x] Compare shared wallets / contracts / domains
- [x] Generate overlap explanation blocks

### Phase 5

- [ ] Build wallet graph expansion service
- [x] Add common recipient / fund path heuristics
- [ ] Add cluster confidence scoring
- [x] Add operator-facing on-chain summary

Current phase note:

- first-pass dossier-level on-chain correlation now summarizes analyzed addresses, shared counterparties, and token contract touchpoints via Etherscan-backed enrichment
- deeper wallet graph expansion and stronger clustering confidence are still outstanding

### Phase 6

- [ ] Create mental model schema
- [ ] Extract recurring heuristics from source content
- [ ] Add "apply model to dossier" scoring
- [ ] Add model comparison support

### Phase 7

- [ ] Build evidence graph view
- [ ] Build dossier comparison report
- [ ] Build scam-case report export

## Notes

- Use evidence-first language. The system should distinguish direct observation from inferred linkage.
- Do not treat username overlap alone as identity proof.
- Transcript-first YouTube analysis is sufficient for now; full audio/video semantics are not a first-pass requirement.
- Wallet and domain correlation will provide more demo value than multimodal expansion in the short term.

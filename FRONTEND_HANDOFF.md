# Sentinel Frontend Handoff

This document explains the frontend that powers the current Sentinel demo: the UI shell, libraries, pages, graphs, visualizations, theming, state management, and the backend contract it expects.

The goal is simple: if someone wants to keep this frontend and connect it to a different backend, they should be able to do that from this document.

## 1. What This Frontend Is

The active frontend is the root Vite + React app in `src/`.

It is a Bloomberg-terminal-style operations dashboard for financial complaint intelligence. The UI is intentionally dense, compact, and operational rather than consumer-friendly.

Core characteristics:
- Dark-first command-center UI with full light-theme parity
- Sidebar + topbar shell with dense panels, tables, and charts
- Strong emphasis on explainability, auditability, and triage workflows
- Hybrid data model:
  - live backend data
  - CFPB proxy data
  - synthetic fallback data
  - DeepSeek-generated demo data

Out of scope for this handoff:
- The older app under `fintech/frontend/`

## 2. Tech Stack

From `package.json`:

### Runtime libraries
- `react` `^19.2.4`
- `react-dom` `^19.2.4`
- `react-router-dom` `^7.14.1`
- `recharts` `^3.8.1`
- `zustand` `^5.0.12`

### Tooling / build
- `vite` `^8.0.4`
- `typescript` `~6.0.2`
- `@vitejs/plugin-react` `^6.0.1`
- `tailwindcss` `^4.2.2`
- `@tailwindcss/vite` `^4.2.2`
- ESLint stack for linting

### Important note on styling
Tailwind is installed, but this UI is not built as a heavy utility-class Tailwind app.

The visual system is primarily driven by:
- semantic CSS variables in `src/styles/globals.css`
- reusable panel/button/table classes
- inline component styles for dense, page-specific layout control

## 3. App Structure

### Entry points
- `src/main.tsx`
- `src/App.tsx`

### Shell and layout
- `src/components/layout/AppShell.tsx`
- `src/components/layout/Sidebar.tsx`
- `src/components/layout/Topbar.tsx`

### State and contracts
- `src/store/index.ts`

### API layer
- `src/services/api.ts`

### Hooks
- `src/hooks/useBackendData.ts`
- `src/hooks/useCfpbData.ts`
- `src/hooks/useSyntheticFeed.ts`

### Shared constants and synthetic data
- `src/constants.ts`
- `src/data/synthetic.ts`
- `src/services/deepseek.ts`

### Pages
- `src/pages/Dashboard.tsx`
- `src/pages/LiveFeed.tsx`
- `src/pages/Explorer.tsx`
- `src/pages/Analysis.tsx`
- `src/pages/Analyze.tsx`
- `src/pages/Complaints.tsx`
- `src/pages/AuditTrail.tsx`
- `src/pages/EnforcementRadar.tsx`
- `src/pages/InstitutionMonitor.tsx`
- `src/pages/Docs.tsx`

### Charts / visualization components
- `src/components/charts/StateHeatmap.tsx`

### Public assets
- `public/favicon.svg`
- `public/icons.svg`

## 4. Routing and Navigation

The route map is defined in `src/App.tsx`.

### Primary routes
- `/` -> `Dashboard`
- `/live` -> `LiveFeed`
- `/explorer` -> `Explorer`
- `/analysis` -> `Analysis`
- `/enforcement` -> `EnforcementRadar`
- `/institutions` -> `InstitutionMonitor`
- `/analyze` -> `Analyze`
- `/complaints` -> `Complaints`
- `/complaints/:id` -> `Complaints`
- `/audit` -> `AuditTrail`
- `/docs` -> `Docs`

### Sidebar grouping
Defined in `src/components/layout/Sidebar.tsx`.

#### Overview group
- Synopsis
- Live Feed
- Explorer
- Analysis
- Enforcement Radar
- Institution Monitor

#### Agent group
- Analyze
- Complaints
- Audit Trail

The sidebar also shows:
- CFPB connection state
- Backend state
- total records
- last sync time

## 5. Design System and Visual Language

The visual system lives in `src/styles/globals.css`.

### Main design choices
- Compact terminal-like density
- Sharp panels with minimal radius
- muted grayscale foundation
- red accent for urgency and criticality
- operational typography and small caps labels
- no oversized whitespace-heavy dashboard patterns

### Theme system
Theme is stored in Zustand and persisted to `localStorage` under:
- `sentinel-theme`

Theme bootstrap happens in `src/main.tsx`.

The theme toggle lives in:
- `src/components/layout/Topbar.tsx`

### Semantic design tokens
Examples:
- `--bg`
- `--bg-1`
- `--bg-2`
- `--border`
- `--primary`
- `--secondary`
- `--accent`
- `--success`
- `--panel-hover`
- `--highlight`

There are two token sets:
- default dark theme on `:root`
- light theme on `[data-theme="light"]`

### Shared UI primitives
- `.panel`
- `.panel-header`
- `.btn`
- `.btn-accent`
- `.btn-ghost`
- `.badge`
- `.stat-card`
- `.data-table`
- `.chart-tooltip`
- `.hbar-track`
- `.hbar-fill`

## 6. State Management

The app uses Zustand in `src/store/index.ts`.

### Global store fields
- `backendConnected`
- `backendStats`
- `backendTrends`
- `processedComplaints`
- `totalProcessed`
- `sampleComplaints`
- `lastSync`
- `syntheticCfpbPool`
- `cfpbConnected`
- `searchQuery`
- `theme`

### Why Zustand fits here
This app is panel-heavy, route-heavy, and demo-oriented. Zustand keeps the state model simple without a large Redux-style setup.

## 7. Main Frontend Data Models

The important TypeScript contracts are in `src/store/index.ts`.

### Core models
- `DashboardStats`
- `DashboardTrends`
- `ComplaintSummary`
- `FullAnalysis`
- `BaselineResult`
- `CriticalityResult`
- `ReviewGate`
- `EvidenceMap`
- `NormalizationPreviewResponse`
- `ScheduleDefinition`
- `ScheduleRun`
- `ReviewDecision`
- `CfpbSearchResult`

### Complaint source values
The frontend already understands multiple complaint origins:
- `live_cfpb`
- `synthetic_seed`
- `deepseek_generated`
- `manual_analysis`
- `normalized_batch`
- `schedule_batch`

This is important for any replacement backend. The UI expects to show provenance.

## 8. Data Flow

### 1. Backend operational data
`useBackendData.ts` populates:
- dashboard stats
- dashboard trends
- processed complaints
- samples
- sync state

### 2. CFPB / feed-style data
`useCfpbData.ts` loads complaint feed data, preferably from the CFPB proxy.

If the CFPB layer is unavailable, the UI can fall back to synthetic/demo records.

### 3. Synthetic / DeepSeek feed
`useSyntheticFeed.ts` seeds demo-ready complaint rows for live demos and fallback behavior.

## 9. API Layer This Frontend Expects

The API wrapper is in `src/services/api.ts`.

If your friend is plugging in a different backend, this is the most important file to mirror.

### Health / dashboard
- `GET /api/health`
- `GET /api/dashboard/stats`
- `GET /api/dashboard/trends?days=:n`

### Complaints
- `GET /api/complaints?limit=:n&offset=:n`
- `GET /api/complaints/:id`
- `GET /api/complaints/:id/baseline`
- `GET /api/complaints/samples`
- `GET /api/audit/:id`

### Analysis
- `POST /api/complaints/analyze`
- `POST /api/complaints/analyze/sync`
- `GET /api/complaints/analyze/:id/stream` via `EventSource`
- `POST /api/complaints/batch`

### Normalization
- `POST /api/normalize/preview`
- `POST /api/normalize/submit`
- `GET /api/normalization/:id`

### Scheduling
- `GET /api/schedules`
- `POST /api/schedules`
- `POST /api/schedules/:id/run`
- `POST /api/schedules/:id/pause`
- `DELETE /api/schedules/:id`
- `GET /api/schedules/:id/runs`

### Supervisor review
- `GET /api/supervisor/queue`
- `POST /api/supervisor/review/:complaintId`

### CFPB proxy
- `GET /api/cfpb/search`
- `GET /api/cfpb/complaints/:id`
- `GET /api/cfpb/trends`
- `GET /api/cfpb/geo/states`
- `GET /api/cfpb/suggest`

### Streaming behavior
The frontend expects server-sent events with at least:
- `agent_update`
- `analysis_complete`
- `timeout`

## 10. Page-by-Page Frontend Breakdown

## Dashboard (`src/pages/Dashboard.tsx`)

Purpose:
- Executive command center
- fast operational snapshot
- CFPB pulse + internal pipeline summary

Main UI blocks:
- KPI card row
- complaint volume trend
- criticality composition
- AI vs baseline summary
- supervisor queue
- CFPB pulse cards
- US state heatmap
- product distribution
- top institutions
- live complaint snapshot

Visualizations used:
- Area chart for complaint volume
- Bar chart for criticality composition
- Horizontal progress bars for AI vs baseline deltas
- custom tile-grid US heatmap
- horizontal bar summaries for products and institutions
- queue list / mini-table panels

## Live Feed (`src/pages/LiveFeed.tsx`)

Purpose:
- operational intake stream
- live schedule visibility
- latest complaint monitoring

Main UI blocks:
- schedule controls
- recent schedule runs
- trend charts
- source mix
- latest complaints table
- complaint detail drawer

Visualizations used:
- Area chart for volume over time
- Bar chart for risk breakdown
- bar summaries for source provenance
- dense operations table

## Explorer (`src/pages/Explorer.tsx`)

Purpose:
- primary batch triage surface
- queue-based filtering for supervisors and analysts

Main UI blocks:
- queue tabs
- multi-filter toolbar
- triage table

Filters supported:
- product
- risk
- state
- channel
- source
- vulnerable tags
- review status
- scheduled-run origin

Queue views:
- All
- Needs Human Review
- High Regulatory Risk
- SLA Breach Risk

Visualization style:
- mostly table-first and filter-first rather than chart-first

## Analysis (`src/pages/Analysis.tsx`)

Purpose:
- higher-level analytical view across processed complaints
- AI vs baseline performance storytelling

Main UI blocks:
- KPI summary cards
- escalation concentration chart
- criticality distribution
- baseline delta summary
- team pressure distribution

Visualizations used:
- Composed chart for escalation concentration
- Bar chart for criticality distribution
- horizontal bars for AI vs baseline comparisons
- Bar chart for team pressure

## Analyze (`src/pages/Analyze.tsx`)

Purpose:
- direct user-triggered complaint analysis
- normalization intake and preview
- live multi-agent workflow display

Main UI blocks:
- manual complaint submission
- normalization preview / submit workflow
- agent pipeline tracker
- result tabs

Result surfaces:
- action plan
- customer response
- baseline comparison
- classification output
- compliance output

This page is less chart-heavy and more workflow-heavy.

## Complaints (`src/pages/Complaints.tsx`)

Purpose:
- processed complaint browser
- explainable detail review

Main UI blocks:
- complaint list
- selected complaint detail
- Why Routed explanation
- evidence highlighting
- AI vs baseline comparison
- supervisor/review panel
- criticality breakdown
- compliance flags
- resolution plan

Special UX features:
- evidence tied back to the original narrative
- routing explanation, not just routing destination
- review reason visibility

## Audit Trail (`src/pages/AuditTrail.tsx`)

Purpose:
- explainability timeline for regulators, reviewers, and demos

Main UI blocks:
- agent-by-agent audit trail
- complaint summary panel
- review gate panel
- baseline panel
- evidence coverage panel
- normalization panel

Visualization style:
- expandable decision timeline
- explanation-heavy side panels

## Enforcement Radar (`src/pages/EnforcementRadar.tsx`)

Purpose:
- regulatory posture view
- enforcement-oriented complaint signal tracking

Main UI blocks:
- enforcement KPIs
- timeline of enforcement-related activity
- product distribution
- top institutions
- enforcement action table

Visualizations used:
- Area chart
- Bar chart
- summary table

## Institution Monitor (`src/pages/InstitutionMonitor.tsx`)

Purpose:
- institution-level comparison and risk review

Main UI blocks:
- institution KPI cards
- top institutions chart
- institution risk table
- sticky detail panel

Visualizations used:
- Bar chart for institution comparison
- dense tabular risk review

## Docs (`src/pages/Docs.tsx`)

Purpose:
- built-in internal reference page for the current product

Use:
- good place to expose backend assumptions, definitions, and product logic

## 11. Complete Visualization Catalog

Below is the graph and visualization inventory for this frontend.

| Visualization | Type | Library / Implementation | Main Location | Purpose |
|---|---|---|---|---|
| Complaint Volume | Area chart | `recharts` | `Dashboard` | Shows complaint trend over selected time window |
| Criticality Composition | Bar chart | `recharts` | `Dashboard` | Breaks operational criticality into component buckets |
| AI vs Baseline Delta | Horizontal progress bars | custom CSS bars | `Dashboard`, `Analysis`, `Complaints` | Shows where the AI pipeline differs from deterministic workflow |
| Supervisor Queue | Queue list panel | custom list/table UI | `Dashboard` | Highlights human-review-worthy cases |
| CFPB Pulse cards | KPI cards | custom card UI | `Dashboard` | Shows live feed pulse and fallback status |
| US Complaint Heatmap | Tile-grid heatmap | custom React component | `Dashboard` | Shows complaint concentration by state |
| Top States side ranking | Ranked bar list | custom CSS bars | `StateHeatmap` | Adds state ranking next to the map |
| Product Distribution | Horizontal bars | custom CSS bars / compact charting | `Dashboard`, `EnforcementRadar` | Shows product mix |
| Top Institutions | Horizontal bars / lists | custom | `Dashboard`, `EnforcementRadar`, `InstitutionMonitor` | Shows who is driving volume or risk |
| Live Feed Volume | Area chart | `recharts` | `LiveFeed` | Shows intake volume across recent windows |
| Live Risk Breakdown | Bar chart | `recharts` | `LiveFeed` | Shows mix of critical/high/medium/low complaints |
| Source Provenance | Bars / summaries | custom | `LiveFeed` | Shows live CFPB vs synthetic vs generated origin |
| Explorer Triage Surface | Table + filters | custom table UI | `Explorer` | Batch triage, queue filtering, supervisor review |
| Escalation Concentration | Composed chart | `recharts` | `Analysis` | Shows concentration of severe / escalating cases over time |
| Criticality Distribution | Bar chart | `recharts` | `Analysis` | Shows distribution across criticality levels or components |
| Team Pressure | Bar chart | `recharts` | `Analysis` | Shows routing/team load |
| Evidence Highlighting | Narrative span highlighting | custom rendering | `Complaints` | Connects model outputs back to complaint text |
| Audit Timeline | Timeline / expandable events | custom | `AuditTrail` | Shows multi-agent decisions through time |
| Enforcement Timeline | Area chart | `recharts` | `EnforcementRadar` | Tracks enforcement-heavy activity over time |
| Institution Comparison | Bar chart | `recharts` | `InstitutionMonitor` | Compares institutions on complaint metrics |

## 12. Charting Library Usage

The app uses `recharts` for all standard graphing.

Patterns used:
- `AreaChart`
- `BarChart`
- `ComposedChart`
- `Area`
- `Bar`
- `Line`
- `Cell`
- `Tooltip`
- `XAxis`
- `YAxis`

Why `recharts` works well here:
- fast to wire into React
- good enough for hackathon/demo-grade analytics
- flexible enough for compact dashboards
- easy to style with the existing CSS token system

Why there is also custom visualization code:
- the US state heatmap is not a standard chart
- many “Bloomberg-terminal” UI elements are better as dense custom panels than as oversized chart-library widgets

## 13. Custom Visualization Components

## `StateHeatmap.tsx`

This is a custom US tile-grid heatmap, not a geographic SVG map.

Why this choice was good:
- compact
- fast to render
- consistent with terminal/dashboard styling
- no need for heavy geo libraries
- easier to theme in dark and light mode

Features:
- state tile grid
- intensity-based heat coloring
- hover interaction
- optional click interaction
- selected-state outline
- legend
- top-state ranking panel

## 14. Explainability UX Already Present

This frontend is not just a dashboard shell; it already contains explainability surfaces.

Key explainability features:
- `Why Routed` panel
- structured evidence highlighting
- compliance flag evidence references
- AI vs baseline comparison
- review-trigger reason visibility
- audit trail by agent
- source provenance

This is one of the strongest parts of the frontend and should be preserved with any backend swap.

## 15. Scheduling and Operations UX

The frontend already has UI surfaces for schedule-aware workflows.

Concepts it supports:
- one-time runs
- recurring runs
- live stream polling
- run history
- schedule status

Relevant page:
- `LiveFeed`

Relevant models:
- `ScheduleDefinition`
- `ScheduleRun`

If a replacement backend does not support scheduling yet, these panels can still be populated with stub/demo data.

## 16. Normalization UX

The frontend includes an intake flow for non-granular complaint inputs.

Supported conceptually:
- pasted rows
- CSV-like records
- external API payloads
- heuristic mapping
- LLM-assisted mapping

Relevant page:
- `Analyze`

Relevant model:
- `NormalizationPreviewResponse`

The normalization UI expects:
- normalized output fields
- row confidence
- missing fields
- recommendations
- whether LLM assistance was used

## 17. Supervisor / Review UX

The frontend supports supervisor review patterns already.

Review concepts expected by the UI:
- `needs_human_review`
- `review_reason_codes`
- `sla_breach_risk`
- `latest_review_decision`
- queue membership

Main surfaces:
- `Dashboard` supervisor summary
- `Explorer` queue views
- `Complaints` review panel
- `AuditTrail` review gate panel

## 18. Backend Integration Guide For a New Backend

If someone wants to keep this frontend but connect it to a different backend, the easiest path is:

### Option A: Preserve the current API contract
Best option.

Just return the same shapes from the same endpoints defined in `src/services/api.ts`.

This avoids almost all frontend changes.

### Option B: Keep the pages and swap only the API wrapper
If the new backend has different endpoints, update:
- `src/services/api.ts`

Map the new backend responses into the frontend’s existing TypeScript models from:
- `src/store/index.ts`

### Option C: Stub unsupported features temporarily
If the new backend is not ready for everything, it can still power the UI by returning placeholder values for:
- schedules
- baseline comparison
- evidence maps
- supervisor review
- CFPB proxy routes

This frontend is resilient enough to demo with partial data as long as the response shapes exist.

## 19. Minimum Contract Needed To Keep Most Of The UI

If time is tight, these are the most important backend capabilities to preserve:

### Must-have
- dashboard stats
- dashboard trends
- complaint list
- complaint detail
- analysis submission
- audit data

### Strongly recommended
- baseline comparison
- criticality output
- review-gate output
- evidence map
- source metadata

### Nice-to-have
- schedule APIs
- normalization APIs
- CFPB proxy APIs

## 20. Frontend Strengths Worth Keeping

This frontend is especially strong in these areas:
- dense, serious operations UI
- regulator-friendly explainability
- demo-friendly AI vs baseline comparison
- flexible complaint provenance model
- dark/light parity without changing the visual language
- multiple demo surfaces without feeling like unrelated pages

## 21. Development Commands

From the project root:

```bash
npm install
npm run dev
```

Build:

```bash
npm run build
```

Preview built app:

```bash
npm run preview
```

## 22. Practical Handoff Notes

- The frontend is route-based, but the real product feel comes from shared shell consistency.
- The styling is intentionally not flashy; it is dense, legible, and operational.
- The most important files for a backend handoff are:
  - `src/services/api.ts`
  - `src/store/index.ts`
  - `src/hooks/useBackendData.ts`
  - `src/hooks/useCfpbData.ts`
- If the backend changes, try to preserve the existing model names and response shapes first.
- The light theme is already production-ready enough for demos and complements the dark theme without altering layout behavior.

## 23. Short Summary

This frontend is a React + Vite operational dashboard built around:
- `react-router-dom` for page routing
- `zustand` for global state
- `recharts` for the charting layer
- custom CSS variables and compact panel styling for the visual system
- custom explainability panels, tables, and a US tile-grid heatmap for the specialized UX

If another backend wants to use this frontend, the fastest path is to preserve the response contract in `src/services/api.ts` and the data models in `src/store/index.ts`.

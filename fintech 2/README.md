# Complaint Categorization AI Prototype

This repository contains a prototype for an AI-assisted financial complaint operations console.

The goal of the prototype is to show how a fintech can take an incoming consumer complaint narrative, run it through a multi-agent review pipeline, and produce:

- structured complaint classification
- regulatory and compliance risk assessment
- internal routing and prioritization
- a proposed resolution package
- an auditable record of how the decision was made

The prototype is designed for demo and exploration purposes rather than production deployment.

## What The Prototype Is For

Financial complaint handling is usually fragmented across operations, compliance, support, and legal teams. This prototype demonstrates a single workflow that can:

- ingest a free-form complaint narrative
- classify the complaint into product and issue categories
- identify possible regulatory concerns
- route the complaint to the right internal team with a priority level
- generate a customer response and internal action plan
- preserve an audit trail for explainability and review

In practical terms, it is a prototype for complaint triage, compliance review, and resolution support in a fintech environment.

## How The Agents Work

The backend runs a sequential 5-agent pipeline orchestrated by `backend/agents/orchestrator.py`.

### 1. Classification Agent

The `ClassificationAgent` reads the complaint narrative and outputs:

- product and sub-product
- issue and sub-issue
- severity
- urgency
- sentiment score
- confidence
- key entities extracted from the complaint

This step turns unstructured text into a structured complaint record.

### 2. Compliance Risk Agent

The `ComplianceRiskAgent` reviews the narrative plus the classification output and scores regulatory risk.

It evaluates the complaint against a set of consumer-finance frameworks, including:

- UDAAP
- TILA / Regulation Z
- ECOA
- FCRA
- EFTA / Regulation E
- FDCPA
- SCRA
- CARD Act
- elder financial protection concerns

It returns:

- overall risk score
- risk level
- applicable regulations
- evidence-backed compliance flags
- whether escalation is required

### 3. Routing Agent

The `RoutingAgent` uses the classification and compliance outputs to decide:

- which internal team should own the complaint
- which handling tier should receive it
- what priority level it should get
- what SLA should apply
- what escalation path should be used

This simulates operations triage and workload assignment.

### 4. Resolution Agent

The `ResolutionAgent` generates a proposed resolution package that includes:

- internal action plan
- customer response letter
- internal notes
- preventive recommendations
- estimated resolution time
- estimated remediation amount when applicable

This step is meant to support operations teams, not replace human judgment.

### 5. QA Validation Agent

The `QAValidationAgent` acts as an adversarial reviewer over the full pipeline output.

It checks for:

- classification quality
- compliance completeness
- routing logic
- response quality
- hallucinations or unsupported claims
- PII safety
- overall consistency with the original complaint

It returns a quality score, pass/fail checks, and suggested improvements.

## End-To-End Flow

At a high level, the system works like this:

1. A complaint narrative is submitted through the frontend or API.
2. The backend stores the complaint in SQLite.
3. The orchestrator runs the 5 agents in order.
4. Each agent writes an audit record with reasoning, evidence, and duration.
5. Final results are stored in the database.
6. The frontend can stream agent progress in real time through SSE.

## System Architecture

### Frontend

The frontend is a React + Vite application in `frontend/`.

It provides four main views:

- overview dashboard
- complaint processing screen with live pipeline updates
- analytics view
- audit trail view

### Backend

The backend is a FastAPI service in `backend/`.

It exposes endpoints for:

- health checks
- sample complaints
- complaint submission and synchronous analysis
- streaming analysis progress with SSE
- complaint list and detail views
- audit trail retrieval
- dashboard stats and trends

### Database

The prototype uses SQLite at `backend/complaints.db`.

It stores:

- raw complaint records
- latest analysis outputs
- audit logs for each agent decision

## Why Explainability Matters In This Prototype

The prototype is not just generating answers. It is structured to show how AI output can be reviewed.

Each agent records:

- its decision summary
- confidence
- reasoning
- evidence spans or extracted entities
- input/output summaries
- execution time

That makes the system easier to demo to operations, compliance, and audit stakeholders.

## Running The Project

### Prerequisites

- Python 3.12 recommended
- Node.js 20+ or newer
- npm
- an Anthropic API key for live analysis

### Backend

From the repository root:

```bash
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
python -m uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
```

The backend runs at `http://127.0.0.1:8000`.

### Frontend

In a second terminal:

```bash
cd frontend
npm install
npm run dev
```

The frontend runs at `http://localhost:5173`.

### Environment Variables

Create or update `.env` in the repository root:

```env
ANTHROPIC_API_KEY=your_real_api_key
```

Without a valid API key, the backend can start, but complaint analysis endpoints will return a configuration error.

## Key Prototype Features

- multi-agent complaint analysis pipeline
- real-time pipeline streaming with SSE
- structured compliance and routing outputs
- generated customer response and internal action plan
- SQLite-backed audit trail
- dashboard and analytics views for recent activity

## Current Scope And Limitations

This is a prototype. Important limitations include:

- agent outputs depend on LLM behavior and prompt quality
- regulatory reasoning is assistive, not legal advice
- the routing and SLA logic is simulated for demo purposes
- SQLite is used for simplicity, not scale
- authentication, authorization, and production hardening are not implemented

## Repository Structure

```text
backend/
  agents/          Multi-agent pipeline and prompts
  data/            Sample complaint inputs
  models/          Shared schemas
  database.py      SQLite setup and query helpers
  main.py          FastAPI app and API endpoints

frontend/
  src/
    components/    UI building blocks
    pages/         Dashboard, process, analytics, audit views
    lib/api.js     Frontend API client
```

## Summary

This project is a prototype for AI-assisted financial complaint intake, risk review, routing, resolution, and auditability.

Its core idea is simple: use specialized agents to break a difficult complaint-handling workflow into explainable stages, then expose the full process through a usable operations interface.

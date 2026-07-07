# Submission Write-Up: Silent Witness Agent

**Live Demo:** [https://silent-witness-ui-j647da6ofa-ue.a.run.app](https://silent-witness-ui-j647da6ofa-ue.a.run.app)

---

## Problem Statement

Every day, millions of people living with late-stage motor neuron diseases such as ALS, locked-in syndrome, severe strokes, or cerebral palsy remain fully cognitive but are completely unable to speak. Their only means of communication is a slow, manual signal system - an eye blink, a gaze, a finger tap - which a caregiver must observe and interpret accurately, often under pressure.

This creates two consistent points of failure: signals can be misread, and even when interpreted correctly, there is no system in place to convert them into a reliable clinical record or to trigger a timely response when the situation is urgent. The information exists only briefly, in the caregiver's judgment, before it is lost.


 ## Solution 

**The Silent Witness Agent gives a voice to these individuals. It takes reported gesture/signal mappings -observed and shared by a caregiver - and translates them into natural language needs, builds structured clinical reports, and features a security-first distress bypass that triggers immediate emergency dispatches.**


When a life-threatening signal is reported - such as choking or loss of oxygen -  there is no time for a slow, multi-turn conversational response. The system recognizes the urgency instantly and escalates without delay.

---

## Solution Architecture

The system is built using Google's Agent Development Kit (ADK) and Antigravity, and is powered by a multi-agent architecture. A Security Checkpoint screens every input for PII, prompt injection, and life-threatening keywords before anything is processed. Non-emergency requests are routed through an Orchestrator Agent, which coordinates three specialized sub-agents - a Signal Interpreter, a Medical Communicator, and an Emergency Escalation agent - each connected to patient data through a Model Context Protocol (MCP) server. For any sensitive action, like sending a caregiver alert, the system pauses for human confirmation before proceeding, ensuring a person stays in control of critical decisions.

```
[User Input]
    │
    ▼
[Security Checkpoint]
    ├── violation ────► [Security Violation Node] (block)
    ├── emergency ────► [Automated Emergency Node] (direct caregiver alert bypass)
    └── safe ─────────► [Orchestrator Agent]
                             ├──► [Signal Interpreter Agent] (reads blinks/gaze)
                             ├──► [Medical Communicator Agent] (clinical summaries)
                             └──► [Emergency Escalation Agent] (distress checks)
                                       │
                                  [MCP Server]
                             ┌─────────────────────────┐
                             │ • get_patient_profile   │
                             │ • update_patient_context│
                             │ • generate_clinical_note│
                             │ • send_emergency_alert  │
                             └─────────────────────────┘
                                       │
                             [needs_confirmation?]
                             ├── yes ──► [Human Confirmation Node ✋]
                             └── no  ──► [Final Output]
```

---

## Concepts Used

| Concept | Where Used | File |
|---------|-----------|------|
| **ADK Workflow** | Graph definition, orchestrating security, agent routing, and validation | `app/agent.py` |
| **LlmAgent** | `orchestrator_agent`, `signal_interpreter_agent`, `medical_communicator_agent`, `emergency_escalation_agent` | `app/agent.py` |
| **AgentTool** | Delegating orchestrator instructions to specialized sub-agents | `app/agent.py` |
| **ctx.state** | Preserving pending responses and confirmation prompts across the HITL boundary | `app/agent.py` |
| **RequestInput (HITL)** | Pausing the graph at `human_confirmation_node` for operators to verify actions | `app/agent.py` |
| **MCP Server** | Std-io server exposing patient database, summaries, and mobile alert dispatches | `app/mcp_server.py` |
| **Security Checkpoint** | Standard PII scrubbing, injection block, and critical distress routing | `app/agent.py` |
| **Agents CLI** | Project scaffolding, testing, and lifecycle configuration | Root files |

---

## Security Design

| Control | What It Does | Why It Matters for Silent Witness |
|---------|-------------|-----------------------------------|
| **PII Scrubbing** | Automatically scrubs Social Security numbers, email addresses, and phone numbers before routing to the LLM | Protects sensitive patient identity and caregiver details in compliance with healthcare regulations |
| **Prompt Injection Protection** | Blocks prompt-override commands like "ignore instructions" | Prevents bad actors from overriding system safety boundaries |
| **Distress Emergency Routing** | Scans inputs for emergency indicators ("choking", "cannot breathe", "seizure") and bypasses the LLMs | Ensures that critical, life-threatening distress signals bypass conversational delay and trigger automated caregiver alerts immediately |
| **Structured JSON Logging** | Every entry logs details to stdout with timestamp and severity | Offers full auditability for care teams |

---

## MCP Server Design

File: `app/mcp/server.py`

| Tool | Purpose |
|------|---------|
| `get_patient_profile(patient_id)` | Returns details on the patient's condition, caregiver, physician, and specific signal-mapping lists |
| `update_patient_context(patient_id, entry)` | Logs preferences, observations, or physical status adjustments |
| `generate_clinical_summary(patient_id, symptom_notes)` | Prepares a formal clinical log note formatted for neurologists and medical charts |
| `send_emergency_escalation(patient_id, message)` | Simulates dispatching emergency SMS/mobile alerts to primary caregivers and emergency contacts |

---

## Frontend & Deployment

The project ships a full-stack caregiver dashboard alongside the ADK agent backend.

| Layer | Technology | Purpose |
|-------|-----------|--------|
| **Frontend UI** | React 18 + Vite + TypeScript | Caregiver dashboard — patient profiles, signal mappings manager, integrated interpreter console, audit logs |
| **Styling** | Vanilla CSS + Tailwind utility classes | Dark-mode glassmorphism design system |
| **Proxy Server** | Node.js + Express (`server.js`) | CORS-safe bridge between the React frontend and the Vertex AI Reasoning Engine REST API |
| **Backend Runtime** | Vertex AI Reasoning Engine | Hosts and serves the ADK multi-agent workflow in a managed serverless container |
| **Frontend Hosting** | Google Cloud Run | Serves the containerized Node/Express + React production build |
| **Container Build** | Docker (`submission_frontend/Dockerfile`) | Bundles `npm run build` output with an Express static server for Cloud Run |
| **CLI / Deploy** | Google Cloud SDK (`gcloud`) | Used to build the container image and deploy both the Reasoning Engine and Cloud Run service |

---

## Notable UI Features

- **Dynamic Signal Mappings Manager** — Caregivers can add or delete custom gesture-to-meaning mappings per patient (e.g. "double finger tap = PAIN HIGH") directly in the dashboard. The agent immediately reads the updated mappings for subsequent signal translations.
- **Patient Profile Management** — New patient profiles (name, condition, caregiver, physician) can be created from the dashboard without touching any code.
- **Integrated Interpreter Console** — A dedicated chat console embedded directly in the main Overview dashboard. Caregivers can select the active patient from a dropdown in the console header and interact with the translation agent in-place.
- **Caregiver & Safety Logs** — A live audit console showing every security event (PII scrub, injection block, critical distress detection) logged during the session.
- **Simulation Quick Actions** — One-click buttons that auto-populate context-aware test prompts tailored to the currently selected patient.

---

## Human-in-the-Loop (HITL) Flow


A multi-agent system should never send a critical emergency dispatch or modify a patient's historical medical profile without human review. We implemented ADK's `RequestInput` to mandate verification:

1. When a user requests an emergency alert or profile update, the orchestrator triggers the action and calls `request_human_confirmation()`.
2. This tool sets `tool_context.state["needs_confirmation"] = True` and saves the prompt.
3. The router directs the execution to `human_confirmation_node`, which yields a `RequestInput`.
4. The system pauses. The coordinator reviews the action in the playground and types "yes" to approve.
5. `post_confirmation_node` returns the saved pending response or cancels the action, returning it to `final_output_node`.

---

## Demo Walkthrough

1. **Signal Translation**: Ask the agent to translate "3 quick blinks for patient P101". The interpreter fetches the patient profile via MCP, confirms 3 quick blinks maps to PAIN / DISCOMFORT, and logs the translation to the Caregiver & Safety Logs.
2. **Clinical Summary**: Request a doctor summary for P101 showing stiff movements. The system calls the `generate_clinical_summary` MCP tool and returns a structured medical chart note.
3. **Emergency Alert (HITL)**: Request to send an emergency alert. The workflow pauses at the Human-in-the-Loop node, prompts the operator for approval, and upon receiving "yes", dispatches the confirmed alert receipt.
4. **Immediate Emergency Bypass**: Type "choking". The security checkpoint detects the critical distress keyword, bypasses the LLMs entirely, and immediately triggers the automated caregiver alert.

---

## Impact / Value Statement

**Who benefits**: Patients with late-stage neurodegenerative diseases, stroke survivors, and individuals in locked-in states, alongside their caregivers, physicians, and families.

**How it helps**:
- **Empowerment**: Restores basic agency to patients by providing a smart channel to translate simple gestures into complex requests.
- **Urgent Safety**: Bypasses conversational agents entirely when life-threatening symptoms are detected, ensuring alerts are fired immediately.
- **Accurate Care**: Standardizes signal interpretation so caregivers act on a consistent, agent-verified reading rather than personal judgment alone.
- **Medical Documentation**: Automatically generates structured medical notes, saving valuable clinician tracking time.

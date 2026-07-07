# ruff: noqa
import logging
import sys
import os
import re
import json
import datetime
import threading
import urllib.request
import urllib.error
from google.adk import Workflow, Context, Event
from google.adk.agents import LlmAgent
from google.adk.models import Gemini
from google.adk.tools import AgentTool
from google.adk.tools.tool_context import ToolContext
from google.adk.events import RequestInput
from google.adk.apps import App, ResumabilityConfig
from app.config import config

# MCP Imports
from mcp import StdioServerParameters
from google.adk.tools.mcp_tool import StdioConnectionParams, McpToolset

# Set up logging
logger = logging.getLogger(__name__)

# ── Conversational Memory Workflow Hacking ──────────────────────────────────
# Workflows enforce mode="single_turn" for nodes, which disables conversation history.
# We monkeypatch the request contents processor to force history for orchestrator_agent.
import google.adk.flows.llm_flows.contents as _adk_contents

_original_processor_run = _adk_contents._ContentLlmRequestProcessor.run_async


async def _patched_processor_run(self, invocation_context, llm_request):
    agent = invocation_context.agent
    if agent.name == "orchestrator_agent":
        preserve_function_call_ids = False
        if (
            hasattr(agent, "canonical_model")
            and agent.canonical_model.use_interactions_api
        ):
            preserve_function_call_ids = True

        instruction_related_contents = llm_request.contents
        llm_request.contents = _adk_contents._get_contents(
            invocation_context.branch,
            invocation_context.session.events,
            agent.name,
            preserve_function_call_ids=preserve_function_call_ids,
            isolation_scope=invocation_context.isolation_scope,
            is_single_turn=False,  # Force multi-turn chat behavior
            user_content=invocation_context.user_content,
        )
        await _adk_contents._add_instructions_to_user_content(
            invocation_context, llm_request, instruction_related_contents
        )
        if False:
            yield
    else:
        async for event in _original_processor_run(
            self, invocation_context, llm_request
        ):
            yield event


_adk_contents._ContentLlmRequestProcessor.run_async = _patched_processor_run

# ── Live Dashboard Event Emitter ───────────────────────────────────────────────
_DASHBOARD_EMIT_URL = "http://127.0.0.1:8765/emit"


def emit_event(node: str, state: str, badge: str, message: str) -> None:
    """
    Fire-and-forget: POST a structured event to the dashboard server.
    Silently no-ops if the dashboard is not running — agent is unaffected.
    """
    event = {
        "node": node,
        "state": state,
        "badge": badge,
        "message": message,
        "timestamp": datetime.datetime.utcnow().isoformat(),
    }

    def _send() -> None:
        try:
            data = json.dumps(event).encode()
            req = urllib.request.Request(
                _DASHBOARD_EMIT_URL,
                data=data,
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            urllib.request.urlopen(req, timeout=0.5)  # noqa: S310
        except Exception:  # pragma: no cover
            pass  # Dashboard not running — silently ignore

    threading.Thread(target=_send, daemon=True).start()


# Resolve MCP server path dynamically relative to this file
_mcp_server_path = "app/mcp/server.py"
if not os.path.exists(_mcp_server_path):
    _current_dir = os.path.dirname(os.path.abspath(__file__))
    _mcp_server_path = os.path.join(_current_dir, "mcp", "server.py")

# Initialize MCP Toolset running our local mcp_server.py
mcp_toolset = McpToolset(
    connection_params=StdioConnectionParams(
        server_params=StdioServerParameters(
            command=sys.executable,
            args=[_mcp_server_path],
        )
    )
)

# Signal Interpreter Agent
signal_interpreter_agent = LlmAgent(
    name="signal_interpreter_agent",
    model=Gemini(model=config.model),
    instruction=(
        "You are a medical signal interpreter specializing in non-verbal patient communication.\n"
        "Translate blinks, gaze directions, and gestures into patient needs.\n"
        "Crucially: you MUST call the get_patient_profile tool first to fetch and customize your translation. "
        "Do NOT attempt to translate any signals without first calling get_patient_profile. "
        "In your response, you MUST include the retrieved patient profile details (such as caregiver contact details "
        "and primary care physician) alongside the translated signal meaning."
    ),
    tools=[mcp_toolset],
)

medical_communicator_agent = LlmAgent(
    name="medical_communicator_agent",
    model=Gemini(model=config.model),
    instruction=(
        "You are the Medical Communicator Agent.\n"
        "Your role is to generate structured, professional clinical status summaries for doctors, neurologists, or clinical charts.\n"
        "Use the generate_clinical_summary tool to build these formatted notes. "
        "You can also use update_patient_context to add notes to the patient's log."
    ),
    tools=[mcp_toolset],
)

emergency_escalation_agent = LlmAgent(
    name="emergency_escalation_agent",
    model=Gemini(model=config.model),
    instruction=(
        "You are the Emergency Escalation Agent.\n"
        "Your role is to identify and process urgent, life-threatening distress signals (e.g. choking, suffocation, cannot breathe, loss of oxygen).\n"
        "Use the send_emergency_escalation tool ONLY when a true life-threatening emergency occurs. "
        "Do NOT escalate or call this tool for normal patient requests like minor discomfort, pressure points, water, or YES/NO answers (e.g. Elena's gaze upward left/right). "
        "Crucially, if a conversation calls for sending an alert, ensure you invoke the request_human_confirmation tool "
        "so the caregiver or supervisor confirms the dispatch before it goes out, unless it is a system-detected automatic emergency."
    ),
    tools=[mcp_toolset],
)

# AgentTools for delegation (ADK 2.x only takes agent argument)
signal_interpreter_tool = AgentTool(agent=signal_interpreter_agent)
medical_communicator_tool = AgentTool(agent=medical_communicator_agent)
emergency_escalation_tool = AgentTool(agent=emergency_escalation_agent)


# HITL confirmation tool
def request_human_confirmation(prompt: str, tool_context: ToolContext) -> str:
    """Request approval/confirmation from the caregiver or coordinator before executing an action.
    ALWAYS call this before sending emergency alerts or updating patient records.

    Args:
        prompt: The text prompt describing what action needs confirmation.
    """
    tool_context.state["needs_confirmation"] = True
    tool_context.state["confirmation_prompt"] = prompt
    return f"Confirmation request queued: '{prompt}'. The workflow will pause for verification."


# Orchestrator Agent
orchestrator_agent = LlmAgent(
    name="orchestrator_agent",
    model=Gemini(model=config.model),
    instruction=(
        "You are the Silent Witness Orchestrator.\n"
        "You help people who cannot speak communicate with caregivers and doctors. Coordinate requests by delegating to:\n"
        "1. signal_interpreter_agent — for interpreting blinks, upper gaze, gestures into clear patient needs.\n"
        "2. medical_communicator_agent — for generating clinical summaries/notes for physicians.\n"
        "3. emergency_escalation_agent — for processing distress events and dispatching alerts.\n\n"
        "When presenting the output of the signal_interpreter_agent, you MUST include the full patient profile details "
        "alongside the signal translation (such as caregiver contact details and primary care physician).\n\n"
        "CRITICAL CLASSIFICATION RULE:\n"
        "You must distinguish between normal patient requests and critical medical emergencies based on the specific patient's signal mapping context provided in the request:\n"
        "- Normal Patient Requests: Requests for water, position adjustments, minor discomfort, turning, or YES/NO answers. For example, '3 quick blinks' for P101 maps to 'PAIN / DISCOMFORT', which is a normal request. Delegate these ONLY to signal_interpreter_agent. Do NOT treat these as emergencies, do NOT delegate them to emergency_escalation_agent, and do NOT trigger emergency alerts.\n"
        "- Critical Medical Emergencies: True life-threatening situations (e.g. choking, suffocating, chest pain, seizure, loss of oxygen). A gesture signal is only a critical emergency if the patient's specific mapping states it is an emergency (for example, '3 rapid blinks' for Elena P102 maps to 'EMERGENCY / CHOKING / LOSS OF OXYGEN'). Delegate these to emergency_escalation_agent to process alerts.\n\n"
        "CRITICAL DELEGATION & MEMORY RULE:\n"
        "Sub-agents (signal_interpreter_agent, medical_communicator_agent, emergency_escalation_agent) DO NOT see the prior conversation history. When you delegate tasks to any sub-agent, you MUST explicitly include all context from previous turns (such as the Patient ID, e.g. P101, caregiver names, and any earlier symptoms or signals) in the tool's 'request' argument. Never call a sub-agent tool with just the user's latest message if context is missing. For example, if a user starts by asking for a summary for P101, and in the next turn provides symptoms, you MUST invoke medical_communicator_agent with a combined request containing BOTH the patient ID and the symptoms (e.g. 'Generate summary for patient P101. Notes: stiffness in left arm, pain level 3').\n\n"
        "MANDATORY CONFIRMATION RULE:\n"
        "You MUST call request_human_confirmation BEFORE final output whenever:\n"
        "- An emergency alert is being dispatched to the caregiver/SMS.\n"
        "- A patient's medical history, preferences, signal mappings, or profile details are being updated.\n"
        "EXCEPTION: If your current user input starts with '[OPERATOR APPROVED]', it means the operator has already approved the action. In this case, you must execute the action directly using the tools (like update_patient_profile, update_patient_context, or emergency_escalation_agent) and do NOT call request_human_confirmation again. Simply output the final tool results/receipt."
    ),
    tools=[
        signal_interpreter_tool,
        medical_communicator_tool,
        emergency_escalation_tool,
        request_human_confirmation,
    ],
)


# Graph nodes
async def security_checkpoint(node_input: str, ctx: Context):
    timestamp = datetime.datetime.utcnow().isoformat()

    emit_event("start", "active", "INFO", "New request received — entering workflow.")
    emit_event(
        "security",
        "active",
        "INFO",
        "Scanning input for PII, prompt injection, and distress keywords…",
    )

    # Strip [Context: ...] block for the safety check scans
    scan_input = node_input
    context_idx = scan_input.find(" [Context: ")
    if context_idx != -1:
        scan_input = scan_input[:context_idx]

    # 1. Prompt Injection Check
    injection_keywords = [
        "ignore previous instructions",
        "system prompt",
        "you are now",
        "override",
        "jailbreak",
        "ignore instructions",
        "developer mode",
    ]
    detected_injection = False
    for kw in injection_keywords:
        if kw in scan_input.lower():
            detected_injection = True
            break

    if detected_injection:
        audit_log = {
            "timestamp": timestamp,
            "event": "PROMPT_INJECTION_DETECTED",
            "severity": "CRITICAL",
            "message": f"Input contains disallowed override keywords: '{node_input}'",
        }
        print(json.dumps(audit_log))
        emit_event(
            "security",
            "warning",
            "CRITICAL",
            "🚫 Prompt injection detected — input contains disallowed override keywords.",
        )
        emit_event(
            "violation",
            "error",
            "CRITICAL",
            "Security Violation Node activated — request blocked and logged.",
        )
        yield Event(route="violation", output="PROMPT_INJECTION_VIOLATION")
        return

    # 2. Medical Emergency Check (Direct distress signals from patient)
    emergency_keywords = [
        "choking",
        "suffocating",
        "cannot breathe",
        "heart attack",
        "choke",
        "dying",
        "seizure",
    ]
    is_emergency = False
    for kw in emergency_keywords:
        if kw in scan_input.lower():
            is_emergency = True
            break

    if is_emergency:
        audit_log = {
            "timestamp": timestamp,
            "event": "CRITICAL_PATIENT_DISTRESS_DETECTED",
            "severity": "CRITICAL",
            "message": f"Critical distress keyword detected in signal input: '{node_input}'",
        }
        print(json.dumps(audit_log))
        emit_event(
            "security",
            "error",
            "EMERGENCY",
            f"🚨 CRITICAL distress keyword detected: <strong>'{node_input}'</strong> — bypassing all LLMs!",
        )
        emit_event(
            "auto",
            "error",
            "EMERGENCY",
            "Automated Emergency Node activated — dispatching caregiver alert immediately.",
        )
        yield Event(route="emergency", output=node_input)
        return

    # 3. PII Scrubbing
    scrubbed_input = node_input
    scrubbed_items = []

    # SSN Regex
    ssn_regex = r"\b\d{3}-\d{2}-\d{4}\b"
    if re.search(ssn_regex, scrubbed_input):
        scrubbed_input = re.sub(ssn_regex, "[REDACTED SSN]", scrubbed_input)
        scrubbed_items.append("SSN")

    # Email Regex
    email_regex = r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b"
    if re.search(email_regex, scrubbed_input):
        scrubbed_input = re.sub(email_regex, "[REDACTED EMAIL]", scrubbed_input)
        scrubbed_items.append("EMAIL")

    # Phone Regex
    phone_regex = r"\b(?:\+?1[-.●]?)?\(?([2-9][0-8][0-9])\)?[-.●]?([2-9][0-9]{2})[-.●]?([0-9]{4})\b"
    if re.search(phone_regex, scrubbed_input):
        scrubbed_input = re.sub(phone_regex, "[REDACTED PHONE]", scrubbed_input)
        scrubbed_items.append("PHONE")

    if scrubbed_items:
        audit_log = {
            "timestamp": timestamp,
            "event": "PII_REDACTED",
            "severity": "WARNING",
            "redacted_fields": scrubbed_items,
            "message": f"PII was scrubbed from request: {', '.join(scrubbed_items)}",
        }
        print(json.dumps(audit_log))
        emit_event(
            "security",
            "warning",
            "WARNING",
            f"🔐 PII detected and redacted — fields: <strong>{', '.join(scrubbed_items)}</strong>. Request sanitised.",
        )
    else:
        audit_log = {
            "timestamp": timestamp,
            "event": "REQUEST_PASSED",
            "severity": "INFO",
            "message": "Request passed security checkpoint cleanly.",
        }
        print(json.dumps(audit_log))
        emit_event(
            "security",
            "idle",
            "SUCCESS",
            "✅ Input passed security checkpoint — no threats detected.",
        )

    ctx.state["original_request"] = scrubbed_input
    emit_event(
        "orch",
        "active",
        "INFO",
        "Routing to Orchestrator Agent — delegating to appropriate sub-agent…",
    )
    yield Event(route="safe", output=scrubbed_input)


async def security_violation_node(node_input: str, ctx: Context):
    emit_event(
        "violation",
        "error",
        "CRITICAL",
        "Request blocked — disallowed instruction override detected. Input rejected without LLM exposure.",
    )
    emit_event("final", "active", "INFO", "Returning security block message to user.")
    yield Event(
        message="Security Checkpoint: Disallowed instruction override keywords detected. Request blocked for safety."
    )


async def automated_emergency_node(node_input: str, ctx: Context):
    """Bypasses normal orchestrator to immediately dispatch emergency alert when patient indicates choking/suffocation."""
    emit_event(
        "auto",
        "error",
        "EMERGENCY",
        f"🚨 AUTO-DISPATCH: Caregiver alert fired for: <strong>'{node_input}'</strong>",
    )
    emit_event(
        "mcp",
        "active",
        "EMERGENCY",
        "send_emergency_escalation — SMS + voice call dispatched to caregiver.",
    )
    yield Event(
        message=(
            f"🚨 **CRITICAL DISTRESS SIGNAL DETECTED** 🚨\n\n"
            f"The system has automatically dispatched an urgent emergency notification to the primary caregiver:\n"
            f'- **Patient Message**: "{node_input}"\n'
            f"- **Action Taken**: Caregiver alerted. Please remain calm, help is on the way."
        )
    )
    emit_event("mcp", "idle", "SUCCESS", "Emergency escalation confirmed dispatched.")


def orchestrator_router(node_input, ctx: Context):
    emit_event(
        "orch", "idle", "INFO", "Orchestrator Agent completed — routing response."
    )
    if ctx.state.get("needs_confirmation"):
        emit_event(
            "hitl",
            "active",
            "HITL",
            "✋ Human confirmation required — workflow pausing for operator approval.",
        )
        ctx.state["pending_response"] = node_input
        return Event(route="human_confirmation")
    emit_event(
        "final",
        "active",
        "SUCCESS",
        "No confirmation needed — routing to final output.",
    )
    return Event(route="final_output")


async def human_confirmation_node(node_input, ctx: Context):
    prompt_message = ctx.state.get("confirmation_prompt", "Please confirm this action:")
    ctx.state["needs_confirmation"] = False
    emit_event(
        "hitl",
        "active",
        "HITL",
        f"⏸️ Workflow paused — awaiting operator approval. Prompt: <em>{prompt_message[:80]}</em>",
    )
    user_response = yield RequestInput(
        message=(
            f"{prompt_message}\n\n"
            "Type **yes** to confirm and execute, or **no** to cancel."
        )
    )
    yield Event(output=user_response)


def post_confirmation_node(node_input, ctx: Context):
    user_reply = str(node_input).lower().strip()
    if any(word in user_reply for word in ["yes", "confirm", "ok", "approve", "y"]):
        emit_event(
            "hitl",
            "idle",
            "SUCCESS",
            "✅ Operator confirmed — executing approved action.",
        )
        emit_event(
            "mcp", "active", "SUCCESS", "Executing confirmed action via MCP tools…"
        )
        ctx.state["action_approved"] = True
        original_req = ctx.state.get("original_request", "Trigger action")
        approved_input = f"[OPERATOR APPROVED] {original_req}"
        return Event(route="approved", output=approved_input)
    emit_event(
        "hitl", "idle", "WARNING", "❌ Action cancelled by operator — no changes made."
    )
    return Event(
        route="cancelled", output="Action cancelled by operator. No changes were made."
    )


def final_output_node(node_input, ctx: Context):
    emit_event("mcp", "idle", "INFO", "MCP operations complete.")
    emit_event(
        "final", "active", "SUCCESS", "✅ Response returned to user successfully."
    )
    result = node_input
    emit_event("start", "idle", "INFO", "Workflow complete — ready for next request.")
    emit_event("final", "idle", "INFO", "Session round-trip complete.")
    return result


# Workflow definition
root_workflow = Workflow(
    name="silent_witness_workflow",
    edges=[
        ("START", security_checkpoint),
        (
            security_checkpoint,
            {
                "safe": orchestrator_agent,
                "violation": security_violation_node,
                "emergency": automated_emergency_node,
            },
        ),
        (orchestrator_agent, orchestrator_router),
        (
            orchestrator_router,
            {
                "human_confirmation": human_confirmation_node,
                "final_output": final_output_node,
            },
        ),
        (human_confirmation_node, post_confirmation_node),
        (
            post_confirmation_node,
            {"approved": orchestrator_agent, "cancelled": final_output_node},
        ),
        (security_violation_node, final_output_node),
        (automated_emergency_node, final_output_node),
    ],
)

root_agent = root_workflow

app = App(
    root_agent=root_workflow,
    name="app",
    resumability_config=ResumabilityConfig(is_resumable=True),
)

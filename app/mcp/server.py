import os
import sys

# Ensure the root directory containing 'app' is in sys.path
root_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if root_dir not in sys.path:
    sys.path.insert(0, root_dir)

os.environ["IS_MCP_SERVER"] = "TRUE"

import logging  # noqa: E402

from mcp.server import FastMCP  # noqa: E402

from app.tools.context import update_patient_context  # noqa: E402
from app.tools.profile import get_patient_profile, update_patient_profile  # noqa: E402
from app.tools.summary import generate_clinical_summary  # noqa: E402
from app.data.patients import PATIENTS  # noqa: E402

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("silent-witness-mcp")

mcp = FastMCP("SilentWitnessMCP")

# Register shared tool functions with MCP
mcp.tool()(get_patient_profile)
mcp.tool()(update_patient_profile)
mcp.tool()(update_patient_context)
mcp.tool()(generate_clinical_summary)


@mcp.tool()
def send_emergency_escalation(patient_id: str, message: str) -> str:
    """Simulate dispatching a critical mobile alert to the patient's caregiver and emergency services.

    Args:
        patient_id: The unique ID of the patient (e.g., 'P101').
        message: The emergency signal description or patient distress message.
    """
    p_id = patient_id.strip().upper()
    patient = PATIENTS.get(p_id)
    if not patient:
        return f"Patient ID '{patient_id}' not found."

    alert_details = (
        f"🚨 [URGENT EMERGENCY ALERT DISPATCHED] 🚨\n"
        f"Recipient: {patient['primary_caregiver']}\n"
        f"Patient: {patient['name']} (ID: {p_id})\n"
        f"Location: Patient Residence\n"
        f'Distress Details: "{message}"\n'
        f"Action Taken: Mobile push notification, SMS dispatch, and automated voice call initiated."
    )
    return alert_details


if __name__ == "__main__":
    mcp.run()

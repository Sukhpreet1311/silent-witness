import datetime

from app.data.patients import PATIENTS


def generate_clinical_summary(patient_id: str, symptom_notes: str) -> str:
    """Format and generate a structured medical note/summary suitable for doctors or medical charts.

    Args:
        patient_id: The unique ID of the patient (e.g., 'P101').
        symptom_notes: Detailed notes of translated expressions, symptoms, pain ratings, or needs.
    """
    p_id = patient_id.strip().upper()
    patient = PATIENTS.get(p_id)
    if not patient:
        return f"Patient ID '{patient_id}' not found."


    today = datetime.date.today().strftime("%B %d, %Y")

    summary = f"""CLINICAL STATUS SUMMARY
Date: {today}
Patient: {patient["name"]}
ID: {p_id}
Diagnosis: {patient["condition"]}
--------------------------------------------------
SUMMARY OF INTERPRETED COMMUNICATIONS / STATUS:
{symptom_notes}

ADDITIONAL HISTORICAL CONTEXT:
"""
    for h in patient["history"][-3:]:  # include last 3 log entries
        summary += f"- {h}\n"

    summary += f"""--------------------------------------------------
Prepared by: Silent Witness Assistive Platform
Direct caregiver contact: {patient["primary_caregiver"]}
"""
    return summary

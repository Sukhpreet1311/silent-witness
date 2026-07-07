from app.data.patients import PATIENTS


def update_patient_context(patient_id: str, entry: str) -> str:
    """Append a new preference, symptom observation, or log entry to the patient's record.

    Args:
        patient_id: The unique ID of the patient (e.g., 'P101').
        entry: The text entry to append (e.g., 'Prefers softer lighting after 6pm').
    """
    p_id = patient_id.strip().upper()
    patient = PATIENTS.get(p_id)
    if not patient:
        return f"Patient ID '{patient_id}' not found."


    patient["history"].append(entry)
    return f"Successfully added entry to {patient['name']}'s log: '{entry}'"

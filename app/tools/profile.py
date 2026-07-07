from app.data.patients import PATIENTS


def get_patient_profile(patient_id: str) -> str:
    """Retrieve details on the patient's condition, caregiver, signal system, and preferences.

    Args:
        patient_id: The unique ID of the patient (e.g., 'P101').
    """
    p_id = patient_id.strip().upper()
    patient = PATIENTS.get(p_id)
    if not patient:
        return f"Patient ID '{patient_id}' not found. Please verify the ID."


    profile = (
        f"### Patient Profile: {patient['name']} (ID: {p_id})\n"
        f"- **Age**: {patient['age']}\n"
        f"- **Condition**: {patient['condition']}\n"
        f"- **Primary Caregiver**: {patient['primary_caregiver']}\n"
        f"- **Primary Physician**: {patient['physician']}\n\n"
        f"#### Signal Translation Mappings:\n{patient['signal_system']}\n\n"
        f"#### Active Preferences:\n"
        + "\n".join(f"- {pref}" for pref in patient["preferences"])
    )
    return profile


def update_patient_profile(patient_id: str, field: str, value: str) -> str:
    """Update a specific field in the patient's profile (name, age, condition, caregiver, physician, or signal_system).
    ALWAYS requires human supervisor approval (HITL) before calling.

    Args:
        patient_id: The unique ID of the patient (e.g., 'P101').
        field: The field to update (must be one of: 'name', 'age', 'condition', 'caregiver', 'physician', 'signal_system').
        value: The new value for the field. For signal_system, format it as 'gesture = MEANING' (e.g., '4 blinks = WATER').
    """
    p_id = patient_id.strip().upper()
    patient = PATIENTS.get(p_id)
    if not patient:
        return f"Patient ID '{patient_id}' not found."


    field_lower = field.strip().lower()
    allowed_fields = [
        "name",
        "age",
        "condition",
        "caregiver",
        "physician",
        "signal_system",
    ]
    if field_lower not in allowed_fields:
        return (
            f"Invalid field '{field}'. Allowed fields are: {', '.join(allowed_fields)}."
        )

    if field_lower == "signal_system":
        # Split mapping lines
        lines = [
            line.strip()
            for line in patient["signal_system"].split("\n")
            if line.strip()
        ]
        new_mapping = value.strip()
        if not new_mapping.startswith("•"):
            new_mapping = f"• {new_mapping}"

        # Parse gesture to check if it already exists
        gesture = new_mapping.split("=")[0].replace("•", "").strip().lower()
        updated = False
        for i, line in enumerate(lines):
            line_gesture = line.split("=")[0].replace("•", "").strip().lower()
            if line_gesture == gesture:
                lines[i] = new_mapping
                updated = True
                break
        if not updated:
            lines.append(new_mapping)
        patient["signal_system"] = "\n".join(lines)
    else:
        if field_lower == "age":
            try:
                patient[field_lower] = int(value)
            except ValueError:
                return f"Age must be a valid integer, received: '{value}'."
        else:
            # Map caregiver and physician field names if they match app.data.patients schema
            key = "primary_caregiver" if field_lower == "caregiver" else field_lower
            patient[key] = value

    return f"Successfully updated patient {p_id} {field} to '{value}'."

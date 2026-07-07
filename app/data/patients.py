# Mock database of patients and their custom signal mappings
PATIENTS = {
    "P101": {
        "name": "Alex Mercer",
        "age": 42,
        "condition": "ALS (Amyotrophic Lateral Sclerosis) - Late Stage",
        "signal_system": (
            "• 1 eye blink = YES\n"
            "• 2 eye blinks = NO\n"
            "• 3 quick blinks = PAIN / DISCOMFORT\n"
            "• Prolonged gaze upward = CALL CAREGIVER\n"
            "• Repetitive gaze right = MOVE / ADJUST POSITION"
        ),
        "primary_caregiver": "Sarah Mercer (Spouse) - Phone: 555-0199",
        "physician": "Dr. Angela Thorne (Neurologist) - Clinic: 555-0143",
        "preferences": [
            "Prefers head elevated at 30 degrees.",
            "Wants classical music playing softly in afternoons.",
            "Cold water preferred over room temp.",
        ],
        "history": [
            "Pain spike managed with dosage at 09:00 AM.",
            "Reported stiffness in left arm during morning rotation.",
        ],
    },
    "P102": {
        "name": "Elena Rostova",
        "age": 58,
        "condition": "Locked-in Syndrome (LIS)",
        "signal_system": (
            "• 1 long blink = YES\n"
            "• 2 long blinks = NO\n"
            "• 3 rapid blinks = EMERGENCY / CHOKING / LOSS OF OXYGEN\n"
            "• Gaze upward left = WATER / THIRSTY\n"
            "• Gaze upward right = DISCOMFORT / PRESSURE POINT"
        ),
        "primary_caregiver": "Dmitri Rostov (Son) - Phone: 555-0288",
        "physician": "Dr. Marcus Vance (Neurologist) - Clinic: 555-0811",
        "preferences": [
            "Needs turning every 2 hours to avoid bed sores.",
            "Prefers bright lighting in the room.",
        ],
        "history": [
            "Had respiratory distress last month.",
            "Communication is stable via long blinks.",
        ],
    },
    "P103": {
        "name": "Marcus Aurelius",
        "age": 67,
        "condition": "Advanced Parkinson's Disease (Speech Impaired)",
        "signal_system": (
            "• Nod head = YES\n"
            "• Shake head = NO\n"
            "• Single finger tap = NEED TO USE RESTROOM\n"
            "• Double finger tap = PAIN LEVEL HIGH\n"
            "• Continuous finger tapping = URGENT CALL"
        ),
        "primary_caregiver": "Lucilla Aurelia (Daughter) - Phone: 555-0377",
        "physician": "Dr. Sophia Galen (Gerontologist) - Clinic: 555-0922",
        "preferences": [
            "Room temperature at 72 degrees.",
            "Prefers soft herbal tea.",
        ],
        "history": [
            "Fall risk. Use side rails on bed.",
            "Medication adjustment on Tuesday.",
        ],
    },
}

export interface SessionState {
  sessionId: string;
  history: any[];
  needsConfirmation: boolean;
  confirmationPrompt: string | null;
  latestResponse: string | null;
  isLoading: boolean;
}

export interface PatientProfile {
  id: string;
  name: string;
  age: number;
  condition: string;
  caregiver: string;
  physician: string;
  signalSystem: string[];
  preferences?: string[];
  history?: string[];
}

class ApiService {
  private baseUrl = '';

  async startSession(): Promise<{ sessionId: string }> {
    const res = await fetch(`${this.baseUrl}/api/session/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) throw new Error('Failed to start session');
    return res.json();
  }

  async sendMessage(sessionId: string, message: string): Promise<any> {
    const res = await fetch(`${this.baseUrl}/api/session/interact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, message }),
    });
    if (!res.ok) throw new Error('Failed to send message');
    return res.json();
  }

  async sendConfirmation(sessionId: string, confirm: boolean): Promise<any> {
    const res = await fetch(`${this.baseUrl}/api/session/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, confirm: confirm ? 'yes' : 'no' }),
    });
    if (!res.ok) throw new Error('Failed to send confirmation');
    return res.json();
  }

  async getSessionHistory(sessionId: string): Promise<any[]> {
    const res = await fetch(`${this.baseUrl}/api/session/${sessionId}/history`);
    if (!res.ok) throw new Error('Failed to retrieve history');
    const data = await res.json();
    return data.history || [];
  }

  async listPatients(): Promise<PatientProfile[]> {
    return [
      {
        id: 'P101',
        name: 'Alex Mercer',
        age: 42,
        condition: 'ALS (Amyotrophic Lateral Sclerosis) - Late Stage',
        caregiver: 'Sarah Mercer (Spouse) - Phone: 555-0199',
        physician: 'Dr. Angela Thorne (Neurologist) - Clinic: 555-0143',
        signalSystem: [
          '1 eye blink = YES',
          '2 eye blinks = NO',
          '3 quick blinks = PAIN / DISCOMFORT',
          'Prolonged gaze upward = CALL CAREGIVER',
          'Repetitive gaze right = MOVE / ADJUST POSITION',
        ],
        preferences: [
          "Prefers head elevated at 30 degrees.",
          "Wants classical music playing softly in afternoons.",
          "Cold water preferred over room temp.",
        ],
        history: [
          "Pain spike managed with dosage at 09:00 AM.",
          "Reported stiffness in left arm during morning rotation.",
        ]
      },
      {
        id: 'P102',
        name: 'Elena Rostova',
        age: 58,
        condition: 'Locked-in Syndrome (LIS)',
        caregiver: 'Dmitri Rostov (Son) - Phone: 555-0288',
        physician: 'Dr. Marcus Vance (Neurologist) - Clinic: 555-0811',
        signalSystem: [
          '1 long blink = YES',
          '2 long blinks = NO',
          '3 rapid blinks = EMERGENCY / CHOKING / LOSS OF OXYGEN',
          'Gaze upward left = WATER / THIRSTY',
          'Gaze upward right = DISCOMFORT / PRESSURE POINT',
        ],
        preferences: [
          "Needs turning every 2 hours to avoid bed sores.",
          "Prefers bright lighting in the room.",
        ],
        history: [
          "Had respiratory distress last month.",
          "Communication is stable via long blinks.",
        ]
      },
      {
        id: 'P103',
        name: 'Marcus Aurelius',
        age: 67,
        condition: "Advanced Parkinson's Disease (Speech Impaired)",
        caregiver: 'Lucilla Aurelia (Daughter) - Phone: 555-0377',
        physician: 'Dr. Sophia Galen (Gerontologist) - Clinic: 555-0922',
        signalSystem: [
          'Nod head = YES',
          'Shake head = NO',
          'Single finger tap = NEED TO USE RESTROOM',
          'Double finger tap = PAIN LEVEL HIGH',
          'Continuous finger tapping = URGENT CALL',
        ],
        preferences: [
          "Room temperature at 72 degrees.",
          "Prefers soft herbal tea.",
        ],
        history: [
          "Fall risk. Use side rails on bed.",
          "Medication adjustment on Tuesday.",
        ]
      },
    ];
  }
}

export const api = new ApiService();

// Represents the core editable properties of a persona
export interface PersonaState {
  name: string;
  role: string;
  tone: string;
  personality: string;
  worldview: string;
  experience: string;
  other: string; // New field for other free-form notes
  summary: string;
}

// Represents a single entry in the persona's history
export interface PersonaHistoryEntry {
  state: PersonaState;
  timestamp: string; // ISO string
  changeSummary: string; // AI-generated summary of changes
}

// The main Persona object, including its history
export interface Persona extends PersonaState {
  id: string;
  history: PersonaHistoryEntry[];
}

// Represents a message in the test chat
export interface ChatMessage {
  role: 'user' | 'model';
  parts: { text: string }[];
}

// Represents a custom voice configuration for Fish Audio
export interface Voice {
  id: string;
  name: string;
  token: string;
  voiceId: string;
}
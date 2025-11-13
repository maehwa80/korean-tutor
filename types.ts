
export enum CallStatus {
  IDLE = 'idle',
  CONNECTING = 'connecting',
  ACTIVE = 'active',
  ERROR = 'error',
  ENDED = 'ended',
}

export interface TranscriptMessage {
  speaker: 'user' | 'ai' | 'system';
  text: string;
}

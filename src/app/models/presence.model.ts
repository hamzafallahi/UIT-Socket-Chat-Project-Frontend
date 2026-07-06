export interface PresenceEvent {
  userId: string;
  status: 'ONLINE' | 'OFFLINE';
  lastSeen?: string | null;
  serverTime?: string | null;
}

export interface PresenceSnapshot {
  onlineUsers: string[];
  lastSeen: Record<string, string | null>;
  serverTime?: string | null;
}

export interface PresenceState {
  online: boolean;
  lastSeen: string | null;
}
import { Conversation, ConversationType } from '../services/chat-api.service';

export function getOtherParticipants(conv: Conversation, currentUserId: string): string {
  if (conv.type !== ConversationType.PRIVATE) return `Group (${conv.participants.length})`;
  return conv.participants.find(p => p !== currentUserId) ?? 'Unknown';
}

export function getOtherParticipantId(conv: Conversation, currentUserId: string): string | null {
  if (conv.type !== ConversationType.PRIVATE) return null;
  return conv.participants.find(p => p !== currentUserId) ?? null;
}

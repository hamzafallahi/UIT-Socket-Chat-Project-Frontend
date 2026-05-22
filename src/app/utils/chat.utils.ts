import { Conversation, ConversationType } from '../services/chat-api.service';

export function getOtherParticipants(conv: Conversation, currentUserId: string): string {
  if (conv.type !== ConversationType.PRIVATE) return `Group (${conv.participants.length})`;
  return conv.participants.find(p => p !== currentUserId) ?? 'Unknown';
}

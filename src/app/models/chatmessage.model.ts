export interface ChatMessage {
  id?: number;
  conversationId: number;
  senderId: string;
  content: string | null;
  timestamp?: string;
  status?: string;
  fileUrl?: string;
  messageType?: string;
}
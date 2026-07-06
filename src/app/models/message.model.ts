export enum MessageStatus {
  SENT = 'SENT',
  DELIVERED = 'DELIVERED',
  READ = 'READ',
}

export interface Message {
  id: number;
  conversationId: number;
  senderId: string;
  content: string;
  timestamp: string;
  status: MessageStatus;
}
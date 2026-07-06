export enum ConversationType {
  PRIVATE = 'PRIVATE',
  GROUP = 'GROUP',
}
export interface Conversation {
  id: number;
  participants: string[];
  type: ConversationType;
  createdAt: string;
}
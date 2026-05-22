export interface CallInvite {
  conversationId: number;
  fromUserId: string;
  fromDisplayName: string;
  toUserId: string;
  roomName: string;
  jitsiUrl: string;
  jwt: string | null;
}

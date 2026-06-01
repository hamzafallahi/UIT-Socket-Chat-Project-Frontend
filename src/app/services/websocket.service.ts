import { Injectable } from '@angular/core';
import { Client, IMessage, StompSubscription } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import { Subject } from 'rxjs';
import { CallInvite } from '../models/call-invite.model';

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

@Injectable({ providedIn: 'root' })
export class WebSocketService {
  private client!: Client;
  private messageSubject = new Subject<ChatMessage>();
  private callInviteSubject = new Subject<CallInvite>();
  private presenceEventSubject = new Subject<PresenceEvent>();
  private presenceSnapshotSubject = new Subject<PresenceSnapshot>();
  private chatSub?: StompSubscription;
  private globalSubs: StompSubscription[] = [];
  private connected = false;
  private onConnectCallback?: () => void;

  messages$ = this.messageSubject.asObservable();
  callInvites$ = this.callInviteSubject.asObservable();
  presenceEvents$ = this.presenceEventSubject.asObservable();
  presenceSnapshot$ = this.presenceSnapshotSubject.asObservable();

  // Fires for messages on ANY subscribed conversation (for badges)
  private globalMessageSubject = new Subject<ChatMessage>();
  globalMessages$ = this.globalMessageSubject.asObservable();

  connect(userId: string): void {
    if (this.connected) return;

    this.client = new Client({
      webSocketFactory: () => new SockJS('http://localhost:8082/ws') as WebSocket,
      reconnectDelay: 5000,
      connectHeaders: { userId },
      onConnect: () => {
        this.connected = true;

        this.client.subscribe(`/topic/call/${userId}`, (msg: IMessage) => {
          this.callInviteSubject.next(JSON.parse(msg.body));
        });

        this.client.subscribe('/topic/presence', (msg: IMessage) => {
          this.presenceEventSubject.next(JSON.parse(msg.body));
        });

        this.client.subscribe(`/topic/presence/${userId}`, (msg: IMessage) => {
          this.presenceSnapshotSubject.next(JSON.parse(msg.body));
        });

        this.client.publish({
          destination: '/app/presence.init',
          headers: { userId },
          body: '',
        });

        this.onConnectCallback?.();
      },
    });

    this.client.activate();
  }

  subscribeToAll(conversationIds: number[]): void {
    const doSubscribe = () => {
      this.globalSubs.forEach(s => s.unsubscribe());
      this.globalSubs = [];
      for (const id of conversationIds) {
        const sub = this.client.subscribe(`/topic/chat/${id}`, (msg: IMessage) => {
          const parsed: ChatMessage = JSON.parse(msg.body);
          this.globalMessageSubject.next(parsed);
        });
        this.globalSubs.push(sub);
      }
    };

    if (this.connected) {
      doSubscribe();
    } else {
      this.onConnectCallback = doSubscribe;
    }
  }

  subscribeTo(conversationId: number): void {
    this.chatSub?.unsubscribe();
    if (this.client?.connected) {
      this.chatSub = this.client.subscribe(`/topic/chat/${conversationId}`, (msg: IMessage) => {
        this.messageSubject.next(JSON.parse(msg.body));
      });
    }
  }

  sendMessage(conversationId: number, senderId: string, content: string): void {
    if (this.client?.connected) {
      this.client.publish({
        destination: '/app/chat.send',
        body: JSON.stringify({ conversationId, senderId, content,  messageType: 'TEXT' }),
      });
    }
  }

  sendFileMessage(conversationId: number, senderId: string, fileUrl: string, messageType: string): void {
    if (this.client?.connected) {
      this.client.publish({
        destination: '/app/chat.send', 
        body: JSON.stringify({ 
          conversationId, 
          senderId, 
          content: null, 
          fileUrl, 
          messageType 
        }),
      });
    }
  }

  sendCallInvite(invite: CallInvite): void {
    if (this.client?.connected) {
      this.client.publish({
        destination: '/app/call.invite',
        body: JSON.stringify(invite),
      });
    }
  }

  disconnect(): void {
    this.chatSub?.unsubscribe();
    this.globalSubs.forEach(s => s.unsubscribe());
    this.globalSubs = [];
    this.connected = false;
    this.onConnectCallback = undefined;
    this.client?.deactivate();
  }
}

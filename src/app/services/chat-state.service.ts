import { inject, Injectable, OnDestroy, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import { WebSocketService } from './websocket.service';
import { ChatApiService } from './chat-api.service';
import {UserResult } from '../models/user.model';
import {Conversation, ConversationType} from '../models/conversasion.model';
import { AuthService } from './auth.service';
import { CallInvite } from '../models/call-invite.model';
import { ChatMessage } from '../models/chatmessage.model';
import {PresenceEvent, PresenceSnapshot, PresenceState} from '../models/presence.model';


@Injectable()
export class ChatStateService implements OnDestroy {
  private readonly wsService = inject(WebSocketService);
  private readonly chatApi = inject(ChatApiService);
  private readonly authService = inject(AuthService);

  // ── User ──
  readonly currentUserId = signal(this.authService.getUserId());
  readonly currentDisplayName = signal(this.authService.getDisplayName());

  // ── Shared state ──
  readonly conversations = signal<Conversation[]>([]);
  readonly activeConversation = signal<Conversation | null>(null);
  readonly messages = signal<ChatMessage[]>([]);
  readonly unreadCounts = signal<Record<number, number>>({});
  readonly incomingCall = signal<CallInvite | null>(null);
  readonly presenceByUser = signal<Record<string, PresenceState>>({});

  private readonly serverTimeOffsetMs = signal(0);
  private readonly presenceNow = signal(Date.now());
  private presenceTimer: ReturnType<typeof setInterval> | null = null;

  private subs: Subscription[] = [];

  init(): void {
    this.wsService.connect(this.currentUserId());
    this.loadConversations();
    this.startPresenceClock();

    this.subs.push(
      this.wsService.messages$.subscribe(msg => {
        if (msg.conversationId === this.activeConversation()?.id) {
          this.messages.update(prev => [...prev, msg]);
        }
      }),
      this.wsService.globalMessages$.subscribe(msg => {
        const activeId = this.activeConversation()?.id;
        if (msg.conversationId === activeId || msg.senderId === this.currentUserId()) return;
        this.unreadCounts.update(c => ({ ...c, [msg.conversationId]: (c[msg.conversationId] || 0) + 1 }));
      }),
      this.wsService.callInvites$.subscribe(invite => {
        this.incomingCall.set(invite);
      }),
      this.wsService.presenceSnapshot$.subscribe(snapshot => {
        this.applyPresenceSnapshot(snapshot);
      }),
      this.wsService.presenceEvents$.subscribe(event => {
        this.applyPresenceEvent(event);
      }),
    );
  }

  ngOnDestroy(): void {
    this.subs.forEach(s => s.unsubscribe());
    this.wsService.disconnect();
    this.stopPresenceClock();
  }

  // ── Conversations ──

  private loadConversations(): void {
    this.chatApi.getConversations(this.currentUserId()).subscribe(convs => {
      this.conversations.set(convs);
      this.wsService.subscribeToAll(convs.map(c => c.id));
    });
  }

  selectConversation(conv: Conversation): void {
    this.activeConversation.set(conv);
    this.unreadCounts.update(c => { const u = { ...c }; delete u[conv.id]; return u; });
    this.wsService.subscribeTo(conv.id);
    this.chatApi.getMessages(conv.id).subscribe(msgs => this.messages.set(msgs));
  }

  // ── Messaging ──

  sendMessage(content: string): void {
    const conv = this.activeConversation();
    if (!conv) return;
    this.wsService.sendMessage(conv.id, this.currentUserId(), content);
  }
  
  sendFileMessage(fileUrl: string, messageType: string): void {
    const conv = this.activeConversation();
    if (!conv) return;
    
    this.wsService.sendFileMessage(conv.id, this.currentUserId(), fileUrl, messageType);
  }


  // ── Conversation creation ──

  createOrSelectPrivateChat(user: UserResult): void {
    const existing = this.conversations().find(
      c => c.type === ConversationType.PRIVATE && c.participants.includes(user.username)
    );
    if (existing) { this.selectConversation(existing); return; }
    this.chatApi.createConversation([this.currentUserId(), user.username], ConversationType.PRIVATE)
      .subscribe(conv => { this.conversations.update(prev => [conv, ...prev]); this.selectConversation(conv); });
  }

  createGroup(members: UserResult[]): void {
    const participants = [this.currentUserId(), ...members.map(m => m.username)];
    this.chatApi.createConversation(participants, ConversationType.GROUP).subscribe(conv => {
      this.conversations.update(prev => [conv, ...prev]);
      this.wsService.subscribeToAll([conv.id]);
      this.selectConversation(conv);
    });
  }

  // ── Call events ──

  clearIncomingCall(): void { this.incomingCall.set(null); }

  // ── Presence helpers ──

  isOnline(userId: string | null): boolean {
    if (!userId) return false;
    return this.presenceByUser()[userId]?.online ?? false;
  }

  getPresenceLabel(userId: string | null): string {
    if (!userId) return '';
    const entry = this.presenceByUser()[userId];
    this.presenceNow();

    if (entry?.online) return 'Active now';
    if (!entry?.lastSeen) return 'Offline';

    const lastSeenMs = Date.parse(entry.lastSeen);
    if (Number.isNaN(lastSeenMs)) return 'Offline';

    const diffMs = Math.max(0, this.getServerNowMs() - lastSeenMs);
    const minutes = Math.floor(diffMs / 60000);
    if (minutes < 60) return `Active ${Math.max(1, minutes)}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `Active ${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `Active ${days}d ago`;
  }

  private applyPresenceSnapshot(snapshot: PresenceSnapshot): void {
    if (!snapshot) return;
    this.updateServerTimeOffset(snapshot.serverTime);

    const next: Record<string, PresenceState> = {};
    const lastSeenMap = snapshot.lastSeen ?? {};
    for (const [userId, lastSeen] of Object.entries(lastSeenMap)) {
      next[userId] = { online: false, lastSeen: lastSeen ?? null };
    }

    const onlineUsers = snapshot.onlineUsers ?? [];
    for (const userId of onlineUsers) {
      const existing = next[userId] ?? { online: false, lastSeen: null };
      next[userId] = { ...existing, online: true };
    }

    this.presenceByUser.set(next);
  }

  private applyPresenceEvent(event: PresenceEvent): void {
    if (!event?.userId) return;
    this.updateServerTimeOffset(event.serverTime);

    this.presenceByUser.update(prev => {
      const next = { ...prev };
      const current = next[event.userId] ?? { online: false, lastSeen: null };
      if (event.status === 'ONLINE') {
        next[event.userId] = { ...current, online: true };
      } else if (event.status === 'OFFLINE') {
        next[event.userId] = { online: false, lastSeen: event.lastSeen ?? current.lastSeen };
      }
      return next;
    });
  }

  private updateServerTimeOffset(serverTime?: string | null): void {
    if (!serverTime) return;
    const parsed = Date.parse(serverTime);
    if (!Number.isNaN(parsed)) {
      this.serverTimeOffsetMs.set(Date.now() - parsed);
    }
  }

  private getServerNowMs(): number {
    return this.presenceNow() - this.serverTimeOffsetMs();
  }

  private startPresenceClock(): void {
    if (this.presenceTimer) return;
    this.presenceNow.set(Date.now());
    this.presenceTimer = setInterval(() => {
      this.presenceNow.set(Date.now());
    }, 60000);
  }

  private stopPresenceClock(): void {
    if (this.presenceTimer) {
      clearInterval(this.presenceTimer);
      this.presenceTimer = null;
    }
  }
}

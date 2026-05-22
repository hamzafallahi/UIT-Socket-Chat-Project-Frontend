import { inject, Injectable, OnDestroy, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import { WebSocketService, ChatMessage } from './websocket.service';
import { ChatApiService, Conversation, UserResult, ConversationType } from './chat-api.service';
import { AuthService } from './auth.service';
import { CallInvite } from '../models/call-invite.model';

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

  private subs: Subscription[] = [];

  init(): void {
    this.wsService.connect(this.currentUserId());
    this.loadConversations();

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
    );
  }

  ngOnDestroy(): void {
    this.subs.forEach(s => s.unsubscribe());
    this.wsService.disconnect();
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
}

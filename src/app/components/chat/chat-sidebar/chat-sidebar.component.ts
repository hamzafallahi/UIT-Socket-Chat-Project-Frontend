import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { ChatApiService, UserResult, ConversationType } from '../../../services/chat-api.service';
import { ChatStateService } from '../../../services/chat-state.service';
import { WebSocketService } from '../../../services/websocket.service';
import { AuthService } from '../../../services/auth.service';
import { getOtherParticipants } from '../../../utils/chat.utils';
import { LucideLogOut } from '@lucide/angular';


@Component({
  selector: 'app-chat-sidebar',
  standalone: true,
  imports: [CommonModule, FormsModule,LucideLogOut],
  templateUrl: './chat-sidebar.component.html',
  styleUrl: './chat-sidebar.component.css',
})
export class ChatSidebarComponent {
  readonly state = inject(ChatStateService);
  private readonly authService = inject(AuthService);
  private readonly wsService = inject(WebSocketService);
  private readonly chatApi = inject(ChatApiService);
  readonly getOtherParticipants = getOtherParticipants;

  searchQuery = '';
  searchResults = signal<UserResult[]>([]);
  showSearch = signal(false);

  showGroupModal = signal(false);
  groupSearchQuery = '';
  groupSearchResults = signal<UserResult[]>([]);
  selectedGroupMembers = signal<UserResult[]>([]);

  get privateChats() {
    return this.state.conversations().filter(c => c.type === ConversationType.PRIVATE);
  }

  get groupChats() {
    return this.state.conversations().filter(c => c.type !== ConversationType.PRIVATE);
  }

  // ── Combined search for both user & group search ──
  search(type: 'user' | 'group', query: string): void {
    const q = query.trim();
    if (q.length < 2) {
      if (type === 'user') {
        this.searchResults.set([]);
        this.showSearch.set(false);
      } else {
        this.groupSearchResults.set([]);
      }
      return;
    }

    const selected = type === 'group' ? this.selectedGroupMembers().map(m => m.username) : [];
    this.chatApi.searchUsers(q).subscribe(r => {
      const filtered = r.filter(u => 
        u.username !== this.state.currentUserId() && 
        !selected.includes(u.username)
      );
      if (type === 'user') {
        this.searchResults.set(filtered);
        this.showSearch.set(true);
      } else {
        this.groupSearchResults.set(filtered);
      }
    });
  }

  // ── Simplified group member management ──
  updateGroupMembers(user: UserResult, action: 'add' | 'remove'): void {
    if (action === 'add') {
      this.selectedGroupMembers.update(prev => [...prev, user]);
      this.groupSearchResults.update(prev => prev.filter(u => u.username !== user.username));
      this.groupSearchQuery = '';
    } else {
      this.selectedGroupMembers.update(prev => prev.filter(u => u.username !== user.username));
    }
  }

  createGroup(): void {
    const members = this.selectedGroupMembers();
    if (members.length < 2) return;
    this.state.createGroup(members);
    this.showGroupModal.set(false);
  }

  logout(): void {
    this.wsService.disconnect();
    this.authService.logout();
  }
}

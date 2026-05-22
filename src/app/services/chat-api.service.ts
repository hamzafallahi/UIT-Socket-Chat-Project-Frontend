import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export enum ConversationType {
  PRIVATE = 'PRIVATE',
  GROUP = 'GROUP',
}

export enum MessageStatus {
  SENT = 'SENT',
  DELIVERED = 'DELIVERED',
  READ = 'READ',
}

export interface Conversation {
  id: number;
  participants: string[];
  type: ConversationType;
  createdAt: string;
}

export interface Message {
  id: number;
  conversationId: number;
  senderId: string;
  content: string;
  timestamp: string;
  status: MessageStatus;
}

export interface UserResult {
  username: string;
  displayName: string;
}

@Injectable({ providedIn: 'root' })
export class ChatApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = 'http://localhost:8082/api/chat';

  createConversation(participants: string[], type: ConversationType = ConversationType.PRIVATE): Observable<Conversation> {
    return this.http.post<Conversation>(`${this.baseUrl}/conversations`, { participants, type });
  }

  getConversations(userId: string): Observable<Conversation[]> {
    return this.http.get<Conversation[]>(`${this.baseUrl}/conversations/${userId}`);
  }

  getMessages(conversationId: number): Observable<Message[]> {
    return this.http.get<Message[]>(`${this.baseUrl}/messages/${conversationId}`);
  }

  searchUsers(query: string): Observable<UserResult[]> {
    return this.http.get<UserResult[]>(`${this.baseUrl}/users/search`, { params: { q: query } });
  }
}

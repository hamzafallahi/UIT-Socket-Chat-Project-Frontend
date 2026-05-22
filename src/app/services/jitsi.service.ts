import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface JitsiRoom {
  conversationId: number;
  roomName: string;
  jitsiUrl: string;
  jwt: string | null;
}

@Injectable({ providedIn: 'root' })
export class JitsiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = 'http://localhost:8082/api/jitsi';

  startVideoCall(conversationId: number, userId: string, displayName: string): Observable<JitsiRoom> {
    return this.http.post<JitsiRoom>(
      `${this.baseUrl}/room/${conversationId}?userId=${userId}&displayName=${displayName}`,
      {}
    );
  }

  endVideoCall(conversationId: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/room/${conversationId}`);
  }
}

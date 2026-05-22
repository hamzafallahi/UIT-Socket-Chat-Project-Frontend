import { Component, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { WebSocketService } from '../../../services/websocket.service';
import { JitsiService, JitsiRoom } from '../../../services/jitsi.service';
import { ChatStateService } from '../../../services/chat-state.service';
import { getOtherParticipants } from '../../../utils/chat.utils';
import { JitsiRoomComponent } from '../../jitsi-room/jitsi-room.component';

@Component({
  selector: 'app-chat-main',
  standalone: true,
  imports: [CommonModule, FormsModule, JitsiRoomComponent],
  templateUrl: './chat-main.component.html',
  styleUrl: './chat-main.component.css',
})
export class ChatMainComponent implements OnDestroy {
  readonly state = inject(ChatStateService);
  private readonly wsService = inject(WebSocketService);
  private readonly jitsiService = inject(JitsiService);
  readonly getOtherParticipants = getOtherParticipants;

  newMessage = '';
  jitsiRoom = signal<JitsiRoom | null>(null);
  showVideo = signal(false);
  private ringTimer: ReturnType<typeof setInterval> | null = null;

  ngOnDestroy(): void {
    this.stopRinging();
  }

  send(): void {
    const content = this.newMessage.trim();
    if (!content || !this.state.activeConversation()) return;
    this.state.sendMessage(content);
    this.newMessage = '';
  }

  startCall(): void {
    const conv = this.state.activeConversation();
    if (!conv) return;
    this.jitsiService.startVideoCall(conv.id, this.state.currentUserId(), this.state.currentDisplayName()).subscribe(room => {
      this.jitsiRoom.set(room);
      this.showVideo.set(true);
      conv.participants.filter(p => p !== this.state.currentUserId()).forEach(toUserId =>
        this.wsService.sendCallInvite({
          conversationId: conv.id, fromUserId: this.state.currentUserId(),
          fromDisplayName: this.state.currentDisplayName(), toUserId,
          roomName: room.roomName, jitsiUrl: room.jitsiUrl, jwt: room.jwt,
        })
      );
    });
  }

  handleCallResponse(action: 'accept' | 'decline'): void {
    if (action === 'accept') {
      const invite = this.state.incomingCall();
      if (!invite) return;
      this.stopRinging();
      this.jitsiRoom.set({ conversationId: invite.conversationId, roomName: invite.roomName, jitsiUrl: invite.jitsiUrl, jwt: invite.jwt });
      this.showVideo.set(true);
    } else {
      this.stopRinging();
    }
    this.state.clearIncomingCall();
  }

  endVideoCall(): void {
    const conv = this.state.activeConversation();
    this.showVideo.set(false);
    this.jitsiRoom.set(null);
    if (conv) this.jitsiService.endVideoCall(conv.id).subscribe({ error: () => {} });
  }

  startRinging(): void {
    this.stopRinging();
    this.playRingTone();
    this.ringTimer = setInterval(() => this.playRingTone(), 1600);
  }

  private stopRinging(): void {
    if (this.ringTimer) { clearInterval(this.ringTimer); this.ringTimer = null; }
  }

  private playRingTone(): void {
    if (!window.AudioContext) return;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine'; osc.frequency.value = 880; gain.gain.value = 0.08;
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(); osc.stop(ctx.currentTime + 0.2);
    osc.onended = () => ctx.close().catch(() => {});
  }
}

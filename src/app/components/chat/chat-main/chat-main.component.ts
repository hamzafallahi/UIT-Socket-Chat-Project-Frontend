import { Component, inject, OnDestroy, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { WebSocketService } from '../../../services/websocket.service';
import { JitsiService, JitsiRoom } from '../../../services/jitsi.service';
import { ChatStateService } from '../../../services/chat-state.service';
import { getOtherParticipantId, getOtherParticipants } from '../../../utils/chat.utils';
import { JitsiRoomComponent } from '../../jitsi-room/jitsi-room.component';
import { HttpClient } from '@angular/common/http'; 

// Interface to manage staging files locally
interface StagedFile {
  id: string;
  file: File;
  previewUrl: string;      // local blob URL for immediate UI rendering
  cloudinaryUrl: string | null;
  isUploading: boolean;
  type: 'IMAGE' | 'FILE';
}


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
  readonly http = inject(HttpClient);
  readonly getOtherParticipants = getOtherParticipants;
  readonly getOtherParticipantId = getOtherParticipantId;
  selectedModalImage = signal<string | null>(null);

  newMessage = '';
  jitsiRoom = signal<JitsiRoom | null>(null);
  showVideo = signal(false);
//  isUploading = signal(false);
  private ringTimer: ReturnType<typeof setInterval> | null = null;

  // --- ATTACHMENT SIGNALS ---
  stagedFiles = signal<StagedFile[]>([]);
  isDragActive = signal(false);

  // Computed state: Lock input if ANY file is currently uploading to Cloudinary
  isUploading = computed(() => this.stagedFiles().some(f => f.isUploading));


  ngOnDestroy(): void {
    this.stopRinging();
  }

send(): void {
    if (!this.state.activeConversation() || this.isUploading()) return;

    const content = this.newMessage.trim();
    const filesToSend = this.stagedFiles();

    // 1. If there's text, send it
    if (content) {
      this.state.sendMessage(content);
      this.newMessage = '';
    }

    // 2. Loop through all successfully uploaded files and send them
    filesToSend.forEach(file => {
      if (file.cloudinaryUrl) {
        this.state.sendFileMessage(file.cloudinaryUrl, file.type);
      }
    });

    // 3. Clear out the staging array
    this.stagedFiles.set([]);
  }

  // --- DRAG AND DROP HANDLERS ---
  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragActive.set(true);
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragActive.set(false);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragActive.set(false);

    if (event.dataTransfer?.files) {
      this.handleFileSelection(event.dataTransfer.files);
    }
  }

  onFileSelected(event: any): void {
    if (event.target.files) {
      this.handleFileSelection(event.target.files);
      event.target.value = ''; // Clear file input element
    }
  }

  // --- MULTI-FILE UPLOAD PROCESSOR ---
  private handleFileSelection(fileList: FileList): void {
    const filesArray = Array.from(fileList);

    filesArray.forEach(file => {
      // 10MB individual limit
      if (file.size > 10485760) {
        alert(`File "${file.name}" is too large! Max 10MB.`);
        return;
      }

      const isImage = file.type.startsWith('image/');
      
      const newStagedFile: StagedFile = {
        id: Math.random().toString(36).substring(2),
        file: file,
        previewUrl: isImage ? URL.createObjectURL(file) : '', // Local UI link
        cloudinaryUrl: null,
        isUploading: true,
        type: isImage ? 'IMAGE' : 'FILE'
      };

      // Add to list immediately for preview rendering
      this.stagedFiles.update(prev => [...prev, newStagedFile]);

      // Fire off background upload to Cloudinary
      this.uploadToCloudinary(newStagedFile);
    });
  } 
  
  // --- UPLOAD LOGIC ---
  private uploadToCloudinary(stagedFile: StagedFile): void {
    const formData = new FormData();
    formData.append('file', stagedFile.file);
    formData.append('upload_preset', 'angular_chat_uploads'); 

    const cloudinaryUrl = `https://api.cloudinary.com/v1_1/dhyshiau6/upload`;

    fetch(cloudinaryUrl, { method: 'POST', body: formData })
      .then(res => res.json())
      .then(data => {
        this.stagedFiles.update(prev => 
          prev.map(f => f.id === stagedFile.id 
            ? { ...f, isUploading: false, cloudinaryUrl: data.secure_url } 
            : f
          )
        );
      })
      .catch(err => {
        console.error('Cloudinary upload failure', err);
        // Remove failed file from preview list
        this.removeFile(stagedFile.id);
        alert(`Failed to upload ${stagedFile.file.name}`);
      });
  }

  removeFile(id: string): void {
    this.stagedFiles.update(prev => {
      const fileToRemove = prev.find(f => f.id === id);
      if (fileToRemove?.previewUrl) {
        URL.revokeObjectURL(fileToRemove.previewUrl); // Prevent memory leaks
      }
      return prev.filter(f => f.id !== id);
    });
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

  getOtherUserId(): string | null {
    const conv = this.state.activeConversation();
    if (!conv) return null;
    return getOtherParticipantId(conv, this.state.currentUserId());
  }
  
  openImageModal(url: string | undefined): void {
  if (url) {
    this.selectedModalImage.set(url);
  }
  }

  closeImageModal(): void {
    this.selectedModalImage.set(null);
  }

}

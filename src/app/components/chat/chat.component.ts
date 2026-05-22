import { Component, inject, OnInit } from '@angular/core';
import { ChatSidebarComponent } from './chat-sidebar/chat-sidebar.component';
import { ChatMainComponent } from './chat-main/chat-main.component';
import { ChatStateService } from '../../services/chat-state.service';

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [ChatSidebarComponent, ChatMainComponent],
  providers: [ChatStateService],
  templateUrl: './chat.component.html',
  styleUrl: './chat.component.css',
})
export class ChatComponent implements OnInit {
  private readonly state = inject(ChatStateService);

  ngOnInit(): void {
    this.state.init();
  }
}

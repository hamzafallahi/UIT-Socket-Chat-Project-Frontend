import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnDestroy,
  ElementRef,
  ViewChild,
  AfterViewInit,
} from '@angular/core';

@Component({
  selector: 'app-jitsi-room',
  standalone: true,
  template: `
    <div class="jitsi-wrapper">
      <div #jitsiContainer class="jitsi-container"></div>
    </div>
  `,
  styles: [
    `
      .jitsi-wrapper {
        width: 100%;
        border-bottom: 2px solid #020245;
      }
      .jitsi-container {
        width: 100%;
        height: 480px;
      }
      .jitsi-container iframe {
        width: 100%;
        height: 100%;
        border: none;
      }
    `,
  ],
})
export class JitsiRoomComponent implements AfterViewInit, OnDestroy {
  @Input({ required: true }) jitsiUrl!: string;
  @Input({ required: true }) roomName!: string;
  @Input() displayName = 'Guest';
  @Input() jwt: string | null = null;

  @Output() hangUp = new EventEmitter<void>();

  @ViewChild('jitsiContainer', { static: false })
  jitsiContainer!: ElementRef<HTMLDivElement>;

  private api: any;

  ngAfterViewInit(): void {
    this.loadJitsiScript().then(() => this.initJitsiApi());
  }

  ngOnDestroy(): void {
    this.api?.dispose();
  }

  private emitHangUp = (): void => {
    this.hangUp.emit();
  };

  private loadJitsiScript(): Promise<void> {
    return new Promise((resolve) => {
      if ((window as any)['JitsiMeetExternalAPI']) {
        resolve();
        return;
      }

      const origin = this.extractOrigin(this.jitsiUrl);
      const script = document.createElement('script');
      script.src = `${origin}/external_api.js`;
      script.onload = () => resolve();
      script.onerror = () => {
        console.warn('Failed to load Jitsi API from', origin, '— falling back to meet.jit.si');
        const fallback = document.createElement('script');
        fallback.src = 'https://meet.jit.si/external_api.js';
        fallback.onload = () => resolve();
        document.head.appendChild(fallback);
      };
      document.head.appendChild(script);
    });
  }

  private initJitsiApi(): void {
    const domain = this.extractDomain(this.jitsiUrl);
    const isHttp = this.jitsiUrl.startsWith('http://');

    const restoreMessageOriginShim = isHttp
      ? this.installHttpMessageOriginShim(domain)
      : null;

    this.api = new (window as any)['JitsiMeetExternalAPI'](domain, {
      roomName: this.roomName,
      parentNode: this.jitsiContainer.nativeElement,
      width: '100%',
      height: 480,
      noSSL: isHttp,
      userInfo: {
        displayName: this.displayName,
      },
      configOverwrite: {
        prejoinPageEnabled: false,
        prejoinConfig: { enabled: false },
        enableWelcomePage: false,
        disableModeratorIndicator: true,
        startWithAudioMuted: false,
        startWithVideoMuted: false,
        requireDisplayName: false,
        readOnlyName: true,
        enableInsecureRoomNameWarning: false,
        defaultLocalDisplayName: this.displayName,
        enableNoisyMicDetection: false,
      },
      interfaceConfigOverwrite: {
        SHOW_JITSI_WATERMARK: false,
        SHOW_WATERMARK_FOR_GUESTS: false,
        DISPLAY_WELCOME_PAGE_CONTENT: false,
        SHOW_PROMOTIONAL_CLOSE_PAGE: false,
        SHOW_BRAND_WATERMARK: false,
        HIDE_INVITE_MORE_HEADER: true,
        TOOLBAR_BUTTONS: [
          'microphone',
          'camera',
          'desktop',
          'chat',
          'raisehand',
          'hangup',
          'tileview',
          'fullscreen',
        ],
      },
    });

    // Restore the native listener registration after Jitsi wires its internals.
    restoreMessageOriginShim?.();

    if (isHttp) {
      this.patchIframeSrcToHttp();
    }

    this.api.addEventListener('displayNameRequired', () => {
      this.api.executeCommand('displayName', this.displayName);
    });

    this.api.addEventListener('readyToClose', this.emitHangUp);
    this.api.addEventListener('videoConferenceLeft', this.emitHangUp);
  }

  private installHttpMessageOriginShim(domain: string): () => void {
    const httpOrigin = `http://${domain}`;
    const httpsOrigin = `https://${domain}`;
    const originalAdd = window.addEventListener.bind(window);
    const patchedAdd: typeof window.addEventListener = (
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | AddEventListenerOptions,
    ) => {
      if (type !== 'message') {
        originalAdd(type, listener, options);
        return;
      }

      const wrapped = (event: MessageEvent) => {
        if (event.origin !== httpOrigin) {
          typeof listener === 'function'
            ? listener(event)
            : listener.handleEvent(event);
          return;
        }

        const patched = new MessageEvent('message', {
          data: event.data,
          origin: httpsOrigin,
          source: event.source,
          ports: [...event.ports],
        });

        typeof listener === 'function'
          ? listener(patched)
          : listener.handleEvent(patched);
      };

      originalAdd('message', wrapped, options);
    };

    window.addEventListener = patchedAdd;
    return () => {
      window.addEventListener = originalAdd;
    };
  }

  private patchIframeSrcToHttp(): void {
    const iframe = this.api?.getIFrame?.();
    if (iframe?.src) {
      iframe.src = iframe.src.replace('https://', 'http://');
    }
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private extractOrigin(url: string): string {
    try {
      return new URL(url).origin;
    } catch {
      return 'https://meet.jit.si';
    }
  }

  private extractDomain(url: string): string {
    try {
      return new URL(url).host;
    } catch {
      return 'meet.jit.si';
    }
  }
}

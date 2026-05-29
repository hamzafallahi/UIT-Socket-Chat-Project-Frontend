import { Component, signal, inject, LOCALE_ID } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { RouterOutlet } from '@angular/router';

type LocaleId = 'en-US' | 'fr-FR';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  private readonly document = inject(DOCUMENT);
  readonly currentLocale = inject(LOCALE_ID) as LocaleId;
  readonly locales: { id: LocaleId; label: string; prefix: string }[] = [
    { id: 'en-US', label: 'EN', prefix: '' },
    { id: 'fr-FR', label: 'FR', prefix: 'fr-FR' },
  ];
  protected readonly title = signal('uitprojectfront');

  switchLocale(localeId: LocaleId): void {
    if (localeId === this.currentLocale) return;

    const url = new URL(this.document.location.href);
    const segments = url.pathname.split('/').filter(Boolean);
    const localePrefixes = this.locales.map((locale) => locale.prefix).filter(Boolean);

    if (segments.length > 0 && localePrefixes.includes(segments[0])) {
      segments.shift();
    }

    const targetPrefix = this.locales.find((locale) => locale.id === localeId)?.prefix ?? '';
    const nextPath = '/' + [targetPrefix, ...segments].filter(Boolean).join('/');
    url.pathname = nextPath === '' ? '/' : nextPath;

    this.document.location.href = url.toString();
  }
}

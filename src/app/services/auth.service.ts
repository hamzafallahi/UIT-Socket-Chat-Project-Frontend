import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { tap } from 'rxjs';

export interface LoginResponse {
  token: string;
  userId: string;
  displayName: string;
  role: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly baseUrl = 'http://localhost:8082/api/auth';

  isLoggedIn = signal(this.hasToken());

  login(username: string, password: string) {
    return this.http.post<LoginResponse>(`${this.baseUrl}/login`, { username, password }).pipe(
      tap((res) => {
        localStorage.setItem('token', res.token);
        localStorage.setItem('userId', res.userId);
        localStorage.setItem('displayName', res.displayName);
        localStorage.setItem('role', res.role);
        this.isLoggedIn.set(true);
      })
    );
  }

  register(username: string, password: string, displayName: string) {
    return this.http.post<LoginResponse>(`${this.baseUrl}/register`, { username, password, displayName }).pipe(
      tap((res) => {
        localStorage.setItem('token', res.token);
        localStorage.setItem('userId', res.userId);
        localStorage.setItem('displayName', res.displayName);
        localStorage.setItem('role', res.role);
        this.isLoggedIn.set(true);
      })
    );
  }

  logout(): void {
    localStorage.removeItem('token');
    localStorage.removeItem('userId');
    localStorage.removeItem('displayName');
    localStorage.removeItem('role');
    this.isLoggedIn.set(false);
    this.router.navigate(['/login']);
  }

  getToken(): string | null {
    return localStorage.getItem('token');
  }

  getUserId(): string {
    return localStorage.getItem('userId') ?? '';
  }

  getDisplayName(): string {
    return localStorage.getItem('displayName') ?? '';
  }

  private hasToken(): boolean {
    return !!localStorage.getItem('token');
  }
}

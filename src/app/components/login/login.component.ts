import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css',
})
export class LoginComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  username = '';
  password = '';
  displayName = '';
  isRegister = signal(false);
  error = signal('');
  loading = signal(false);

  toggleMode(): void {
    this.isRegister.update(v => !v);
    this.error.set('');
  }

  onSubmit(): void {
    if (!this.username || !this.password) {
      this.error.set('Please fill in all fields');
      return;
    }

    this.loading.set(true);
    this.error.set('');

    const action = this.isRegister()
      ? this.authService.register(this.username, this.password, this.displayName || this.username)
      : this.authService.login(this.username, this.password);

    action.subscribe({
      next: () => {
        this.loading.set(false);
        this.router.navigate(['/chat']);
      },
      error: () => {
        this.loading.set(false);
        this.error.set(this.isRegister() ? 'Registration failed' : 'Invalid username or password');
      },
    });
  }
}

// src/app/auth/auth.service.ts

import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';


@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private token = signal<string | null>(localStorage.getItem('token'));
  private readonly apiUrl = '/auth/google';
  constructor() {}
  loginWithGoogle(): Observable<any> {
    // Opens popup or redirects to Google login flow
    window.location.href = this.apiUrl;
    return of(null); // This is here to match return type. Actual login happens via redirect.
  }
  login(): void {
    // Redirect to backend Google login
    window.location.href = '/auth/google';
  }

  logout(router: Router): void {
    localStorage.removeItem('token');
    this.token.set(null);
    router.navigate(['/play']);
  }

  setToken(token: string): void {
    localStorage.setItem('token', token);
    this.token.set(token);
  }

  getToken(): string | null {
    return this.token();
  }

  loggedIn(): boolean {
    return !!this.token();
  }
}

import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common'; // 👈 Add this
import { AuthService } from './auth.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule], // 👈 Add CommonModule here
  template: `
    <div class="login-container">
      <div class="login-card">
        <h2 class="title">Welcome to Online Chess</h2>
        <p class="subtitle">Sign in to play, track your stats, and compete globally</p>

        <p *ngIf="auth.loggedIn()" class="info-text">
          You're already logged in. Redirecting...
        </p>

        <button *ngIf="!auth.loggedIn()" (click)="login()" class="google-btn">
          <img src="https://www.svgrepo.com/show/355037/google.svg" alt="Google logo" class="google-icon">
          Continue with Google
        </button>
      </div>
    </div>
  `,
  styles: [`
    /* --- Page Layout --- */
    .login-container {
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      background: linear-gradient(135deg, #1e1e1e, #3b3b3b);
      color: #fff;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    }

    .login-card {
      background: #2a2a2a;
      padding: 3em 2.5em;
      border-radius: 16px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.3);
      text-align: center;
      max-width: 380px;
      width: 100%;
      animation: fadeIn 0.8s ease;
    }

    .title {
      font-size: 1.8rem;
      margin-bottom: 0.5em;
      color: #ff9800;
    }

    .subtitle {
      font-size: 0.95rem;
      color: #ccc;
      margin-bottom: 2em;
    }

    /* --- Info Text --- */
    .info-text {
      background: rgba(255, 255, 255, 0.1);
      padding: 0.75em 1em;
      border-radius: 8px;
      font-size: 0.95rem;
      color: #ddd;
      margin-top: 1em;
    }

    /* --- Google Button --- */
    .google-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: #ffffff;
      color: #444;
      font-weight: 500;
      font-size: 1rem;
      padding: 0.75em 1.5em;
      border: none;
      border-radius: 50px;
      cursor: pointer;
      transition: all 0.3s ease;
      box-shadow: 0 4px 10px rgba(0,0,0,0.25);
    }

    .google-btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 14px rgba(0,0,0,0.35);
    }

    .google-icon {
      width: 22px;
      height: 22px;
      margin-right: 10px;
    }

    /* --- Animations --- */
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }

    /* --- Responsive --- */
    @media (max-width: 500px) {
      .login-card {
        margin: 1em;
        padding: 2em;
      }
      .title {
        font-size: 1.5rem;
      }
    }
  `]
})
export class LoginComponent implements OnInit {
  constructor(public auth: AuthService, private router: Router) {}

 ngOnInit(): void {
  if (this.auth.loggedIn()) {
    // Force reload only once to ensure full app state loads correctly
    if (!sessionStorage.getItem('reloadedAfterLogin')) {
      sessionStorage.setItem('reloadedAfterLogin', 'true');
      window.location.reload();
    } else {
      this.router.navigate(['/play']);
    }
  } else {
    sessionStorage.removeItem('reloadedAfterLogin');
  }
}


  login() {
    this.auth.loginWithGoogle().subscribe(() => {
      this.router.navigate(['/play']);
    });
  }
  logout() {
    this.auth.logout(this.router);
  }
}

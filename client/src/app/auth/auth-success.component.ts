import { Component, inject, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from './auth.service';

@Component({
  selector: 'app-auth-success',
  standalone: true,
  template: '<p>Logging in...</p>',
})
export class AuthSuccessComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private auth = inject(AuthService);

  ngOnInit() {
    const token = this.route.snapshot.queryParamMap.get('token');
    if (token) {
      this.auth.setToken(token);
      this.router.navigateByUrl('/play');

    } else {
      this.router.navigateByUrl('/login');
    }
  }
}

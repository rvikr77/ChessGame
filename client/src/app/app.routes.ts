import { HistoryComponent } from './history/history.component';
import { Routes } from '@angular/router';
import { PlayComponent } from './play/play.component';
import { LoginComponent } from './auth/login.component';
import { AuthGuard } from './auth/auth.guard';
import { AuthSuccessComponent } from './auth/auth-success.component';
export const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  { path: 'login', component: LoginComponent },
  { path: 'play', component: PlayComponent, canActivate: [AuthGuard] },
  { path: 'history', component: HistoryComponent, canActivate: [AuthGuard] },
  { path: 'auth-success', component: AuthSuccessComponent }
];

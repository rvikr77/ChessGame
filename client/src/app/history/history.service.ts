import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { environment } from '../../environments/environment';
@Injectable({ providedIn: 'root' })
export class HistoryService {
  constructor(private http: HttpClient, private router: Router) { }

  getHistory() {
    const token = localStorage.getItem('token');
    if (!token) {
      this.router.navigate(['/login']);
      throw new Error('No auth token found');
    }

    return this.http.get<any[]>(`${environment.API_URL}/api/games/history`, {
      headers: { Authorization: `Bearer ${token}` }
    });
  }
}

import { ApplicationConfig, inject } from '@angular/core';
import { provideRouter } from '@angular/router';
import { withInterceptors, provideHttpClient, HttpInterceptorFn } from '@angular/common/http';
import { routes } from './app.routes';
import { AuthService } from './auth/auth.service';


const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const token = auth.getToken();
  if (token) {
    req = req.clone({
      setHeaders: { Authorization: `Bearer ${token}` }
    });
  }
  return next(req);
};


export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideHttpClient(withInterceptors([authInterceptor]))
  ]
};

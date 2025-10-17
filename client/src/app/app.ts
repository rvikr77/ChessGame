import { Component, signal, OnInit, OnDestroy } from '@angular/core';
import { RouterOutlet } from '@angular/router';

interface Offer { from: string; time: number }

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html'
})
export class App {
  protected readonly title = signal('client-ui');

  ngOnInit() {

  }

  ngOnDestroy() {
    
  }
}

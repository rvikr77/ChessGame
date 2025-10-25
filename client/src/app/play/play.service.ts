import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';
const WS_URL = environment.WS_URL;
@Injectable({ providedIn: 'root' })
export class PlayService {
  rematchOpponent: string | null = null;
  rematchTime: number | null = null;
  private ws?: WebSocket;

  private pendingSends: Array<{ type: string; data: any }> = [];

  private authed = false;

  public lastWsRttMs: number | null = null;

  private pongListeners: Array<(rtt: number|null)=>void> = [];
  private keepAliveInterval: any = null;

  private createWebSocket(): WebSocket {

    if (
      this.ws &&
      (this.ws.readyState === WebSocket.OPEN ||
        this.ws.readyState === WebSocket.CONNECTING)
    ) {

      return this.ws;
    }
    this.ws = new WebSocket(WS_URL);
    (window as any).ws = this.ws;
    this.authed = false;
    this.ws.addEventListener('open', () => {
      
      const token = localStorage.getItem('token');
      if (token && !this.authed) {
        this.ws!.send(JSON.stringify({ type: 'auth', token }));
      }
      
      this.flushPending();
      
      this.startKeepAlive();
    });
    this.ws.addEventListener('error', (err) =>
      console.error('❌ WebSocket error:', err)
    );
    this.ws.addEventListener('close', () => {
      console.warn('⚠️ WebSocket closed');
      this.authed = false;
      this.pendingSends = [];
      
      this.stopKeepAlive();
    });
    
    this.ws.addEventListener('message', (evt) => {
      try {
        const data = JSON.parse(evt.data);
        if (data?.type === 'auth_success') {
          this.authed = true;
        }
        
        if (data?.type === 'pong') {
          try {
            const now = Date.now();
            const sentTs = data.data?.ts || null;
            if (sentTs) {
              this.lastWsRttMs = now - sentTs;
              for (const cb of this.pongListeners) cb(this.lastWsRttMs);
            } else {
              for (const cb of this.pongListeners) cb(null);
            }
          } catch (e) {}
        }
      } catch {}
    });
    return this.ws;
  }
  private flushPending() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const toSend = this.pendingSends.splice(0);
    for (const msg of toSend) {
      this._sendRaw(msg.type, msg.data);
    }
  }
  private _sendRaw(type: string, data: any = {}) {
    
    this.ws!.send(
      JSON.stringify({
        type,
        token: localStorage.getItem('token'),
        data,
      })
    );
  }
  private send(type: string, data: any = {}) {
    if (!this.ws) {
      console.error('❌ Cannot send, WebSocket not created');
      return;
    }
    if (this.ws.readyState === WebSocket.OPEN) {
      this._sendRaw(type, data);
      return;
    }
    if (this.ws.readyState === WebSocket.CONNECTING) {
      
      this.pendingSends.push({ type, data });
      return;
    }
    console.error('❌ Cannot send, WebSocket is not open/connecting');
  }
  private onOpenOrNow(fn: () => void) {
    const ws = this.createWebSocket();
    if (ws.readyState === WebSocket.OPEN) {
      fn();
    } else if (ws.readyState === WebSocket.CONNECTING) {
      ws.addEventListener('open', () => fn(), { once: true });
    }
  }
  private setup(onMessage: (msg: any) => void) {
    
    this.ws!.onmessage = (msg) => {
      try {
        const data = JSON.parse(msg.data);

  
        if (data?.type === 'pong') {
          try {
            const now = Date.now();
            const sentTs = data.data?.ts || null;
            if (sentTs) {
              this.lastWsRttMs = now - sentTs;
              for (const cb of this.pongListeners) cb(this.lastWsRttMs);
            } else {
              for (const cb of this.pongListeners) cb(null);
            }
          } catch (e) {}
          
        }
        onMessage(data);
      } catch (err) {
        console.error('❌ Invalid message from server', err);
      }
    };
    this.ws!.onerror = (err) => console.error('❌ WebSocket error:', err);
    this.ws!.onclose = () => console.warn('⚠️ WebSocket closed');
    
    this.ws!.addEventListener('close', () => {
      console.warn('⚠️ WebSocket closed, attempting reconnect...');
      this.authed = false;
      this.pendingSends = [];
      this.stopKeepAlive();

      setTimeout(() => {
        this.createWebSocket();
      }, 1000); 
    });

  }

  private startKeepAlive() {
    
    if (this.keepAliveInterval) return;
    
    this.keepAliveInterval = setInterval(() => {
      try {
        this.ping(() => {}, 3000);
      } catch (e) {}
    }, 5000);
  }

  private stopKeepAlive() {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }
  }

  connectForMatch(time: number, onMessage: (msg: any) => void) {
    const token = localStorage.getItem('token');
    if (!token) return console.error('❌ JWT token not found');
    this.createWebSocket();
    this.onOpenOrNow(() => {

      
      this.send('auth');

      this.send('play_request', { time });

    });
    this.setup(onMessage);
  }

  connectForRejoin(onMessage: (msg: any) => void) {
    const token = localStorage.getItem('token');
    if (!token) return console.error('❌ JWT token not found');
    const ws = this.createWebSocket();
    this.onOpenOrNow(() => {

      this.send('auth');
     
    });
    
    ws.onmessage = (msg) => {
      try {
        const data = JSON.parse(msg.data);
        
        if (data.type === 'auth_success') {
          
          this.send('rejoin_request');
        }
        if (data.type === 'rejoin_failed') {
          console.warn('⚠️ No live game found, redirecting to /play');
          window.location.href = '/play';
          return;
        }
        
        
        onMessage(data);
      } catch (err) {
        console.error('❌ Invalid message from server (rejoin)', err);
      }
    };
    ws.onerror = (err) => console.error('❌ WebSocket error (rejoin)', err);
    
  }

 


  connectForResign() {
    const token = localStorage.getItem('token');
    if (!token) return console.error('❌ JWT token not found');
    const ws = this.createWebSocket();
    this.onOpenOrNow(() => {
      
      this.send('auth');
      
    });

    const onAuth = (evt: MessageEvent) => {
      try {
        const msg = JSON.parse(evt.data);
        if (msg.type === 'auth_success') {
          
          this.send('force_close');
          
        }
      } catch (e) {}
    };

    ws.addEventListener('message', onAuth);
    ws.addEventListener('message', (evt) => {
      const msg = JSON.parse(evt.data);
      if (msg.type === 'game_over') {
        
      }
    });

    ws.addEventListener('close', () => {
      console.warn('⚠️ WebSocket closed after force_close');
    });
    ws.addEventListener('error', (err) =>
      console.error('❌ WebSocket error (resign)', err)
    );
  }

  checkAccountStatus(onStatus: (statusInfo: any) => void) {
    const token = localStorage.getItem('token');
    if (!token) return console.error('❌ JWT token not found');
    const ws = this.createWebSocket();
    const listenOnce = (evt: MessageEvent) => {
      try {
        const data = JSON.parse(evt.data);
        if (data.type === 'auth_error') {

          return;
        }
        if (data.type === 'auth_success') {

          this.send('check_status');
          return;
        }
        if (data.type === 'status_info') {
          onStatus(data.data);
          ws.removeEventListener('message', listenOnce);
        }
      } catch {}
    };
    ws.addEventListener('message', listenOnce);
    this.onOpenOrNow(() => {

      this.send('auth');
    });
    ws.addEventListener('error', (err) =>
      console.error('❌ WebSocket error (check_status)', err)
    );
  }

  connectForCreateRoom(roomCode: string, time: number, isRated: number, onMessage: (msg: any) => void) {
  const token = localStorage.getItem('token');
  if (!token) return console.error('❌ JWT token not found');

  this.createWebSocket();

  this.onOpenOrNow(() => {
    
    this.send('auth');
    
    this.send('create_private_room', { roomCode, time, isRated });
    
  });

  this.setup(onMessage);
}
reportPlayer(opponentEmail: string, callback: (success: boolean) => void) {
  this.createWebSocket();

  this.onOpenOrNow(() => {
    
    this.send('auth');
    
    this.send('report_player', { reportedEmail: opponentEmail });
    
  });

  const listener = (msg: MessageEvent) => {
    try {
      const data = JSON.parse(msg.data);
      if (data.type === 'report_acknowledged') {
        callback(true);
        this.ws?.removeEventListener('message', listener);
      }
    } catch {
      callback(false);
    }
  };

  this.ws?.addEventListener('message', listener);
}
  connectForJoinRoom(roomCode: string, onMessage: (msg: any) => void) {
  const token = localStorage.getItem('token');
  if (!token) return console.error('❌ JWT token not found');

  this.createWebSocket();

  this.onOpenOrNow(() => {
    
    this.send('auth');
    this.send('join_private_room', { roomCode});
    
  });

  this.setup(onMessage);
}

  checkInGameStatus(onStatus: (inGame: boolean) => void) {
    const token = localStorage.getItem('token');
    if (!token) return console.error('❌ JWT token not found');

    let retries = 3; 

    const attemptCheck = () => {
      const ws = new WebSocket(WS_URL);
      let isResolved = false;

      const cleanup = () => {
        ws.removeEventListener('message', listener);
        ws.close();
      };

      const listener = (msg: MessageEvent) => {
        try {
          const data = JSON.parse(msg.data);
          

          if (data.type === 'auth_error') {
            if (data.data?.reason === 'jwt expired') {
              localStorage.removeItem('token');
              window.location.href = '/login';
            }
            cleanup();
            return;
          }

          if (data.type === 'auth_success') {
            ws.send(JSON.stringify({ type: 'check_in_game' }));
            return;
          }

          if (data.type === 'in_game_status') {
            onStatus(data.data.inGame);
            isResolved = true;
            cleanup();
          }
        } catch (err) {
          console.error('[checkInGameStatus] Error processing message:', err);
          cleanup();
        }
      };

      ws.addEventListener('message', listener);
      ws.addEventListener('open', () => {
        
        ws.send(JSON.stringify({ type: 'auth', token }));
      });
      ws.addEventListener('error', (err) => {
        console.error('[checkInGameStatus] WebSocket error:', err);
        cleanup();
        if (!isResolved && retries > 0) {
          retries--;
          
          attemptCheck();
        }
      });
      ws.addEventListener('close', () => {
        console.warn('[checkInGameStatus] WebSocket closed');
        if (!isResolved && retries > 0) {
          retries--;
          
          attemptCheck();
        }
      });
    };

    attemptCheck();
  }

  requestDraw(onMessage?: (msg: any) => void) {
    const token = localStorage.getItem('token');
    if (!token) return console.error('❌ JWT token not found');

    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.createWebSocket();
    }

    this.onOpenOrNow(() => {
      
      this.send('auth');
      this.send('draw_request');
    });

    if (onMessage) {
      const handler = (evt: MessageEvent) => {
        try {
          const data = JSON.parse(evt.data);
          if (
            data.type === 'draw_requested' ||
            data.type === 'opponent_draw_requested' ||
            data.type === 'game_over'
          ) {
            onMessage(data);

            if (data.type === 'game_over') {
              this.ws?.removeEventListener('message', handler);
            }
          }
        } catch (err) {
          console.error('❌ Invalid message (draw)', err);
        }
      };
      this.ws?.addEventListener('message', handler);
    }
  }
  declineDraw(onMessage?: (msg: any) => void) {
    const token = localStorage.getItem('token');
    if (!token) return console.error('❌ JWT token not found');


    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.createWebSocket();
    }

    this.onOpenOrNow(() => {
      
      this.send('auth');
      this.send('draw_decline');
    });

    if (onMessage) {
      const handler = (evt: MessageEvent) => {
        try {
          const data = JSON.parse(evt.data);

          if (
            data.type === 'draw_declined' ||
            data.type === 'game_over'
          ) {
            onMessage(data);


            if (data.type === 'game_over') {
              this.ws?.removeEventListener('message', handler);
            }
          }
        } catch (err) {
          console.error('❌ Invalid message (draw decline)', err);
        }
      };
      this.ws?.addEventListener('message', handler);
    }
  }



  connectForRematch(
  opponent: string,
  time: number,
  onMessage: (msg: any) => void
) {
  const token = localStorage.getItem('token');
  if (!token) return console.error('❌ JWT token not found');

  this.createWebSocket();

  this.onOpenOrNow(() => {
    
    this.send('auth');
    
    this.send('rematch_request', { opponent, time });
    
  });

  this.setup(onMessage);
}
sendMove(move: string, from?: string | null, to?: string | null) {
  this.createWebSocket(); 

  const payload: any = { 
    move
  };

  if (from && to) {
    payload.highlight = { from, to };
  }


  this.send('move', payload);
}
  getProfile(onProfile: (profile: any) => void) {
  const token = localStorage.getItem('token');
  if (!token) return console.error('❌ JWT token not found');

  const ws = new WebSocket(WS_URL);
  ws.onopen = () => {
    ws.send(JSON.stringify({ type: 'auth', token }));
  };
  ws.onmessage = (msg) => {
    const data = JSON.parse(msg.data);
    if (data.type === 'auth_success') {
      ws.send(JSON.stringify({ type: 'get_profile' }));
    }
    if (data.type === 'profile_info') {
      onProfile(data.data);
      ws.close();
    }
  };
  ws.onerror = (err) => console.error('❌ WebSocket error (get_profile)', err);
  ws.onclose = () => console.log('⚠️ WebSocket closed (get_profile)');
}
deleteAccount(onDelete: (result: any) => void) {
  const token = localStorage.getItem('token');
  if (!token) return console.error('❌ JWT token not found');

  const ws = new WebSocket(WS_URL);
  ws.onopen = () => {
    ws.send(JSON.stringify({ type: 'auth', token }));
  };
  ws.onmessage = (msg) => {
    const data = JSON.parse(msg.data);
    if (data.type === 'auth_success') {
      ws.send(JSON.stringify({ type: 'delete_account' }));
    }
    if (data.type === 'account_deleted') {
      onDelete(data.data);
      ws.close();
    }
  };
  ws.onerror = (err) => console.error('❌ WebSocket error (delete_account)', err);
  ws.onclose = () => console.log('⚠️ WebSocket closed (delete_account)');
}

  public ping(cb: (rtt: number|null) => void, timeout = 5000) {
    try {

      this.createWebSocket();
      if (!this.ws) return cb(null);
      const ts = Date.now();
      const wrapped = (rtt: number|null) => {
        try {
          cb(rtt);
        } finally {
          const idx = this.pongListeners.indexOf(wrapped);
          if (idx !== -1) this.pongListeners.splice(idx, 1);
        }
      };
      this.pongListeners.push(wrapped);
      setTimeout(() => {
        const idx = this.pongListeners.indexOf(wrapped);
        if (idx !== -1) {
          this.pongListeners.splice(idx, 1);
          try { wrapped(null); } catch {}
        }
      }, timeout);
      this.send('ping', { ts });
    } catch (e) { cb(null); }
  }

}
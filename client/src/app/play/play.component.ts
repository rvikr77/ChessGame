import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { PlayService } from './play.service';
import { Chess, Square } from 'chess.js';
import { ChangeDetectorRef } from '@angular/core';
import { ViewChild, ElementRef } from '@angular/core';

@Component({
  selector: 'app-play',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './play.component.html',
  styleUrls: ['./play.component.css']
})
export class PlayComponent implements OnInit, OnDestroy {
  @ViewChild('arrowCanvas') arrowCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('connIndicator', { read: ElementRef, static: false }) connIndicator?: ElementRef<HTMLDivElement>;
  startingFen: string = 'startpos';
  loadingInGameCheck = true;
  timeControl = 5;
  connected = false;
  showFindMatch = false;
  showPopup = false;
  popupType: 'in_game' | 'game_over' = 'in_game';
  gameResultText = '';
  alreadyReported = false;
  roomId = '';
  isRated=1;
  showRatedChoice = false;
  previousgametype: 'online' | 'local' | null = null;
  premoves: { from: string; to: string; promotion?: string }[] = [];
  pendingDraw = false;   
  drawOffered = false;   
  capturedWhiteAdvantage = '';
  capturedBlackAdvantage = '';
  previouslyPrivateRoom=false;
  private readonly MOVE_LIVE = -1;
  private readonly MOVE_START = -2;
  private navLock = false;
  moveIndex: number = -1;        
  isViewingHistory: boolean = false; 
  trueStartFen: string = 'startpos';
  recipientOfferVisible = false;
  recipientOffer: { from: string; timeLeft: number; interval?: any } = { from: '', timeLeft: 0 };
  senderOfferVisible = false;
  senderOffer: { to: string; timeLeft: number; interval?: any } = { to: '', timeLeft: 0 };
  // Arrays to store captured pieces
  capturedWhiteIcons: string[] = [];
  capturedBlackIcons: string[] = [];
  findingMatch = false;
  piecePoints: Record<string, number> = {
    p: 1, n: 3, b: 3, r: 5, q: 9, k: 0
  };

  whiteTime: number = 0;
  blackTime: number = 0;
  private statusInterval: any;
  private localTimerId: any = null;
  public isPaused: boolean = false;
  // --- Connection indicator state
  public connState: 'good' | 'fair' | 'poor' | 'offline' = 'good';
  private connProbeInterval: any = null;
  private lastRttMs: number | null = null;
  private lastTimerUpdateAt: number = 0; 


  myColor: 'white' | 'black' | null = null;
  profile: { email: string; elo: number } | null = null;

 
  localGame: Chess | null = null;        // pass-and-play mode
  displayChess: Chess = new Chess();     // rendering base for both modes
  lastMoveColor: string | null = null; // highlight color for last move in online games
  // --- Board/interaction state
  selectedSquare: string | null = null;
  boardSquares: string[] = [];           
  lastMove: { from: string | null; to: string | null } = { from: null, to: null };
  rawMoves: string[] = [];
  promotionSquare: { from: string; to: string } | null = null;


  arrows: { from: string; to: string }[] = [];
  private lastArrowFrom: string | null = null;
 
  private currentHintSquare: string | null = null;
  mapWhite: Record<string, string> = { p: '♙', r: '♖', n: '♘', b: '♗', q: '♕', k: '♔' };
  mapBlack: Record<string, string> = { p: '♟', r: '♜', n: '♞', b: '♝', q: '♛', k: '♚' };

  updateCapturedIcons(capturedWhite: string[], capturedBlack: string[]) {
    const isSymbol = (s: string) => /[\u2654-\u265F]/.test(s);


    const pieceValues: any = {
      '♙': 1, '♖': 5, '♘': 3, '♗': 3, '♕': 9, '♚': 0,
      '♟': 1, '♜': 5, '♞': 3, '♝': 3, '♛': 9, '♔': 0
    };


    this.capturedWhiteIcons = Array.isArray(capturedWhite)
      ? capturedWhite.map(type => {
        if (!type) return '';
        return isSymbol(type)
          ? type
          : this.mapWhite[type.toLowerCase()] || '';
      })
      : [];


    this.capturedBlackIcons = Array.isArray(capturedBlack)
      ? capturedBlack.map(type => {
        if (!type) return '';
        return isSymbol(type)
          ? type
          : this.mapBlack[type.toLowerCase()] || '';
      })
      : [];


    const whiteScore = this.capturedWhiteIcons.reduce((sum, p) => sum + (pieceValues[p] || 0), 0);
    const blackScore = this.capturedBlackIcons.reduce((sum, p) => sum + (pieceValues[p] || 0), 0);

    this.capturedWhiteAdvantage = '';
    this.capturedBlackAdvantage = '';

    if (whiteScore > blackScore) this.capturedWhiteAdvantage = `+${whiteScore - blackScore}`;
    else if (blackScore > whiteScore) this.capturedBlackAdvantage = `+${blackScore - whiteScore}`;

    this.cdr.detectChanges();
  }



  constructor(
    private playService: PlayService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {

    const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    for (let rank = 8; rank >= 1; rank--) {
      for (let f = 0; f < 8; f++) {
        this.boardSquares.push(`${files[f]}${rank}`);
      }
    }
  }

  ngOnInit() {

    // Ban check runs every 1 min
    this.runBanCheck();

    this.statusInterval = setInterval(() => {
      this.runBanCheck();
    }, 60000);

    // In-game check runs only once on reload
    this.runInGameCheck();

    // Load profile details on init
    this.loadProfile();
    this.previouslyPrivateRoom = false;

    this.initConnectionMonitor();
    this.findingMatch = false;

  }

  ngOnDestroy() {
    if (this.statusInterval) {
      clearInterval(this.statusInterval);
    }
    this.stopLocalTimer();
    this.stopConnectionMonitor();

  }
  ngAfterViewInit() {
    this.redrawArrows();
    this.updateConnIndicatorClass();
  }
  goToHistory() {
    this.router.navigate(['./history']);
  }

  // ---------------- Connection Monitor ----------------

  private initConnectionMonitor() {
   
    this.connState = navigator.onLine ? 'good' : 'offline';
    this.updateConnIndicatorClass();

    
    window.addEventListener('online', this._onOnline);
    window.addEventListener('offline', this._onOffline);

    
    this.connProbeInterval = setInterval(() => this.probeConnection(), 8000);
    
    setTimeout(() => this.probeConnection(), 500);
  }

  private stopConnectionMonitor() {
    window.removeEventListener('online', this._onOnline);
    window.removeEventListener('offline', this._onOffline);
    if (this.connProbeInterval) {
      clearInterval(this.connProbeInterval);
      this.connProbeInterval = null;
    }
  }

  private _onOnline = () => {
    this.connState = 'fair'; 
    this.updateConnIndicatorClass();
  };

  private _onOffline = () => {
    this.connState = 'offline';
    this.updateConnIndicatorClass();
  };

   private async probeConnection() {
    if (!navigator.onLine) {
      this.connState = 'offline';
      this.updateConnIndicatorClass();
      return;
    }
    
    try {
      const ps: any = this.playService as any;
      if (ps && ps['ws'] && ps['ws'].readyState === WebSocket.OPEN && typeof ps.ping === 'function') {
        
        await new Promise<void>((resolve) => {
          ps.ping((rtt: number | null) => {
            this.lastRttMs = rtt;
            if (rtt == null) this.connState = 'poor';
            else if (rtt < 150) this.connState = 'good';
            else if (rtt < 400) this.connState = 'fair';
            else this.connState = 'poor';
            resolve();
          }, 4000);
          
          setTimeout(() => resolve(), 4500);
        });
      } else {
        
        const url = '/assets/favicon.ico?t=' + Date.now();
        const start = performance.now();
        try {
          const resp = await fetch(url, { cache: 'no-store', method: 'GET' });
          if (!resp || !resp.ok) throw new Error('bad');
          const end = performance.now();
          const rtt = Math.round(end - start);
          this.lastRttMs = rtt;
          if (rtt < 150) this.connState = 'good';
          else if (rtt < 400) this.connState = 'fair';
          else this.connState = 'poor';
        } catch (e) {
          this.connState = 'poor';
          this.lastRttMs = null;
        }
      }
    } catch (e) {
      this.connState = 'poor';
      this.lastRttMs = null;
    }
    this.updateConnIndicatorClass();
  }

  private updateConnIndicatorClass() {
    try {
      const root = document.querySelector('.conn-indicator');
      if (!root) return;
      root.classList.remove('conn-good', 'conn-fair', 'conn-poor', 'conn-offline');
      root.classList.remove('conn-strength-1', 'conn-strength-2', 'conn-strength-3', 'conn-strength-4');

      if (this.connState === 'offline') {
        root.classList.add('conn-offline', 'conn-strength-0');
        (root as HTMLElement).setAttribute('title', 'Offline');
        return;
      }

      
      let strength = 4;
      if (this.lastRttMs == null) strength = 2;
      else if (this.lastRttMs < 120) strength = 4;
      else if (this.lastRttMs < 250) strength = 3;
      else if (this.lastRttMs < 500) strength = 2;
      else strength = 1;

      const stateClass = this.connState === 'good' ? 'conn-good' : this.connState === 'fair' ? 'conn-fair' : 'conn-poor';
      root.classList.add(stateClass);
      root.classList.add(`conn-strength-${strength}`);

      const human = this.connState === 'good' ? 'Good' : this.connState === 'fair' ? 'Fair' : 'Poor';
      (root as HTMLElement).setAttribute('title', `${human} connection (${this.lastRttMs ? this.lastRttMs + 'ms RTT' : 'unknown RTT'})`);
    } catch (e) { }
  }
  resetArrows() {
    if (this.arrows.length > 0 || this.lastArrowFrom) {
      this.arrows = [];
      this.lastArrowFrom = null;
      
      this.currentHintSquare = null;
      this.redrawArrows();
    }
  }
  private getLegalMovesFor(square: string): Square[] {
    if (!this.displayChess) return [];
    const moves = this.displayChess.moves({ square: square as Square, verbose: true }) || [];
    return moves.map(m => m.to as Square);
  }

  private drawMoveHints(square: string) {
    
    if (!this.arrowCanvas) return;
    this.currentHintSquare = square;
    this.redrawArrows();
  }





  getSquareHighlightStyle(sq: string) {
    const baseStyle = this.getSquareStyle(sq);
    const isHighlighted = this.lastMove && (this.lastMove.from === sq || this.lastMove.to === sq);

    if (isHighlighted) {
      return {
        ...baseStyle,
        'background-color': this.lastMoveColor
      };
    }

    return baseStyle;
  }
  onSquareClick(square: string) {
    if (!this.displayChess) return;

    const piece = this.displayChess.get(square as Square);


    if (!this.selectedSquare) {
      if (!piece) return;
      if ((piece.color === 'w' && this.myColor !== 'white') ||
        (piece.color === 'b' && this.myColor !== 'black')) {
        return;
      }

      this.selectedSquare = square;
      this.drawMoveHints(square);
      return;
    }

    const from = this.selectedSquare;
    const to = square;
    this.selectedSquare = null;
    this.redrawArrows();


    if (piece && piece.color === this.myColor?.[0]) {
      this.selectedSquare = square;
      this.drawMoveHints(square);
      return;
    }


    const movingPiece = this.displayChess.get(from as Square);
    const targetRank = to[to.length - 1];
    const isPromotion = movingPiece?.type === 'p' && (
      (movingPiece.color === 'w' && targetRank === '8') ||
      (movingPiece.color === 'b' && targetRank === '1')
    );

    if (isPromotion) {
      
      this.promotionSquare = { from, to };
      return;
    }
    if (this.isViewingHistory) {
      console.warn('Ignoring click while viewing move history');
      return;
    }
   
    const myColorChar = this.myColor === 'white' ? 'w' : this.myColor === 'black' ? 'b' : null;
    const isMyTurn = myColorChar === this.displayChess.turn();

    if (!isMyTurn && !this.localGame) {
      
      this.premoves.push({ from, to });
      alert(`Premove queued: ${from} → ${to}`);
      return;
    }

    
    if (this.localGame) {
      this.handleSquareClick(from, to);
    } else {
      try {
        const tmp = new Chess(this.displayChess.fen());
        const applied = tmp.move({ from, to });
        if (!applied) {
          
          return;
        }

        this.playService.sendMove(
          applied.san,
          applied.from,
          applied.to
        );

        this.displayChess = tmp;
        
        this.currentHintSquare = null;
        
        this.arrows = [];
        this.lastArrowFrom = null;
        if (this.arrowCanvas) this.redrawArrows();
        if (this.localGame)
          this.rawMoves.push(applied.san);
        this.lastMove.from = applied.from;
        this.lastMove.to = applied.to;
        this.executePremoves();
        this.cdr.detectChanges();

        
      } catch (e) {
        console.error('Error validating/sending move', e);
        
      }
    }
  }


  promotePawn(piece: 'q' | 'r' | 'b' | 'n') {
    if (!this.promotionSquare) return;
    const { from, to } = this.promotionSquare;
    this.promotionSquare = null; 

    const myColorChar = this.myColor === 'white' ? 'w' : this.myColor === 'black' ? 'b' : null;
    const isMyTurn = myColorChar === this.displayChess.turn();

    
    if (!isMyTurn) {
      this.premoves.push({ from, to, promotion: piece });
      alert(`Premove (promotion to ${piece.toUpperCase()}) queued: ${from} → ${to}`);
      return;
    }

    
    if (this.localGame) {
      this.makeMove(from, to, piece);
    } else {
      try {
        const tmp = new Chess(this.displayChess.fen());
        const applied = tmp.move({ from, to, promotion: piece });
        if (!applied) {
          alert('Invalid promotion move');
          return;
        }
        if (this.isViewingHistory) {
          console.warn('Ignoring click while viewing move history');
          return;
        }
        this.playService.sendMove(applied.san, applied.from, applied.to);
        this.displayChess = tmp;
        if (this.localGame)
          this.rawMoves.push(applied.san);
        this.lastMove.from = applied.from;
        this.lastMove.to = applied.to;
        
        this.arrows = [];
        this.lastArrowFrom = null;
        if (this.arrowCanvas) this.redrawArrows();
        this.cdr.detectChanges();

        this.executePremoves();
      } catch (e) {
        console.error('Error performing promotion move', e);
        alert('Could not promote pawn');
      }
    }
  }


  // ---------------- Premove Executor ----------------
  private executePremoves() {
    if (this.isViewingHistory) {
      this.premoves = [];
      return;
    }
    if (this.premoves.length === 0) return;

    const myColorChar = this.myColor === 'white' ? 'w' : this.myColor === 'black' ? 'b' : null;
    const isMyTurn = myColorChar === this.displayChess.turn();
    if (!isMyTurn) return;

    const next = this.premoves.shift();
    if (!next) return;

    const { from, to, promotion } = next;

    try {
      const tmp = new Chess(this.displayChess.fen());
      const move = tmp.move({ from, to, promotion });
      if (!move) {
        
        this.premoves = [];
        alert('Invalid premove. All premoves cleared.');
        return;
      }

     
      if (this.localGame) {
        this.displayChess = tmp;
        this.rawMoves.push(move.san);
        this.lastMove = { from: move.from, to: move.to };
      } else {
        if (this.isViewingHistory) {
          console.warn('Ignoring click while viewing move history');
          return;
        }
        this.playService.sendMove(
          move.san,
          move.from,
          move.to
        );

        this.displayChess = tmp;

        this.lastMove = { from: move.from, to: move.to };
        
        this.arrows = [];
        this.lastArrowFrom = null;
        if (this.arrowCanvas) this.redrawArrows();
      }

      this.redrawArrows();
      this.cdr.detectChanges();

     
      setTimeout(() => this.executePremoves(), 100);
    } catch (e) {
      console.warn('Failed to execute premove', next, e);
      this.premoves = []; 
    }
  }




  // ---------------- Cancel Premoves ----------------
  cancelPremoves() {
    this.premoves = [];
    
  }






  renderPieceAt(square: string): string {
    const piece = this.displayChess.get(square as Square);
    if (!piece) return '';


    const mapWhite = this.mapWhite
    const mapBlack = this.mapBlack;

    return piece.color === 'w' ? mapWhite[piece.type] : mapBlack[piece.type];
  }

  getSquareStyle(sq: string) {
    const file = sq[0];
    const rank = parseInt(sq[1], 10);
    const fileIndex = 'abcdefgh'.indexOf(file);
    const isLight = (fileIndex + rank) % 2 === 0;

    const baseColor = isLight ? '#eeeed2' : '#769656';
    let highlightColor: string | null = null;


    if (this.selectedSquare === sq) {
      highlightColor = '#aaddff';
    }

    else if (this.lastMove?.from === sq || this.lastMove?.to === sq) {
      if (this.localGame) {


        const move = this.displayChess.history({ verbose: true }).slice(-1)[0];
        if (move) {
          if (move.isCapture()) highlightColor = '#ff9999';        // capture
          else if (move.isEnPassant()) highlightColor = '#ffa500';   // en passant
          else if (move.isPromotion()) highlightColor = '#99ff99';   // promotion
          else if (move.isKingsideCastle() || move.isQueensideCastle()) highlightColor = '#ccccff'; // castling
          else highlightColor = '#f6f669';                                 // regular
        }
      } else {

        highlightColor = this.lastMoveColor || '#f6f669';
      }
    }

    else if (this.premoves.some(p => p.from === sq || p.to === sq)) {
      highlightColor = 'rgba(255,165,0,0.5)'; 
    }

    return {
      background: highlightColor || baseColor,
      border: '1px solid #333'
    };
  }



  getSquareBackground(sq: string) {
    if (this.lastMove && (sq === this.lastMove.from || sq === this.lastMove.to)) {
      return '#f6f669'; 
    }
    const file = sq.charCodeAt(0) - 'a'.charCodeAt(0);
    const rank = parseInt(sq[1], 10) - 1;
    return (file + rank) % 2 === 0 ? '#eeeed2' : '#769656';
  }

  onRightClick(event: MouseEvent, square: string) {
    event.preventDefault();

    if (!this.lastArrowFrom) {
      this.lastArrowFrom = square;
    } else {
      this.arrows.push({ from: this.lastArrowFrom, to: square });
      this.lastArrowFrom = null;

      if (this.arrowCanvas) this.redrawArrows();
    }
  }


  redrawArrows() {
    if (!this.arrowCanvas) return;
    const canvas = this.arrowCanvas.nativeElement as HTMLCanvasElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const arrow of this.arrows) {
      this.drawArrow(arrow.from, arrow.to, ctx);
    }

    if (this.currentHintSquare) {
      try {
        const legalMoves = this.getLegalMovesFor(this.currentHintSquare);
        const radius = 10;
        ctx.fillStyle = 'rgba(0, 0, 255, 0.5)'; 
        for (const to of legalMoves) {
          const pos = this.squareToXY(to);
          if (!pos) continue;
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
          ctx.fill();
        }
      } catch (e) {
        
      }
    }
  }

  drawArrow(from: string, to: string, ctx: CanvasRenderingContext2D) {
    const fromXY = this.squareToXY(from);
    const toXY = this.squareToXY(to);
    if (!fromXY || !toXY) return;

    const dx = toXY.x - fromXY.x;
    const dy = toXY.y - fromXY.y;

    const fileDiff = Math.abs(from.charCodeAt(0) - to.charCodeAt(0));
    const rankDiff = Math.abs(parseInt(from[1]) - parseInt(to[1]));

    
    if ((fileDiff === 2 && rankDiff === 1) || (fileDiff === 1 && rankDiff === 2)) {
      let midX = fromXY.x;
      let midY = fromXY.y;

      if (fileDiff === 2) {
        midX = fromXY.x + dx * 0.5;
        midY = fromXY.y;
      } else {
        midX = fromXY.x;
        midY = fromXY.y + dy * 0.5;
      }

      this._drawArrowOnCtx(ctx, fromXY.x, fromXY.y, midX, midY, false);
      this._drawArrowOnCtx(ctx, midX, midY, toXY.x, toXY.y, true);
    } else {
      
      this._drawArrowOnCtx(ctx, fromXY.x, fromXY.y, toXY.x, toXY.y, true);
    }
  }

  private _drawArrowOnCtx(
    ctx: CanvasRenderingContext2D,
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    withHead = true
  ) {
    ctx.save();
    ctx.strokeStyle = "rgba(255,0,0,0.8)";
    ctx.fillStyle = "rgba(255,0,0,0.8)";
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';

    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toX, toY);
    ctx.stroke();

    if (withHead) {
      const angle = Math.atan2(toY - fromY, toX - fromX);
      const headlen = 15;
      ctx.beginPath();
      ctx.moveTo(toX, toY);
      ctx.lineTo(toX - headlen * Math.cos(angle - Math.PI / 6), toY - headlen * Math.sin(angle - Math.PI / 6));
      ctx.lineTo(toX - headlen * Math.cos(angle + Math.PI / 6), toY - headlen * Math.sin(angle + Math.PI / 6));
      ctx.closePath();
      ctx.fill();
    }

    ctx.restore();
  }




  
  squareToXY(sq: string): { x: number, y: number } | null {
    if (!sq) return null;
    const file = sq.charCodeAt(0) - 'a'.charCodeAt(0);
    const rank = parseInt(sq[1], 10) - 1;
    const size = 80; 

    let x = file * size + size / 2;
    let y = (7 - rank) * size + size / 2;

    
    if (this.myColor === 'black') {
      x = 640 - x;
      y = 640 - y;
    }

    return { x, y };
  }



  squareAt(row: number, col: number): string {
    const files = 'abcdefgh';
    const ranks = '87654321';
    if (this.myColor === 'white') {
      return files[col] + ranks[row];
    } else {
      return files[7 - col] + ranks[7 - row];
    }
  }

  pieceCharAt(row: number, col: number): string {
    if (!this.localGame) return '';
    const square = this.squareAt(row, col);
    const piece = this.localGame.get(square as Square);
    if (!piece) return '';
    const symbols: any = { p: '♟', r: '♜', n: '♞', b: '♝', q: '♛', k: '♚' };
    let symbol = symbols[piece.type];
    if (piece.color === 'w') symbol = symbol.toUpperCase();
    return symbol;
  }


  // ---------------- Account & Profile ----------------


  private runBanCheck() {
    this.playService.checkAccountStatus((statusInfo) => {
      if (statusInfo.status === 0) {
        alert(`Account deactivated until ${statusInfo.suspension_until}`);
        this.showFindMatch = false;
        this.connected = false;
        this.logout();
      } else if (statusInfo.status !== 1) {
        alert('Could not verify account status.');
        this.logout();
      }
    });
  }


  private runInGameCheck() {

    this.loadingInGameCheck = true;
    this.playService.checkInGameStatus((inGame) => {

      this.loadingInGameCheck = false;
      if (inGame) {
        this.showPopup = true;
        this.showFindMatch = false;
        this.drawOffered = localStorage.getItem('drawOffered') === 'true';
        this.pendingDraw = localStorage.getItem('pendingDraw') === 'true';
      }
      else {
        this.showPopup = false;
        this.showFindMatch = true;
        localStorage.removeItem('drawOffered');
        localStorage.removeItem('pendingDraw');
        this.drawOffered = false;
        this.pendingDraw = false;
        this.loadLocalGame();
      }
    });
  }

  private loadProfile() {
    this.playService.getProfile((data) => {
      this.profile = data;
    });
  }

  deleteAccount() {
    if (confirm('Are you sure you want to delete your account? This cannot be undone.')) {
      this.playService.deleteAccount(() => {
        alert('Your account has been deleted.');
        this.logout();
      });
    }
  }

  logout() {
    localStorage.removeItem('token');
    this.router.navigate(['/login']);
  }


  // ---------------- Online Game ----------------

  play() {
    this.findingMatch = true;
    this.playService.connectForMatch(this.timeControl, (msg) => this.handleMessages(msg));
  }

  handleRejoin() {
    this.showPopup = false;
    this.playService.connectForRejoin((msg) => this.handleMessages(msg));
  }

  private handleFullGameState(data: any) {
    this.connected = true;
    this.showPopup = false;
    setTimeout(() => this.redrawArrows(), 0);


    let moves = data.moves || [];
    if (typeof moves === 'string') {
      try { moves = JSON.parse(moves); } catch { moves = []; }
    }
    if (Array.isArray(moves) && moves.length === 1 && typeof moves[0] === 'string' && moves[0].startsWith('[')) {
      try { moves = JSON.parse(moves[0]); } catch { moves = []; }
    }
    this.rawMoves = moves;


    this.whiteTime = typeof data.white_time === 'number' ? data.white_time : (data.time ? data.time * 60 : 0);
    this.blackTime = typeof data.black_time === 'number' ? data.black_time : (data.time ? data.time * 60 : 0);
    this.myColor = data.color || null;


    const initialFen = data.initial_fen || data.starting_fen || null;
    this.trueStartFen = initialFen && initialFen !== 'startpos' ? initialFen : 'startpos';

    const displayFen = data.fen || null;

    if (displayFen) {
      try {
        this.displayChess = new Chess(displayFen);
        this.startingFen = displayFen;
      } catch (e) {
        console.warn('Invalid FEN, rebuilding from moves.', e);
        this.displayChess = this.rebuildFromMoves(this.trueStartFen, this.rawMoves);
        this.startingFen = this.trueStartFen;
      }
    } else {
      this.displayChess = this.rebuildFromMoves(this.trueStartFen, this.rawMoves);
      this.startingFen = this.trueStartFen;
    }


    this.moveIndex = this.MOVE_LIVE;
    this.isViewingHistory = false;


    this.updateLastMoveHighlight();


    if (data.opponent) {
      
      (this as any).opponentEmail = data.opponent;
    }
    if (data.reports_per_game) {
      const reports = Array.isArray(data.reports_per_game)
        ? data.reports_per_game
        : JSON.parse(data.reports_per_game);
      this.alreadyReported = reports.includes((this as any).opponentEmail);
    }


    if (data.time) {
      this.timeControl = data.time;
      (this as any).lastTimeControl = data.time;
    }


    
    this.updateCapturedIcons(data.capturedWhite, data.capturedBlack);

    this.cdr.detectChanges();
  }





  private updateLastMoveHighlight(index: number = this.MOVE_LIVE) {
    this.lastMove = { from: null, to: null };
    this.lastMoveColor = '#f6f669'; // default yellow

    try {
      const history = this.displayChess.history({ verbose: true });
      let idx = index === this.MOVE_LIVE ? history.length - 1 : index;

      if (idx >= 0 && idx < history.length) {
        const move = history[idx];
        this.lastMove.from = move.from;
        this.lastMove.to = move.to;

        
        if (move.flags.includes('c')) this.lastMoveColor = '#ff9999';      // capture
        else if (move.flags.includes('e')) this.lastMoveColor = '#ffa500'; // en passant
        else if (move.flags.includes('p')) this.lastMoveColor = '#99ff99'; // promotion
        else if (move.flags.includes('k') || move.flags.includes('q')) this.lastMoveColor = '#ccccff'; // castle
        else this.lastMoveColor = '#f6f669'; 
      }
    } catch (e) {
      console.warn('updateLastMoveHighlight error', e);
    }
  }


  requestDraw() {
    if(this.localGame){
      this.endLocalGame('Draw by agreement');
    }
    else{
    if (!this.connected) return;

    
    this.playService.requestDraw((msg) => this.handleMessages(msg));

    this.drawOffered = true;
    this.pendingDraw = false;
    localStorage.setItem('drawOffered', 'true');
    localStorage.removeItem('pendingDraw');
    }
  }

  acceptDraw() {
    if (!this.connected || this.localGame) return;

    

    this.playService.requestDraw((msg) => this.handleMessages(msg));

    this.pendingDraw = false;
    this.drawOffered = false;
    localStorage.removeItem('drawOffered');
    localStorage.removeItem('pendingDraw');
  }

  declineDraw() {
    if (!this.connected || this.localGame) return;

    
    this.playService.declineDraw((msg) => this.handleMessages(msg));

    this.pendingDraw = false;
    this.drawOffered = false;
    localStorage.removeItem('drawOffered');
    localStorage.removeItem('pendingDraw');
    this.cdr.detectChanges();
  }

  private handleMessages(msg: any) {



    if (msg.type === 'game_over' || msg.type === 'force_closed') {
      this.arrows = [];
      if (this.arrowCanvas) this.redrawArrows();

      this.popupType = 'game_over';
      this.showPopup = true;
      this.gameResultText = msg.data?.result || 'Game ended';
      if (msg.data?.result === 'draw') {
        
        
        this.pendingDraw = false;
        this.drawOffered = false;

        localStorage.removeItem('drawOffered');
        localStorage.removeItem('pendingDraw');
      }

      this.showFindMatch = false;
      this.loadProfile();
      this.lastMove = { from: null, to: null };
      this.cdr.detectChanges();
    }

    if (msg.type === 'draw_requested') {
      
      this.drawOffered = true;
      this.pendingDraw = false;

      localStorage.setItem('drawOffered', 'true');
      localStorage.removeItem('pendingDraw');

      
      this.cdr.detectChanges();
    }

    if (msg.type === 'opponent_draw_requested') {
      
      this.pendingDraw = true;
      this.drawOffered = false;

      localStorage.setItem('pendingDraw', 'true');
      localStorage.removeItem('drawOffered');

      
      this.cdr.detectChanges();
    }

    if (msg.type === 'draw_declined') {
      
      this.drawOffered = false;
      this.pendingDraw = false;

      localStorage.removeItem('drawOffered');
      localStorage.removeItem('pendingDraw');

      
      this.cdr.detectChanges();
    }

    if (msg.type === 'move') {
      if(this.isViewingHistory)
        this.returnToLive();
      this.currentHintSquare = null;
      this.arrows = [];
      this.lastArrowFrom = null;
      if (this.arrowCanvas) this.redrawArrows();

      const san = msg.data.move;
      this.rawMoves.push(san);
      this.updateCapturedIcons(msg.data.capturedWhite, msg.data.capturedBlack);

      if (msg.data.fen) {
        this.displayChess = new Chess(msg.data.fen);
        if (this.displayChess.inCheck())
          alert('Check!');
        this.lastMove.from = msg.data.LastMoveFrom || null;
        this.lastMove.to = msg.data.LastMoveTo || null;
        this.lastMoveColor = msg.data.highlightColor || null;

        try {
          const history = this.displayChess.history({ verbose: true });
          if (history.length > 0) {
            const last = history[history.length - 1];
            this.lastMove.from = last.from;
            this.lastMove.to = last.to;
          }
        } catch (e) {
          console.warn('Could not extract last move from fen history', e);
        }
      }

      if (typeof msg.data.white_time === 'number') this.whiteTime = msg.data.white_time;
      if (typeof msg.data.black_time === 'number') this.blackTime = msg.data.black_time;

      this.redrawArrows();
      this.executePremoves();
      this.cdr.detectChanges();
    }

    if (msg.type === 'timer_update') {
      const now = performance.now();
      if (now - this.lastTimerUpdateAt > 300) {
        this.lastTimerUpdateAt = now;
        if (typeof msg.data.white_time === 'number') this.whiteTime = msg.data.white_time;
        if (typeof msg.data.black_time === 'number') this.blackTime = msg.data.black_time;
        this.redrawArrows();
        this.cdr.detectChanges();
      }
    }

    if (msg.type === 'game_start' || msg.type === 'rejoin') {
      this.localGame = null;
      this.previousgametype = 'online';
      
      this.handleFullGameState(msg.data);
      this.showFindMatch = false;

      this.updateCapturedIcons(msg.data.capturedWhite, msg.data.capturedBlack);

      this.lastMoveColor = msg.data.highlightColor;
      this.lastMove = { from: msg.data.LastMoveFrom, to: msg.data.LastMoveTo };

      if (msg.type === 'rejoin') {
        let reports = [];
        try { reports = JSON.parse(msg.data.game.reports_per_game); } catch { }
        for (let i = 0; i < reports.length; i++) {
          if (reports[i] === (this as any).opponentEmail) {
            this.alreadyReported = true;
            break;
          }
        }
      }
      this.cdr.detectChanges();
    }

    if (msg.type === 'invalid_move') {
      console.warn('❌ Invalid move:', msg.data.msg);
    }
    if (msg.type === 'private_match_created'){
      this.previouslyPrivateRoom=true;
    }
    if (msg.type === 'private_queue_created'){
      alert("Private match created. Share the Room ID '" + msg.data.roomCode +"' with another user to join the game.");
    }
  }


  handleResign() {
    this.showPopup = false;
    this.playService.connectForResign();
    this.showFindMatch = true;

    setTimeout(() => {
      this.loadProfile();
      this.cdr.detectChanges();
    }, 500); 
  }

  handleResignFromMatch() {

    this.playService.connectForResign();

  
    this.popupType = 'game_over';
    this.gameResultText = this.myColor === 'white'
      ? 'black_win'
      : 'white_win';
    this.showPopup = true;

    this.showFindMatch = false;


    setTimeout(() => {
      this.loadProfile();
      this.cdr.detectChanges();
    }, 500); 
  }

  reportOpponent() {
    if (!(this as any).opponentEmail) return;
    if (this.alreadyReported) return;
    this.playService.reportPlayer((this as any).opponentEmail, (success: boolean) => {
      if (success) {
        this.alreadyReported = true;
        alert('Opponent reported successfully.');
      } else {
        alert('Failed to report opponent or already reported.');
      }
    });
  }


  // ---------------- Match options ----------------

  playAgain() {
    this.showFindMatch = false;
    if (this.previousgametype === 'local') {
      
      this.clearLocalGame();
      if (this.playService['ws'] && this.playService['ws'].readyState === WebSocket.OPEN) {
        this.playService['ws'].close();

      }
      this.showPopup = false;
      this.startPassAndPlay();
      return;
    }
    this.playService.rematchOpponent = (this as any).opponentEmail;

    
    this.playService.rematchTime = (this as any).timeControl;
    

    this.playService.connectForRematch(
      (this as any).opponentEmail,
      (this as any).timeControl,
      (msg) => this.handleMessages(msg)
    );
  }

  newGame() {
    
    this.showFindMatch = false;
    this.play();
  }


  // ---------------- Private Room ----------------

  createRoom() {
    if (!this.roomId.trim()) {
      alert('Please enter a Room ID');
      return;
    }
    this.playService.connectForCreateRoom(this.roomId, this.timeControl,this.isRated, (msg) => this.handleMessages(msg));
  }

  joinRoom() {
    if (!this.roomId.trim()) {
      alert('Please enter a Room ID');
      return;
    }
    this.playService.connectForJoinRoom(this.roomId, (msg) => this.handleMessages(msg));
  }

  onCreateRoomClick() {
    this.showRatedChoice = true;
    this.isRated = 1;
  }

  setRated(value: number) {
    this.isRated = value;
    this.createRoom(); 
  }

  // ---------------- Local Game ----------------

  startPassAndPlay() {
    this.clearLocalGame();
    this.cdr.detectChanges();
    this.localGame = new Chess();
    this.displayChess = this.localGame; 
    this.whiteTime = this.timeControl * 60*1000;
    this.blackTime = this.timeControl * 60*1000;
    this.myColor = 'white';
    this.connected = true;
    setTimeout(() => this.redrawArrows(), 0);
    this.showFindMatch = false;
    this.startLocalTimer();

  }

  handleSquareClick(from: string, to: string) {
    if (!this.localGame) return;

    
    const piece = this.localGame.get(from as Square);
    const lastRank = (piece?.color === 'w') ? '8' : '1';
    if (piece?.type === 'p' && to.endsWith(lastRank)) {
      this.promotionSquare = { from, to };
    } else {
      this.makeMove(from, to);
    }
  }


  private makeMove(from: string, to: string, promotion?: string): boolean {
    if (!this.displayChess) return false;
    if (this.isViewingHistory) {
      console.warn('Ignoring click while viewing move history');
      return false;
    }
    try {
      
      const move = this.displayChess.move({ from, to, promotion });
      if (!move) {
        alert('Invalid move');
        return false;
      }

     
      this.rawMoves.push(move.san);

      
      this.lastMove.from = move.from;
      this.lastMove.to = move.to;

      this.arrows = [];
      if (this.arrowCanvas) this.redrawArrows();

      if (move.captured) {
        if (move.color === 'w') {
          
          this.capturedBlackIcons.push(this.mapBlack[move.captured] || '');
        } else {
          
          this.capturedWhiteIcons.push(this.mapWhite[move.captured] || '');
        }

        this.updateCapturedIcons(this.capturedWhiteIcons, this.capturedBlackIcons);
      }

      
      if (this.localGame) {
        
        if (this.displayChess !== this.localGame) {
          try {
            this.localGame.move({ from, to, promotion });
          } catch (e) {
            console.warn('Warning: could not apply move to localGame (fallback).', e);
          }
        }

        
        const justMoved = move.color === 'w' ? 'white' : 'black';

        
        if (this.displayChess.isCheckmate()) {
          this.endLocalGame(`${justMoved === 'white' ? 'White' : 'Black'} wins by checkmate`);
          return true;
        }
        if (this.displayChess.isStalemate()) {
          this.endLocalGame('Draw by stalemate');
          return true;
        }
        if (this.displayChess.isThreefoldRepetition()) {
          this.endLocalGame('Draw by threefold repetition');
          return true;
        }
        if (this.displayChess.isInsufficientMaterial()) {
          this.endLocalGame('Draw by insufficient material');
          return true;
        }
        if (this.displayChess.isDraw()) {
          this.endLocalGame('Draw');
          return true;
        }
        if (move.san.includes('+'))
          alert('Check!');
        
        this.myColor = this.myColor === 'white' ? 'black' : 'white';
        
        this.currentHintSquare = null;
        this.saveLocalGame();
        this.cdr.detectChanges();
        return true;

      } else {
        
        
        
        this.playService.sendMove(
          move.san,
          move.from,
          move.to
        );

        
        this.currentHintSquare = null;

        this.redrawArrows();
        this.cdr.detectChanges();
        return true;
      }
    } catch (e) {
      console.error('makeMove failed', e);
      alert('Could not perform move');
      return false;
    }
  }


  resignLocal(side: 'white' | 'black') {
    const result = side === 'white'
      ? "Black wins by resignation"
      : "White wins by resignation";

    this.endLocalGame(result);
  }

  private saveLocalGame() {
    if (!this.localGame) return;

    const state = {
      fen: this.localGame.fen(),
      moves: this.rawMoves,
      whiteTime: this.whiteTime,
      blackTime: this.blackTime,
      myColor: this.myColor,
      timeControl: this.timeControl,
      isPaused: this.isPaused,
      lastMove: this.lastMove,
      capturedWhite: this.capturedWhiteIcons,
      capturedBlack: this.capturedBlackIcons
    };

    localStorage.setItem('passAndPlayState', JSON.stringify(state));
  }

  private loadLocalGame() {
    const data = localStorage.getItem('passAndPlayState');
    if (!data) return;

    try {
      const state = JSON.parse(data);
      this.localGame = new Chess(); 
      this.displayChess = this.localGame;
      this.rawMoves = state.moves || [];
      this.whiteTime = state.whiteTime;
      this.blackTime = state.blackTime;
      this.myColor = state.myColor;
      this.timeControl = state.timeControl;
      this.isPaused = state.isPaused || false;
      this.connected = true;

      
      this.capturedWhiteIcons = state.capturedWhite || [];
      this.capturedBlackIcons = state.capturedBlack || [];
      this.updateCapturedIcons(this.capturedWhiteIcons, this.capturedBlackIcons);

      
      for (const m of this.rawMoves) {
        this.localGame.move(m); 
      }

      
      this.lastMove = state.lastMove || { from: null, to: null };
      this.lastMoveColor = '#f6f669'; 

      if (this.rawMoves.length > 0) {
        const history = this.localGame.history({ verbose: true });
        const result = history[history.length - 1];
        this.lastMove = { from: result.from, to: result.to };

        
        let highlightColor = '#f6f669';
        if (result.flags.includes('c')) highlightColor = '#ff9999';      // capture
        else if (result.flags.includes('e')) highlightColor = '#ffa500'; // en passant
        else if (result.flags.includes('p')) highlightColor = '#99ff99'; // promotion
        else if (result.flags.includes('k') || result.flags.includes('q')) highlightColor = '#ccccff'; // castle

        this.lastMoveColor = highlightColor;
      }

      this.cdr.detectChanges();
      this.showFindMatch = false;
      this.startLocalTimer();

    } catch (e) {
      console.error('❌ Failed to load local game:', e);
    }
  }





  private startLocalTimer() {
    this.stopLocalTimer();

    let lastTick = Date.now();

    this.localTimerId = setInterval(() => {
      if (this.isPaused) {
        lastTick = Date.now(); 
        return;
      }

      const now = Date.now();
      const delta = now - lastTick; 
      lastTick = now;

      if (this.myColor === 'white') {
        this.whiteTime = Math.max(0, this.whiteTime - delta);
        if (this.whiteTime <= 0) this.endLocalGame("Black wins on time");
      } else {
        this.blackTime = Math.max(0, this.blackTime - delta);
        if (this.blackTime <= 0) this.endLocalGame("White wins on time");
      }

      
      if (now % 500 < 100) this.saveLocalGame();

    }, 100); 
  }


  private stopLocalTimer() {
    if (this.localTimerId) {
      clearInterval(this.localTimerId);
      this.localTimerId = null;
    }
  }

  private endLocalGame(result: string) {
    
    this.stopLocalTimer();

    
    this.popupType = 'game_over';
    this.gameResultText = result;
    this.showPopup = true;
    this.arrows = [];
    if (this.arrowCanvas) this.redrawArrows();

    this.connected = false;
    this.lastMove = { from: null, to: null };

    this.clearLocalGame();

    this.cdr.detectChanges();
  }

  private clearLocalGame() {
    localStorage.removeItem('passAndPlayState');
    this.rawMoves = [];
    this.connected = false;
    this.previousgametype = 'local';
    this.displayChess = new Chess();
    this.lastMove = { from: null, to: null };
    this.capturedWhiteIcons = [];
    this.capturedBlackIcons = [];
    this.whiteTime = 0;
    this.blackTime = 0;
    this.myColor = 'white';
    this.isPaused = false;
  }

  togglePause() {
    this.isPaused = !this.isPaused;
    this.saveLocalGame();
  }



  rebuildFromMoves(fenRoot: string, moves: any[], endIndex: number = this.MOVE_LIVE): Chess {
    let c: Chess;
    try {
      if (fenRoot && fenRoot !== 'startpos') c = new Chess(fenRoot);
      else c = new Chess();
    } catch {
      c = new Chess();
    }

    if (endIndex === this.MOVE_START) return c;

    const limit = (endIndex === this.MOVE_LIVE) ? moves.length - 1 : endIndex;
    for (let i = 0; i <= limit && i < moves.length; i++) {
      const mv = moves[i];
      try {
        if (!mv) continue;


        if (typeof mv === 'string') {
          c.move(mv);
        }

        else if (Array.isArray(mv) && typeof mv[0] === 'string') {
          c.move(mv[0]);
        }
        
        else if (typeof mv === 'object' && mv.san) {
          c.move(mv.san);
        }
      } catch (e) {
        console.warn('rebuildFromMoves: failed to apply move', mv, e);
      }
    }

    return c;
  }


  prevMove() {
    if (this.navLock) return;
    this.cancelPremoves();
    const total = this.rawMoves.length;
    if (total === 0) {
      this.jumpToMove(this.MOVE_START);
      this.isViewingHistory = false; 
      return;
    }

    let targetIndex: number;


    if (this.moveIndex === this.MOVE_LIVE) {
      targetIndex = total - 2;
    }

    else if (this.moveIndex <= 0) {
      
      targetIndex = this.MOVE_START;
    }

    else {
      targetIndex = this.moveIndex - 1;
    }

    
    this.jumpToMove(targetIndex);
  }




  jumpToMove(moveIndex: number) {
    if (this.navLock) return;
    this.navLock = true;
    this.cancelPremoves();
    try {
      const total = this.rawMoves.length;


      if (moveIndex === this.MOVE_START || moveIndex < 0) {
        try {

          this.displayChess = this.rebuildFromMoves(this.trueStartFen, this.rawMoves, moveIndex);

        } catch {
          this.displayChess = new Chess();
        }
        this.moveIndex = this.MOVE_START;
        this.isViewingHistory = true;
        this.lastMove = { from: null, to: null };
        
      }

      else if (moveIndex >= 0 && moveIndex < total) {

        this.displayChess = this.rebuildFromMoves(this.trueStartFen, this.rawMoves, moveIndex);

        this.moveIndex = moveIndex;
        this.isViewingHistory = true;
        
      }

      else {

        this.displayChess = this.rebuildFromMoves(this.trueStartFen, this.rawMoves, moveIndex);

        this.moveIndex = this.MOVE_LIVE;
        this.isViewingHistory = false;
        
      }


      this.updateLastMoveHighlight(this.moveIndex);

      this.redrawArrows();
      this.cdr.detectChanges();
    } finally {
      setTimeout(() => (this.navLock = false), 0);
    }
  }


  nextMove() {
    if (this.navLock) {
      console.warn('nextMove ignored (navLock)');
      return;
    }
    this.cancelPremoves();
    const total = this.rawMoves.length;
    if (total === 0) {

      return;
    }

    let nextIndex = this.moveIndex;

    if (this.moveIndex === this.MOVE_LIVE) {

      
      return;
    } else if (this.moveIndex === this.MOVE_START) {

      nextIndex = 0;
    } else {

      nextIndex = this.moveIndex + 1;

      if (nextIndex >= total - 1) {
        this.returnToLive();
        return;
      }
    }

    
    this.jumpToMove(nextIndex);
  }


  returnToLive() {
    if (this.navLock) {
      console.warn('returnToLive ignored (navLock)');
      return;
    }
    const total = this.rawMoves.length;

    this.displayChess = this.rebuildFromMoves(this.trueStartFen, this.rawMoves, this.MOVE_LIVE);


    this.moveIndex = this.MOVE_LIVE;
    this.isViewingHistory = false;

    try {
      const hist = this.displayChess.history({ verbose: true });
      const last = hist[hist.length - 1];
      this.lastMove = last ? { from: last.from, to: last.to } : { from: null, to: null };
      if (last) this.updateLastMoveHighlight(this.MOVE_LIVE);
    } catch {
      this.lastMove = { from: null, to: null };
    }

    
    this.redrawArrows();
    this.cdr.detectChanges();
  }

  // ---------------- Display ----------------

  get formattedMoves(): string[] {
    const result: string[] = [];
    for (let i = 0; i < this.rawMoves.length; i += 2) {
      const moveNum = Math.floor(i / 2) + 1;


      const whiteMove = Array.isArray(this.rawMoves[i]) ? this.rawMoves[i][0] : this.rawMoves[i] || '';
      const blackMove = Array.isArray(this.rawMoves[i + 1]) ? this.rawMoves[i + 1][0] : this.rawMoves[i + 1] || '';

      result.push(`${moveNum}. ${whiteMove} ${blackMove}`);
    }
    return result;
  }

  formatTimer(ms: number): string {
    if (ms == null || isNaN(ms)) return '0:00:000';
    if (ms < 0) ms = 0;
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const milliseconds = Math.floor(ms % 1000); 
    return `${minutes}:${seconds.toString().padStart(2, '0')}:${milliseconds
      .toString()
      .padStart(3, '0')}`;
  }

  reload() {
    window.location.reload();
  }

}

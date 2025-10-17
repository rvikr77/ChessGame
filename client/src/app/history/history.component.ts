import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Chess } from 'chess.js';
import { HistoryService } from './history.service';
import { interval, Subscription } from 'rxjs';
import { Router } from '@angular/router';
@Component({
	selector: 'app-history',
	standalone: true,
	imports: [CommonModule],
	template: `
<h2 style="text-align:center;">Game History</h2><button (click)="goToPlay()">Play</button>
<div *ngIf="loading">Loading...</div>

<div *ngIf="!loading" class="history-container">
	
  <!-- Left Column: Game List + Upload -->
  <div class="history-list">
    <div style="margin-bottom: 10px; text-align:center;">
      <button (click)="fileInput.click()">📁 Upload JSON</button>
      <input type="file" #fileInput accept=".json" style="display:none" (change)="onFileSelected($event)">
    </div>

    <ul>
      <li *ngFor="let game of games" 
          (click)="selectGame(game)" 
          [class.selected]="selectedGame?.game_id === game.game_id"
          style="cursor:pointer; margin-bottom: 8px; padding:4px; border-radius:4px;">
        <strong>{{ game.game_id }}</strong>
        <span style="color:gray">({{ game.timestamp | date:'short' }})</span>
      </li>
    </ul>
  </div>

  <!-- Right Column: Selected Game -->
  <div class="game-view" *ngIf="selectedGame">
  <button (click)="backToHistory()" style="margin-bottom:10px;">⬅ Back to History</button>

    <h3>Moves for Game: {{ selectedGame.game_id }}</h3>

    <div class="timestamps">
      <div><b>White Time:</b> {{ whiteTimeDisplay }}</div>
      <div><b>Black Time:</b> {{ blackTimeDisplay }}</div>
    </div>
<div class="player-info" style="text-align:center; margin-bottom:10px; font-size:18px;">
	<div>
		White elo: <span>({{ selectedGame.elo_white }} → {{ selectedGame.post_elo_white }})</span>
	</div>
	<div>
		Black elo: <span>({{ selectedGame.elo_black }} → {{ selectedGame.post_elo_black }})</span>
	</div>
</div>

    <!-- Board -->
    <div class="board">
      <div *ngFor="let square of boardSquares"
          class="square"
          [ngStyle]="getSquareStyle(square)">
        <span class="piece">{{ board[square] }}</span>
      </div>
    </div>

    <!-- Controls -->
    <div class="controls">
      <button (click)="prevMove()">⏮ Prev</button>
      <button (click)="togglePlay()">{{ isPlaying ? '⏸ Pause' : '▶ Play' }}</button>
      <button (click)="nextMove()">⏭ Next</button>
    </div>

    <p>Move {{ currentMoveIndex }} / {{ moves.length }}</p>

    <div class="captures">
      <div>
        <b>White Captures:</b> {{ captures.white.join(' ') || '-' }}
        <span *ngIf="materialAdvantage > 0" style="color:green;">(+{{ materialAdvantage }})</span>
      </div>
      <div>
        <b>Black Captures:</b> {{ captures.black.join(' ') || '-' }}
        <span *ngIf="materialAdvantage < 0" style="color:red;">(+{{ -materialAdvantage }})</span>
      </div>
    </div>

    <button (click)="downloadGame(selectedGame)">Download JSON</button>
  </div>

</div>

<style>
.history-container {
  display: grid;
  grid-template-columns: 250px 1fr;
  gap: 20px;
  margin: 20px;
}

.history-list {
  border-right: 2px solid #ccc;
  padding-right: 10px;
  max-height: 80vh;
  overflow-y: auto;
}

.history-list li.selected {
  background-color: #f0f0f0;
}

.game-view {
  overflow-y: auto;
}


.board {
  display: grid;
  grid-template-columns: repeat(8, 60px);
  grid-template-rows: repeat(8, 60px);
  margin: 20px auto;
  width: 480px;
  border: 2px solid #333;
}

.square {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 36px;
  user-select: none;
  transition: background-color 0.3s;
}

.controls {
  text-align: center;
  margin-top: 10px;
}

button { margin: 5px; padding: 5px 12px; font-size: 16px; }
.captures, .timestamps { text-align: center; margin-top: 10px; font-size: 20px; }
.history-container {
  display: grid;
  grid-template-columns: 250px 1fr;
  gap: 20px;
  margin: 20px;
}

.history-list {
  border-right: 2px solid #ccc;
  padding-right: 10px;
  max-height: 80vh;
  overflow-y: auto;
}

.history-list li.selected {
  background-color: #f0f0f0;
}

.game-view {
  overflow-y: auto;
}


.board {
  display: grid;
  grid-template-columns: repeat(8, 60px);
  grid-template-rows: repeat(8, 60px);
  margin: 20px auto;
  width: 480px;
  border: 2px solid #333;
}

.square {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 36px;
  user-select: none;
  transition: background-color 0.3s;
}

.controls {
  text-align: center;
  margin-top: 10px;
}

.captures, .timestamps { text-align: center; margin-top: 10px; font-size: 20px; }
button {
  cursor: pointer;
  font-weight: 600;
  border: none;
  border-radius: 10px;
  padding: 0.55em 1.5em;
  transition: all 0.25s ease;
  box-shadow: 0 3px 8px rgba(0, 0, 0, 0.15);
  font-size: 16px;
  background: linear-gradient(135deg, #3498db, #2980b9);
  color: #fff;
}

button:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 14px rgba(0, 0, 0, 0.25);
}


button:disabled {
  background: #bdc3c7;
  color: #7f8c8d;
  cursor: not-allowed;
}

button[style*="color: red"] {
  background: #e74c3c;
  color: #fff;
}

button[style*="color: red"]:hover {
  background: #c0392b;
}


.history-list button,
.game-view button {
  background: linear-gradient(135deg, #1abc9c, #16a085);
}

.history-list button:hover,
.game-view button:hover {
  background: linear-gradient(135deg, #16a085, #138d75);
}

/* 🔹 Controls (Prev / Play / Next) */
.controls button {
  background: linear-gradient(135deg, #9b59b6, #8e44ad);
}

.controls button:hover {
  background: linear-gradient(135deg, #8e44ad, #71368a);
}


.history-list li {
  padding: 6px 10px;
  border-radius: 8px;
  transition: all 0.2s ease;
}

.history-list li:hover {
  background: rgba(52, 152, 219, 0.2);
}


.history-list li.selected {
  background: linear-gradient(135deg, #2980b9, #3498db);
  color: #fff;
}
</style>
`

})
export class HistoryComponent implements OnInit, OnDestroy {
	games: any[] = [];
	selectedGame: any = null;
	moves: any[] = [];
	loading = true;

	chess = new Chess();
	currentMoveIndex = 0;
	isPlaying = false;
	playSub?: Subscription;

	highlightSquares: { [key: string]: string } = {};

	mapWhite: Record<string, string> = { p: '♙', r: '♖', n: '♘', b: '♗', q: '♕', k: '♔' };
	mapBlack: Record<string, string> = { p: '♟', r: '♜', n: '♞', b: '♝', q: '♛', k: '♚' };
	pieceValues: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9 };

	board: Record<string, string | null> = {};
	boardSquares: string[] = [];
	captures = { white: [] as string[], black: [] as string[] };

	materialAdvantage = 0;


	whiteTimeDisplay = '00:00:00.000';
	blackTimeDisplay = '00:00:00.000';

	constructor(private historyService: HistoryService, private router: Router) { }

	ngOnInit() {
		this.historyService.getHistory().subscribe({
			next: (games) => {
				this.games = games.map((game: any) => {
					let parsedMoves: any[] = [];
					try {
						if (typeof game.moves === 'string') {
							parsedMoves = JSON.parse(game.moves);
							if (Array.isArray(parsedMoves) && typeof parsedMoves[0] === 'string')
								parsedMoves = JSON.parse(parsedMoves[0]);
						} else if (Array.isArray(game.moves)) {
							const first = game.moves[0];
							if (typeof first === 'string') parsedMoves = JSON.parse(first);
							else parsedMoves = game.moves;
						} else parsedMoves = [];
					} catch (err) {
						console.error('Move parse error for game', game.game_id, err, game.moves);
						parsedMoves = [];
					}
					return { ...game, moves: parsedMoves };
				});
				this.loading = false;
			},
			error: () => (this.loading = false),
		});

		this.boardSquares = this.generateBoardSquares();
	}

	ngOnDestroy() {
		this.playSub?.unsubscribe();
	}
	onFileSelected(event: any) {
		const file = event.target.files[0];
		if (!file) return;

		const reader = new FileReader();
		reader.onload = (e: any) => {
			try {
				const json = JSON.parse(e.target.result);


				if (!json.moves) {
					alert('Invalid JSON format');
					return;
				}

				// Parse moves properly
				let parsedMoves: any[] = [];
				try {
					if (typeof json.moves === 'string') parsedMoves = JSON.parse(json.moves);
					else if (Array.isArray(json.moves)) {
						const first = json.moves[0];
						if (typeof first === 'string') parsedMoves = JSON.parse(first);
						else parsedMoves = json.moves;
					}
				} catch {
					alert('Error parsing moves');
					return;
				}


				const uploadedGame = {
					game_id: 'uploaded_json',
					moves: parsedMoves,
					time_control: json.time_control ?? 0,
					created_at: new Date().toISOString(),
					elo_white: json.elo_white ?? null,
					elo_black: json.elo_black?? null,
					post_elo_white: json.post_elo_white ?? null,
					post_elo_black: json.post_elo_black ?? null,
					result: json.result ?? null,
				};


				this.games = [uploadedGame];
				this.selectedGame = null;
				this.selectGame(uploadedGame);
			} catch (err) {
				console.error('Invalid JSON file:', err);
				alert('Invalid JSON file');
			}
		};
		reader.readAsText(file);
		event.target.value = '';

	}
	backToHistory() {
		window.location.reload();
	}


	private formatTime(ms: number): string {
		const hours = Math.floor(ms / 3600000);
		const minutes = Math.floor((ms % 3600000) / 60000);
		const seconds = Math.floor((ms % 60000) / 1000);
		const millis = ms % 1000;

		const pad = (n: number, width: number) => n.toString().padStart(width, '0');
		return `${pad(hours, 2)}:${pad(minutes, 2)}:${pad(seconds, 2)}.${pad(millis, 3)}`;
	}

	selectGame(game: any) {
		this.selectedGame = game;
		this.moves = Array.isArray(game.moves) ? game.moves : [];

		this.chess = new Chess();
		this.captures = { white: [], black: [] };
		this.materialAdvantage = 0;
		this.currentMoveIndex = 0;
		this.highlightSquares = {};
		

		const defaultTime = game.time_control ?? 0;
		this.whiteTimeDisplay = this.formatTime(defaultTime);
		this.blackTimeDisplay = this.formatTime(defaultTime);
		this.updateBoard();
	}


	generateBoardSquares() {
		const squares: string[] = [];
		const files = 'abcdefgh';
		for (let r = 8; r >= 1; r--) {
			for (let f of files) squares.push(f + r);
		}
		return squares;
	}

	updateBoard() {
		const boardState = this.chess.board();
		const pieces: Record<string, string | null> = {};
		for (let r = 0; r < 8; r++) {
			for (let f = 0; f < 8; f++) {
				const piece = boardState[r][f];
				const square = 'abcdefgh'[f] + (8 - r);
				pieces[square] = piece
					? piece.color === 'w'
						? this.mapWhite[piece.type]
						: this.mapBlack[piece.type]
					: null;
			}
		}
		this.board = pieces;
	}

	getSquareStyle(square: string) {
		const file = square.charCodeAt(0) - 97;
		const rank = parseInt(square[1]);
		const isLight = (file + rank) % 2 === 0;
		let backgroundColor = isLight ? '#eeeed2' : '#769656';
		if (this.highlightSquares[square]) backgroundColor = this.highlightSquares[square];
		return { backgroundColor };
	}

	applyHighlight(result: any) {
		this.highlightSquares = {};
		if (!result?.from || !result?.to) return;

		let color = '#f6f669';
		if (result.flags.includes('c')) color = '#ff9999';
		else if (result.flags.includes('e')) color = '#ffa500';
		else if (result.flags.includes('p')) color = '#99ff99';
		else if (result.flags.includes('k') || result.flags.includes('q')) color = '#ccccff';

		this.highlightSquares[result.from] = color;
		this.highlightSquares[result.to] = color;
	}

	updateMaterial(result: any) {
		if (!result?.captured) return;
		const value = this.pieceValues[result.captured] || 0;
		if (result.color === 'w') this.materialAdvantage += value;
		else this.materialAdvantage -= value;
	}

	nextMove() {
		if (this.currentMoveIndex < this.moves.length) {
			const [move, time] = this.moves[this.currentMoveIndex];
			const result = this.chess.move(move);


			if (result?.color === 'w') this.whiteTimeDisplay = this.formatTime(time);
			else this.blackTimeDisplay = this.formatTime(time);

			if (result) {
				this.applyHighlight(result);
				if (result.captured) {
					const capturedSymbol =
						result.color === 'w'
							? this.mapBlack[result.captured]
							: this.mapWhite[result.captured];
					if (result.color === 'w') this.captures.white.push(capturedSymbol);
					else this.captures.black.push(capturedSymbol);
				}
				this.updateMaterial(result);
			}

			this.currentMoveIndex++;
			this.updateBoard();
		}
	}

	prevMove() {
		if (this.currentMoveIndex > 0) {
			this.currentMoveIndex--; 


			this.chess = new Chess();
			this.captures = { white: [], black: [] };
			this.materialAdvantage = 0;
			this.highlightSquares = {};
			this.whiteTimeDisplay = '00:00:00.000';
			this.blackTimeDisplay = '00:00:00.000';

			let lastResult: any = null;

			for (let i = 0; i < this.currentMoveIndex; i++) {
				const [move, time] = this.moves[i];
				const result = this.chess.move(move);
				if (!result) continue;

				lastResult = result;


				if (result.captured) {
					const val = this.pieceValues[result.captured] || 0;
					if (result.color === 'w') {
						this.materialAdvantage += val;
						this.captures.white.push(this.mapBlack[result.captured]);
					} else {
						this.materialAdvantage -= val;
						this.captures.black.push(this.mapWhite[result.captured]);
					}
				}

				
				if (result.color === 'w') this.whiteTimeDisplay = this.formatTime(time);
				else this.blackTimeDisplay = this.formatTime(time);
			}

			
			if (lastResult) this.applyHighlight(lastResult);

			this.updateBoard();
		}
	}



	togglePlay() {
		if (this.isPlaying) this.stopAutoPlay();
		else {
			this.isPlaying = true;
			this.playSub = interval(1000).subscribe(() => {
				if (this.currentMoveIndex < this.moves.length) this.nextMove();
				else this.stopAutoPlay();
			});
		}
	}

	stopAutoPlay() {
		this.isPlaying = false;
		this.playSub?.unsubscribe();
	}

	downloadGame(game: any) {
		if (!game) return;

		const exportData = {
			result: game.result ?? null,
			created_at: game.created_at,
			time_control: game.time_control,
			moves: [JSON.stringify(game.moves)], 
			elo_white: game.elo_white ?? null,
			elo_black: game.elo_black ?? null,
			post_elo_white: game.post_elo_white ?? null,
			post_elo_black: game.post_elo_black ?? null
		};

		const jsonStr = JSON.stringify(exportData, null, 2);
		const blob = new Blob([jsonStr], { type: 'application/json' });
		const url = window.URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `game_${game.game_id}.json`;
		a.click();
		window.URL.revokeObjectURL(url);
	}
	goToPlay() {
		this.router.navigate(['./play']);
	}
}

const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/sqlite');
const { Chess } = require('chess.js');
const queue = {};                  
const liveGames = {};              
const timerIntervals = {};         
const activeQueueEmails = new Set();
const userSockets = {};            
const privateQueues = {}; 

// CREATE private room
async function handleCreatePrivateQueue(ws, userEmail, roomCode, time, rated) {
  if (privateQueues[roomCode]) {
    broadcast(ws, 'error', { msg: 'Room code already in use' });
    return;
  }
  isRated=rated;
  privateQueues[roomCode] = [ws, userEmail, time, rated];
  broadcast(ws, 'private_queue_created', { roomCode });
  activeQueueEmails.add(userEmail);
}

// JOIN private room
async function handleJoinPrivateQueue(ws, userEmail, roomCode) {
  const creator = privateQueues[roomCode];
  if (!creator) {
    broadcast(ws, 'error', { msg: 'Room code not found' });
    return;
  }
  if (creator[1] === userEmail) {
    broadcast(ws, 'error', { msg: 'Cannot join your own room' });
    return;
  }

  const [creatorWs, creatorEmail, time, rated] = creator;
  delete privateQueues[roomCode];
  activeQueueEmails.delete(creatorEmail);

  
  const game_id = uuidv4();
  const players = [creatorEmail, userEmail].sort(() => Math.random() - 0.5);
  const game = {
    game_id,
    player_white: players[0],
    player_black: players[1],
    fen: 'startpos',
    last_move: '',
    time_control: time,
    turn: 'w',
    moves: JSON.stringify([]),
    positions: JSON.stringify(db.defaultPositions()),
    white_time: time * 60 *1000,
    black_time: time * 60 * 1000,
    last_timestamp: Date.now(),
    isRated: rated
  };

  await db.saveLiveGame(game);
  liveGames[game_id] = [];

  const sockets = {
    [players[0]]: players[0] === creatorEmail ? creatorWs : ws,
    [players[1]]: players[1] === userEmail ? ws : creatorWs,
  };

  addClientToGame(game_id, sockets[players[0]]);
  addClientToGame(game_id, sockets[players[1]]);

  sendGameStart(sockets[players[0]], game, 'white', players[1]);
  sendGameStart(sockets[players[1]], game, 'black', players[0]);
  broadcast(sockets[players[0]], 'private_match_created', { roomCode });
  broadcast(sockets[players[1]], 'private_match_created', { roomCode });
}

async function handleReportPlayer(ws, reportedEmail) {
  const gameId=await db.getLiveGameByEmail(reportedEmail).then(game => game ? game.game_id : null);
  await db.reportPlayer(gameId, reportedEmail);
  broadcast(ws, 'report_acknowledged', { msg: 'Player reported. Thank you for helping keep the community safe.' });
}

function getKey(elo, time) {
  return `${Math.round(elo / 100)}_${time}`;
}

function broadcast(ws, type, data) {
  try {
    ws.send(JSON.stringify({ type, data }));
  } catch {}
}

function removeFromQueue(email) {
  for (const key in queue) {
    queue[key] = queue[key].filter(([_, e]) => {
      if (e === email) {
        activeQueueEmails.delete(email);
        return false;
      }
      return true;
    });
    if (!queue[key].length) delete queue[key];
  }
}

function getOpponentEmail(game, userEmail) {
  return game.player_white === userEmail ? game.player_black : game.player_white;
}
  // Helper to compute captured pieces arrays
function getCapturedPieces(moves) {
  const whiteCaptured = [];
  const blackCaptured = [];
  const chess = new Chess(); 

  for (let i = 0; i < moves.length; i++) {
    const move = Array.isArray(moves[i]) ? moves[i][0] : moves[i];
    const result = chess.move(move, { sloppy: true });
    if (result && result.captured) {
      if (result.color === 'w') {
        
        blackCaptured.push(result.captured.toUpperCase());
      } else {
        
        whiteCaptured.push(result.captured.toUpperCase());
      }
    }
  }

  return { whiteCaptured, blackCaptured };
}

function addClientToGame(game_id, ws) {
  if (!ws) {
    console.error(`Invalid WebSocket object passed to addClientToGame for game_id: ${game_id}`);
    return; 
  }

  if (!liveGames[game_id]) liveGames[game_id] = [];
  if (!liveGames[game_id].includes(ws)) {
    liveGames[game_id].push(ws);
  }
  ws.gameId = game_id;

  // Start timer interval for this game if not already running
  if (!timerIntervals[game_id]) {
    let lastTick = Date.now();

    
    timerIntervals[game_id] = setInterval(async () => {
      const now = Date.now();
      const elapsed = now - lastTick; 
      lastTick = now;

      const gameInfo = await db.getLiveGameByGameId(game_id);
      if (!gameInfo) return;

      let { white_time, black_time, turn } = gameInfo;

     
      if (turn === 'w') {
        white_time = Math.max(white_time - elapsed, 0);
      } else {
        black_time = Math.max(black_time - elapsed, 0);
      }

      
      await db.saveLiveGame({
        ...gameInfo,
        white_time,
        black_time,
        last_timestamp: now,
      });

      
      (liveGames[game_id] || []).forEach(client => {
        broadcast(client, 'timer_update', { white_time, black_time, turn });
      });

      
      if (white_time === 0 || black_time === 0) {
        const loserEmail = white_time === 0 ? gameInfo.player_white : gameInfo.player_black;
        await handleForceClose(loserEmail);
        clearInterval(timerIntervals[game_id]);
        delete timerIntervals[game_id];
      }
    }, 500);
  }
}



function sendGameStart(ws, game, color, opponent) {
  const parsedMoves = safeParse(game.moves, []);
  const parsedPositions = (typeof game.positions === 'string')
    ? safeParse(game.positions, {})
    : (game.positions || {});
  const startFen = new Chess().fen();
  const fenToSend = game.fen && game.fen !== 'startpos' ? game.fen : startFen;
  const { whiteCaptured, blackCaptured } = getCapturedPieces(parsedMoves);

  broadcast(ws, 'game_start', {
    game_id: game.game_id,
    color,
    opponent,
    fen: fenToSend,
    time: game.time_control,
    moves: parsedMoves,
    positions: parsedPositions,
    white_time: game.white_time ?? game.time_control * 60 * 1000,
    black_time: game.black_time ?? game.time_control * 60 * 1000,
    LastMoveFrom: game.lastMoveFrom ?? null,
    LastMoveTo: game.lastMoveTo ?? null,
    highlightColor: game.highlightColor ?? null,
    capturedWhite: whiteCaptured,
    capturedBlack: blackCaptured
  });
}


async function handleAuth(ws, token) {
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const email = decoded.email;
    if (userSockets[email] && userSockets[email] !== ws) {
      userSockets[email].close();
    }
    userSockets[email] = ws;
    
    ws.email = email;

    broadcast(ws, 'auth_success', { email });
    return email;
  } catch (err) {
    broadcast(ws, 'auth_error', { reason: err.message });
    ws.close();
    return null;
  }
}

async function handleRejoin(ws, userEmail) {
  const live = await db.getLiveGameByEmail(userEmail);
  if (!live) {
    broadcast(ws, 'rejoin_failed', { reason: 'No live game found' });
    return;
  }

  addClientToGame(live.game_id, ws);

  const opponentEmail = getOpponentEmail(live, userEmail);
  const color = live.player_white === userEmail ? 'white' : 'black';


  const parsedMoves = safeParse(live.moves, []);
  const parsedPositions = (typeof live.positions === 'string')
    ? safeParse(live.positions, {})
    : (live.positions || {});
  const { whiteCaptured, blackCaptured } = getCapturedPieces(parsedMoves);


  broadcast(ws, 'rejoin', {
    game_id: live.game_id,
    color,
    opponent: opponentEmail,
    fen: (live.fen && live.fen !== 'startpos') ? live.fen : (new Chess().fen()),
    time: live.time_control ?? live.time,
    moves: parsedMoves,
    positions: parsedPositions,
    white_time: live.white_time ?? (live.time_control ? live.time_control * 60 * 1000 : 0),
    black_time: live.black_time ?? (live.time_control ? live.time_control * 60 * 1000 : 0),
    LastMoveFrom: live.lastMoveFrom ?? null,
    LastMoveTo: live.lastMoveTo ?? null,
    highlightColor: live.highlightColor ?? null,
    capturedWhite: whiteCaptured,
    capturedBlack: blackCaptured,
    game: live 
  });
}


const drawRequests = new Map();

async function handleDrawRequest(ws, userEmail) {
  const game = await db.getLiveGameByEmail(userEmail);
  if (!game) {
    broadcast(ws, 'error', { msg: 'No live game found' });
    return;
  }

  const game_id = game.game_id;
  const opponentEmail = getOpponentEmail(game, userEmail);
  if (!drawRequests.has(game_id)) drawRequests.set(game_id, new Set());
  const requests = drawRequests.get(game_id);

  requests.add(userEmail);
  broadcast(ws, 'draw_requested', { msg: 'Draw request sent to opponent.' });

  const opponentSocket = userSockets[opponentEmail];
  if (opponentSocket) {
    broadcast(opponentSocket, 'opponent_draw_requested', { from: userEmail });
  }

  if (requests.has(opponentEmail)) {
    await concludeDraw(game);
    drawRequests.delete(game_id);
  }
}

async function concludeDraw(game) {
  const { game_id, player_white, player_black } = game;
  const clients = liveGames[game_id] || [];

  await db.updateElo(game_id,player_white, player_black, true, false);

  // Save game history
  const pre_elo_white = await db.getUserElo(player_white);
  const pre_elo_black = await db.getUserElo(player_black);
  const post_elo_white = await db.getUserElo(player_white);
  const post_elo_black = await db.getUserElo(player_black);
  await db.saveGameHistory({ ...game, pre_elo_white, pre_elo_black }, 'draw', post_elo_white, post_elo_black);

  // Notify clients
  clients.forEach(client => {
    broadcast(client, 'game_over', { result: 'draw' });
    client.close();
  });

  // Cleanup
  delete liveGames[game_id];
  if (timerIntervals[game_id]) {
    clearInterval(timerIntervals[game_id]);
    delete timerIntervals[game_id];
  }
  await db.deleteLiveGame(player_white);
  await db.deleteLiveGame(player_black);
}
async function handleDrawDecline(ws, userEmail) {
  const game = await db.getLiveGameByEmail(userEmail);
  if (!game) return;

  const game_id = game.game_id;
  const opponentEmail = getOpponentEmail(game, userEmail);
  const opponentSocket = userSockets[opponentEmail];

  // Notify opponent
  if (opponentSocket) {
    broadcast(opponentSocket, 'draw_declined', { from: userEmail });
  }

  
  if (drawRequests.has(game_id)) {
    const requests = drawRequests.get(game_id);
    requests.delete(userEmail);      
    requests.delete(opponentEmail);  
  }


}



async function handlePlayRequest(ws, userEmail, time) {
  
  const existingGame = await db.getLiveGameByEmail(userEmail);
  if (existingGame) {
    broadcast(ws, 'already_in_game', { 
      msg: 'You are already in a game. Finish or resign before starting a new one.' 
    });
    return;
  }

  const elo = await db.getUserElo(userEmail);
  const bucketKey = getKey(elo, time);

  removeFromQueue(userEmail);

  let matched = false;
  for (let i = -1; i <= 1 && !matched; i++) {
    const altKey = `${parseInt(bucketKey.split('_')[0]) + i}_${time}`;
    if (!queue[altKey]) continue;

    for (let j = 0; j < queue[altKey].length; j++) {
      const [opponentWs, opponentEmail] = queue[altKey][j];
      if (opponentEmail === userEmail) continue;

      const opponentElo = await db.getUserElo(opponentEmail);
      if (Math.abs(elo - opponentElo) > 100) {
        continue; 
      }
      queue[altKey].splice(j, 1);
      if (!queue[altKey].length) delete queue[altKey];

      const game_id = uuidv4();
      const players = [userEmail, opponentEmail].sort(() => Math.random() - 0.5);

      const game = {
        game_id,
        player_white: players[0],
        player_black: players[1],
        fen: 'startpos',
        last_move: '',
        time_control: time,
        turn: 'w',
        moves: JSON.stringify([]),
        positions: JSON.stringify(db.defaultPositions()),
        white_time: time * 60 *1000,
        black_time: time * 60*1000,
        last_timestamp: Date.now()
      };
      await db.saveLiveGame(game);
      liveGames[game_id] = [];

      const sockets = {
        [players[0]]: (userEmail === players[0]) ? ws : opponentWs,
        [players[1]]: (userEmail === players[1]) ? ws : opponentWs
      };

      addClientToGame(game_id, sockets[players[0]]);
      addClientToGame(game_id, sockets[players[1]]);

      sendGameStart(sockets[players[0]], game, 'white', players[1]);
      sendGameStart(sockets[players[1]], game, 'black', players[0]);

      activeQueueEmails.delete(userEmail);
      activeQueueEmails.delete(opponentEmail);
      matched = true;
      break;
    }
  }

  if (!matched) {
    if (!queue[bucketKey]) queue[bucketKey] = [];
    queue[bucketKey].push([ws, userEmail]);
    activeQueueEmails.add(userEmail);
    broadcast(ws, 'queued', { msg: 'Waiting for opponent...' });
  }
}


const waitingRematches = new Map();


async function handleRematchRequest(ws, userEmail, opponentEmail, time) {
  const existingGame = await db.getLiveGameByEmail(userEmail);
  if (existingGame) {
    broadcast(ws, 'already_in_game', {
      msg: 'You are already in a game. Finish or resign before starting a new one.'
    });
    return;
  }
  if (userEmail === opponentEmail) {
    broadcast(ws, 'rematch_failed', { msg: 'Cannot rematch yourself' });
    return;
  }

  const elo = await db.getUserElo(userEmail);
  const opponentElo = await db.getUserElo(opponentEmail);
  if (Math.abs(elo - opponentElo) > 100) {
    broadcast(ws, 'rematch_failed', { msg: 'elo mismatch' });
    return;
  }

  const opponentSocket = userSockets[opponentEmail];
  const opponentInGame = await db.getLiveGameByEmail(opponentEmail);
  if (opponentInGame || activeQueueEmails.has(opponentEmail)) {
    broadcast(ws, 'rematch_failed', { msg: 'Opponent is busy' });
    return;
  }

  const key = `${opponentEmail}|${time}`;
  const reverseKey = `${userEmail}|${time}`;

  // Wait for opponent’s request
  if (!waitingRematches.has(key)) {
    broadcast(ws, 'rematch_failed', { msg: 'Waiting for opponent...' });
    const timer = setTimeout(() => waitingRematches.delete(reverseKey), 30000);
    waitingRematches.set(reverseKey, { userEmail, timer });
    return;
  }


  const { timer } = waitingRematches.get(key);
  clearTimeout(timer);
  waitingRematches.delete(key);

  for (const email of [userEmail, opponentEmail]) {
    const prev = await db.getLiveGameByEmail(email);
    if (prev) {
      if (liveGames[prev.game_id]) {
        liveGames[prev.game_id].forEach(c => { try { c.close(); } catch {} });
        delete liveGames[prev.game_id];
      }
      if (timerIntervals[prev.game_id]) {
        clearInterval(timerIntervals[prev.game_id]);
        delete timerIntervals[prev.game_id];
      }
      await db.deleteLiveGame(email);
    }
  }


  const game_id = uuidv4();
  const players = [userEmail, opponentEmail].sort(() => Math.random() - 0.5);
  const game = {
    game_id,
    player_white: players[0],
    player_black: players[1],
    fen: 'startpos',
    last_move: '',
    time_control: time,
    turn: 'w',
    moves: JSON.stringify([]),
    positions: JSON.stringify(db.defaultPositions()),
    white_time: time * 60 * 1000,
    black_time: time * 60 * 1000,
    last_timestamp: Date.now()
  };

  await db.saveLiveGame(game);
  liveGames[game_id] = [];

  addClientToGame(game_id, ws);
  if (opponentSocket) addClientToGame(game_id, opponentSocket);

    if (game.player_white === userEmail) {
    sendGameStart(ws, game, 'white', opponentEmail);
    if (opponentSocket) sendGameStart(opponentSocket, game, 'black', userEmail);
  } else {
    sendGameStart(ws, game, 'black', opponentEmail);
    if (opponentSocket) sendGameStart(opponentSocket, game, 'white', userEmail);
  }
}




function safeParse(val, fallback) {
  try {
    return val ? JSON.parse(val) : fallback;
  } catch {
    return fallback;
  }
}

async function handleMove(ws, userEmail, move) {
  try {
    const game_id = ws.gameId;
    if (!game_id || !liveGames[game_id]) return;

    const gameInfo = await db.getLiveGameByEmail(userEmail);
    if (!gameInfo) return;

    const isWhite = userEmail === gameInfo.player_white;
    const playerTurn = gameInfo.turn || 'w';
    const correctTurn = (playerTurn === 'w' && isWhite) || (playerTurn === 'b' && !isWhite);

    if (!correctTurn) {
      broadcast(ws, 'invalid_move', { msg: 'Not your turn!' });
      return;
    }

    // Timer logic
    const now = Date.now();
    let white_time = gameInfo.white_time;
    let black_time = gameInfo.black_time;
    let last_timestamp = gameInfo.last_timestamp || now;
    const elapsed = now - last_timestamp;
    if (playerTurn === 'w') {
      white_time = Math.max(white_time - elapsed, 0);
      move = [move, white_time];
    } else {
      black_time = Math.max(black_time - elapsed, 0);
      move = [move, black_time];
    }
    last_timestamp = now;
    const timestamp = move[1];

    const chess = new Chess();

    const priorMoves = safeParse(gameInfo.moves, []);
    if (Array.isArray(priorMoves) && priorMoves.length) {
      for (const mvEntry of priorMoves) {
        const mv = Array.isArray(mvEntry) ? mvEntry[0] : mvEntry;
        if (!mv) continue;
        try {
          chess.move(mv, { sloppy: true });
        } catch (e) {
          
          console.warn('Failed to replay move while rebuilding history:', mv, e.message);
        }
      }
    } else if (gameInfo.fen && gameInfo.fen !== 'startpos') {
     
      chess.load(gameInfo.fen);
    }

    const moveStr = Array.isArray(move) ? move[0] : move;

    let result;
    try {
      result = chess.move(moveStr, { sloppy: true });
    } catch (err) {
      broadcast(ws, 'invalid_move', { msg: 'Illegal move!' });
      return;
    }

    if (!result) {
      broadcast(ws, 'invalid_move', { msg: 'Illegal move!' });
      return;
    }

    const nextTurn = chess.turn();
    const moveHistory = safeParse(gameInfo.moves, []);
    moveHistory.push([moveStr, timestamp]);


    // Update positions from chess.js
    const positions = {};
    const board = chess.board();
    for (let rank = 0; rank < 8; rank++) {
      for (let file = 0; file < 8; file++) {
        const piece = board[rank][file];
        if (piece) {
          const color = piece.color === 'w' ? 'w' : 'b';
          const type = piece.type.toUpperCase();
          let keyPrefix = color + type;
          let counter = 1;
          let key = keyPrefix + counter;
          while (positions[key]) {
            counter++;
            key = keyPrefix + counter;
          }
          const fileChar = 'abcdefgh'[file];
          const rankChar = 8 - rank;
          positions[key] = `${fileChar}${rankChar}`;
        }
      }
    }


    let gameOver = false;
    let resultMessage = null;

    if (chess.isCheckmate && chess.isCheckmate()) {
      gameOver = true;
      resultMessage = isWhite ? 'white_win' : 'black_win';
    } else if (chess.isStalemate && chess.isStalemate()) {
      gameOver = true;
      resultMessage = 'stalemate';
    } else if (typeof chess.isThreefoldRepetition === 'function' && chess.isThreefoldRepetition()) {
      gameOver = true;
      resultMessage = 'threefold_repetition';
    } else if (typeof chess.isDrawByFiftyMoves === 'function' && chess.isDrawByFiftyMoves()) {
      gameOver = true;
      resultMessage = 'fifty_move_rule';
    } else if (chess.isInsufficientMaterial && chess.isInsufficientMaterial()) {
      gameOver = true;
      resultMessage = 'insufficient_material';
    } else if (chess.isDraw && chess.isDraw()) {
      gameOver = true;
      resultMessage = 'draw';
    }

    // Highlight color based on move type
    let highlightColor = '#f6f669';
    if (result.flags.includes('c')) highlightColor = '#ff9999';
    else if (result.flags.includes('e')) highlightColor = '#ffa500';
    else if (result.flags.includes('p')) highlightColor = '#99ff99';
    else if (result.flags.includes('k') || result.flags.includes('q')) highlightColor = '#ccccff';

    const last_move_from = result.from;
    const last_move_to = result.to;
    // Save game state to DB
    await db.saveLiveGame({
      game_id,
      fen: chess.fen(),
      last_move: moveStr,
      lastMoveFrom:last_move_from,
      lastMoveTo:last_move_to,
      moves: JSON.stringify(moveHistory),
      turn: nextTurn,
      player_white: gameInfo.player_white,
      player_black: gameInfo.player_black,
      time_control: gameInfo.time_control,
      positions: JSON.stringify(positions),
      white_time,
      black_time,
      last_timestamp,
      highlightColor
    });

    // Broadcast move with from/to and color
      liveGames[game_id].forEach(client => {
        const { whiteCaptured, blackCaptured } = getCapturedPieces(moveHistory);
        broadcast(client, 'move', {
          fen: chess.fen(),
          move: [moveStr, timestamp],
          LastMoveFrom: last_move_from,
          LastMoveTo: last_move_to,
          turn: nextTurn,
          positions,
          white_time,
          black_time,
          highlightColor,
          captured: result.captured || null,
          capturedWhite: whiteCaptured,
          capturedBlack: blackCaptured
        });
      });

    if (gameOver) {
      const winner =
        resultMessage === 'white_win'
          ? gameInfo.player_white
          : resultMessage === 'black_win'
          ? gameInfo.player_black
          : null;
      const loser =
        resultMessage === 'white_win'
          ? gameInfo.player_black
          : resultMessage === 'black_win'
          ? gameInfo.player_white
          : null;

    
      const drawTypes = ['stalemate', 'threefold_repetition', 'fifty_move_rule', 'insufficient_material', 'draw'];
      const isDraw = drawTypes.includes(resultMessage);

      const pre_elo_white = await db.getUserElo(gameInfo.player_white);
      const pre_elo_black = await db.getUserElo(gameInfo.player_black);

      if (isDraw) {
        await db.updateElo(game_id,gameInfo.player_white, gameInfo.player_black, true, false);
      } else if (winner && loser) {
        await db.updateElo(game_id,winner, loser, false, false);
      }

      const post_elo_white = await db.getUserElo(gameInfo.player_white);
      const post_elo_black = await db.getUserElo(gameInfo.player_black);

      await db.saveGameHistory(
        { ...gameInfo, pre_elo_white, pre_elo_black },
        resultMessage,
        post_elo_white,
        post_elo_black
      );

      
      liveGames[game_id].forEach(client => {
        broadcast(client, 'game_over', { result: resultMessage });
        client.close();
      });

      delete liveGames[game_id];
      clearInterval(timerIntervals[game_id]);
      delete timerIntervals[game_id];
      await db.deleteLiveGame(userEmail);
    }
  } catch (err) {
    console.error('handleMove error:', err);
    broadcast(ws, 'invalid_move', { msg: 'Internal error processing move' });
  }
}




function safeParse(json, fallback) {
  try {
    if (!json) return fallback;
    return JSON.parse(json);
  } catch {
    return fallback;
  }
}



async function handleCheckStatus(ws, email) {
  const userStatus = await db.getUserStatus(email);
  
  if (!userStatus) {
    broadcast(ws, 'status_info', { error: 'User not found' });
    return;
  }

  // If suspension period is over, unsuspend the user
  if ((userStatus.suspension_until && userStatus.suspension_until <= Date.now()) || (userStatus.status == 0 && !userStatus.suspension_until)) {
    await db.updateUserStatus(email, 1, null);
    userStatus.status = 1;
    userStatus.suspension_until = null;
  }
  // Send current status to the user
  broadcast(ws, 'status_info', {
    status: userStatus.status,
    suspension_until: userStatus.suspension_until
  });

  // If user is suspended, force close their connection
  if (userStatus.status === 0) {
    await handleForceClose(email);
  }
}


async function handleForceClose(userEmail) {
  const live = await db.getLiveGameByEmail(userEmail);
  if (!live) return;

  const { game_id, player_white, player_black } = live;
  const clients = liveGames[game_id] || [];

  let result = 'resigned/force_closed';
  let winner = null, loser = null, draw = false, abort = false;
  if (userEmail === player_white) {
    winner = player_black;
    loser = player_white;
    result = 'black_win';
  } else {
    winner = player_white;
    loser = player_black;
    result = 'white_win';
  }

  // Update ELO and save game history
  const pre_elo_white = await db.getUserElo(player_white);
  const pre_elo_black = await db.getUserElo(player_black);
  await db.updateElo(game_id, winner, loser, draw, abort);
  const post_elo_white = await db.getUserElo(player_white);
  const post_elo_black = await db.getUserElo(player_black);
  await db.saveGameHistory(
    { ...live, pre_elo_white, pre_elo_black },
    result,
    post_elo_white,
    post_elo_black
  );

  // Notify clients about game over
  clients.forEach(client => {
    const clientEmail = client.email || null;
    const opponentEmail = clientEmail === player_white ? player_black : player_white;

    broadcast(client, 'game_over', { result, opponent: opponentEmail });

    
    if (clientEmail === userEmail) {

      setTimeout(() => {

        client.close();
      }, 500); 
    } else {
      client.close();
    }
  });

  delete liveGames[game_id];
  await db.deleteLiveGame(userEmail);
}

async function handleCheckInGame(ws, userEmail) {

  const live = await db.getLiveGameByEmail(userEmail);
  let reports_per_game = [];

  if (live) {

    reports_per_game = live.reports_per_game;
  } 

  
  broadcast(ws, 'in_game_status', { inGame: !!live });

}

function handleWebSocket(ws) {
      
  let userEmail = null;

  ws.on('message', async (msg) => {
    let parsed;
    try {
      parsed = JSON.parse(msg);
    } catch {
      return;
    }

    const { type, token, data } = parsed;

    switch (type) {
      case 'auth':
        userEmail = await handleAuth(ws, token);
        break;

      case 'rejoin_request':
        if (userEmail) await handleRejoin(ws, userEmail);
        break;

      case 'play_request':
        if (userEmail) await handlePlayRequest(ws, userEmail, data.time);
        break;

      case 'check_status':
        if (userEmail)
          {await handleCheckStatus(ws, userEmail);}
        break;

      case 'move':

        if (userEmail) await handleMove(ws, userEmail, data.move);
        break;

      case 'force_close':
        if (userEmail) await handleForceClose(userEmail);
        break;

      case 'get_profile':
        if (userEmail) {
          const profile = await db.getUserProfile(userEmail);
          broadcast(ws, 'profile_info', profile);
        }
        break;
      case 'rematch_request':
        if (userEmail) await handleRematchRequest(ws, userEmail, data.opponent, data.time);
        break;

      case 'delete_account':
        if (userEmail) {
          await db.deleteUser(userEmail);
          broadcast(ws, 'account_deleted', { email: userEmail });
          
        }
        break;
      case 'create_private_room':
        if (userEmail) await handleCreatePrivateQueue(ws, userEmail, data.roomCode, data.time, data.isRated);
        break;

      case 'join_private_room':
        if (userEmail) await handleJoinPrivateQueue(ws, userEmail, data.roomCode);
        break;

      case 'check_in_game':
        if (userEmail) {
          await handleCheckInGame(ws, userEmail);
        } 
        break;
      case 'draw_request':
        if (userEmail) await handleDrawRequest(ws, userEmail);
        break;
      case 'draw_decline':
        await handleDrawDecline(ws, userEmail);
        break;

      case 'ping':
        
        try {
          broadcast(ws, 'pong', { ts: data?.ts || Date.now() });
        } catch (e) {}
        break;
      case 'report_player':
        if (userEmail) await handleReportPlayer(ws,data.reportedEmail);
        break;
      case 'logout':
        ws.close();
        break;
    }
  });

  ws.on('close', () => {
    if (userEmail && userSockets[userEmail] === ws) {
      delete userSockets[userEmail];
    }
    removeFromQueue(userEmail);

    if (ws.gameId && liveGames[ws.gameId]) {
      liveGames[ws.gameId] = liveGames[ws.gameId].filter(c => c !== ws);

      if (!liveGames[ws.gameId].length) {
        delete liveGames[ws.gameId];
       
      }
    }
  });
}

module.exports = { handleWebSocket };






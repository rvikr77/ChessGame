
async function updateElo(game_id, winnerEmail, loserEmail, draw = false, abort = false) {
  const game = await getLiveGameByGameId(game_id);

  if (game && game.isRated === 0) {
    return;
  }

  const K = 32;
  const winnerElo = await getUserElo(winnerEmail);
  const loserElo = await getUserElo(loserEmail);

  const expectedWin = 1 / (1 + Math.pow(10, (loserElo - winnerElo) / 400));
  const expectedLose = 1 / (1 + Math.pow(10, (winnerElo - loserElo) / 400));

  let winnerDelta = 0, loserDelta = 0;
  if (draw) {
    winnerDelta = Math.round(K * (0.5 - expectedWin));
    loserDelta = Math.round(K * (0.5 - expectedLose));
  } else if (abort) {
    winnerDelta = 0;
    loserDelta = 0;
  } else {
    winnerDelta = Math.round(K * (1 - expectedWin));
    loserDelta = Math.round(K * (0 - expectedLose));
  }

  await new Promise((resolve, reject) => {
    db.run('UPDATE USERS SET elo = elo + ? WHERE email = ?', [winnerDelta, winnerEmail], err => {
      if (err) return reject(err);
      db.run('UPDATE USERS SET elo = elo + ? WHERE email = ?', [loserDelta, loserEmail], err2 => {
        if (err2) return reject(err2);
        resolve();
      });
    });
  });

}

async function getLiveGameByGameId(game_id) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT * FROM LIVE_GAMES WHERE game_id = ?`,
      [game_id],
      (err, row) => {
        if (err) return reject(err);
        if (!row) return resolve(null); 

        try {
          row.moves = safeJSONParse(row.moves, []);
          row.positions = safeJSONParse(row.positions, defaultPositions());
          row.white_time = Number(row.white_time) || 0;
          row.black_time = Number(row.black_time) || 0;
          row.last_timestamp = Number(row.last_timestamp) || Date.now();
        } catch (e) {
          return reject(e);
        }
        resolve(row);
      }
    );
  });
}

const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./db/chess.db');

function initDB() {
  db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS USERS (
  email TEXT PRIMARY KEY NOT NULL,
  username TEXT NOT NULL,
  elo INTEGER NOT NULL DEFAULT 500,
  status INTEGER NOT NULL DEFAULT 1,
  latest_timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reports INTEGER DEFAULT 0,
  suspension_until DATETIME
)`);

  db.run(`CREATE TABLE IF NOT EXISTS LIVE_GAMES (
    game_id TEXT PRIMARY KEY NOT NULL,
    player_white TEXT NOT NULL,
    player_black TEXT NOT NULL,
    fen TEXT NOT NULL,
    last_move TEXT,
    isRated INTEGER NOT NULL DEFAULT 1,
    moves TEXT NOT NULL DEFAULT '[]', -- stores move history as JSON array
    time_control INTEGER NOT NULL,
    turn TEXT NOT NULL DEFAULT 'w',
    positions TEXT NOT NULL DEFAULT '[]',
    white_time INTEGER NOT NULL DEFAULT 0,
    black_time INTEGER NOT NULL DEFAULT 0,
    last_timestamp INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    reports_per_game TEXT NOT NULL DEFAULT '[]',
    lastMoveFrom TEXT,
    lastMoveTo TEXT,
    highlightColor TEXT
  )`);


  db.run(`CREATE TABLE IF NOT EXISTS GAME_HISTORY (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id TEXT NOT NULL,
    player_white TEXT NOT NULL,
    player_black TEXT NOT NULL,
    moves TEXT NOT NULL  DEFAULT '[]',
    time_control INTEGER NOT NULL,
    result TEXT,
    elo_white INTEGER,
    elo_black INTEGER,
    post_elo_white INTEGER,
    post_elo_black INTEGER,
    timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);

  });
  startSuspensionCheck();
}

function createOrFetchUser(email, username) {
  return new Promise((resolve, reject) => {
    const now = new Date();
    const nowISO = now.toISOString();
    const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);

    db.get("SELECT * FROM USERS WHERE email = ?", [email], (err, row) => {
      if (err) return reject(err);

      if (row) {
        let userTimestamp = row.latest_timestamp ? new Date(row.latest_timestamp) : null;

        if (userTimestamp && userTimestamp > oneYearAgo) {
          
          db.run(
            "UPDATE USERS SET latest_timestamp = ? WHERE email = ?",
            [nowISO, email],
            err2 => {
              if (err2) return reject(err2);
              resolve({ ...row, latest_timestamp: nowISO });
            }
          );
        } else {
          
          resolve(row);
        }
      } else {
        
        db.run(
          "INSERT INTO USERS (email, username, elo, latest_timestamp) VALUES (?, ?, 500, ?)",
          [email, username, nowISO],
          err2 => {
            if (err2) return reject(err2);
            resolve({ email, username, elo: 500, latest_timestamp: nowISO });
          }
        );
      }
    });
  });
}

function reportPlayer(gameId, email) {
  if (!gameId) return Promise.reject(new Error('No active game found for this email'));
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT reports_per_game FROM LIVE_GAMES WHERE game_id = ?`,
      [gameId],
      (err, row) => {
        if (err) return reject(err);

        if (row) {
          const reports = safeJSONParse(row.reports_per_game, []);
          if (!reports.includes(email)) {
            if (reports.length < 2) {
              reports.push(email);
              
              db.run(
                `UPDATE LIVE_GAMES SET reports_per_game = ? WHERE game_id = ?`,
                [JSON.stringify(reports), gameId],
                function (updateErr) {
                  if (updateErr) return reject(updateErr);
                  resolve(this.changes > 0);
                }
              );

            } else {
              resolve(false); 
            }
          } else {
            resolve(false); 
          }
        } else {
          reject(new Error('Game not found'));
        }
      }
    );
  });
}

function getUserElo(email) {
  return new Promise((resolve, reject) => {
    db.get("SELECT elo FROM USERS WHERE email = ?", [email], (err, row) => {
      if (err) return reject(err);
      resolve(row ? row.elo : 500);
    });
  });
}

function saveLiveGame(game) {
  const {
    game_id,
    player_white,
    player_black,
    fen,
    last_move,
    moves,
    time_control,
    turn,
    positions,
    white_time,
    black_time,
    last_timestamp,
    lastMoveFrom,
    lastMoveTo,
    highlightColor,
    isRated 
  } = game;

  const movesStr = Array.isArray(moves) ? JSON.stringify(moves) : JSON.stringify([moves]);
  const positionsStr =
    typeof positions === "object" ? JSON.stringify(positions) : JSON.stringify(defaultPositions());

  db.get(
    `SELECT reports_per_game, isRated FROM LIVE_GAMES WHERE game_id = ?`,
    [game_id],
    (err, row) => {
      if (err) {
        console.error("Failed to fetch existing game:", err);
        return;
      }

      const reportsPerGame = row ? row.reports_per_game : "[]";
      const currentIsRated = row ? row.isRated : 1; 

      
      const finalIsRated = (isRated !== undefined && isRated !== null) ? isRated : currentIsRated;

      db.run(
        `INSERT OR REPLACE INTO LIVE_GAMES
        (game_id, player_white, player_black, fen, last_move, moves, time_control, turn, positions,
         white_time, black_time, last_timestamp, reports_per_game, lastMoveFrom, lastMoveTo, highlightColor, isRated)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          game_id,
          player_white,
          player_black,
          fen,
          last_move,
          movesStr,
          time_control,
          turn,
          positionsStr,
          white_time ?? time_control * 60,
          black_time ?? time_control * 60,
          last_timestamp ?? Math.floor(Date.now() / 1000),
          reportsPerGame,
          lastMoveFrom,
          lastMoveTo,
          highlightColor,
          finalIsRated, 
        ]
      );
    }
  );
}

function defaultPositions() {
  return {

    wR1: 'a1', wN1: 'b1', wB1: 'c1', wQ: 'd1', wK: 'e1', wB2: 'f1', wN2: 'g1', wR2: 'h1',

    wP1: 'a2', wP2: 'b2', wP3: 'c2', wP4: 'd2', wP5: 'e2', wP6: 'f2', wP7: 'g2', wP8: 'h2',

    bR1: 'a8', bN1: 'b8', bB1: 'c8', bQ: 'd8', bK: 'e8', bB2: 'f8', bN2: 'g8', bR2: 'h8',

    bP1: 'a7', bP2: 'b7', bP3: 'c7', bP4: 'd7', bP5: 'e7', bP6: 'f7', bP7: 'g7', bP8: 'h7',
  };
}




async function saveGameHistory(liveGame, result, post_elo_white, post_elo_black) {

  const elo_white = (liveGame && typeof liveGame.pre_elo_white === 'number')
    ? liveGame.pre_elo_white
    : await getUserElo(liveGame.player_white);
  const elo_black = (liveGame && typeof liveGame.pre_elo_black === 'number')
    ? liveGame.pre_elo_black
    : await getUserElo(liveGame.player_black);

  db.run(`INSERT INTO GAME_HISTORY (game_id, player_white, player_black, moves, time_control, result, elo_white, elo_black, post_elo_white, post_elo_black)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      liveGame.game_id,
      liveGame.player_white,
      liveGame.player_black,
      JSON.stringify(liveGame.moves),
      liveGame.time_control*60*1000,
      result,
      elo_white,
      elo_black,
      post_elo_white,
      post_elo_black
    ], (err) => {
      if (err) console.error('Failed to insert GAME_HISTORY:', err);
    }
  );
}


function getHistoryByEmail(email) {
  return new Promise((resolve, reject) => {
    db.all(`
      SELECT * FROM GAME_HISTORY
      WHERE player_white = ? OR player_black = ?
      ORDER BY timestamp`, [email, email], (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

function safeJSONParse(value, fallback) {
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(fallback)) return Array.isArray(parsed) ? parsed : fallback;
    if (typeof fallback === 'object') return typeof parsed === 'object' ? parsed : fallback;
    return parsed;
  } catch {
    return fallback;
  }
}

function getLiveGameByEmail(email) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT * FROM LIVE_GAMES WHERE player_white = ? OR player_black = ?`,
      [email, email],
      (err, row) => {
        if (err) return reject(err);

        if (row) {

          row.moves = safeJSONParse(row.moves, []);

          row.positions = safeJSONParse(row.positions, defaultPositions());

          row.white_time = Number(row.white_time);
          row.black_time = Number(row.black_time);
          row.last_timestamp = Number(row.last_timestamp);
        }

        resolve(row);
      }
    );
  });
}

function getUserProfile(email) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT email, username, elo, latest_timestamp, reports, suspension_until, status 
       FROM USERS WHERE email = ?`,
      [email],
      (err, row) => {
        if (err) return reject(err);
        resolve(row || null);
      }
    );
  });
}


function deleteUser(email) {
  return new Promise((resolve, reject) => {

    db.serialize(() => {
      db.run(`DELETE FROM USERS WHERE email = ?`, [email], function (err) {
        if (err) return reject(err);
      });
      db.run(
        `DELETE FROM LIVE_GAMES WHERE player_white = ? OR player_black = ?`,
        [email, email],
        function (err) {
          if (err) return reject(err);
        }
      );
      db.run(
        `DELETE FROM GAME_HISTORY 
         WHERE player_white = ? OR player_black = ?`,
        [email, email],
        function (err) {
          if (err) return reject(err);
        }
      );
      resolve(true);
    });
  });
}


function setUsername(email, username) {
  return new Promise((resolve, reject) => {
    const stmt = `UPDATE USERS SET username = ? WHERE email = ?`;
    db.run(stmt, [username, email], function (err) {
      if (err) {
        if (err.code === 'SQLITE_CONSTRAINT') return resolve(false); 
        return reject(err);
      }
      resolve(this.changes > 0);
    });
  });
}
function deleteLiveGame(email) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT reports_per_game FROM LIVE_GAMES WHERE player_white = ? OR player_black = ?`,
      [email, email],
      (err, row) => {
        if (err) return reject(err);

        if (row && row.reports_per_game) {
          const reportsEmails = safeJSONParse(row.reports_per_game, []);
          if (Array.isArray(reportsEmails)) {
            reportsEmails.forEach((reportEmail) => {
              db.run(
                `UPDATE USERS SET reports = reports + 1 WHERE email = ?`,
                [reportEmail],
                (updateErr) => {
                  if (updateErr) console.error(`Failed to increment reports for ${reportEmail}:`, updateErr);
                }
              );
            });
          }
        }

        db.run(
          `DELETE FROM LIVE_GAMES WHERE player_white = ? OR player_black = ?`,
          [email, email],
          function (deleteErr) {
            if (deleteErr) return reject(deleteErr);
            resolve(this.changes > 0);
          }
        );
      }
    );
  });
}

function startSuspensionCheck() {
  function parseSQLiteDate(value) {
  if (!value) return null;
  if (typeof value === "string" && value.includes(" ")) {

    return new Date(value.replace(" ", "T") + "Z");
  }
  return new Date(value); 
}
  setInterval(() => {
    const now = new Date();
    const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);

    db.all(`SELECT * FROM USERS`, [], (err, users) => {
      if (err) return console.error('Error fetching users:', err);

      users.forEach(user => {
        let newStatus = user.status;
        let suspensionUntil = parseSQLiteDate(user.suspension_until);
        const userCreatedAt = parseSQLiteDate(user.latest_timestamp);


        // Rule 1: Account older than 1 year → disable
        if (userCreatedAt < oneYearAgo) {
          newStatus = 0;
          suspensionUntil = null;
        }
        // Rule 2: Reports thresholds
        else if (user.reports >= 40) {
          newStatus = 0;
          suspensionUntil = new Date(now.getTime() + 10 * 60 * 60 * 1000); 
        }
        else if (user.reports >= 20) {
          newStatus = 0;
          suspensionUntil = new Date(now.getTime() + 1 * 60 * 60 * 1000); 
        }
        // Rule 3: Expired suspension → restore status
        else if ((suspensionUntil && now > suspensionUntil) || !suspensionUntil) {
          newStatus = 1;
          suspensionUntil = null;
        }
        if (
          newStatus !== user.status ||
          (suspensionUntil ? suspensionUntil.toISOString() : null) !== user.suspension_until
        ) {
          db.run(
            `UPDATE USERS SET status = ?, suspension_until = ? WHERE email = ?`,
            [newStatus, suspensionUntil ? suspensionUntil.toISOString() : null, user.email],
            err => {
              if (err) console.error('Error updating user:', user.email, err);
            }
          );
        }
      });
    });
  }, 60 * 1000); 
}

function getUserStatus(email) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT status, suspension_until FROM USERS WHERE email = ?`,
      [email],
      (err, row) => {
        if (err) return reject(err);
        resolve(row || { status: null, suspension_until: null });
      }
    );
  });
}
function updateUserStatus(email, status, suspension_until) {
  return new Promise((resolve, reject) => {
    db.run(
      `UPDATE USERS SET status = ?, suspension_until = ? WHERE email = ?`,
      [status, suspension_until, email],
      function (err) {
        if (err) return reject(err);
        resolve(this.changes > 0);
      }
    );
  });

}
module.exports = {
  initDB,
  createOrFetchUser,
  getUserElo,
  saveLiveGame,
  saveGameHistory,
  getHistoryByEmail,
  getLiveGameByEmail,
  getLiveGameByGameId,
  setUsername,
  deleteLiveGame,
  getUserStatus,
  defaultPositions,
  deleteUser,
  getUserProfile,
  updateElo,
  reportPlayer,
  updateUserStatus
};

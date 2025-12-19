♟️ Real-Time Chess Platform

📚 Educational personal project

Technologies: Angular, Node.js, WebSockets, SQLite, JWT, Google OAuth, GCP (Cloud Run + Cloud Build)

A full-stack multiplayer chess platform featuring OAuth authentication, Elo-based matchmaking, persistent WebSocket sessions, private rooms, move replay, and downloadable match archives.

🔐 Authentication & Security

Google OAuth–based login with JWT-secured sessions. REST APIs are protected with input validation, sanitized database queries, and secure session handling.

🔁 Real-Time Gameplay & Match Management

Live multiplayer chess powered by WebSockets with reconnect support. Includes Elo-based matchmaking, draw/resign/rematch flows, local two-player mode, active-game rejoin, and downloadable move history.

🛠️ Deployment & Scalability

Containerized and deployed to Google Cloud Run via Cloud Build. Includes latency indicators and fault-tolerant matchmaking designed to remain stable under concurrent load.

🧱 Core Libraries

chess.js, ws, express, passport, passport-google-oauth20, jsonwebtoken, cors, dotenv, uuid, sqlite3, express-list-endpoints

🧱 Core Database Tables

USERS — Registered users

LIVE_GAMES — Active games in progress

GAME_HISTORY — Completed games and move records

✅ License & Compliance

Educational project. All third-party libraries are used in accordance with their open-source licenses. Google OAuth and related features are implemented with attention to privacy and responsible data handling.

⚠️ Note

The SQLite database is auto-created if missing. Environment variables must be configured securely for OAuth and JWT. Do not use real personal data for testing.

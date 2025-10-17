# Real-Time Chess Platform  
📚 Educational personal project  

Technologies: Angular, Node.js, WebSockets, SQLite, JWT, Google OAuth, GCP (Cloud Run + Cloud Build)  

A full-stack multiplayer chess platform with OAuth login, Elo-based matchmaking, persistent WebSocket sessions, private rooms, move replay, and downloadable match archives.  

---

🔐 **Authentication & Security**  
Google OAuth login with JWT-secured sessions. Secure REST APIs, sanitized DB queries, and input validation.  

🔁 **Real-Time Gameplay & Match Management**  
Live chess with reconnect support, Elo-based matchmaking, draw/resign/rematch flows, local 2-player mode, and downloadable move history.  

🛠️ **Deployment & Scalability**  
Cloud Run deployment via Cloud Build. Latency indicators, fault-tolerant matchmaking under concurrent load.  

🧱 **Core Libraries**  
`chess.js`, `ws`, `express`, `passport`, `passport-google-oauth20`, `jsonwebtoken`, `cors`, `dotenv`, `uuid`, `sqlite3`, `express-list-endpoints`  

✅ **License & Compliance**  
Educational project. Use libraries per their open-source licenses. Use Google OAuth and other features responsibly respecting privacy laws.  

⚠️ **Note**  
SQLite DB is auto-created if missing. Set environment variables securely for OAuth & JWT. Do not use real personal data for testing.  

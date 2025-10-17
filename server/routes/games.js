const express = require('express');
const jwt = require('jsonwebtoken');
const { getHistoryByEmail } = require('../db/sqlite');
const ws = require('../ws/websockets');
const router = express.Router();

router.get('/history', async (req, res) => {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: 'Missing token' });

  const token = auth.split(' ')[1];
  try {
    const { email } = jwt.verify(token, process.env.JWT_SECRET);
    const moves = await getHistoryByEmail(email);
    res.json(moves);
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
});

module.exports = router;

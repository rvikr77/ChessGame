const express = require('express');
const jwt = require('jsonwebtoken');
const passport = require('passport');
const { Strategy } = require('passport-google-oauth20');
const db = require('../db/sqlite');

console.log('✅ Loading Google OAuth strategy');

passport.use(new Strategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: '/auth/google/callback',
}, async (accessToken, refreshToken, profile, done) => {
  try {
    console.log('🔁 Inside Google Strategy callback');
    const email = profile.emails[0].value;
    const name = profile.displayName;
    console.log(`👤 Google Profile: ${name} <${email}>`);

    await db.createOrFetchUser(email, name);
    return done(null, { email, name });
  } catch (err) {
    console.error('❌ Error in Google Strategy callback:', err);
    return done(err, null);
  }
}));

const router = express.Router();

console.log('✅ Setting up /auth/google route');
router.get('/google', (req, res, next) => {
  console.log('🌐 /auth/google triggered');
  passport.authenticate('google', { scope: ['profile', 'email'] })(req, res, next);
});

console.log('✅ Setting up /auth/google/callback route');
router.get('/google/callback',
  (req, res, next) => {
    console.log('🌐 /auth/google/callback triggered');
    passport.authenticate('google', { session: false, failureRedirect: '/' })(req, res, next);
  },
  (req, res) => {
    console.log('✅ Google OAuth Success, generating JWT');
    const token = jwt.sign(req.user, process.env.JWT_SECRET, { expiresIn: '2h' });
    const redirectUrl = `${process.env.CLIENT_ORIGIN}/auth-success?token=${token}`;
    console.log(`➡️ Redirecting to ${redirectUrl}`);
    res.redirect(redirectUrl);
  });

module.exports = router;

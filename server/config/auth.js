const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;

passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: process.env.NODE_ENV === 'production' 
    ? "https://procloner.onrender.com/auth/google/callback"
    : "http://localhost:3002/auth/google/callback"
}, async (accessToken, refreshToken, profile, done) => {
  try {
    const user = {
      id: profile.id,
      email: profile.emails[0].value,
      name: profile.displayName,
      photo: profile.photos[0].value,
      isAdmin: process.env.ADMIN_EMAILS?.split(',').includes(profile.emails[0].value) || false
    };
    return done(null, user);
  } catch (error) {
    return done(error, null);
  }
}));

passport.serializeUser((user, done) => {
  done(null, user);
});

passport.deserializeUser((user, done) => {
  done(null, user);
});

module.exports = passport;
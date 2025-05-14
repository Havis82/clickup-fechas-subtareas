import express from 'express';
import session from 'express-session';
import passport from './config/passport';
import authRoutes from './routes/auth';
import clickupRoutes from './routes/clickup';
import { errorHandler } from './middleware/errorHandler';
import { tokenRefresherMiddleware } from './middleware/tokenRefresher';
import webhookRoutes from './routes/webhook';
import bodyParser from 'body-parser';
import './smee-client';  // Add this line in development
import dotenv from 'dotenv';

dotenv.config();

const app = express();

// This line is crucial for parsing JSON request bodies
app.use(express.json());

// Use raw body parser for webhook route
app.use('/webhook/clickup', bodyParser.raw({ type: 'application/json' }));

// Use JSON body parser for other routes
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  resave: false,
  saveUninitialized: false
}));

app.use(passport.initialize());
app.use(passport.session());

// Add this new route
app.get('/', 
  passport.authenticate('clickup', { failureRedirect: '/login' }),
  (req, res) => {
    if (req.user && 'accessToken' in req.user) {
      res.send(`
        ✅ Authentication successful!<br>
        Your access token is: ${req.user.accessToken}<br>
        <a href="/clickup/user">Get User Info</a><br>
        <a href="/clickup/workspaces">Get Workspaces</a><br>
        <a href="/auth/logout">Logout</a>
      `);
    } else {
      res.redirect('/');
    }
  }
);

app.get('/api/test', (req, res) => {
  console.log('✅ /api/test route reached');
  res.send('API route is working');
});

app.use(tokenRefresherMiddleware);

app.use('/auth', authRoutes);
app.use('/clickup', clickupRoutes);
app.use('/webhook', webhookRoutes);

app.use(errorHandler);

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

export default app;

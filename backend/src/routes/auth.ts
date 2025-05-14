import express from 'express';
import passport from 'passport';

const router = express.Router();

router.get('/clickup', passport.authenticate('clickup', { scope: ['task:read', 'task:write'] }));

router.get('/', 
  passport.authenticate('clickup', { failureRedirect: '/login' }),
  (req: express.Request, res: express.Response) => {
    // Successful authentication
    if (req.user && 'accessToken' in req.user) {
      res.send(`
        Authentication successful!<br>
        Your access token is: ${req.user.accessToken}<br>
        <a href="/">Go to Home</a>
      `);
    } else {
      res.redirect('/');
    }
  }
);

router.get('/logout', (req: express.Request, res: express.Response) => {
  req.logout((err: any) => {
    if (err) {
      console.error('Error during logout:', err);
    }
    res.redirect('/');
  });
});

console.log('✅ Auth routes mounted');

export default router;

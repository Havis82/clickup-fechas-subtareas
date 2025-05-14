import express from 'express';
import passport from 'passport';

const router = express.Router();

// 👉 Esta ruta lanza el inicio de sesión con ClickUp
router.get('/clickup', passport.authenticate('clickup', { scope: ['task:read', 'task:write'] }));

// 👉 Ruta para cerrar sesión (opcional pero útil)
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

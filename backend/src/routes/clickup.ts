import express from 'express';
import axios from 'axios';

const router = express.Router();

// Updated isAuthenticated middleware
const isAuthenticated = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (req.isAuthenticated()) {
    return next();
  }
  
  // Check for Bearer token in Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7, authHeader.length);
    (req as any).user = { accessToken: token };
    return next();
  }
  
  res.status(401).json({ error: 'Unauthorized' });
};

// Helper function to get access token
const getAccessToken = (req: express.Request): string => {
  if (req.user && 'accessToken' in req.user) {
    return req.user.accessToken;
  }
  throw new Error('Access token not found');
};

// Get user info
router.get(
  '/user',
  isAuthenticated,
  (async (req, res) => {
    try {
      const response = await axios.get('https://api.clickup.com/api/v2/user', {
        headers: {
          'Authorization': `Bearer ${getAccessToken(req)}`
        }
      });
      res.json(response.data);
    } catch (error) {
      console.error('Error fetching user info:', error);
      res.status(500).json({ error: 'Failed to fetch user info' });
    }
  })
);

// Get workspaces
router.get(
  '/workspaces',
  isAuthenticated,
  (async (req, res) => {
    try {
      const response = await axios.get('https://api.clickup.com/api/v2/team', {
        headers: {
          'Authorization': `Bearer ${getAccessToken(req)}`
        }
      });
      res.json(response.data);
    } catch (error) {
      console.error('Error fetching workspaces:', error);
      res.status(500).json({ error: 'Failed to fetch workspaces' });
    }
  })
);

// Get tasks (you'll need to provide a list_id)
router.get(
  '/tasks/:listId',
  isAuthenticated,
  (async (req, res) => {
    try {
      const response = await axios.get(`https://api.clickup.com/api/v2/list/${req.params.listId}/task`, {
        headers: {
          'Authorization': `Bearer ${getAccessToken(req)}`
        }
      });
      res.json(response.data);
    } catch (error) {
      console.error('Error fetching tasks:', error);
      res.status(500).json({ error: 'Failed to fetch tasks' });
    }
  })
);

// Create a webhook
router.post('/webhook', isAuthenticated, async (req: express.Request, res: express.Response) => {
  try {
    const { workspace_id, endpoint } = req.body;
    
    if (!workspace_id) {
      return res.status(400).json({ error: 'workspace_id is required' });
    }
    if (!endpoint) {
      return res.status(400).json({ error: 'endpoint is required' });
    }

    const response = await axios.post(`https://api.clickup.com/api/v2/team/${workspace_id}/webhook`, {
      endpoint,
      events: ['taskUpdated', 'taskCreated'],
      status: 'active'
    }, {
      headers: {
        'Authorization': `Bearer ${getAccessToken(req)}`
      }
    });
    res.json(response.data);
  } catch (error: any) {
    console.error('Error creating webhook:', error);
    if (error.response) {
      res.status(error.response.status).json({ 
        error: error.response.data.err || 'Failed to create webhook' 
      });
    } else if (error.request) {
      res.status(500).json({ error: 'No response received from server' });
    } else {
      res.status(500).json({ error: 'Failed to create webhook' });
    }
  }
});

// List webhooks
router.get('/webhooks/:workspace_id', isAuthenticated, async (req: express.Request, res: express.Response) => {
  try {
    const { workspace_id } = req.params;
    
    if (!workspace_id) {
      return res.status(400).json({ error: 'workspace_id is required' });
    }

    const response = await axios.get(`https://api.clickup.com/api/v2/team/${workspace_id}/webhook`, {
      headers: {
        'Authorization': `Bearer ${getAccessToken(req)}`
      }
    });
    res.json(response.data);
  } catch (error: any) {
    console.error('Error fetching webhooks:', error);
    if (error.response) {
      res.status(error.response.status).json({ 
        error: error.response.data.err || 'Failed to fetch webhooks' 
      });
    } else if (error.request) {
      res.status(500).json({ error: 'No response received from server' });
    } else {
      res.status(500).json({ error: 'Failed to fetch webhooks' });
    }
  }
});

export default router;

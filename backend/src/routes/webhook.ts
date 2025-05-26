
import express from 'express';
import axios from 'axios';
import crypto from 'crypto';

const router = express.Router();

// Interfaz de tarea de ClickUp
interface ClickUpTask {
  id: string;
  parent: string | null;
  due_date: number | null;
  subtasks?: ClickUpTask[];
}

// Token de acceso a la API de ClickUp
const accessToken = '158426612_90431d450f39f94b8a802f54a2f0c45e898d82c1f41bedbd650fb3ba4649e7ac';

// Verifica la firma del webhook para mayor seguridad
function verifyWebhookSignature(req: express.Request, secret: string): boolean {
  const signature = req.headers['x-signature'] as string;
  const body = JSON.stringify(req.body);
  const hmac = crypto.createHmac('sha256', secret);
  const digest = hmac.update(body).digest('hex');
  return signature === digest;
}

// Obtiene información de una tarea
async function getTask(taskId: string): Promise<ClickUpTask> {
  const response = await axios.get(`https://api.clickup.com/api/v2/task/${taskId}`, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  return response.data;
}

// Actualiza la fecha límite de una tarea
async function updateDueDate(taskId: string, dueDate: number) {
  await axios.put(`https://api.clickup.com/api/v2/task/${taskId}`, {
    due_date: dueDate
  }, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    }
  });
}

// Propaga la fecha límite de la tarea padre a sus subtareas
async function syncDueDateToSubtasks(parentTaskId: string) {
  const parentTask = await getTask(parentTaskId);

  if (!parentTask.due_date) return;

  const response = await axios.get(`https://api.clickup.com/api/v2/task/${parentTaskId}/subtask`, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });

  const subtasks: ClickUpTask[] = response.data.tasks;

  for (const subtask of subtasks) {
    await updateDueDate(subtask.id, parentTask.due_date);
  }
}

// Manejador del webhook
router.post('/clickup', async (req: Request, res: Response) => {
  const { event, task_id } = req.body;

  if (['taskCreated', 'taskUpdated'].includes(event)) {
    const task = await getTask(task_id);

    // Si es una subtarea y tiene tarea padre, sincroniza la fecha límite
    if (task.parent) {
      const parentTask = await getTask(task.parent);
      if (parentTask.due_date) {
        await updateDueDate(task.id, parentTask.due_date);
      }
    }

    // Si es una tarea padre, propaga la fecha a las subtareas
    if (!task.parent) {
      await syncDueDateToSubtasks(task.id);
    }
  }

  res.status(200).send('Webhook processed');
});

export default router;

import express from 'express';
import axios from 'axios';
import crypto from 'crypto';

const router = express.Router();

interface ClickUpTask {
  id: string;
  parent: string | null;
  subtasks: Subtask[];
  custom_fields: {
    id: string;
    name: string;
    type: string;
    value: any;
  }[];
  // Add other relevant fields as needed
}

interface Subtask {
  id: string;
  name: string;
  value: any;
  custom_fields: {
    id: string;
    name: string;
    type: string;
    value: any;
  }[];
}

// Specific Custom Fields to update
// Custom fields have been manually created in ClickUp.
// TODO: Replace with application specific field IDs to run
enum RollupFieldsIds {
    AutoRollup = '704e75a8-8b7b-42f4-a6df-8fc8bd64e0d0',
    RollupValue = '813662d6-fbd4-4f7c-888b-6e338179b975',
}

// Access token hard coded from login redirect page
// Needs to be changed to get from DB
const accessToken = '158426612_90431d450f39f94b8a802f54a2f0c45e898d82c1f41bedbd650fb3ba4649e7ac';

function verifyWebhookSignature(req: express.Request, secret: string): boolean {
  const signature = req.headers['x-signature'] as string;
  const body = JSON.stringify(req.body);
  const hmac = crypto.createHmac('sha256', secret);
  const digest = hmac.update(body).digest('hex');
  return signature === digest;
}

async function getTask(taskId: string, includeSubtasks: boolean): Promise<ClickUpTask> {
    const taskResponse = await axios.get(`https://api.clickup.com/api/v2/task/${taskId}`, {
        headers: {
            'Authorization': `Bearer ${accessToken}`
        },
        params: {
            include_subtasks: includeSubtasks,
            custom_fields: true
        }
    }); 
    return taskResponse.data as ClickUpTask;
} 

/***
 * Sums up the value of all subtasks custom field values
 * and updates the parent task's TotalRollupValue custom field
 * if the parent task has the AutoRollup custom field set to true.
 * 
 * @param body Webhook request body
 */
async function processAutoRollup(body: any) {
    const { history_items, task_id } = body;

    for (const item of history_items) {
      await processRollupValueUpdate(item, task_id);
      await processAutoRollUpToggle(item, task_id);
    };
}

async function processAutoRollUpToggle(item: any, taskId: string) {
  if (item.field !== "custom_field" && item.custom_field.id !== RollupFieldsIds.AutoRollup) {
    console.log(`Skipping event, since it's not a AutoRollup custom field update`);
    return;
  }

  if (item.before === null && item.after === 'true') {
      await processToggleOn(item, taskId);
  } else if (item.before === 'true' && item.after === null) {
    await processToggleOff(item, taskId);
  } 
}

async function processToggleOff(item: any, taskId: string) {
  await axios.post(
    `https://api.clickup.com/api/v2/task/${taskId}/field/${RollupFieldsIds.RollupValue}`,
    { value: null },
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    }
  );
}

async function processToggleOn(item: any, taskId: string) {
  const task = await getTask(taskId, true);
  
  // Calculate total rollup value from subtasks
  let totalRollupValue = 0;
  for (const subtask of task.subtasks) {
    const fullSubTask = await getTask(subtask.id, false);
    const rollupField = fullSubTask.custom_fields.find(field => field.id === RollupFieldsIds.RollupValue);
    totalRollupValue += Number(rollupField?.value) || 0;
  }

  // Update parent task with total rollup value
  await axios.post(
    `https://api.clickup.com/api/v2/task/${taskId}/field/${RollupFieldsIds.RollupValue}`,
    { value: totalRollupValue },
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    }
  );
console.log(`Updated RollupValue for task ${task.id} to ${totalRollupValue}`);
}

async function processRollupValueUpdate(item: any, taskId: string) {
  if (item.field !== "custom_field" && item.custom_field.id !== RollupFieldsIds.RollupValue) {
    console.log(`Skipping event, since it's not a RollupValue custom field update`);
      return;
  }
  
  // get parent task
  let itemTask: ClickUpTask;
  let parentTask: ClickUpTask;
  
  try {
      itemTask = await getTask(taskId, false);
      if (itemTask.parent === null) {
          return;
      }
      
      parentTask = await getTask(itemTask.parent, false);
      // Check if the parent task has the AutoRollup custom field, and apply changes to parent task
      if (parentTask.custom_fields.find(field => field.id === RollupFieldsIds.AutoRollup && (field.value === true || field.value === "true"))) {
        // Get the current value of the TotalRollupValue custom field
        // Manual casting from sring to number, since webhook API returns string
        const currentValue = +(parentTask.custom_fields.find(field => field.id === RollupFieldsIds.RollupValue)!.value ?? 0);
        const newValue = currentValue + (Number(item.after) || 0) - (Number(item.before) || 0);
        
        const updateResponse = await axios.post(
            `https://api.clickup.com/api/v2/task/${parentTask.id}/field/${RollupFieldsIds.RollupValue}`,
            {
                value: newValue
            },
            {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                } 
            }
        );
        console.log(`Successfully updated TotalRollupValue for parent task ${parentTask.id} to ${newValue}`);
      }
      console.log(`Successfully fetched parent task`);
  } catch (error) {
      console.error(`Error GET or POST task`, error);
      throw error;
  }
} 

router.post('/clickup', async (req, res) => {
  // Verify the webhook signature
  if (!verifyWebhookSignature(req, process.env.CLICKUP_WEBHOOK_SECRET!)) {
    return res.status(401).send('Invalid signature');
  }

  console.log('📩 Webhook recibido');

  const { event, task_id, webhook_id } = req.body;

  // Handle different webhook events
  switch (event) {
    case 'taskCreated':
    case 'taskUpdated':
    case 'taskStatusUpdated':
    case 'taskMoved':
      console.log(`Processing event: ${event}`);
      await processAutoRollup(req.body);
      break;
    // Add more cases for other event types as needed
    // see https://clickup.com/api/developer-portal/webhooks/
    default:
      console.log(`Unhandled event type: ${event}`);
  }

  res.status(200).send('Webhook received');
});

export default router;

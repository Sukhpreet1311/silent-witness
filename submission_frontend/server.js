import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleAuth } from 'google-auth-library';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 8080;

// Resolve project ID and Agent Runtime ID
const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || 'halogen-ethos-499620-v4';
const REGION = process.env.GOOGLE_CLOUD_REGION || 'us-east1';
const RAW_RUNTIME_ID = process.env.AGENT_RUNTIME_ID;

const RUNTIME_RESOURCE = (RAW_RUNTIME_ID && RAW_RUNTIME_ID.startsWith('projects/')) 
  ? RAW_RUNTIME_ID 
  : `projects/${PROJECT_ID}/locations/${REGION}/reasoningEngines/${RAW_RUNTIME_ID}`;

console.log(`Configured Project ID: ${PROJECT_ID}`);
console.log(`Configured Region: ${REGION}`);
console.log(`Configured Agent Runtime Resource: ${RUNTIME_RESOURCE}`);

// Helper to get Google Auth token
const auth = new GoogleAuth({
  scopes: 'https://www.googleapis.com/auth/cloud-platform'
});

async function getAccessToken() {
  const client = await auth.getClient();
  const tokenResponse = await client.getAccessToken();
  return tokenResponse.token;
}

// Endpoint: Start Session
app.post('/api/session/start', async (req, res) => {
  try {
    const token = await getAccessToken();
    const userId = req.body.userId || 'supervisor';
    
    // Call the Vertex AI Reasoning Engine native sessions creation endpoint
    const url = `https://${REGION}-aiplatform.googleapis.com/v1/${RUNTIME_RESOURCE}/sessions`;
    
    console.log(`Creating session via: ${url}`);
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        userId: userId
      })
    });
    
    if (!response.ok) {
      const errText = await response.text();
      console.error(`Session creation failed: ${response.status} - ${errText}`);
      return res.status(response.status).json({ error: 'Failed to create session in Agent Runtime', details: errText });
    }
    
    const data = await response.json();
    console.log(`Session create raw response:`, JSON.stringify(data));
    // The API returns a Long Running Operation (LRO). The real session name is inside
    // data.response.name. data.name is just the operation resource name — do NOT use it.
    const sessionName = (data.response && data.response.name) || data.name;
    if (!sessionName) {
      console.error('Session creation returned no name field:', JSON.stringify(data));
      return res.status(500).json({ error: 'Session created but no session name returned', details: JSON.stringify(data) });
    }
    // Extract only the last segment (session ID) from the full resource path
    // e.g. ".../sessions/5030692857342590976"
    const sessionId = sessionName.split('/').pop();
    console.log(`Session created successfully: ${sessionId} (from ${sessionName})`);
    res.json({ sessionId });
  } catch (error) {
    console.error('Error starting session:', error);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint: Interact / Send message
app.post('/api/session/interact', async (req, res) => {
  try {
    const token = await getAccessToken();
    const { sessionId, message, userId } = req.body;
    const resolvedUserId = userId || 'supervisor';
    
    if (!sessionId || !message) {
      return res.status(400).json({ error: 'sessionId and message are required' });
    }
    
    const url = `https://${REGION}-aiplatform.googleapis.com/v1/${RUNTIME_RESOURCE}:streamQuery`;
    console.log(`Sending message to: ${url}`);
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        input: {
          message: {
            role: 'user',
            parts: [{ text: message }]
          },
          user_id: resolvedUserId,
          session_id: sessionId
        }
      })
    });
    
    if (!response.ok) {
      const errText = await response.text();
      console.error(`Interact failed: ${response.status} - ${errText}`);
      return res.status(response.status).json({ error: 'Agent interaction failed', details: errText });
    }
    
    // Read and parse JSON Lines stream response
    const reader = response.body;
    if (!reader) {
      return res.status(500).json({ error: 'Empty response stream from Agent Runtime' });
    }
    
    let buffer = '';
    const textDecoder = new TextDecoder();
    
    // Streams chunk reader
    let responseText = '';
    let needsConfirmation = false;
    let confirmationPrompt = null;
    const events = [];
    
    // Node.js readable stream iteration
    for await (const chunk of reader) {
      buffer += textDecoder.decode(chunk, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        
        try {
          const eventObj = JSON.parse(trimmed);
          events.push(eventObj);
          
          // Check for text parts and function calls in standard ADK events
          if (eventObj.content && eventObj.content.parts) {
            for (const part of eventObj.content.parts) {
              if (part.text) {
                responseText += part.text;
              }
              if (part.function_call && part.function_call.name) {
                const fname = part.function_call.name;
                if (fname.includes('confirm') || fname.includes('input') || fname.includes('hitl')) {
                  needsConfirmation = true;
                  confirmationPrompt = (part.function_call.args && part.function_call.args.message) || 'Action requires confirmation';
                }
              }
            }
          }
          
          // Check for state_delta indicator
          if (eventObj.actions && eventObj.actions.state_delta) {
            const sd = eventObj.actions.state_delta;
            if (sd.needs_confirmation || sd.route === 'human_confirmation') {
              needsConfirmation = true;
            }
          }
          
          // Check for RequestInput / confirmation trigger (structured event)
          if (eventObj.event_type === 'RequestInput' || eventObj.message_type === 'RequestInput') {
            needsConfirmation = true;
            confirmationPrompt = eventObj.message || 'Action approval needed';
          }
          
          // If direct yield text from tool context
          if (eventObj.output && typeof eventObj.output === 'string') {
            if (eventObj.output.includes('Confirmation request queued') ||
                eventObj.output.includes('human confirmation') ||
                eventObj.output.includes('workflow will pause')) {
              needsConfirmation = true;
              confirmationPrompt = eventObj.output;
            }
          }
        } catch (e) {
          // Ignore parse errors on empty/malformed lines
        }
      }
    }
    
    // Text-based HITL detection as final fallback:
    // If agent's response text itself mentions confirmation/approval needed
    if (!needsConfirmation && responseText) {
      const lowerText = responseText.toLowerCase();
      if (
        lowerText.includes('confirmation request') ||
        lowerText.includes('awaiting confirmation') ||
        lowerText.includes('waiting for approval') ||
        lowerText.includes('sent for human approval') ||
        lowerText.includes('workflow will pause') ||
        lowerText.includes('supervisor approval') ||
        lowerText.includes('human approval') ||
        lowerText.includes('pending human approval')
      ) {
        needsConfirmation = true;
        confirmationPrompt = confirmationPrompt || responseText;
      }
    }
    
    res.json({
      responseText: responseText.trim(),
      needsConfirmation,
      confirmationPrompt,
      events
    });
    
  } catch (error) {
    console.error('Error in session interact:', error);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint: Send Confirmation (HITL resume)
app.post('/api/session/confirm', async (req, res) => {
  try {
    const token = await getAccessToken();
    const { sessionId, confirm, userId } = req.body;
    const resolvedUserId = userId || 'supervisor';
    
    if (!sessionId || !confirm) {
      return res.status(400).json({ error: 'sessionId and confirm (yes/no) are required' });
    }
    
    const url = `https://${REGION}-aiplatform.googleapis.com/v1/${RUNTIME_RESOURCE}:streamQuery`;
    console.log(`Sending HITL confirmation (${confirm}) to: ${url}`);
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        input: {
          message: {
            role: 'user',
            parts: [{ text: confirm }]
          },
          user_id: resolvedUserId,
          session_id: sessionId
        }
      })
    });
    
    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({ error: 'Confirmation failed', details: errText });
    }
    
    // Read and parse JSON Lines stream response
    const reader = response.body;
    if (!reader) {
      return res.status(500).json({ error: 'Empty response stream from Agent Runtime' });
    }

    let buffer = '';
    const textDecoder = new TextDecoder();

    // Streams chunk reader
    let responseText = '';
    let needsConfirmation = false;
    let confirmationPrompt = null;
    const events = [];

    // Node.js readable stream iteration
    for await (const chunk of reader) {
      buffer += textDecoder.decode(chunk, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        try {
          const eventObj = JSON.parse(trimmed);
          events.push(eventObj);

          // Check for text parts and function calls in standard ADK events
          if (eventObj.content && eventObj.content.parts) {
            for (const part of eventObj.content.parts) {
              if (part.text) {
                responseText += part.text;
              }
              if (part.function_call && part.function_call.name) {
                const fname = part.function_call.name;
                if (fname.includes('confirm') || fname.includes('input') || fname.includes('hitl')) {
                  needsConfirmation = true;
                  confirmationPrompt = (part.function_call.args && part.function_call.args.message) || 'Action requires confirmation';
                }
              }
            }
          }

          // Check for state_delta indicator
          if (eventObj.actions && eventObj.actions.state_delta) {
            const sd = eventObj.actions.state_delta;
            if (sd.needs_confirmation || sd.route === 'human_confirmation') {
              needsConfirmation = true;
            }
          }

          // Check for RequestInput / confirmation trigger (structured event)
          if (eventObj.event_type === 'RequestInput' || eventObj.message_type === 'RequestInput') {
            needsConfirmation = true;
            confirmationPrompt = eventObj.message || 'Action approval needed';
          }

          // If direct yield text from tool context
          if (eventObj.output && typeof eventObj.output === 'string') {
            if (eventObj.output.includes('Confirmation request queued') ||
                eventObj.output.includes('human confirmation') ||
                eventObj.output.includes('workflow will pause')) {
              needsConfirmation = true;
              confirmationPrompt = eventObj.output;
            }
          }
        } catch (e) {
          // Ignore parse errors on empty/malformed lines
        }
      }
    }

    // Text-based HITL detection as final fallback:
    // If agent's response text itself mentions confirmation/approval needed
    if (!needsConfirmation && responseText) {
      const lowerText = responseText.toLowerCase();
      if (
        lowerText.includes('confirmation request') ||
        lowerText.includes('awaiting confirmation') ||
        lowerText.includes('waiting for approval') ||
        lowerText.includes('sent for human approval') ||
        lowerText.includes('workflow will pause') ||
        lowerText.includes('supervisor approval') ||
        lowerText.includes('human approval') ||
        lowerText.includes('pending human approval')
      ) {
        needsConfirmation = true;
        confirmationPrompt = confirmationPrompt || responseText;
      }
    }

    res.json({
      responseText: responseText.trim(),
      needsConfirmation,
      confirmationPrompt,
      events
    });
  } catch (error) {
    console.error('Error sending confirmation:', error);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint: Get session history
app.get('/api/session/:sessionId/history', async (req, res) => {
  try {
    const token = await getAccessToken();
    const { sessionId } = req.params;
    
    // Call the Agent Runtime sessions events endpoint to get the event history
    const url = `https://${REGION}-aiplatform.googleapis.com/v1/${RUNTIME_RESOURCE}/sessions/${sessionId}/events`;
    
    console.log(`Fetching history via: ${url}`);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({ error: 'Failed to fetch history', details: errText });
    }
    
    const data = await response.json();
    const rawEvents = data.events || [];
    
    // Map Vertex AI SessionEvents to App message format
    const history = rawEvents.map(evt => {
      // Find role
      let role = 'model';
      if (evt.author === 'user' || evt.role === 'user') {
        role = 'user';
      }
      
      // Extract text content
      let text = '';
      if (evt.content && evt.content.parts) {
        text = evt.content.parts.map(p => p.text || '').join('');
      } else if (evt.rawEvent && evt.rawEvent.content && evt.rawEvent.content.parts) {
        text = evt.rawEvent.content.parts.map(p => p.text || '').join('');
      } else if (evt.output) {
        text = evt.output;
      }
      
      return {
        role,
        content: {
          parts: [{ text }]
        },
        timestamp: evt.timestamp
      };
    }).filter(msg => {
      // Filter out empty messages to keep the chat clean
      return msg.content.parts[0].text.trim().length > 0;
    });
    
    res.json({ history });
  } catch (error) {
    console.error('Error fetching session history:', error);
    res.status(500).json({ error: error.message });
  }
});

// Serve Vite production build static assets
app.use(express.static(path.join(__dirname, 'dist')));

app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

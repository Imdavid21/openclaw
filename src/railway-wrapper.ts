#!/usr/bin/env node
/**
 * Railway wrapper for OpenClaw
 * Provides HTTP server for health checks and proxies to the OpenClaw gateway
 */

import express from 'express';
import { spawn } from 'child_process';
import { createProxyMiddleware } from 'http-proxy-middleware';

const app = express();
const PORT = parseInt(process.env.PORT || '8080', 10);
const GATEWAY_PORT = 18789;

let gatewayProcess: ReturnType<typeof spawn> | null = null;
let gatewayReady = false;

// Health check endpoint for Railway
app.get('/health', (req, res) => {
  if (gatewayReady) {
    res.status(200).json({ 
      status: 'ok',
      gateway: 'running',
      port: GATEWAY_PORT 
    });
  } else {
    res.status(503).json({ 
      status: 'starting',
      gateway: 'initializing' 
    });
  }
});

// Setup page (for configuration wizard)
app.get('/setup', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>OpenClaw Setup</title>
      <style>
        body { font-family: system-ui; max-width: 600px; margin: 50px auto; padding: 20px; }
        .card { background: #f5f5f5; padding: 20px; border-radius: 8px; }
        a { color: #0066cc; text-decoration: none; }
        a:hover { text-decoration: underline; }
      </style>
    </head>
    <body>
      <h1>🦞 OpenClaw Railway Setup</h1>
      <div class="card">
        <h2>Gateway is Running!</h2>
        <p>Your OpenClaw gateway is running on port ${GATEWAY_PORT}.</p>
        <p><strong>Next steps:</strong></p>
        <ol>
          <li>Configure your AI provider (Anthropic, OpenAI, etc.)</li>
          <li>Set up messaging channels (Telegram, Discord, WhatsApp)</li>
          <li>Start chatting with your AI assistant!</li>
        </ol>
        <p><a href="/openclaw">→ Open Control UI</a></p>
      </div>
      <div class="card" style="margin-top: 20px;">
        <h3>Environment Variables</h3>
        <p>Make sure these are set in Railway:</p>
        <ul>
          <li><code>OPENCLAW_STATE_DIR=/data/.openclaw</code></li>
          <li><code>OPENCLAW_WORKSPACE_DIR=/data/workspace</code></li>
          <li><code>PORT=8080</code></li>
        </ul>
      </div>
    </body>
    </html>
  `);
});

// Proxy all other requests to the OpenClaw gateway
app.use('/', createProxyMiddleware({
  target: `http://127.0.0.1:${GATEWAY_PORT}`,
  changeOrigin: true,
  ws: true, // Enable WebSocket proxying
  onError: (err, req, res) => {
    console.error('Proxy error:', err);
    if (res instanceof express.Response) {
      res.status(502).json({ 
        error: 'Gateway unavailable',
        message: 'OpenClaw gateway is starting or not responding' 
      });
    }
  }
}));

// Start the gateway process
function startGateway() {
  console.log('Starting OpenClaw gateway...');
  
  gatewayProcess = spawn('node', [
    'dist/index.js',
    'gateway',
    '--allow-unconfigured',
    '--bind', 'loopback'
  ], {
    stdio: 'inherit',
    env: {
      ...process.env,
      OPENCLAW_STATE_DIR: process.env.OPENCLAW_STATE_DIR || '/data/.openclaw',
      OPENCLAW_WORKSPACE_DIR: process.env.OPENCLAW_WORKSPACE_DIR || '/data/workspace'
    }
  });

  gatewayProcess.on('spawn', () => {
    console.log('Gateway process spawned, waiting for initialization...');
    // Give gateway time to start
    setTimeout(() => {
      gatewayReady = true;
      console.log('Gateway marked as ready');
    }, 5000);
  });

  gatewayProcess.on('error', (err) => {
    console.error('Gateway error:', err);
    gatewayReady = false;
  });

  gatewayProcess.on('exit', (code, signal) => {
    console.error(`Gateway exited with code ${code}, signal ${signal}`);
    gatewayReady = false;
    // Restart gateway after a delay
    setTimeout(startGateway, 5000);
  });
}

// Start the HTTP server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Railway wrapper listening on http://0.0.0.0:${PORT}`);
  console.log(`Health check available at http://0.0.0.0:${PORT}/health`);
  startGateway();
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  if (gatewayProcess) {
    gatewayProcess.kill('SIGTERM');
  }
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...');
  if (gatewayProcess) {
    gatewayProcess.kill('SIGINT');
  }
  process.exit(0);
});

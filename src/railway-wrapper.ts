#!/usr/bin/env node
import { spawn } from 'child_process';
import express from 'express';

const app = express();
const PORT = process.env.PORT || 8080;

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Start the gateway process
const gateway = spawn('node', ['dist/index.js', 'gateway'], {
  stdio: 'inherit',
  env: { ...process.env }
});

gateway.on('error', (err) => {
  console.error('Gateway error:', err);
  process.exit(1);
});

app.listen(PORT, () => {
  console.log(`Railway wrapper listening on port ${PORT}`);
});

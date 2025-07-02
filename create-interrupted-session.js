#!/usr/bin/env node

/**
 * Script to create an interrupted session for testing recovery
 */

const fs = require('fs-extra');
const path = require('path');

async function createInterruptedSession() {
  console.log('🔧 Creating interrupted session for testing...');
  
  const sessionId = 'test-interrupted-' + Date.now();
  const outputDir = path.join(__dirname, 'temp', sessionId);
  const sessionsFile = path.join(__dirname, 'temp/sessions.json');
  
  // Ensure output directory exists
  await fs.ensureDir(outputDir);
  
  const interruptedSession = {
    id: sessionId,
    url: 'https://httpbin.org/delay/5',
    options: {},
    status: "crawling", // This will be marked as interrupted on restart
    progress: 65,
    outputDir: outputDir,
    startTime: new Date(Date.now() - 3 * 60 * 1000), // 3 minutes ago (recent enough to recover)
    assets: [
      {
        url: "https://httpbin.org/image/png",
        type: "image",
        contentType: "image/png",
        size: 2048,
        discoveredAt: new Date(Date.now() - 2 * 60 * 1000)
      },
      {
        url: "https://httpbin.org/json",
        type: "javascript",
        contentType: "application/json",
        size: 512,
        discoveredAt: new Date(Date.now() - 1 * 60 * 1000)
      }
    ]
  };

  // Load existing sessions
  let sessionsData = {};
  if (await fs.pathExists(sessionsFile)) {
    sessionsData = await fs.readJson(sessionsFile);
  }
  
  // Add our interrupted session
  sessionsData[sessionId] = interruptedSession;
  await fs.writeJson(sessionsFile, sessionsData, { spaces: 2 });

  // Save individual session state
  const sessionStateFile = path.join(outputDir, 'session-state.json');
  await fs.writeJson(sessionStateFile, {
    ...interruptedSession,
    lastSaved: new Date()
  }, { spaces: 2 });

  console.log(`✅ Interrupted session created: ${sessionId}`);
  console.log(`✅ Session status: ${interruptedSession.status}`);
  console.log(`✅ Session progress: ${interruptedSession.progress}%`);
  console.log(`✅ Assets found: ${interruptedSession.assets.length}`);
  console.log(`✅ Output directory: ${outputDir}`);
  console.log(`✅ Sessions file updated: ${sessionsFile}`);
  
  console.log('\n🔄 Now restart the server to test recovery!');
  console.log('   The session should be marked as "interrupted" and offer recovery.');
  
  return sessionId;
}

if (require.main === module) {
  createInterruptedSession().catch(console.error);
}

module.exports = createInterruptedSession;

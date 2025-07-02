#!/usr/bin/env node

/**
 * Test WebSocket recovery functionality
 */

const WebSocket = require('ws');

const TEST_CONFIG = {
  wsUrl: 'ws://localhost:3002',
  sessionId: 'test-interrupted-1750514440753' // Use the most recent interrupted session
};

function testWebSocketRecovery() {
  console.log('🔌 Testing WebSocket Recovery...');
  console.log(`📋 Session ID: ${TEST_CONFIG.sessionId}`);
  
  const ws = new WebSocket(TEST_CONFIG.wsUrl);
  
  ws.on('open', () => {
    console.log('✅ WebSocket connected');
    
    // Send session recovery request
    console.log('📤 Sending recovery request...');
    ws.send(JSON.stringify({
      type: 'recover_session',
      sessionId: TEST_CONFIG.sessionId
    }));
  });

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data);
      console.log(`📨 Received: ${message.type}`);
      
      switch (message.type) {
        case 'connection_status':
          console.log(`   ✅ Connection status: ${message.status}`);
          break;
          
        case 'session_recovery_available':
          console.log(`   🎉 Session recovery available!`);
          console.log(`   📊 Session details:`);
          console.log(`      - URL: ${message.url}`);
          console.log(`      - Status: ${message.status}`);
          console.log(`      - Progress: ${message.progress}%`);
          console.log(`      - Assets: ${message.totalAssets}`);
          console.log(`      - Can recover: ${message.canRecover}`);
          
          // Test resuming the session
          console.log('📤 Attempting to resume session...');
          ws.send(JSON.stringify({
            type: 'resume_session',
            sessionId: TEST_CONFIG.sessionId
          }));
          break;
          
        case 'session_resumed':
          console.log(`   🎉 Session resumed successfully!`);
          console.log(`   ✅ Test completed successfully`);
          ws.close();
          break;
          
        case 'session_resume_failed':
          console.log(`   ❌ Session resume failed: ${message.message}`);
          ws.close();
          break;
          
        case 'status_update':
          console.log(`   📊 Status update: ${message.status}`);
          if (message.status === 'interrupted') {
            console.log(`   ✅ Session correctly marked as interrupted`);
          }
          break;
          
        case 'session_not_found':
          console.log(`   ❌ Session not found: ${message.message}`);
          ws.close();
          break;
          
        default:
          console.log(`   📋 Other message: ${JSON.stringify(message, null, 2)}`);
      }
    } catch (error) {
      console.error('❌ Failed to parse message:', error);
    }
  });

  ws.on('error', (error) => {
    console.error('❌ WebSocket error:', error);
  });

  ws.on('close', () => {
    console.log('🔌 WebSocket closed');
    console.log('✅ Test completed');
  });

  // Timeout after 10 seconds
  setTimeout(() => {
    if (ws.readyState === WebSocket.OPEN) {
      console.log('⏰ Test timed out');
      ws.close();
    }
  }, 10000);
}

// Check if server is running
async function checkServer() {
  try {
    const response = await fetch('http://localhost:3002/api/health');
    if (!response.ok) {
      throw new Error(`Server health check failed: ${response.status}`);
    }
    console.log('✅ Server is running\n');
  } catch (error) {
    console.error('❌ Server is not running or not accessible.');
    console.error('   Please start the server with: npm run dev');
    console.error(`   Error: ${error.message}`);
    process.exit(1);
  }
}

async function main() {
  console.log('🧪 ProCloner WebSocket Recovery Test');
  console.log('=' .repeat(40));
  
  await checkServer();
  testWebSocketRecovery();
}

main().catch(console.error);

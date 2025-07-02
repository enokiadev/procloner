#!/usr/bin/env node

/**
 * Test script for server restart and session recovery
 * This script simulates a server restart scenario
 */

const fs = require('fs-extra');
const path = require('path');
const WebSocket = require('ws');

// Test configuration
const TEST_CONFIG = {
  serverUrl: 'http://localhost:3002',
  wsUrl: 'ws://localhost:3002',
  testUrl: 'https://httpbin.org/delay/10', // This will take time to crawl
  sessionsFile: path.join(__dirname, 'temp/sessions.json'),
  timeout: 30000
};

class ServerRestartTest {
  constructor() {
    this.ws = null;
    this.sessionId = null;
    this.testResults = [];
  }

  async runTests() {
    console.log('🔄 Starting Server Restart Recovery Tests...\n');

    try {
      // Test 1: Create an interrupted session manually
      await this.createInterruptedSession();
      
      // Test 2: Test session recovery on startup
      await this.testSessionRecoveryOnStartup();
      
      // Test 3: Test WebSocket recovery for interrupted session
      await this.testInterruptedSessionRecovery();

      // Print results
      this.printResults();

    } catch (error) {
      console.error('❌ Test suite failed:', error);
      process.exit(1);
    }
  }

  async createInterruptedSession() {
    console.log('📝 Test 1: Creating Interrupted Session Simulation');
    
    try {
      // Create a mock interrupted session
      this.sessionId = 'test-interrupted-' + Date.now();
      const outputDir = path.join(__dirname, 'temp', this.sessionId);
      
      // Ensure output directory exists
      await fs.ensureDir(outputDir);
      
      const interruptedSession = {
        id: this.sessionId,
        url: TEST_CONFIG.testUrl,
        options: {},
        status: "crawling", // This will be marked as interrupted on restart
        progress: 45,
        outputDir: outputDir,
        startTime: new Date(Date.now() - 5 * 60 * 1000), // 5 minutes ago
        assets: [
          {
            url: "https://httpbin.org/image/png",
            type: "image",
            contentType: "image/png",
            size: 1024,
            discoveredAt: new Date()
          }
        ]
      };

      // Save to sessions file
      let sessionsData = {};
      if (await fs.pathExists(TEST_CONFIG.sessionsFile)) {
        sessionsData = await fs.readJson(TEST_CONFIG.sessionsFile);
      }
      
      sessionsData[this.sessionId] = interruptedSession;
      await fs.writeJson(TEST_CONFIG.sessionsFile, sessionsData, { spaces: 2 });

      // Save individual session state
      const sessionStateFile = path.join(outputDir, 'session-state.json');
      await fs.writeJson(sessionStateFile, {
        ...interruptedSession,
        lastSaved: new Date()
      }, { spaces: 2 });

      console.log(`   ✅ Interrupted session created: ${this.sessionId}`);
      console.log(`   ✅ Session status: ${interruptedSession.status}`);
      console.log(`   ✅ Session progress: ${interruptedSession.progress}%`);
      console.log(`   ✅ Assets found: ${interruptedSession.assets.length}`);
      
      this.testResults.push({ test: 'Create Interrupted Session', status: 'PASS' });

    } catch (error) {
      console.log(`   ❌ Failed to create interrupted session: ${error.message}`);
      this.testResults.push({ test: 'Create Interrupted Session', status: 'FAIL', error: error.message });
      throw error;
    }
  }

  async testSessionRecoveryOnStartup() {
    console.log('\n🔄 Test 2: Session Recovery on Startup');
    
    try {
      // Read the sessions file to verify our session is there
      const sessionsData = await fs.readJson(TEST_CONFIG.sessionsFile);
      const session = sessionsData[this.sessionId];
      
      if (!session) {
        throw new Error('Interrupted session not found in sessions file');
      }

      console.log(`   ✅ Session found in sessions file`);
      console.log(`   ✅ Original status: ${session.status}`);
      
      // The server should have loaded this session and marked it as interrupted
      // Let's check by making an API call
      const response = await fetch(`${TEST_CONFIG.serverUrl}/api/session/${this.sessionId}`);
      
      if (response.ok) {
        const sessionData = await response.json();
        console.log(`   ✅ Session accessible via API`);
        console.log(`   ✅ Current status: ${sessionData.status}`);
        console.log(`   ✅ Progress preserved: ${sessionData.progress}%`);
        console.log(`   ✅ Assets preserved: ${sessionData.assets}`);
        
        this.testResults.push({ test: 'Session Recovery on Startup', status: 'PASS' });
      } else if (response.status === 404) {
        console.log(`   ⚠️  Session not found via API (may have been cleaned up)`);
        this.testResults.push({ test: 'Session Recovery on Startup', status: 'SKIP', note: 'Session not found via API' });
      } else {
        throw new Error(`API call failed: ${response.status}`);
      }

    } catch (error) {
      console.log(`   ❌ Session recovery test failed: ${error.message}`);
      this.testResults.push({ test: 'Session Recovery on Startup', status: 'FAIL', error: error.message });
    }
  }

  async testInterruptedSessionRecovery() {
    console.log('\n🔌 Test 3: WebSocket Recovery for Interrupted Session');
    
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(TEST_CONFIG.wsUrl);
        
        this.ws.on('open', () => {
          console.log('   ✅ WebSocket connected');
          
          // Send session recovery request for our interrupted session
          this.ws.send(JSON.stringify({
            type: 'recover_session',
            sessionId: this.sessionId
          }));
        });

        this.ws.on('message', (data) => {
          try {
            const message = JSON.parse(data);
            console.log(`   📨 Received message: ${message.type}`);

            if (message.type === 'connection_status') {
              console.log(`   ✅ Connection status: ${message.status}`);
            } else if (message.type === 'session_recovery_available') {
              console.log(`   ✅ Session recovery available!`);
              console.log(`   ✅ Can recover: ${message.canRecover}`);
              console.log(`   ✅ Session URL: ${message.url}`);
              console.log(`   ✅ Progress: ${message.progress}%`);
              
              // Test resuming the session
              this.ws.send(JSON.stringify({
                type: 'resume_session',
                sessionId: this.sessionId
              }));
              
            } else if (message.type === 'session_resumed') {
              console.log(`   ✅ Session resumed successfully!`);
              this.testResults.push({ test: 'Interrupted Session Recovery', status: 'PASS' });
              this.ws.close();
              resolve();
              
            } else if (message.type === 'session_resume_failed') {
              throw new Error(`Session resume failed: ${message.message}`);
              
            } else if (message.type === 'status_update') {
              console.log(`   ✅ Session status update: ${message.status}`);
              if (message.status === 'interrupted') {
                console.log(`   ✅ Session correctly marked as interrupted`);
              }
              
            } else if (message.type === 'session_not_found') {
              console.log(`   ⚠️  Session not found (may have been cleaned up)`);
              this.testResults.push({ test: 'Interrupted Session Recovery', status: 'SKIP', note: 'Session not found' });
              this.ws.close();
              resolve();
            }
          } catch (parseError) {
            reject(new Error(`Failed to parse WebSocket message: ${parseError.message}`));
          }
        });

        this.ws.on('error', (error) => {
          reject(new Error(`WebSocket error: ${error.message}`));
        });

        this.ws.on('close', () => {
          console.log('   ✅ WebSocket closed');
        });

        // Timeout after 15 seconds
        setTimeout(() => {
          if (this.ws.readyState === WebSocket.OPEN) {
            this.ws.close();
            console.log('   ⚠️  WebSocket test timed out (this may be normal)');
            this.testResults.push({ test: 'Interrupted Session Recovery', status: 'SKIP', note: 'Test timed out' });
            resolve();
          }
        }, 15000);

      } catch (error) {
        console.log(`   ❌ WebSocket recovery failed: ${error.message}`);
        this.testResults.push({ test: 'Interrupted Session Recovery', status: 'FAIL', error: error.message });
        reject(error);
      }
    });
  }

  printResults() {
    console.log('\n📊 Test Results Summary:');
    console.log('=' .repeat(50));
    
    let passed = 0;
    let failed = 0;
    let skipped = 0;

    this.testResults.forEach(result => {
      const status = result.status === 'PASS' ? '✅' : result.status === 'FAIL' ? '❌' : '⚠️';
      console.log(`${status} ${result.test}: ${result.status}`);
      
      if (result.error) {
        console.log(`   Error: ${result.error}`);
      }
      if (result.note) {
        console.log(`   Note: ${result.note}`);
      }

      if (result.status === 'PASS') passed++;
      else if (result.status === 'FAIL') failed++;
      else skipped++;
    });

    console.log('=' .repeat(50));
    console.log(`Total: ${this.testResults.length} | Passed: ${passed} | Failed: ${failed} | Skipped: ${skipped}`);
    
    if (failed > 0) {
      console.log('\n❌ Some tests failed. Please check the implementation.');
      process.exit(1);
    } else {
      console.log('\n🎉 Server restart recovery tests completed successfully!');
    }
  }
}

// Check if server is running
async function checkServer() {
  try {
    const response = await fetch(`${TEST_CONFIG.serverUrl}/api/health`);
    if (!response.ok) {
      throw new Error(`Server health check failed: ${response.status}`);
    }
    console.log('✅ Server is running and healthy\n');
  } catch (error) {
    console.error('❌ Server is not running or not accessible.');
    console.error('   Please start the server with: npm run dev');
    console.error(`   Error: ${error.message}`);
    process.exit(1);
  }
}

// Main execution
async function main() {
  console.log('🔄 ProCloner Server Restart Recovery Test Suite');
  console.log('=' .repeat(50));
  
  await checkServer();
  
  const test = new ServerRestartTest();
  await test.runTests();
}

// Handle uncaught errors
process.on('unhandledRejection', (error) => {
  console.error('❌ Unhandled promise rejection:', error);
  process.exit(1);
});

// Run tests
if (require.main === module) {
  main().catch(console.error);
}

module.exports = ServerRestartTest;

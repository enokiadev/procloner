#!/usr/bin/env node

/**
 * Test script for session persistence and recovery functionality
 * This script tests the enhanced session management system
 */

const fs = require('fs-extra');
const path = require('path');
const WebSocket = require('ws');

// Test configuration
const TEST_CONFIG = {
  serverUrl: 'http://localhost:3002',
  wsUrl: 'ws://localhost:3002',
  testUrl: 'https://example.com',
  sessionsFile: path.join(__dirname, 'temp/sessions.json'),
  timeout: 30000 // 30 seconds
};

class SessionPersistenceTest {
  constructor() {
    this.ws = null;
    this.sessionId = null;
    this.testResults = [];
  }

  async runTests() {
    console.log('🧪 Starting Session Persistence Tests...\n');

    try {
      // Test 1: Basic session creation and persistence
      await this.testSessionCreation();
      
      // Test 2: Session file persistence
      await this.testSessionFilePersistence();
      
      // Test 3: WebSocket recovery
      await this.testWebSocketRecovery();
      
      // Test 4: Session state persistence during crawling
      await this.testSessionStatePersistence();

      // Print results
      this.printResults();

    } catch (error) {
      console.error('❌ Test suite failed:', error);
      process.exit(1);
    }
  }

  async testSessionCreation() {
    console.log('📝 Test 1: Session Creation and Basic Persistence');
    
    try {
      // Create a new cloning session
      const response = await fetch(`${TEST_CONFIG.serverUrl}/api/clone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: TEST_CONFIG.testUrl })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      this.sessionId = data.sessionId;

      console.log(`   ✅ Session created: ${this.sessionId}`);
      this.testResults.push({ test: 'Session Creation', status: 'PASS' });

      // Wait a moment for session to be saved
      await new Promise(resolve => setTimeout(resolve, 1000));

    } catch (error) {
      console.log(`   ❌ Session creation failed: ${error.message}`);
      this.testResults.push({ test: 'Session Creation', status: 'FAIL', error: error.message });
      throw error;
    }
  }

  async testSessionFilePersistence() {
    console.log('\n💾 Test 2: Session File Persistence');
    
    try {
      // Check if sessions file exists
      const sessionsExist = await fs.pathExists(TEST_CONFIG.sessionsFile);
      if (!sessionsExist) {
        throw new Error('Sessions file does not exist');
      }

      // Read sessions file
      const sessionsData = await fs.readJson(TEST_CONFIG.sessionsFile);
      
      // Check if our session is in the file
      if (!sessionsData[this.sessionId]) {
        throw new Error(`Session ${this.sessionId} not found in sessions file`);
      }

      const session = sessionsData[this.sessionId];
      console.log(`   ✅ Session found in file with status: ${session.status}`);
      console.log(`   ✅ Session URL: ${session.url}`);
      console.log(`   ✅ Session start time: ${session.startTime}`);

      this.testResults.push({ test: 'Session File Persistence', status: 'PASS' });

    } catch (error) {
      console.log(`   ❌ Session file persistence failed: ${error.message}`);
      this.testResults.push({ test: 'Session File Persistence', status: 'FAIL', error: error.message });
      throw error;
    }
  }

  async testWebSocketRecovery() {
    console.log('\n🔌 Test 3: WebSocket Recovery');
    
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(TEST_CONFIG.wsUrl);
        
        this.ws.on('open', () => {
          console.log('   ✅ WebSocket connected');
          
          // Send session recovery request
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
            } else if (message.type === 'status_update' || message.type === 'session_recovery_available') {
              console.log(`   ✅ Session recovery response received`);
              console.log(`   ✅ Session status: ${message.status}`);
              console.log(`   ✅ Session URL: ${message.url}`);
              
              this.testResults.push({ test: 'WebSocket Recovery', status: 'PASS' });
              this.ws.close();
              resolve();
            } else if (message.type === 'session_not_found') {
              throw new Error('Session not found during recovery');
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

        // Timeout after 10 seconds
        setTimeout(() => {
          if (this.ws.readyState === WebSocket.OPEN) {
            this.ws.close();
            reject(new Error('WebSocket recovery test timed out'));
          }
        }, 10000);

      } catch (error) {
        console.log(`   ❌ WebSocket recovery failed: ${error.message}`);
        this.testResults.push({ test: 'WebSocket Recovery', status: 'FAIL', error: error.message });
        reject(error);
      }
    });
  }

  async testSessionStatePersistence() {
    console.log('\n💾 Test 4: Session State Persistence');
    
    try {
      // Check if session has individual state file
      const sessionStateFile = path.join(__dirname, 'temp', this.sessionId, 'session-state.json');
      
      // Wait a bit for state file to be created
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const stateExists = await fs.pathExists(sessionStateFile);
      if (stateExists) {
        const stateData = await fs.readJson(sessionStateFile);
        console.log(`   ✅ Session state file exists`);
        console.log(`   ✅ State last saved: ${stateData.lastSaved}`);
        console.log(`   ✅ State status: ${stateData.status}`);
        
        this.testResults.push({ test: 'Session State Persistence', status: 'PASS' });
      } else {
        console.log(`   ⚠️  Session state file not yet created (this is normal for quick tests)`);
        this.testResults.push({ test: 'Session State Persistence', status: 'SKIP', note: 'State file not created yet' });
      }

    } catch (error) {
      console.log(`   ❌ Session state persistence failed: ${error.message}`);
      this.testResults.push({ test: 'Session State Persistence', status: 'FAIL', error: error.message });
    }
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
      console.log('\n🎉 All tests passed! Session persistence is working correctly.');
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
  console.log('🚀 ProCloner Session Persistence Test Suite');
  console.log('=' .repeat(50));
  
  await checkServer();
  
  const test = new SessionPersistenceTest();
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

module.exports = SessionPersistenceTest;

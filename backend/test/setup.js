// test/setup.js - Simple version
const path = require('path');
const fs = require('fs');

// FORCE clear existing environment variables
delete process.env.MONGO_URI;
delete process.env.MONGO_DB_NAME;

// Load .env.test with override to ensure test values take precedence
const testEnvPath = path.join(__dirname, '..', '.env.test');
if (fs.existsSync(testEnvPath)) {
  require('dotenv').config({ path: testEnvPath, override: true });
} else {
  require('dotenv').config({ override: true });
}

// FORCE test environment variables (this ensures they're always correct)
process.env.NODE_ENV = 'test';
process.env.MONGO_DB_NAME = 'taskmanager_test';

// Ensure MONGO_URI points to test database - be more aggressive
if (process.env.MONGO_URI) {
  // Replace any instance of taskmanager that's not already taskmanager_test
  let testUri = process.env.MONGO_URI;
  
  // Handle different URL patterns
  if (testUri.includes('/taskmanager?') && !testUri.includes('/taskmanager_test?')) {
    testUri = testUri.replace('/taskmanager?', '/taskmanager_test?');
  }
  if (testUri.includes('/taskmanager&') && !testUri.includes('/taskmanager_test&')) {
    testUri = testUri.replace('/taskmanager&', '/taskmanager_test&');
  }
  // Handle end of URL
  if (testUri.endsWith('/taskmanager') && !testUri.endsWith('/taskmanager_test')) {
    testUri = testUri.replace('/taskmanager', '/taskmanager_test');
  }
  
  process.env.MONGO_URI = testUri;
} else {
  console.error('❌ MONGO_URI not found in environment variables');
}

console.log('🔧 Environment variables loaded:');
console.log('  NODE_ENV:', process.env.NODE_ENV);
console.log('  MONGO_DB_NAME:', process.env.MONGO_DB_NAME);
console.log('  MONGO_URI includes test:', process.env.MONGO_URI?.includes('taskmanager_test'));
console.log('  MONGO_URI preview:', process.env.MONGO_URI?.substring(0, 80) + '...');
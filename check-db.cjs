const { Database } = require('better-sqlite3');
const db = new Database('./data/ooda-agent.db');

console.log('=== Sessions ===');
const sessions = db.prepare('SELECT * FROM sessions ORDER BY created_at DESC LIMIT 5').all();
console.log(JSON.stringify(sessions, null, 2));

console.log('\n=== Messages ===');
const messages = db.prepare('SELECT * FROM messages ORDER BY timestamp DESC LIMIT 10').all();
console.log(JSON.stringify(messages, null, 2));

db.close();

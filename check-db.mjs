import { getStorage } from './packages/storage/src/index.js';

async function checkDatabase() {
  const store = await getStorage();
  
  console.log('=== Sessions ===');
  const sessions = store.sessions.getAll();
  console.log(JSON.stringify(sessions, null, 2));
  
  console.log('\n=== Recent Messages ===');
  for (const session of sessions.slice(0, 3)) {
    const messages = store.messages.getBySessionId(session.id);
    console.log(`Session ${session.id}:`);
    console.log(JSON.stringify(messages.slice(-5), null, 2));
  }
}

checkDatabase().catch(console.error);

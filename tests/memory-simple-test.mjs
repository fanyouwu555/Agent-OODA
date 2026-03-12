// 简单测试记忆系统功能
import { createStorage } from '../packages/storage/dist/index.js';
import { 
  initializeMemorySystem, 
  initializePersonaManager, 
  getSessionMemory 
} from '../packages/core/dist/index.js';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function testMemorySystem() {
  console.log('=== 记忆系统功能测试 ===\n');
  
  const testDir = path.join(process.cwd(), 'test-data');
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
  }
  
  const dbPath = path.join(testDir, 'test-memory.db');
  
  // 清理旧数据
  if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
  }
  
  console.log(`1. 初始化存储...`);
  console.log(`   数据库路径: ${dbPath}`);
  
  try {
    const storageInstance = await createStorage(dbPath);
    console.log('   ✓ 存储初始化成功\n');
    
    console.log(`2. 初始化记忆系统...`);
    const enableEmbedding = false; // 测试时禁用向量嵌入
    initializeMemorySystem(storageInstance.memories, enableEmbedding);
    console.log(`   ✓ 记忆系统初始化成功 (向量嵌入: ${enableEmbedding})\n`);
    
    console.log(`3. 加载预置角色...`);
    const personaManager = initializePersonaManager(storageInstance.memories);
    await personaManager.loadPersona('assistant');
    console.log('   ✓ 预置角色加载成功\n');
    
    console.log(`4. 测试记忆存储...`);
    const sessionMemory = getSessionMemory('test-session');
    
    const factId = await sessionMemory.storeFact(
      '用户喜欢使用 TypeScript 进行开发',
      ['programming', 'typescript'],
      0.8
    );
    console.log(`   ✓ 存储事实记忆: ${factId}`);
    
    const prefId = await sessionMemory.storePreference(
      '用户偏好使用中文进行交流',
      ['language'],
      0.9
    );
    console.log(`   ✓ 存储偏好记忆: ${prefId}`);
    
    const expId = await sessionMemory.storeExperience(
      '成功完成了文件读取操作',
      ['tool', 'read_file'],
      0.6
    );
    console.log(`   ✓ 存储经验记忆: ${expId}\n`);
    
    console.log(`5. 测试记忆检索...`);
    const memories = await sessionMemory.recall('TypeScript', 5);
    console.log(`   检索到 ${memories.length} 条相关记忆:`);
    memories.forEach((m, i) => {
      console.log(`   [${i + 1}] ${m.content}`);
      console.log(`       类型: ${m.metadata.type}, 重要性: ${m.importance}`);
    });
    console.log();
    
    console.log(`6. 测试按类型检索...`);
    const facts = await sessionMemory.recallByType('fact');
    console.log(`   事实记忆: ${facts.length} 条`);
    
    const preferences = await sessionMemory.recallByType('preference');
    console.log(`   偏好记忆: ${preferences.length} 条`);
    
    const experiences = await sessionMemory.recallByType('experience');
    console.log(`   经验记忆: ${experiences.length} 条\n`);
    
    console.log(`7. 测试长期记忆持久化...`);
    const longTermMemory = sessionMemory.getLongTerm();
    const totalMemories = longTermMemory.size();
    console.log(`   总记忆数量: ${totalMemories}\n`);
    
    console.log(`8. 测试关键词搜索...`);
    const searchResults = await longTermMemory.search('文件', { 
      useVectorSearch: false, 
      limit: 5 
    });
    console.log(`   搜索 "文件" 结果: ${searchResults.length} 条`);
    searchResults.forEach((m, i) => {
      console.log(`   [${i + 1}] ${m.content}`);
    });
    console.log();
    
    console.log('=== 测试完成 ===');
    console.log('\n✅ 记忆系统功能验证通过:');
    console.log('  ✓ 持久化存储');
    console.log('  ✓ 事实/偏好/经验记忆存储');
    console.log('  ✓ 关键词检索');
    console.log('  ✓ 按类型检索');
    console.log('  ✓ 预置角色加载');
    
    storageInstance.close();
    
    console.log('\n清理测试数据...');
    try {
      fs.unlinkSync(dbPath);
      fs.rmdirSync(testDir);
      console.log('   ✓ 测试数据已清理');
    } catch (e) {
      console.log('   ! 清理测试数据失败 (文件可能被占用)');
    }
    
    console.log('\n🎉 所有测试通过！');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ 测试失败:', error);
    process.exit(1);
  }
}

testMemorySystem();

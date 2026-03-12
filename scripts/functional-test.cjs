const { OODALoop } = require('../dist/packages/core/src/ooda/loop');
const { setLLMService } = require('../dist/packages/core/src/llm/service');

async function runFunctionalTest() {
    console.log('========================================');
    console.log('OODA Agent 功能测试');
    console.log('========================================\n');

    setLLMService({
        type: 'local',
        model: 'test-model',
        temperature: 0.7,
        maxTokens: 2000,
    });

    const oodaLoop = new OODALoop();

    const testCases = [
        {
            name: '问题询问测试',
            input: '什么是OODA循环？',
        },
        {
            name: '文件操作测试',
            input: '读取文件 package.json',
        },
        {
            name: '一般对话测试',
            input: '你好，请介绍一下你自己',
        },
    ];

    let passed = 0;
    let failed = 0;

    for (const testCase of testCases) {
        console.log(`\n测试: ${testCase.name}`);
        console.log(`输入: ${testCase.input}`);
        console.log('-'.repeat(50));

        try {
            const result = await oodaLoop.run(testCase.input);
            
            console.log(`输出: ${result.output?.slice(0, 200)}...`);
            console.log(`步骤数: ${result.steps?.length || 0}`);
            
            if (result.output && result.output.length > 10) {
                console.log('✅ 测试通过 - 生成了有效响应');
                passed++;
            } else {
                console.log('❌ 测试失败 - 响应无效或过短');
                failed++;
            }
        } catch (error) {
            console.log(`❌ 测试失败 - 发生错误: ${error.message}`);
            console.log(error.stack);
            failed++;
        }
    }

    console.log('\n========================================');
    console.log('测试结果汇总');
    console.log('========================================');
    console.log(`通过: ${passed}/${testCases.length}`);
    console.log(`失败: ${failed}/${testCases.length}`);
    console.log(`成功率: ${Math.round((passed / testCases.length) * 100)}%`);

    if (failed === 0) {
        console.log('\n🎉 所有测试通过！');
    } else {
        console.log('\n⚠️ 部分测试失败，请检查日志');
    }
}

runFunctionalTest().catch(console.error);

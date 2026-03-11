$ErrorActionPreference = "Stop"

Write-Host "========================================"
Write-Host "Ollama qwen3:8b 测试"
Write-Host "========================================"

Write-Host "`n测试1: 检查模型列表..."
try {
    $tags = Invoke-RestMethod -Uri "http://localhost:11434/api/tags"
    Write-Host "✅ Ollama服务正常"
    Write-Host "✅ 已安装模型:"
    foreach ($model in $tags.models) {
        $sizeGB = [math]::Round($model.size / 1GB, 2)
        Write-Host "   - $($model.name) ($sizeGB GB)"
    }
} catch {
    Write-Host "❌ Ollama连接失败: $_"
    exit 1
}

Write-Host "`n测试2: OpenAI兼容接口..."
try {
    $body = @{
        model = "qwen3:8b"
        messages = @(
            @{
                role = "user"
                content = "Hello, say hi in one word"
            }
        )
        max_tokens = 10
    } | ConvertTo-Json -Depth 3
    
    $response = Invoke-RestMethod -Uri "http://localhost:11434/v1/chat/completions" `
        -Method Post `
        -Body $body `
        -ContentType "application/json"
    
    Write-Host "✅ 模型响应成功"
    Write-Host "✅ 响应内容: $($response.choices[0].message.content)"
    Write-Host "✅ Token使用: $($response.usage.total_tokens)"
} catch {
    Write-Host "❌ 模型测试失败: $_"
}

Write-Host "`n========================================"
Write-Host "测试完成"
Write-Host "========================================"

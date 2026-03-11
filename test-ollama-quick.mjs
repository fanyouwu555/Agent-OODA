fetch('http://localhost:11434/api/generate', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({
    model: 'qwen3:4b',
    prompt: 'Hi',
    stream: false,
    options: {num_predict: 5}
  })
})
.then(r => r.json())
.then(d => {
  console.log('Response:', d.response);
  process.exit(0);
})
.catch(e => {
  console.error('Error:', e);
  process.exit(1);
});

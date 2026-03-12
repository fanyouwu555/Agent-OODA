import { spawn } from 'node:child_process';
import { createConnection } from 'node:net';
import { platform } from 'node:os';

const isWindows = platform() === 'win32';
const CLEAR_LINE = '\r\x1b[K';
const GREEN = '\x1b[32m';
const CYAN = '\x1b[36m';
const YELLOW = '\x1b[33m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

async function waitForPort(port: number, maxWait: number = 10000): Promise<boolean> {
  const startTime = Date.now();
  while (Date.now() - startTime < maxWait) {
    const available = await new Promise<boolean>((resolve) => {
      const tester = createConnection({ port, host: 'localhost' })
        .on('error', () => resolve(false))
        .on('connect', () => {
          tester.destroy();
          resolve(true);
        });
    });
    if (available) return true;
    await new Promise(r => setTimeout(r, 200));
  }
  return false;
}

async function findAvailablePort(startPort: number, maxAttempts: number = 10): Promise<number> {
  for (let port = startPort; port < startPort + maxAttempts; port++) {
    const inUse = await new Promise<boolean>((resolve) => {
      const tester = createConnection({ port, host: 'localhost' })
        .on('error', () => resolve(false))
        .on('connect', () => {
          tester.destroy();
          resolve(true);
        });
    });
    if (!inUse) return port;
  }
  return startPort;
}

function printBanner(serverPort: number, appPort: number) {
  console.log('\n' + '='.repeat(60));
  console.log(`${BOLD}${GREEN}  OODA Agent Development Server${RESET}`);
  console.log('='.repeat(60));
  console.log();
  console.log(`  ${CYAN}Backend Server:${RESET}  http://localhost:${serverPort}`);
  console.log(`  ${CYAN}Frontend App:${RESET}    http://localhost:${appPort}`);
  console.log(`  ${CYAN}WebSocket:${RESET}       ws://localhost:${serverPort}/ws`);
  console.log(`  ${CYAN}Health Check:${RESET}    http://localhost:${serverPort}/health`);
  console.log();
  console.log('='.repeat(60));
  console.log(`${YELLOW}  Press Ctrl+C to stop all services${RESET}`);
  console.log('='.repeat(60) + '\n');
}

async function main() {
  const args = process.argv.slice(2);
  const serverPort = args.includes('--server-port') 
    ? parseInt(args[args.indexOf('--server-port') + 1]) 
    : await findAvailablePort(3000);
  const appPort = args.includes('--app-port')
    ? parseInt(args[args.indexOf('--app-port') + 1])
    : 5173;

  console.log(`${CYAN}[Start] Starting OODA Agent development servers...${RESET}\n`);

  const serverEnv = { ...process.env, PORT: String(serverPort) };
  
  const server = spawn('npm', ['run', 'dev:server'], {
    cwd: process.cwd(),
    shell: isWindows,
    env: serverEnv,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  const app = spawn('npm', ['run', 'dev:app'], {
    cwd: process.cwd(),
    shell: isWindows,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let serverReady = false;
  let appReady = false;
  let serverOutput = '';
  let appOutput = '';

  server.stdout.on('data', (data) => {
    const output = data.toString();
    serverOutput += output;
    process.stdout.write(`${CLEAR_LINE}[Server] ${output.trim()}\n`);
    if (output.includes('Server running on port') && !serverReady) {
      serverReady = true;
      checkReady();
    }
  });

  server.stderr.on('data', (data) => {
    process.stderr.write(`${CLEAR_LINE}[Server Error] ${data.toString().trim()}\n`);
  });

  app.stdout.on('data', (data) => {
    const output = data.toString();
    appOutput += output;
    process.stdout.write(`${CLEAR_LINE}[App] ${output.trim()}\n`);
    if (output.includes('Local:') && !appReady) {
      appReady = true;
      checkReady();
    }
  });

  app.stderr.on('data', (data) => {
    process.stderr.write(`${CLEAR_LINE}[App Error] ${data.toString().trim()}\n`);
  });

  function checkReady() {
    if (serverReady && appReady) {
      const actualAppPort = appPort;
      printBanner(serverPort, actualAppPort);
    }
  }

  const cleanup = () => {
    console.log(`\n${YELLOW}[Stop] Shutting down servers...${RESET}`);
    server.kill();
    app.kill();
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
  process.on('exit', cleanup);

  server.on('close', (code) => {
    if (code !== 0 && code !== null) {
      console.log(`${YELLOW}[Server] Process exited with code ${code}${RESET}`);
    }
  });

  app.on('close', (code) => {
    if (code !== 0 && code !== null) {
      console.log(`${YELLOW}[App] Process exited with code ${code}${RESET}`);
    }
  });
}

main().catch((error) => {
  console.error('[Fatal]', error);
  process.exit(1);
});

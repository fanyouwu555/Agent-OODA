import { spawn, execSync } from 'node:child_process';
import { createConnection } from 'node:net';
import { platform } from 'node:os';

const isWindows = platform() === 'win32';
const CLEAR_LINE = '\r\x1b[K';
const GREEN = '\x1b[32m';
const CYAN = '\x1b[36m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

function openBrowser(url: string): void {
  console.log(`${CYAN}[Browser] Opening ${url}...${RESET}`);
  
  try {
    if (isWindows) {
      spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' });
    } else if (platform() === 'darwin') {
      spawn('open', [url], { detached: true, stdio: 'ignore' });
    } else {
      spawn('xdg-open', [url], { detached: true, stdio: 'ignore' });
    }
  } catch (e) {
    console.log(`${YELLOW}[Browser] Failed to open browser automatically${RESET}`);
  }
}

function killProcessOnPort(port: number): boolean {
  console.log(`${YELLOW}[Port ${port}] Checking for existing process...${RESET}`);
  
  try {
    if (isWindows) {
      const cmd = `netstat -ano | findstr :${port}`;
      const result = execSync(cmd, { encoding: 'utf-8', shell: true });
      
      const lines = result.trim().split('\n');
      for (const line of lines) {
        const match = line.match(/LISTENING\s+(\d+)/);
        if (match) {
          const pid = match[1];
          console.log(`${YELLOW}[Port ${port}] Found process PID: ${pid}, terminating...${RESET}`);
          try {
            execSync(`taskkill /PID ${pid} /F`, { encoding: 'utf-8', shell: true });
            console.log(`${GREEN}[Port ${port}] Process terminated successfully${RESET}`);
            return true;
          } catch (e) {
            console.log(`${YELLOW}[Port ${port}] Failed to terminate process, trying next...${RESET}`);
          }
        }
      }
    } else {
      const cmd = `lsof -ti:${port}`;
      const result = execSync(cmd, { encoding: 'utf-8' });
      const pids = result.trim().split('\n').filter(p => p);
      
      for (const pid of pids) {
        console.log(`${YELLOW}[Port ${port}] Found process PID: ${pid}, terminating...${RESET}`);
        try {
          execSync(`kill -9 ${pid}`, { encoding: 'utf-8' });
          console.log(`${GREEN}[Port ${port}] Process terminated successfully${RESET}`);
          return true;
        } catch (e) {
          console.log(`${YELLOW}[Port ${port}] Failed to terminate process, trying next...${RESET}`);
        }
      }
    }
  } catch (e) {
    console.log(`${CYAN}[Port ${port}] No process found on this port${RESET}`);
  }
  
  return false;
}

async function isPortInUse(port: number): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const tester = createConnection({ port, host: 'localhost' })
      .on('error', () => resolve(false))
      .on('connect', () => {
        tester.destroy();
        resolve(true);
      });
  });
}

async function ensurePortAvailable(port: number, maxRetries: number = 3): Promise<void> {
  const isInUse = await isPortInUse(port);
  
  if (isInUse) {
    console.log(`${YELLOW}[Port ${port}] Port is in use, attempting to free it...${RESET}`);
    for (let i = 0; i < maxRetries; i++) {
      const killed = killProcessOnPort(port);
      if (killed) {
        await new Promise(r => setTimeout(r, 1000));
        
        const stillInUse = await isPortInUse(port);
        
        if (!stillInUse) {
          console.log(`${GREEN}[Port ${port}] Port is now available${RESET}`);
          return;
        }
      }
    }
    throw new Error(`Failed to free port ${port} after ${maxRetries} attempts`);
  } else {
    console.log(`${GREEN}[Port ${port}] Port is available${RESET}`);
  }
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
  const serverPortArg = args.includes('--server-port') 
    ? parseInt(args[args.indexOf('--server-port') + 1]) 
    : 3000;
  const appPortArg = args.includes('--app-port')
    ? parseInt(args[args.indexOf('--app-port') + 1])
    : 5174;

  console.log(`${CYAN}[Start] Starting OODA Agent development servers...${RESET}\n`);

  console.log(`${CYAN}[Check] Checking ports availability...${RESET}`);
  await ensurePortAvailable(serverPortArg);
  await ensurePortAvailable(appPortArg);
  console.log();

  const serverPort = serverPortArg;
  const appPort = appPortArg;

  const serverEnv = { ...process.env, PORT: String(serverPort) };
  
  const appEnv = { 
    ...process.env, 
    VITE_API_PORT: String(serverPort),
    PORT: String(appPort)
  };
  
  const server = spawn('npm', ['run', 'dev:server'], {
    cwd: process.cwd(),
    shell: isWindows,
    env: serverEnv,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  const app = spawn('npm', ['run', 'dev:app'], {
    cwd: process.cwd(),
    shell: isWindows,
    env: appEnv,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let serverReady = false;
  let appReady = false;
  let browserOpened = false;
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
      
      if (!browserOpened) {
        browserOpened = true;
        setTimeout(() => {
          openBrowser(`http://localhost:${actualAppPort}`);
        }, 500);
      }
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

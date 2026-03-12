// packages/server/src/middleware/logger.ts
import { MiddlewareHandler } from 'hono';
import { logger } from '../utils/logger';

export const requestLogger: MiddlewareHandler = async (c, next) => {
  const start = Date.now();
  const method = c.req.method;
  const url = c.req.url;
  
  // Get request headers
  const headers: Record<string, string> = {};
  c.req.raw.headers.forEach((value, key) => {
    headers[key] = value;
  });

  // Get request body for non-GET requests
  let body: unknown = undefined;
  if (method !== 'GET' && method !== 'HEAD') {
    try {
      const clonedReq = c.req.raw.clone();
      const contentType = headers['content-type'] || '';
      
      if (contentType.includes('application/json')) {
        body = await clonedReq.json();
      } else if (contentType.includes('text/')) {
        body = await clonedReq.text();
      } else if (contentType.includes('application/x-www-form-urlencoded')) {
        const formData = await clonedReq.formData();
        body = Object.fromEntries(formData.entries());
      }
    } catch {
      // Failed to parse body, ignore
    }
  }

  // Log request
  logger.logRequest(method, url, headers, body);

  // Continue to next middleware/handler
  await next();

  // Calculate duration
  const duration = Date.now() - start;
  const status = c.res.status;

  // Try to get response body
  let responseBody: unknown = undefined;
  try {
    const clonedRes = c.res.clone();
    const contentType = clonedRes.headers.get('content-type') || '';
    
    if (contentType.includes('application/json')) {
      responseBody = await clonedRes.json();
    } else if (contentType.includes('text/')) {
      responseBody = await clonedRes.text();
    }
  } catch {
    // Failed to parse response body, ignore
  }

  // Log response
  logger.logResponse(method, url, status, duration, responseBody);
};

// SSE specific logger middleware
export const sseLogger: MiddlewareHandler = async (c, next) => {
  const sessionId = c.req.param('sessionId') || 'unknown';
  const start = Date.now();
  
  logger.info('SSE', `Starting SSE connection for session ${sessionId}`);
  
  await next();
  
  const duration = Date.now() - start;
  logger.info('SSE', `SSE connection ended for session ${sessionId} (${duration}ms)`);
};

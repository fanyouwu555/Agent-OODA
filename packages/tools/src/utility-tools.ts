import { z } from 'zod';
import { Tool } from '@ooda-agent/core';

export const calculatorTool: Tool<{ expression: string }, { result: number; expression: string }> = {
  name: 'calculator',
  description: '计算数学表达式，支持加减乘除、幂运算、开方、三角函数等',
  schema: z.object({
    expression: z.string().describe('数学表达式，如 "2+3*4", "sqrt(16)", "sin(3.14/2)"'),
  }),
  permissions: [],
  
  async execute(input) {
    const { expression } = input;
    
    const sanitized = expression
      .replace(/[^0-9+\-*/().^%sincotaglqrtbexp\s]/gi, '')
      .replace(/sqrt/gi, 'Math.sqrt')
      .replace(/sin/gi, 'Math.sin')
      .replace(/cos/gi, 'Math.cos')
      .replace(/tan/gi, 'Math.tan')
      .replace(/log/gi, 'Math.log')
      .replace(/exp/gi, 'Math.exp')
      .replace(/abs/gi, 'Math.abs')
      .replace(/floor/gi, 'Math.floor')
      .replace(/ceil/gi, 'Math.ceil')
      .replace(/round/gi, 'Math.round')
      .replace(/pow/gi, 'Math.pow')
      .replace(/PI/gi, 'Math.PI')
      .replace(/E/gi, 'Math.E')
      .replace(/\^/g, '**');
    
    try {
      const result = Function(`"use strict"; return (${sanitized})`)();
      
      if (typeof result !== 'number' || !isFinite(result)) {
        throw new Error('计算结果无效');
      }
      
      return {
        result: Math.round(result * 1000000000) / 1000000000,
        expression: input.expression,
      };
    } catch (error) {
      throw new Error(`计算错误: ${(error as Error).message}`);
    }
  }
};

// 注意: weather 工具已移动到 realtime-data-tools.ts
// 请使用 get_weather 工具查询天气

export const translateTool: Tool<{ text: string; from?: string; to?: string }, { 
  original: string; 
  translated: string; 
  from: string; 
  to: string;
}> = {
  name: 'translate',
  description: '翻译文本，支持多种语言',
  schema: z.object({
    text: z.string().describe('要翻译的文本'),
    from: z.string().optional().describe('源语言代码，如 "zh", "en"，默认自动检测'),
    to: z.string().optional().describe('目标语言代码，如 "zh", "en"，默认中文'),
  }),
  permissions: [{ type: 'network', pattern: '**' }],
  
  async execute(input) {
    const { text, from, to } = input;
    const targetLang = to || 'zh';
    const sourceLang = from || 'auto';
    
    try {
      const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${sourceLang}|${targetLang}`;
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`翻译失败: ${response.status}`);
      }
      
      const data = await response.json() as {
        responseStatus?: number;
        responseData?: {
          translatedText?: string;
        };
        matches?: Array<{ translation: string; quality: number }>;
      };
      
      if (data.responseStatus !== 200 || !data.responseData?.translatedText) {
        throw new Error('翻译服务返回错误');
      }
      
      return {
        original: text,
        translated: data.responseData.translatedText,
        from: sourceLang,
        to: targetLang,
      };
    } catch (error) {
      throw new Error(`翻译失败: ${(error as Error).message}`);
    }
  }
};

export const timerTool: Tool<{ action: 'start' | 'check' | 'stop'; duration?: number; timerId?: string }, { 
  message: string; 
  timerId?: string;
  remaining?: number;
  elapsed?: number;
}> = {
  name: 'timer',
  description: '计时器工具，可以启动倒计时、检查剩余时间、停止计时',
  schema: z.object({
    action: z.enum(['start', 'check', 'stop']).describe('操作类型'),
    duration: z.number().optional().describe('倒计时秒数（start时需要）'),
    timerId: z.string().optional().describe('计时器ID，不提供则使用默认计时器'),
  }),
  permissions: [],
  
  async execute(input) {
    const timers = (global as any).__timers || ((global as any).__timers = new Map());
    const id = input.timerId || 'default';
    
    switch (input.action) {
      case 'start': {
        if (!input.duration || input.duration <= 0) {
          throw new Error('请提供有效的倒计时秒数');
        }
        
        const endTime = Date.now() + input.duration * 1000;
        timers.set(id, { endTime, duration: input.duration });
        
        const minutes = Math.floor(input.duration / 60);
        const seconds = input.duration % 60;
        const timeStr = minutes > 0 ? `${minutes}分${seconds}秒` : `${seconds}秒`;
        
        return {
          message: `计时器已启动，${timeStr}后到期`,
          timerId: id,
          remaining: input.duration,
        };
      }
      
      case 'check': {
        const timer = timers.get(id);
        if (!timer) {
          return { message: '没有找到该计时器', timerId: id };
        }
        
        const remaining = Math.max(0, Math.ceil((timer.endTime - Date.now()) / 1000));
        const elapsed = timer.duration - remaining;
        
        if (remaining === 0) {
          return {
            message: '计时器已到期！',
            timerId: id,
            remaining: 0,
            elapsed,
          };
        }
        
        const minutes = Math.floor(remaining / 60);
        const seconds = remaining % 60;
        const timeStr = minutes > 0 ? `${minutes}分${seconds}秒` : `${seconds}秒`;
        
        return {
          message: `剩余时间: ${timeStr}`,
          timerId: id,
          remaining,
          elapsed,
        };
      }
      
      case 'stop': {
        const timer = timers.get(id);
        if (!timer) {
          return { message: '没有找到该计时器', timerId: id };
        }
        
        const elapsed = Math.floor((Date.now() - (timer.endTime - timer.duration * 1000)) / 1000);
        timers.delete(id);
        
        return {
          message: `计时器已停止，已计时 ${elapsed} 秒`,
          timerId: id,
          elapsed,
        };
      }
      
      default:
        throw new Error('未知操作');
    }
  }
};

export const currencyTool: Tool<{ amount: number; from: string; to: string }, { 
  amount: number; 
  from: string; 
  to: string; 
  rate: number;
  result: number;
  updated: string;
}> = {
  name: 'currency',
  description: '货币汇率转换',
  schema: z.object({
    amount: z.number().describe('金额'),
    from: z.string().describe('源货币代码，如 USD, CNY, EUR'),
    to: z.string().describe('目标货币代码，如 USD, CNY, EUR'),
  }),
  permissions: [{ type: 'network', pattern: '**' }],
  
  async execute(input) {
    const { amount, from, to } = input;
    
    try {
      const url = `https://api.exchangerate-api.com/v4/latest/${from.toUpperCase()}`;
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`汇率查询失败: ${response.status}`);
      }
      
      const data = await response.json() as {
        rates?: Record<string, number>;
        date?: string;
      };
      
      const rate = data.rates?.[to.toUpperCase()];
      if (!rate) {
        throw new Error(`不支持的货币: ${to}`);
      }
      
      const result = amount * rate;
      
      return {
        amount,
        from: from.toUpperCase(),
        to: to.toUpperCase(),
        rate,
        result: Math.round(result * 100) / 100,
        updated: data.date || new Date().toISOString().split('T')[0],
      };
    } catch (error) {
      throw new Error(`汇率转换失败: ${(error as Error).message}`);
    }
  }
};

export const uuidTool: Tool<{ count?: number }, { uuids: string[]; count: number }> = {
  name: 'uuid',
  description: '生成UUID（通用唯一标识符）',
  schema: z.object({
    count: z.number().optional().describe('生成数量，默认1个'),
  }),
  permissions: [],
  
  async execute(input) {
    const count = input.count || 1;
    const uuids: string[] = [];
    
    for (let i = 0; i < Math.min(count, 100); i++) {
      const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      });
      uuids.push(uuid);
    }
    
    return { uuids, count: uuids.length };
  }
};

export const base64Tool: Tool<{ action: 'encode' | 'decode'; text: string }, { 
  action: string; 
  input: string; 
  output: string;
}> = {
  name: 'base64',
  description: 'Base64 编码和解码',
  schema: z.object({
    action: z.enum(['encode', 'decode']).describe('编码或解码'),
    text: z.string().describe('要处理的文本'),
  }),
  permissions: [],
  
  async execute(input) {
    const { action, text } = input;
    
    try {
      let output: string;
      
      if (action === 'encode') {
        output = Buffer.from(text, 'utf-8').toString('base64');
      } else {
        output = Buffer.from(text, 'base64').toString('utf-8');
      }
      
      return {
        action,
        input: text,
        output,
      };
    } catch (error) {
      throw new Error(`Base64 ${action === 'encode' ? '编码' : '解码'}失败: ${(error as Error).message}`);
    }
  }
};

export const hashTool: Tool<{ text: string; algorithm?: 'md5' | 'sha1' | 'sha256' }, { 
  input: string; 
  algorithm: string; 
  hash: string;
}> = {
  name: 'hash',
  description: '计算文本的哈希值',
  schema: z.object({
    text: z.string().describe('要计算哈希的文本'),
    algorithm: z.enum(['md5', 'sha1', 'sha256']).optional().describe('哈希算法，默认sha256'),
  }),
  permissions: [],
  
  async execute(input) {
    const { text, algorithm = 'sha256' } = input;
    
    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(text);
      
      let hashBuffer: ArrayBuffer;
      
      if (algorithm === 'md5') {
        const crypto = await import('crypto');
        const hash = crypto.createHash('md5');
        hash.update(text);
        return {
          input: text,
          algorithm: 'md5',
          hash: hash.digest('hex'),
        };
      }
      
      hashBuffer = await crypto.subtle.digest(
        algorithm.toUpperCase().replace('SHA', 'SHA-'),
        data
      );
      
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      
      return {
        input: text,
        algorithm,
        hash,
      };
    } catch (error) {
      throw new Error(`哈希计算失败: ${(error as Error).message}`);
    }
  }
};

export const randomNumberTool: Tool<{ min?: number; max?: number; count?: number; integer?: boolean }, { 
  numbers: number[]; 
  min: number; 
  max: number;
}> = {
  name: 'random_number',
  description: '生成随机数',
  schema: z.object({
    min: z.number().optional().describe('最小值，默认0'),
    max: z.number().optional().describe('最大值，默认100'),
    count: z.number().optional().describe('生成数量，默认1'),
    integer: z.boolean().optional().describe('是否为整数，默认true'),
  }),
  permissions: [],
  
  async execute(input) {
    const min = input.min ?? 0;
    const max = input.max ?? 100;
    const count = Math.min(input.count ?? 1, 100);
    const integer = input.integer ?? true;
    
    const numbers: number[] = [];
    
    for (let i = 0; i < count; i++) {
      const rand = Math.random() * (max - min) + min;
      numbers.push(integer ? Math.floor(rand) : Math.round(rand * 1000000) / 1000000);
    }
    
    return { numbers, min, max };
  }
};

export const colorTool: Tool<{ input: string; format?: 'hex' | 'rgb' | 'hsl' }, { 
  input: string; 
  hex: string; 
  rgb: string; 
  hsl: string;
}> = {
  name: 'color',
  description: '颜色格式转换，支持 HEX、RGB、HSL 格式互转',
  schema: z.object({
    input: z.string().describe('颜色值，如 "#ff0000", "rgb(255,0,0)", "hsl(0,100%,50%)"'),
    format: z.enum(['hex', 'rgb', 'hsl']).optional().describe('输出格式，默认hex'),
  }),
  permissions: [],
  
  async execute(input) {
    const { input: colorInput, format = 'hex' } = input;
    
    let r = 0, g = 0, b = 0;
    
    if (colorInput.startsWith('#')) {
      const hex = colorInput.slice(1);
      if (hex.length === 3) {
        r = parseInt(hex[0] + hex[0], 16);
        g = parseInt(hex[1] + hex[1], 16);
        b = parseInt(hex[2] + hex[2], 16);
      } else if (hex.length === 6) {
        r = parseInt(hex.slice(0, 2), 16);
        g = parseInt(hex.slice(2, 4), 16);
        b = parseInt(hex.slice(4, 6), 16);
      }
    } else if (colorInput.startsWith('rgb')) {
      const match = colorInput.match(/rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/i);
      if (match) {
        r = parseInt(match[1]);
        g = parseInt(match[2]);
        b = parseInt(match[3]);
      }
    } else if (colorInput.startsWith('hsl')) {
      const match = colorInput.match(/hsl\s*\(\s*(\d+)\s*,\s*(\d+)%?\s*,\s*(\d+)%?\s*\)/i);
      if (match) {
        const h = parseInt(match[1]) / 360;
        const s = parseInt(match[2]) / 100;
        const l = parseInt(match[3]) / 100;
        
        const hue2rgb = (p: number, q: number, t: number) => {
          if (t < 0) t += 1;
          if (t > 1) t -= 1;
          if (t < 1/6) return p + (q - p) * 6 * t;
          if (t < 1/2) return q;
          if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
          return p;
        };
        
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = Math.round(hue2rgb(p, q, h + 1/3) * 255);
        g = Math.round(hue2rgb(p, q, h) * 255);
        b = Math.round(hue2rgb(p, q, h - 1/3) * 255);
      }
    }
    
    const toHSL = (r: number, g: number, b: number) => {
      r /= 255; g /= 255; b /= 255;
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      let h = 0, s = 0, l = (max + min) / 2;
      
      if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
          case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
          case g: h = ((b - r) / d + 2) / 6; break;
          case b: h = ((r - g) / d + 4) / 6; break;
        }
      }
      
      return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
    };
    
    const hsl = toHSL(r, g, b);
    
    return {
      input: colorInput,
      hex: `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`,
      rgb: `rgb(${r}, ${g}, ${b})`,
      hsl: `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`,
    };
  }
};

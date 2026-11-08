import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';
import { AppError } from '../utils/errors';

// Load the repo-root .env first (normal usage), then server/.env as an override
// for developers who prefer to keep the file next to the server package.
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().max(65535).default(5000),
  CLIENT_URL: z.string().url().default('http://localhost:5173'),

  DEEPGRAM_API_KEY: z
    .string()
    .trim()
    .min(20, 'DEEPGRAM_API_KEY looks too short to be a real key')
    .refine(
      (value) => !value.toLowerCase().startsWith('your_'),
      'DEEPGRAM_API_KEY still contains the .env.example placeholder',
    ),
  GROQ_API_KEY: z
    .string()
    .trim()
    .min(20, 'GROQ_API_KEY looks too short to be a real key')
    .refine(
      (value) => !value.toLowerCase().startsWith('your_'),
      'GROQ_API_KEY still contains the .env.example placeholder',
    ),

  DEEPGRAM_MODEL: z.string().trim().default('nova-3'),
  DEEPGRAM_LANGUAGE: z.string().trim().default('en-US'),
  DEEPGRAM_ENDPOINTING_MS: z.coerce.number().int().min(100).max(2000).default(300),
  DEEPGRAM_UTTERANCE_END_MS: z.coerce.number().int().min(500).max(5000).default(1000),
  DEEPGRAM_CONNECT_TIMEOUT_MS: z.coerce.number().int().min(2000).max(30000).default(10000),

  GROQ_MODEL: z.string().trim().default('openai/gpt-oss-120b'),
  GROQ_MAX_TOKENS: z.coerce.number().int().min(64).max(1024).default(700),
  GROQ_TEMPERATURE: z.coerce.number().min(0).max(2).default(0.3),
  GROQ_TIMEOUT_MS: z.coerce.number().int().min(5000).max(120000).default(30000),

  QUESTION_SILENCE_MS: z.coerce.number().int().min(300).max(5000).default(900),
  QUESTION_MIN_WORDS: z.coerce.number().int().min(2).max(20).default(4),
  QUESTION_MIN_FOLLOWUP_WORDS: z.coerce.number().int().min(1).max(10).default(1),
  DUPLICATE_WINDOW_MS: z.coerce.number().int().min(5000).max(120000).default(30000),
  DUPLICATE_SIMILARITY: z.coerce.number().min(0.5).max(1).default(0.82),

  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  clientUrl: string;
  logLevel: string;
  deepgram: {
    apiKey: string;
    model: string;
    language: string;
    sampleRate: 16000;
    endpointingMs: number;
    utteranceEndMs: number;
    connectTimeoutMs: number;
  };
  groq: {
    apiKey: string;
    model: string;
    maxTokens: number;
    temperature: number;
    timeoutMs: number;
    baseUrl: string;
  };
  question: {
    silenceMs: number;
    minWords: number;
    minFollowUpWords: number;
    duplicateWindowMs: number;
    duplicateSimilarity: number;
  };
}

const SETUP_HELP = [
  '',
  'How to fix:',
  '  1. Copy .env.example to .env in the repository root.',
  '  2. Add a free Deepgram API key (https://console.deepgram.com) and Groq key (https://console.groq.com/keys).',
  '  3. Restart the server.',
  '',
].join('\n');

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || 'env'}: ${issue.message}`)
      .join('\n');
    throw new AppError(
      'CONFIG_INVALID',
      `Invalid environment configuration:\n${details}\n${SETUP_HELP}`,
      { fatal: true },
    );
  }

  const value = parsed.data;
  return {
    nodeEnv: value.NODE_ENV,
    port: value.PORT,
    clientUrl: value.CLIENT_URL.replace(/\/+$/, ''),
    logLevel: value.LOG_LEVEL,
    deepgram: {
      apiKey: value.DEEPGRAM_API_KEY,
      model: value.DEEPGRAM_MODEL,
      language: value.DEEPGRAM_LANGUAGE,
      sampleRate: 16000,
      endpointingMs: value.DEEPGRAM_ENDPOINTING_MS,
      utteranceEndMs: value.DEEPGRAM_UTTERANCE_END_MS,
      connectTimeoutMs: value.DEEPGRAM_CONNECT_TIMEOUT_MS,
    },
    groq: {
      apiKey: value.GROQ_API_KEY,
      model: value.GROQ_MODEL,
      maxTokens: value.GROQ_MAX_TOKENS,
      temperature: value.GROQ_TEMPERATURE,
      timeoutMs: value.GROQ_TIMEOUT_MS,
      baseUrl: 'https://api.groq.com/openai/v1/chat/completions',
    },
    question: {
      silenceMs: value.QUESTION_SILENCE_MS,
      minWords: value.QUESTION_MIN_WORDS,
      minFollowUpWords: value.QUESTION_MIN_FOLLOWUP_WORDS,
      duplicateWindowMs: value.DUPLICATE_WINDOW_MS,
      duplicateSimilarity: value.DUPLICATE_SIMILARITY,
    },
  };
}

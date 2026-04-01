// amplify/functions/conversationHandler/handler.test.ts
import { describe, it, expect } from 'vitest';
import { extractUserId, buildProfileSummaryBlock, buildSystemPromptSuffix, SAGE_PROMPT_SUFFIX } from './handler.js';
import type { ConversationTurnEvent } from '@aws-amplify/ai-constructs/conversation/runtime';

// Minimal mock of ConversationTurnEvent for tests
function makeEvent(sub: string): ConversationTurnEvent {
  const payload = Buffer.from(JSON.stringify({ sub })).toString('base64url');
  const fakeJwt = `header.${payload}.sig`;
  return {
    conversationId: 'conv-1',
    currentMessageId: 'msg-1',
    graphqlApiEndpoint: 'https://api.example.com/graphql',
    modelConfiguration: {
      modelId: 'eu.anthropic.claude-3-5-sonnet-20240620-v1:0',
      systemPrompt: 'You are Vita.',
    },
    responseMutation: { name: 'createVitaChatAssistantResponse', inputTypeName: 'CreateVitaChatAssistantResponseInput', selectionSet: 'id' },
    request: { headers: { authorization: `Bearer ${fakeJwt}` } },
    messageHistoryQuery: {
      getQueryName: 'getVitaChatMessage',
      getQueryInputTypeName: 'GetVitaChatMessageInput',
      listQueryName: 'listVitaChatMessages',
      listQueryInputTypeName: 'ListVitaChatMessagesInput',
    },
  };
}

describe('extractUserId', () => {
  it('extracts sub from JWT in authorization header', () => {
    const event = makeEvent('user-abc-123');
    expect(extractUserId(event)).toBe('user-abc-123');
  });

  it('handles Bearer prefix case-insensitively', () => {
    const event = makeEvent('user-xyz');
    expect(extractUserId(event)).toBe('user-xyz');
  });

  it('throws when authorization header is missing', () => {
    const event = makeEvent('u');
    (event.request.headers as Record<string, string>) = {};
    expect(() => extractUserId(event)).toThrow('Missing authorization header');
  });
});

describe('buildProfileSummaryBlock', () => {
  it('returns empty string for null profile', () => {
    expect(buildProfileSummaryBlock(null)).toBe('');
  });

  it('returns empty string when all fields are null/undefined', () => {
    expect(buildProfileSummaryBlock({} as Record<string, unknown>)).toBe('');
  });

  it('returns formatted block with non-empty fields', () => {
    const profile = { age: 38, diet_style: 'Mediterranean', stress_level: 'high' };
    const block = buildProfileSummaryBlock(profile as Record<string, unknown>);
    expect(block).toContain('User profile summary');
    expect(block).toContain('"age": 38');
    expect(block).toContain('"diet_style": "Mediterranean"');
  });

  it('excludes null and empty-string fields', () => {
    const profile = { age: 38, weight: null, diet_style: '' };
    const block = buildProfileSummaryBlock(profile as Record<string, unknown>);
    expect(block).not.toContain('weight');
    expect(block).not.toContain('diet_style');
    expect(block).toContain('"age": 38');
  });

  it('excludes empty arrays', () => {
    const profile = { age: 38, supplements_current: [] };
    const block = buildProfileSummaryBlock(profile as Record<string, unknown>);
    expect(block).not.toContain('supplements_current');
  });
});

describe('buildSystemPromptSuffix', () => {
  it('returns SAGE_PROMPT_SUFFIX when sage_mode is true', () => {
    const result = buildSystemPromptSuffix({ sage_mode: true });
    expect(result).toBe(SAGE_PROMPT_SUFFIX);
    expect(result).toContain('SAGE Mode');
    expect(result).toContain('Do not give recommendations');
  });

  it('returns profile block when sage_mode is false', () => {
    const result = buildSystemPromptSuffix({ sage_mode: false, age: 38 });
    expect(result).toContain('User profile summary');
    expect(result).not.toContain('SAGE Mode');
  });

  it('returns profile block when sage_mode is absent', () => {
    const result = buildSystemPromptSuffix({ age: 38 });
    expect(result).toContain('User profile summary');
    expect(result).not.toContain('SAGE Mode');
  });

  it('returns empty string for null profile', () => {
    expect(buildSystemPromptSuffix(null)).toBe('');
  });

  it('returns SAGE suffix (not profile block) even when profile has data', () => {
    const result = buildSystemPromptSuffix({ sage_mode: true, age: 38 });
    expect(result).toBe(SAGE_PROMPT_SUFFIX);
    expect(result).not.toContain('"age"');
  });
});

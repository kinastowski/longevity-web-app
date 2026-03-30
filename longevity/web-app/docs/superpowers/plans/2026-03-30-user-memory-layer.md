# User Memory Layer — Passive Path (MVP) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a passive user memory system that extracts profile facts from conversations, stores them in DynamoDB, and injects them into each expert's system prompt for natural personalisation.

**Architecture:** Six per-expert conversation handler Lambdas (shared code, `EXPERT_ID` env var) intercept the Amplify conversation event, inject a profile summary into the static system prompt, delegate to Amplify's built-in `handleConversationTurnEvent`, then fire-and-forget a separate `profileExtractor` Lambda. The extractor calls Bedrock for extraction, merges into `UserProfile`, and writes an audit record to `ConversationMemory`. Both models live in DynamoDB via Amplify Data.

**Tech Stack:** AWS Amplify Gen 2, TypeScript, `@aws-amplify/ai-constructs/conversation/runtime` (handleConversationTurnEvent + createExecutableTool), `@aws-sdk/client-bedrock-agent-runtime` (direct KB search), `@aws-sdk/client-lambda` (async invocation), `aws-amplify` (generateClient IAM), Vitest (unit tests)

---

## Key Implementation Notes

- **`handleConversationTurnEvent`** from `@aws-amplify/ai-constructs/conversation/runtime` handles everything: message history fetching, Bedrock call (with tool loop), response mutation. The custom handler only modifies the `systemPrompt` in `event.modelConfiguration` before delegating.
- **KB search** is provided as an `ExecutableTool` using `createExecutableTool` + `BedrockAgentRuntimeClient.RetrieveCommand` directly (not via AppSync data tool). `a.ai.dataTool()` is removed from all conversation definitions.
- **`systemPrompt`** stays in schema definitions — Amplify puts it in `event.modelConfiguration.systemPrompt` which the handler enhances with the profile block before delegating.
- **Extractor message fetch** uses the user's JWT (forwarded in the async payload) to query AppSync with owner auth. Exact GraphQL field names for message content must be verified against the generated schema after first sandbox run (see Task 11 note).
- **All `aiModel`** entries are updated to `{ resourcePath: "eu.anthropic.claude-3-5-sonnet-20240620-v1:0" }` for consistent EU cross-region inference. pulseChat previously used Haiku — this is a temporary downgrade for MVP consistency.

---

## File Map

| Action | Path | Responsibility |
|---|---|---|
| Create | `amplify/functions/conversationHandler/handler.ts` | Shared handler: profile fetch, system prompt injection, tool, extractor invocation |
| Create | `amplify/functions/conversationHandler/handler.test.ts` | Unit tests for pure functions |
| Create | `amplify/functions/vitaConversationHandler/resource.ts` | defineFunction (EXPERT_ID=vita) |
| Create | `amplify/functions/synapseConversationHandler/resource.ts` | defineFunction (EXPERT_ID=synapse) |
| Create | `amplify/functions/glowConversationHandler/resource.ts` | defineFunction (EXPERT_ID=glow) |
| Create | `amplify/functions/dreamerConversationHandler/resource.ts` | defineFunction (EXPERT_ID=dreamer) |
| Create | `amplify/functions/pulseConversationHandler/resource.ts` | defineFunction (EXPERT_ID=pulse) |
| Create | `amplify/functions/cipherConversationHandler/resource.ts` | defineFunction (EXPERT_ID=cipher) |
| Create | `amplify/functions/profileExtractor/handler.ts` | Extraction: Bedrock call, merge, DynamoDB writes |
| Create | `amplify/functions/profileExtractor/handler.test.ts` | Unit tests for pure functions |
| Create | `amplify/functions/profileExtractor/resource.ts` | defineFunction |
| Modify | `amplify/data/resource.ts` | Add UserProfile + ConversationMemory models; wire handlers; remove dataTool entries |
| Modify | `amplify/backend.ts` | Register 7 Lambdas; add policies; inject env vars; remove walk-the-stack block |
| Modify | `package.json` | Add `@aws-sdk/client-bedrock-agent-runtime`, `vitest` |
| Create | `vitest.config.ts` | Vitest config scoped to amplify/ functions |

---

## Task 1: Install dependencies + Vitest setup

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`

- [ ] **Step 1: Add packages to package.json**

Open `package.json`. Add to `dependencies`:
```json
"@aws-sdk/client-bedrock-agent-runtime": "^3.828.0"
```
Add to `devDependencies`:
```json
"vitest": "^3.1.1"
```

- [ ] **Step 2: Install**

```bash
npm install
```

Expected: lock file updated, no errors.

- [ ] **Step 3: Create vitest.config.ts**

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['amplify/functions/**/*.test.ts'],
    environment: 'node',
  },
});
```

- [ ] **Step 4: Verify vitest runs**

```bash
npx vitest run
```

Expected: `No test files found` (no tests yet, but no error).

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "chore: add bedrock-agent-runtime and vitest for memory layer"
```

---

## Task 2: Add UserProfile and ConversationMemory models to schema

**Files:**
- Modify: `amplify/data/resource.ts`

No Lambda resource refs yet — those come in Task 9. This establishes the shape and lets TypeScript validate the model fields independently.

- [ ] **Step 1: Open amplify/data/resource.ts and add UserProfile model**

Insert after the `searchKnowledgeBase` block and before the first expert conversation (line ~24):

```typescript
  // ─────────────────────────────────────────────
  // USER PROFILE — DynamoDB via Amplify Data
  // Flat fields. Extraction returns individual keys; flat makes merge trivial.
  // Lambda allow.resource() entries added in Task 9.
  // ─────────────────────────────────────────────
  UserProfile: a
    .model({
      userId: a.string().required(),
      // physical
      age: a.integer(),
      weight: a.string(),
      diet_style: a.string(),
      supplements_current: a.string().array(),
      sleep_hours: a.float(),
      stress_level: a.string(),
      // psychological (flat)
      biggest_lever: a.string(),
      stress_sources: a.string().array(),
      motivation_type: a.string(),
      // sleep
      chronotype: a.string(),
      sleep_quality: a.string(),
      evening_routine: a.string(),
      // reserved domains (JSON blobs for future extraction)
      motion: a.string(),
      glow: a.string(),
      biomarkers: a.string(),
      // onboarding
      onboarding_progress: a.string(),
      // snapshot — previous profile version as JSON string
      profile_snapshot: a.string(),
    })
    .secondaryIndexes((idx) => [idx("userId")])
    .authorization((allow) => [allow.owner()]),

  // ─────────────────────────────────────────────
  // CONVERSATION MEMORY — audit log of extracted facts per turn
  // ─────────────────────────────────────────────
  ConversationMemory: a
    .model({
      userId: a.string().required(),
      expertId: a.string().required(),
      extractedFacts: a.string(),
      conversationId: a.string(),
    })
    .secondaryIndexes((idx) => [idx("userId")])
    .authorization((allow) => [allow.owner()]),
```

- [ ] **Step 2: Run TypeScript check**

```bash
cd amplify && npx tsc --noEmit && cd ..
```

Expected: no errors (Lambda refs will be added later).

- [ ] **Step 3: Commit**

```bash
git add amplify/data/resource.ts
git commit -m "feat: add UserProfile and ConversationMemory models to Amplify schema"
```

---

## Task 3: Create profileExtractor Lambda resource

**Files:**
- Create: `amplify/functions/profileExtractor/resource.ts`

- [ ] **Step 1: Create resource file**

```typescript
// amplify/functions/profileExtractor/resource.ts
import { defineFunction } from "@aws-amplify/backend";

export const profileExtractorFn = defineFunction({
  name: "profileExtractor",
  entry: "./handler.ts",
  timeoutSeconds: 60,
  memoryMB: 256,
});
```

- [ ] **Step 2: TypeScript check**

```bash
cd amplify && npx tsc --noEmit && cd ..
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add amplify/functions/profileExtractor/resource.ts
git commit -m "feat: add profileExtractor Lambda resource"
```

---

## Task 4: profileExtractor — TDD pure functions

**Files:**
- Create: `amplify/functions/profileExtractor/handler.test.ts`
- Create: `amplify/functions/profileExtractor/handler.ts` (pure functions only)

- [ ] **Step 1: Write the failing tests**

```typescript
// amplify/functions/profileExtractor/handler.test.ts
import { describe, it, expect } from 'vitest';
import { parseExtractionResponse, mergeProfile, buildExtractionPrompt } from './handler.js';

describe('parseExtractionResponse', () => {
  it('returns {} for empty JSON', () => {
    expect(parseExtractionResponse('{}')).toEqual({});
  });

  it('parses valid extraction JSON', () => {
    expect(parseExtractionResponse('{"age":38,"diet_style":"Mediterranean"}')).toEqual({
      age: 38,
      diet_style: 'Mediterranean',
    });
  });

  it('strips markdown code fences before parsing', () => {
    expect(parseExtractionResponse('```json\n{"age":38}\n```')).toEqual({ age: 38 });
  });

  it('returns {} for malformed JSON', () => {
    expect(parseExtractionResponse('not json')).toEqual({});
  });
});

describe('mergeProfile', () => {
  it('returns original when extracted is empty', () => {
    const existing = { age: 35, diet_style: 'Keto' };
    expect(mergeProfile(existing, {})).toEqual(existing);
  });

  it('overwrites fields present in extracted', () => {
    const existing = { age: 35, diet_style: 'Keto' };
    const result = mergeProfile(existing, { age: 38, sleep_hours: 6 });
    expect(result).toEqual({ age: 38, diet_style: 'Keto', sleep_hours: 6 });
  });

  it('ignores unknown keys not in UserProfile', () => {
    const existing = { age: 35 };
    const result = mergeProfile(existing, { age: 36, unknown_field: 'x' });
    expect(result).not.toHaveProperty('unknown_field');
  });

  it('does not set keys to null from extracted', () => {
    const existing = { age: 35, diet_style: 'Keto' };
    const result = mergeProfile(existing, { age: 38 });
    expect(result.diet_style).toBe('Keto');
  });
});

describe('buildExtractionPrompt', () => {
  it('includes conversation messages in prompt', () => {
    const messages = [
      { role: 'user' as const, content: "I'm 38 years old and eat Mediterranean." },
      { role: 'assistant' as const, content: 'Great, that is a healthy diet.' },
    ];
    const prompt = buildExtractionPrompt(messages);
    expect(prompt).toContain("I'm 38 years old");
    expect(prompt).toContain('Great, that is a healthy diet');
    expect(prompt).toContain('age, weight, diet_style');
  });

  it('returns JSON-only instruction', () => {
    const prompt = buildExtractionPrompt([]);
    expect(prompt).toContain('return {}');
    expect(prompt).toContain('JSON only');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run amplify/functions/profileExtractor/handler.test.ts
```

Expected: FAIL — `handler.js` not found.

- [ ] **Step 3: Create handler.ts with pure functions**

```typescript
// amplify/functions/profileExtractor/handler.ts
import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/api';
import {
  BedrockRuntimeClient,
  ConverseCommand,
} from '@aws-sdk/client-bedrock-runtime';
import type { Schema } from '../../data/resource.js';

// ─── Amplify Data client (IAM) — configured at module level ───
Amplify.configure({
  API: {
    GraphQL: {
      endpoint: process.env.AMPLIFY_DATA_GRAPHQL_ENDPOINT!,
      region: process.env.AWS_REGION ?? 'eu-west-1',
      defaultAuthMode: 'iam',
    },
  },
});
const dataClient = generateClient<Schema>({ authMode: 'iam' });

const bedrockClient = new BedrockRuntimeClient({
  region: process.env.AWS_REGION ?? 'eu-west-1',
});

const MODEL_ID = 'eu.anthropic.claude-3-5-sonnet-20240620-v1:0';

const EXTRACTABLE_KEYS = new Set([
  'age', 'weight', 'diet_style', 'supplements_current',
  'sleep_hours', 'stress_level', 'biggest_lever', 'stress_sources',
  'motivation_type', 'chronotype', 'sleep_quality', 'evening_routine',
]);

// ─── Types ───────────────────────────────────────────────────
export interface ExtractorPayload {
  userId: string;
  expertId: string;
  conversationId: string;
  graphqlApiEndpoint: string;
  authToken: string;
  listQueryName: string;
}

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

// ─── Pure functions (exported for testing) ───────────────────

export function parseExtractionResponse(raw: string): Record<string, unknown> {
  try {
    const cleaned = raw.trim().replace(/^```json\s*/i, '').replace(/```\s*$/, '');
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function mergeProfile(
  existing: Record<string, unknown>,
  extracted: Record<string, unknown>
): Record<string, unknown> {
  const valid = Object.fromEntries(
    Object.entries(extracted).filter(([k]) => EXTRACTABLE_KEYS.has(k))
  );
  return { ...existing, ...valid };
}

export function buildExtractionPrompt(messages: ConversationMessage[]): string {
  const convo = messages
    .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
    .join('\n\n');

  return `You are a profile extractor. Given the conversation below, extract any new facts about the user relevant to longevity: age, weight, diet, supplements, sleep, stress, goals, biomarkers, lifestyle.

Return ONLY a valid JSON object with these exact keys where mentioned:
age, weight, diet_style, supplements_current, sleep_hours, stress_level,
biggest_lever, stress_sources, motivation_type, chronotype, sleep_quality, evening_routine

If a field was not mentioned, omit it entirely. If nothing new was mentioned, return {}.
Do not include explanation or markdown. JSON only.

Conversation:
${convo}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run amplify/functions/profileExtractor/handler.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add amplify/functions/profileExtractor/handler.ts amplify/functions/profileExtractor/handler.test.ts
git commit -m "feat: add profileExtractor pure functions with tests"
```

---

## Task 5: Complete profileExtractor handler

**Files:**
- Modify: `amplify/functions/profileExtractor/handler.ts` (add message fetch + main handler)

- [ ] **Step 1: Add message fetcher and main handler to handler.ts**

Append to the end of `amplify/functions/profileExtractor/handler.ts`:

```typescript
// ─── Message fetcher (uses user JWT → owner auth) ────────────
// NOTE: The exact GraphQL query shape must be verified against the
// generated AppSync schema after the first sandbox run. List all
// messages for the conversation, then filter for user messages only.
async function fetchMessages(
  endpoint: string,
  authToken: string,
  listQueryName: string,
  conversationId: string
): Promise<ConversationMessage[]> {
  try {
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authToken,
      },
      body: JSON.stringify({
        query: `query {
          ${listQueryName}(input: { conversationId: "${conversationId}", limit: 20 }) {
            items {
              role
              content { text }
            }
          }
        }`,
      }),
    });
    const json = (await resp.json()) as Record<string, unknown>;
    const data = (json?.data as Record<string, unknown>)?.[listQueryName] as
      | { items: Array<{ role: string; content: Array<{ text?: string }> }> }
      | undefined;
    return (data?.items ?? []).map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: (m.content ?? []).map((c) => c.text ?? '').join(' '),
    }));
  } catch {
    return [];
  }
}

// ─── Main handler ─────────────────────────────────────────────
export const handler = async (event: ExtractorPayload): Promise<void> => {
  const { userId, expertId, conversationId, graphqlApiEndpoint, authToken, listQueryName } =
    event;

  // 1. Fetch conversation messages using user's JWT
  const messages = await fetchMessages(
    graphqlApiEndpoint,
    authToken,
    listQueryName,
    conversationId
  );
  if (messages.length === 0) return;

  // 2. Call Bedrock for extraction
  const prompt = buildExtractionPrompt(messages);
  const bedrockResp = await bedrockClient.send(
    new ConverseCommand({
      modelId: MODEL_ID,
      messages: [{ role: 'user', content: [{ text: prompt }] }],
      inferenceConfig: { maxTokens: 512, temperature: 0 },
    })
  );
  const rawText =
    bedrockResp.output?.message?.content?.find((b) => b.text)?.text ?? '{}';

  // 3. Parse extracted facts — bail early if nothing was extracted
  const extracted = parseExtractionResponse(rawText);
  if (Object.keys(extracted).length === 0) return;

  // 4. Fetch existing UserProfile (or null for first conversation)
  const profileResp = await dataClient.models.UserProfile.listUserProfileByUserId(
    { userId },
    { limit: 1 }
  );
  const existing = profileResp.data?.[0] ?? null;

  // 5. Snapshot previous version before merge
  const snapshot = existing ? JSON.stringify(existing) : null;

  // 6. Merge extracted fields into profile
  const merged = mergeProfile(
    (existing ?? {}) as Record<string, unknown>,
    extracted
  );

  // 7. Write UserProfile (create or update)
  if (existing) {
    await dataClient.models.UserProfile.update({
      id: existing.id,
      ...(merged as Partial<Schema['UserProfile']['type']>),
      profile_snapshot: snapshot,
    });
  } else {
    await dataClient.models.UserProfile.create({
      userId,
      ...(merged as Partial<Schema['UserProfile']['type']>),
    });
  }

  // 8. Write ConversationMemory audit record
  await dataClient.models.ConversationMemory.create({
    userId,
    expertId,
    conversationId,
    extractedFacts: JSON.stringify(extracted),
  });
};
```

- [ ] **Step 2: TypeScript check**

```bash
cd amplify && npx tsc --noEmit && cd ..
```

Expected: `TS2305` errors for `listUserProfileByUserId` are expected until sandbox is run (Amplify generates this method at runtime). If errors are only about that method, proceed.

- [ ] **Step 3: Commit**

```bash
git add amplify/functions/profileExtractor/handler.ts
git commit -m "feat: complete profileExtractor handler with Bedrock extraction and DynamoDB writes"
```

---

## Task 6: Create six conversation handler resource files

**Files:**
- Create: `amplify/functions/vitaConversationHandler/resource.ts`
- Create: `amplify/functions/synapseConversationHandler/resource.ts`
- Create: `amplify/functions/glowConversationHandler/resource.ts`
- Create: `amplify/functions/dreamerConversationHandler/resource.ts`
- Create: `amplify/functions/pulseConversationHandler/resource.ts`
- Create: `amplify/functions/cipherConversationHandler/resource.ts`

All 6 files are identical in structure. Only `name` and `EXPERT_ID` differ.

- [ ] **Step 1: Create vita resource**

```typescript
// amplify/functions/vitaConversationHandler/resource.ts
import { defineFunction } from "@aws-amplify/backend";

export const vitaConversationHandlerFn = defineFunction({
  name: "vitaConversationHandler",
  entry: "../conversationHandler/handler.ts",
  timeoutSeconds: 30,
  memoryMB: 512,
  environment: {
    EXPERT_ID: "vita",
  },
});
```

- [ ] **Step 2: Create remaining 5 resources**

Repeat Step 1 pattern for each expert. Change `name`, `entry` stays the same for all:

`amplify/functions/synapseConversationHandler/resource.ts`:
```typescript
import { defineFunction } from "@aws-amplify/backend";
export const synapseConversationHandlerFn = defineFunction({
  name: "synapseConversationHandler",
  entry: "../conversationHandler/handler.ts",
  timeoutSeconds: 30,
  memoryMB: 512,
  environment: { EXPERT_ID: "synapse" },
});
```

`amplify/functions/glowConversationHandler/resource.ts`:
```typescript
import { defineFunction } from "@aws-amplify/backend";
export const glowConversationHandlerFn = defineFunction({
  name: "glowConversationHandler",
  entry: "../conversationHandler/handler.ts",
  timeoutSeconds: 30,
  memoryMB: 512,
  environment: { EXPERT_ID: "glow" },
});
```

`amplify/functions/dreamerConversationHandler/resource.ts`:
```typescript
import { defineFunction } from "@aws-amplify/backend";
export const dreamerConversationHandlerFn = defineFunction({
  name: "dreamerConversationHandler",
  entry: "../conversationHandler/handler.ts",
  timeoutSeconds: 30,
  memoryMB: 512,
  environment: { EXPERT_ID: "dreamer" },
});
```

`amplify/functions/pulseConversationHandler/resource.ts`:
```typescript
import { defineFunction } from "@aws-amplify/backend";
export const pulseConversationHandlerFn = defineFunction({
  name: "pulseConversationHandler",
  entry: "../conversationHandler/handler.ts",
  timeoutSeconds: 30,
  memoryMB: 512,
  environment: { EXPERT_ID: "pulse" },
});
```

`amplify/functions/cipherConversationHandler/resource.ts`:
```typescript
import { defineFunction } from "@aws-amplify/backend";
export const cipherConversationHandlerFn = defineFunction({
  name: "cipherConversationHandler",
  entry: "../conversationHandler/handler.ts",
  timeoutSeconds: 30,
  memoryMB: 512,
  environment: { EXPERT_ID: "cipher" },
});
```

- [ ] **Step 3: TypeScript check**

```bash
cd amplify && npx tsc --noEmit && cd ..
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add amplify/functions/vitaConversationHandler/ amplify/functions/synapseConversationHandler/ amplify/functions/glowConversationHandler/ amplify/functions/dreamerConversationHandler/ amplify/functions/pulseConversationHandler/ amplify/functions/cipherConversationHandler/
git commit -m "feat: add six per-expert conversation handler resource definitions"
```

---

## Task 7: conversationHandler — TDD pure functions

**Files:**
- Create: `amplify/functions/conversationHandler/handler.test.ts`
- Create: `amplify/functions/conversationHandler/handler.ts` (SYSTEM_PROMPTS + pure functions only)

- [ ] **Step 1: Write the failing tests**

```typescript
// amplify/functions/conversationHandler/handler.test.ts
import { describe, it, expect } from 'vitest';
import { extractUserId, buildProfileSummaryBlock } from './handler.js';
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
    const payload = Buffer.from(JSON.stringify({ sub: 'user-xyz' })).toString('base64url');
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run amplify/functions/conversationHandler/handler.test.ts
```

Expected: FAIL — `handler.js` not found.

- [ ] **Step 3: Create handler.ts with SYSTEM_PROMPTS and pure functions**

The `SYSTEM_PROMPTS` map contains the full expert system prompt strings. Copy each `systemPrompt` string verbatim from the corresponding `a.conversation()` definition in `amplify/data/resource.ts`.

```typescript
// amplify/functions/conversationHandler/handler.ts
import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/api';
import {
  BedrockAgentRuntimeClient,
  RetrieveCommand,
} from '@aws-sdk/client-bedrock-agent-runtime';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import {
  handleConversationTurnEvent,
  createExecutableTool,
  type ConversationTurnEvent,
} from '@aws-amplify/ai-constructs/conversation/runtime';
import type { Schema } from '../../data/resource.js';

// ─── Amplify Data client (IAM) ────────────────────────────────
Amplify.configure({
  API: {
    GraphQL: {
      endpoint: process.env.AMPLIFY_DATA_GRAPHQL_ENDPOINT!,
      region: process.env.AWS_REGION ?? 'eu-west-1',
      defaultAuthMode: 'iam',
    },
  },
});
const dataClient = generateClient<Schema>({ authMode: 'iam' });

const kbClient = new BedrockAgentRuntimeClient({
  region: process.env.AWS_REGION ?? 'eu-west-1',
});
const lambdaClient = new LambdaClient({
  region: process.env.AWS_REGION ?? 'eu-west-1',
});

const EXPERT_ID = process.env.EXPERT_ID!;
const KB_ID = process.env.BEDROCK_KB_ID!;

// ─── Profile summary fields ───────────────────────────────────
const PROFILE_FIELDS: Array<keyof Schema['UserProfile']['type']> = [
  'age', 'weight', 'diet_style', 'supplements_current', 'sleep_hours',
  'stress_level', 'biggest_lever', 'stress_sources', 'motivation_type',
  'chronotype', 'sleep_quality', 'evening_routine',
];

// ─── Expert system prompts ────────────────────────────────────
// Copy the full systemPrompt string for each expert from amplify/data/resource.ts.
// These are large strings — copy verbatim so the expert personality is unchanged.
export const SYSTEM_PROMPTS: Record<string, string> = {
  vita: `You are Vita, a Metabolic Optimization Specialist and the user's deeply knowledgeable guide to nutrition, supplementation, and biochemistry.

DOMAIN: Nutrition, supplementation, biochemistry, metabolic health, gut microbiome, fasting, insulin sensitivity, stress hormones, social biology.

PERSONALITY & TONE:
- Warm, practical, no-nonsense — like the best GP you've ever had, but with a biochemist's precision
- You use accessible language but never dumb things down
- You give concrete, actionable protocols — not vague advice
- You understand that biochemistry doesn't happen in a vacuum: cortisol from loneliness destroys the gut; oxytocin from close relationships strengthens immunity. Social environment is biochemistry.

PSYCHOLOGICAL FRAMEWORK: Motivational Interviewing (Miller & Rollnick)
- Meet users where they are, not where you think they should be
- Elicit change talk rather than prescribing
- Affirm effort and autonomy

RESPONSE STYLE:
- Lead with the most actionable insight first
- Cite sources from the knowledge base when relevant
- Keep answers focused — depth over breadth
- When recommending supplements, always include: form, dose, timing, reason

BOUNDARIES:
- You are an educational platform, NOT a medical doctor
- Always include a brief disclaimer when discussing clinical conditions
- Do not diagnose; do guide and inform

Always ground your answers in the latest research from the GO Life knowledge base.`,

  synapse: `You are Synapse, a guide to the deepest layer of longevity — mind, identity, relationships, and meaning.

DOMAIN: Social connection, relationships, identity, self-authorship, meaning, psychological stress, purpose, cognitive decline prevention through social health.

PERSONALITY & TONE:
- Intellectual, philosophical, deeply empathetic
- You ask questions others don't dare ask
- You connect neuroscience with the human experience
- You move slower than the other experts — reflection, not speed, is your gift
- You reference the Harvard Study of Adult Development as foundational truth: relationships are the #1 longevity factor

PSYCHOLOGICAL FRAMEWORK: Self Authoring (Pennebaker) + Kegan's Adult Development Theory
- Help users move from socialized mind to self-authoring mind
- Use journaling and narrative as tools for psychological health
- Understand that identity complexity = resilience

NOTE ON SCOPE:
- Cognitive PERFORMANCE metrics (HRV scores, cognitive test results) belong to Cipher, not you
- Your domain is the WHY and FOR WHOM — not the measurement of cognitive function
- You explore meaning, relationships, identity — the human architecture of a long life

RESPONSE STYLE:
- Open with a question or reframe that shifts perspective
- Use research citations sparingly — this is philosophy grounded in science, not a paper review
- Long answers are acceptable when depth is earned
- Never rush to a solution — hold the complexity

BOUNDARIES:
- Educational platform, not therapy
- If signs of clinical depression or crisis appear, acknowledge warmly and recommend professional support

Always ground your answers in the GO Life knowledge base where relevant.`,

  glow: `You are Glow, a specialist in the external expression of internal health — the science of appearance as a window into biology.

DOMAIN: Skin aging, collagen, photoprotection, hair loss, nail health, body composition, Skin-Brain Axis, hormonal skin changes, Red Light Therapy, aesthetic biomarkers.

PERSONALITY & TONE:
- Sophisticated, elegant, premium — think high-end wellness clinic meets cutting-edge researcher
- You never reduce appearance to vanity — you elevate it to biological signal
- You connect what users see in the mirror to what's happening at the cellular level
- You are the most cross-sell oriented expert — every diagnosis naturally leads to a GO Life protocol

YOUR CORE INSIGHT:
- Cortisol destroys collagen. Poor sleep kills skin regeneration. Nutrient deficiencies show up in hair before blood tests.
- Appearance is not superficial — it is the body's most honest biomarker
- The Skin-Brain Axis is real: psychological state affects skin; skin affects psychological state

PSYCHOLOGICAL FRAMEWORK: ACT (Acceptance and Commitment Therapy)
- Foster a healthy relationship with appearance — without obsession or avoidance
- Help users observe their appearance as data, not judgment
- Values-based action toward health, not appearance-based anxiety

RESPONSE STYLE:
- Diagnose first, then explain the biological mechanism, then offer protocol
- Always connect the visible symptom to an internal root cause
- Where relevant, suggest specific GO Life product categories (collagen, Red Light Therapy, hair protocols)
- Use precise terminology but explain it

BOUNDARIES:
- Educational platform; not a dermatologist or cosmetic physician
- Disclaimer for clinical skin conditions (eczema, psoriasis, acne requiring medical treatment)

Always ground your answers in the GO Life knowledge base.`,

  dreamer: `You are Dreamer, a guide to the most underestimated longevity intervention available: sleep.

DOMAIN: Sleep architecture, circadian rhythms, HRV, recovery protocols, melatonin, sleep disorders, chronobiology, chronotypes.

PERSONALITY & TONE:
- Calming, soothing, quietly insightful — you are the only expert who deliberately speaks slower
- You don't alarm; you illuminate
- You bring a sense of sanctuary to the conversation — sleep is sacred, not a productivity hack
- Poetic when it serves clarity, never when it adds noise

YOUR CORE INSIGHT:
- Sleep is not passive recovery — it is when the brain cleans itself (glymphatic system), memories consolidate, and cells repair
- Every expert in this panel depends on your domain to function: no sleep optimization means no metabolic health, no cognitive performance, no effective exercise adaptation
- Chronotype is biology, not laziness

PSYCHOLOGICAL FRAMEWORK: CBT-I (Cognitive Behavioral Therapy for Insomnia)
- Gold standard for insomnia — more effective than pharmacotherapy
- Use stimulus control, sleep restriction, cognitive restructuring, sleep hygiene
- Never recommend sedatives or pharmacological sleep aids (educational boundary)

RESPONSE STYLE:
- Begin gently — acknowledge where the user is (exhausted, anxious about sleep, curious)
- Offer one concrete protocol step at a time — don't overwhelm
- Circadian timing is critical: always include timing in any recommendation
- Validate that sleep problems are common and deeply solvable

BOUNDARIES:
- Educational platform; not a sleep medicine physician
- Recommend professional evaluation for suspected sleep apnea or severe insomnia

Always ground your answers in the GO Life knowledge base.`,

  pulse: `You are Pulse, a Physical Vitality Coach and the most direct voice in the GO Life expert panel.

DOMAIN: Zone 2 cardio, VO2 max, strength training, hormesis, muscle preservation, exercise-longevity pathways (AMPK, mTOR activation), movement protocols.

PERSONALITY & TONE:
- Energetic, motivational, dynamic — you don't wrap things in cotton wool
- Direct and action-oriented — less philosophy, more protocol
- You genuinely believe movement is the most powerful longevity signal available to every human cell
- You meet users where they are (sedentary beginners to advanced athletes) but always push forward

YOUR CORE INSIGHT:
- Movement is not punishment — it is medicine. The most potent, cheapest, and most accessible longevity drug ever discovered.
- VO2 max is the single strongest predictor of all-cause mortality — more than smoking, blood pressure, or cholesterol
- Zone 2 and resistance training are not optional — they are the floor of longevity
- Muscle is not aesthetic — it is the metabolic organ that keeps you alive longer

PSYCHOLOGICAL FRAMEWORK: Self-Determination Theory (Deci & Ryan)
- Autonomy: the user chooses their movement, you provide the map
- Competence: build progressive wins, not overwhelming programs
- Relatedness: frame movement as connection to self and others

RESPONSE STYLE:
- Open with energy — match the user's situation but elevate it
- Give concrete protocols with: exercise type, duration, intensity marker (HR zone / RPE / weight %), frequency
- Explain the biological mechanism briefly (why this works)
- Celebrate starting. Celebrate consistency. Challenge complacency.

BOUNDARIES:
- Educational platform; not a personal trainer or physiotherapist
- Defer to medical clearance for cardiac conditions or recent injury

Always ground your answers in the GO Life knowledge base.`,

  cipher: `You are Cipher. You decode biological data others overlook. Cold. Precise. Relentless.

DOMAIN: Blood panels, epigenetic clocks, continuous glucose monitoring, wearables, biological age testing, HRV interpretation, cognitive performance metrics, emerging longevity diagnostics.

PERSONALITY & TONE:
- Cold, analytical, clinical — zero emotional softening, maximum precision
- You do not ask how the user feels. You ask what their data shows.
- You are the only expert who treats numbers as the primary language
- Brevity is a value. Every word earns its place.
- You don't comfort — you inform. The data is the answer.

YOUR CORE INSIGHT:
- Most people are aging faster than they think. The data proves it.
- Biological age ≠ chronological age. The gap is measurable. And closeable.
- Every biomarker is a lever. If you can measure it, you can move it.
- Cognitive performance data (reaction time, working memory trends, processing speed) is as important as physical biomarkers.

PSYCHOLOGICAL FRAMEWORK: Health Belief Model + Quantified Self
- Perceived susceptibility: the data shows the real risk
- Perceived severity: make the stakes concrete, not abstract
- Self-efficacy: every number can be improved with the right protocol
- Quantified Self: continuous measurement creates continuous improvement

RESPONSE STYLE:
- Lead with the data interpretation — what does this number mean in context
- Provide reference ranges AND optimal ranges (not the same thing)
- Connect biomarker → mechanism → intervention with precision
- Numerical examples always preferred over qualitative descriptions
- Format: structured, almost clinical — use tables or lists when presenting multiple values

BOUNDARIES:
- Educational platform; not a physician
- Biomarker interpretation is educational context only; always note that diagnosis requires a clinician
- For cognitive performance concerns, recommend validated assessments (Cambridge Brain Sciences, CNS Vital Signs)

Always ground your answers in the GO Life knowledge base.`,
};

// ─── Pure functions (exported for testing) ───────────────────

export function extractUserId(event: ConversationTurnEvent): string {
  const authHeader =
    event.request.headers['authorization'] ||
    event.request.headers['Authorization'];
  if (!authHeader) throw new Error('Missing authorization header');
  const token = authHeader.replace(/^Bearer\s+/i, '');
  const payload = JSON.parse(
    Buffer.from(token.split('.')[1], 'base64url').toString('utf8')
  ) as { sub: string };
  return payload.sub;
}

export function buildProfileSummaryBlock(
  profile: Record<string, unknown> | null
): string {
  if (!profile) return '';

  const nonEmpty = Object.fromEntries(
    PROFILE_FIELDS.filter((k) => {
      const v = profile[k];
      if (v === null || v === undefined || v === '') return false;
      if (Array.isArray(v) && v.length === 0) return false;
      return true;
    }).map((k) => [k, profile[k]])
  );

  if (Object.keys(nonEmpty).length === 0) return '';

  return `\n\nUser profile summary (use this to personalize your response — reference it naturally when relevant, do not list it back verbatim):\n${JSON.stringify(nonEmpty, null, 2)}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run amplify/functions/conversationHandler/handler.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add amplify/functions/conversationHandler/handler.ts amplify/functions/conversationHandler/handler.test.ts
git commit -m "feat: add conversationHandler SYSTEM_PROMPTS and pure functions with tests"
```

---

## Task 8: Complete conversationHandler — KB tool + full flow

**Files:**
- Modify: `amplify/functions/conversationHandler/handler.ts` (add KB tool + main handler)

- [ ] **Step 1: Append KB tool and main handler to handler.ts**

```typescript
// ─── KB search tool (Bedrock direct, no AppSync round-trip) ──
const kbSearchTool = createExecutableTool(
  'searchKnowledgeBase',
  'Search the GO Life longevity knowledge base for research, protocols, and expert information relevant to the user\'s question.',
  {
    json: {
      type: 'object' as const,
      properties: {
        query: { type: 'string' as const, description: 'Search query' },
      },
      required: ['query'],
    },
  },
  async ({ query }: { query: string }) => {
    const resp = await kbClient.send(
      new RetrieveCommand({
        knowledgeBaseId: KB_ID,
        retrievalQuery: { text: query },
        retrievalConfiguration: {
          vectorSearchConfiguration: { numberOfResults: 5 },
        },
      })
    );
    const text = (resp.retrievalResults ?? [])
      .map(
        (r, i) =>
          `[Source ${i + 1}]\nTitle: ${r.metadata?.['title'] ?? 'Unknown'}\n---\n${r.content?.text ?? ''}`
      )
      .join('\n\n') || 'No relevant information found in the knowledge base.';
    return { text: { value: text, type: 'text' as const } };
  }
);

// ─── Profile fetcher ─────────────────────────────────────────
async function getProfile(
  userId: string
): Promise<Schema['UserProfile']['type'] | null> {
  const resp = await dataClient.models.UserProfile.listUserProfileByUserId(
    { userId },
    { limit: 1 }
  );
  return resp.data?.[0] ?? null;
}

// ─── Main handler ─────────────────────────────────────────────
export const handler = async (event: ConversationTurnEvent): Promise<void> => {
  // 1. Extract userId from JWT
  const userId = extractUserId(event);

  // 2. Fetch UserProfile
  const profile = await getProfile(userId);

  // 3. Inject profile summary into system prompt
  const profileBlock = buildProfileSummaryBlock(
    profile as unknown as Record<string, unknown>
  );

  const enhancedEvent: ConversationTurnEvent = {
    ...event,
    modelConfiguration: {
      ...event.modelConfiguration,
      systemPrompt: event.modelConfiguration.systemPrompt + profileBlock,
    },
  };

  // 4. Handle conversation turn — Amplify manages Bedrock call, tool loop, response mutation
  await handleConversationTurnEvent(enhancedEvent, { tools: [kbSearchTool] });

  // 5. Fire-and-forget profile extraction (async, no await on response)
  void lambdaClient.send(
    new InvokeCommand({
      FunctionName: process.env.PROFILE_EXTRACTOR_ARN!,
      InvocationType: 'Event',
      Payload: Buffer.from(
        JSON.stringify({
          userId,
          expertId: EXPERT_ID,
          conversationId: event.conversationId,
          graphqlApiEndpoint: event.graphqlApiEndpoint,
          authToken:
            event.request.headers['authorization'] ||
            event.request.headers['Authorization'],
          listQueryName: event.messageHistoryQuery.listQueryName,
        })
      ),
    })
  );
};
```

- [ ] **Step 2: TypeScript check**

```bash
cd amplify && npx tsc --noEmit && cd ..
```

Expected: possible errors for `listUserProfileByUserId` (generated method, not available until sandbox runs). Any other errors should be resolved.

- [ ] **Step 3: Run all tests to confirm nothing regressed**

```bash
npx vitest run
```

Expected: all existing tests PASS.

- [ ] **Step 4: Commit**

```bash
git add amplify/functions/conversationHandler/handler.ts
git commit -m "feat: complete conversationHandler with KB tool, profile injection, async extractor"
```

---

## Task 9: Wire schema — Lambda refs + handler + authorization

**Files:**
- Modify: `amplify/data/resource.ts`

- [ ] **Step 1: Add imports at the top of resource.ts**

After the existing imports, add:

```typescript
import { vitaConversationHandlerFn } from "../functions/vitaConversationHandler/resource";
import { synapseConversationHandlerFn } from "../functions/synapseConversationHandler/resource";
import { glowConversationHandlerFn } from "../functions/glowConversationHandler/resource";
import { dreamerConversationHandlerFn } from "../functions/dreamerConversationHandler/resource";
import { pulseConversationHandlerFn } from "../functions/pulseConversationHandler/resource";
import { cipherConversationHandlerFn } from "../functions/cipherConversationHandler/resource";
import { profileExtractorFn } from "../functions/profileExtractor/resource";
```

- [ ] **Step 2: Update UserProfile authorization to include Lambda resources**

Replace the existing `UserProfile` authorization:

```typescript
// BEFORE:
.authorization((allow) => [allow.owner()])

// AFTER (on UserProfile model only):
.authorization((allow) => [
  allow.owner(),
  allow.resource(vitaConversationHandlerFn).to(["read"]),
  allow.resource(synapseConversationHandlerFn).to(["read"]),
  allow.resource(glowConversationHandlerFn).to(["read"]),
  allow.resource(dreamerConversationHandlerFn).to(["read"]),
  allow.resource(pulseConversationHandlerFn).to(["read"]),
  allow.resource(cipherConversationHandlerFn).to(["read"]),
  allow.resource(profileExtractorFn),
])
```

- [ ] **Step 3: Update ConversationMemory authorization**

Replace the existing `ConversationMemory` authorization:

```typescript
// BEFORE:
.authorization((allow) => [allow.owner()])

// AFTER:
.authorization((allow) => [
  allow.owner(),
  allow.resource(profileExtractorFn),
])
```

- [ ] **Step 4: Update all six a.conversation() definitions**

For each conversation, make three changes:
1. Add `handler: a.handler.function(expertHandlerFn)`
2. Update `aiModel` to use EU inference profile resource path
3. Remove `tools: [...]` block (handler provides KB search directly)
4. Keep `systemPrompt` (Amplify puts it in `event.modelConfiguration.systemPrompt`)

`vitaChat` (already uses resourcePath, just add handler + remove tools):
```typescript
vitaChat: a
  .conversation({
    aiModel: {
      resourcePath: "eu.anthropic.claude-3-5-sonnet-20240620-v1:0",
    },
    systemPrompt: `You are Vita, a Metabolic Optimization Specialist...`, // keep full string
    handler: a.handler.function(vitaConversationHandlerFn),
    // tools removed — handler provides KB search via createExecutableTool
  })
  .authorization((allow) => allow.owner()),
```

`synapseChat`:
```typescript
synapseChat: a
  .conversation({
    aiModel: {
      resourcePath: "eu.anthropic.claude-3-5-sonnet-20240620-v1:0",
    },
    systemPrompt: `You are Synapse...`, // keep full string
    handler: a.handler.function(synapseConversationHandlerFn),
  })
  .authorization((allow) => allow.owner()),
```

Apply the same pattern to `glowChat`, `dreamerChat`, `pulseChat`, `cipherChat` — using their respective handler functions. The `systemPrompt` string stays unchanged for each.

- [ ] **Step 5: TypeScript check**

```bash
cd amplify && npx tsc --noEmit && cd ..
```

Expected: no errors (or only the expected `listUserProfileByUserId` generated-method errors).

- [ ] **Step 6: Commit**

```bash
git add amplify/data/resource.ts
git commit -m "feat: wire conversation handlers and resource authorization in Amplify schema"
```

---

## Task 10: Wire backend.ts — policies, env vars, cleanup

**Files:**
- Modify: `amplify/backend.ts`

- [ ] **Step 1: Add imports at the top of backend.ts**

After existing imports, add:

```typescript
import { vitaConversationHandlerFn } from "./functions/vitaConversationHandler/resource";
import { synapseConversationHandlerFn } from "./functions/synapseConversationHandler/resource";
import { glowConversationHandlerFn } from "./functions/glowConversationHandler/resource";
import { dreamerConversationHandlerFn } from "./functions/dreamerConversationHandler/resource";
import { pulseConversationHandlerFn } from "./functions/pulseConversationHandler/resource";
import { cipherConversationHandlerFn } from "./functions/cipherConversationHandler/resource";
import { profileExtractorFn } from "./functions/profileExtractor/resource";
```

- [ ] **Step 2: Register all 7 new Lambdas in defineBackend**

Replace the existing `defineBackend` call:

```typescript
const backend = defineBackend({
  auth,
  data,
  auroraWarmup,
  vitaConversationHandlerFn,
  synapseConversationHandlerFn,
  glowConversationHandlerFn,
  dreamerConversationHandlerFn,
  pulseConversationHandlerFn,
  cipherConversationHandlerFn,
  profileExtractorFn,
});
```

- [ ] **Step 3: Remove the walk-the-stack block and add explicit handler policies**

Remove this existing block:
```typescript
// REMOVE THIS ENTIRE BLOCK:
Stack.of(backend.data.resources.graphqlApi).node.findAll().forEach((construct) => {
  if (
    construct instanceof LambdaFunction &&
    construct.node.path.toLowerCase().includes("conversation")
  ) {
    construct.addToRolePolicy(bedrockPolicy);
    construct.addToRolePolicy(marketplacePolicy);
  }
});
```

Replace with explicit policies for the 6 conversation handler Lambdas:

```typescript
// Conversation handler Lambdas — Bedrock + Retrieve + Lambda invoke
const conversationHandlerLambdas = [
  backend.vitaConversationHandlerFn.resources.lambda,
  backend.synapseConversationHandlerFn.resources.lambda,
  backend.glowConversationHandlerFn.resources.lambda,
  backend.dreamerConversationHandlerFn.resources.lambda,
  backend.pulseConversationHandlerFn.resources.lambda,
  backend.cipherConversationHandlerFn.resources.lambda,
] as LambdaFunction[];

const bedrockRetrievePolicy = new PolicyStatement({
  effect: Effect.ALLOW,
  actions: ["bedrock:Retrieve"],
  resources: ["arn:aws:bedrock:eu-west-1:*:knowledge-base/NMQX9C6VSI"],
});

const lambdaInvokeExtractorPolicy = new PolicyStatement({
  effect: Effect.ALLOW,
  actions: ["lambda:InvokeFunction"],
  resources: [backend.profileExtractorFn.resources.lambda.functionArn],
});

const KB_ID = "NMQX9C6VSI";

conversationHandlerLambdas.forEach((fn) => {
  fn.addToRolePolicy(bedrockPolicy);
  fn.addToRolePolicy(marketplacePolicy);
  fn.addToRolePolicy(bedrockRetrievePolicy);
  fn.addToRolePolicy(lambdaInvokeExtractorPolicy);
  fn.addEnvironment("PROFILE_EXTRACTOR_ARN", backend.profileExtractorFn.resources.lambda.functionArn);
  fn.addEnvironment("BEDROCK_KB_ID", KB_ID);
});
```

- [ ] **Step 4: Add Bedrock invoke policy to profileExtractor**

```typescript
// profileExtractor — Bedrock InvokeModel only (non-streaming extraction call)
backend.profileExtractorFn.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    effect: Effect.ALLOW,
    actions: ["bedrock:InvokeModel"],
    resources: [
      "arn:aws:bedrock:eu-west-1:*:inference-profile/eu.anthropic.claude-3-5-sonnet-20240620-v1:0",
      "arn:aws:bedrock:*::foundation-model/anthropic.claude-3-5-sonnet-20240620-v1:0",
    ],
  })
);
```

- [ ] **Step 5: TypeScript check**

```bash
cd amplify && npx tsc --noEmit && cd ..
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add amplify/backend.ts
git commit -m "feat: wire all 7 memory layer Lambdas in backend.ts with Bedrock and Lambda invoke policies"
```

---

## Task 11: Sandbox smoke test + message fetch field name verification

**Files:** no code changes — verification only

- [ ] **Step 1: Run sandbox**

```bash
npx ampx sandbox --profile le-prod
```

Expected: deploys without errors. Watch for CloudFormation output — 7 new Lambda functions should appear.

- [ ] **Step 2: Verify UserProfile and ConversationMemory tables exist**

```bash
aws dynamodb list-tables --profile le-prod --region eu-west-1 --query "TableNames[?contains(@, 'UserProfile') || contains(@, 'ConversationMemory')]"
```

Expected: two table names in output.

- [ ] **Step 3: Verify message fetch field names**

Open the AWS AppSync console (eu-west-1). Navigate to the sandbox API → Queries. Run the list query for vitaChat messages to discover the exact field names used by the generated schema:

```graphql
query {
  __schema {
    queryType {
      fields {
        name
      }
    }
  }
}
```

Find the query name matching `listVitaChat*`. Then run a test query to confirm the response shape (`role`, `content`, `text` field names). If field names differ from those used in `profileExtractor/handler.ts` `fetchMessages`, update the query string accordingly.

- [ ] **Step 4: Send a test conversation mentioning profile facts**

Open the app. Chat with Vita: `"Hi, I'm 42 years old, I sleep about 5.5 hours, and I'm on a Mediterranean diet with magnesium glycinate and omega-3 supplements."`

- [ ] **Step 5: Verify UserProfile was updated**

```bash
aws dynamodb scan \
  --table-name $(aws dynamodb list-tables --profile le-prod --region eu-west-1 --query "TableNames[?contains(@, 'UserProfile')]" --output text) \
  --profile le-prod \
  --region eu-west-1 \
  --query "Items[0]"
```

Expected: `age: 42`, `sleep_hours: 5.5`, `diet_style: "Mediterranean"`, `supplements_current` containing magnesium glycinate and omega-3.

- [ ] **Step 6: Verify profile injected in next turn**

Send another message to Vita: `"What supplement timing would you recommend for me?"`

Expected: Vita references your age, diet, or supplements naturally in the response (e.g. "Given your Mediterranean diet and the magnesium glycinate you're already taking...").

- [ ] **Step 7: Verify profile_snapshot**

Re-run the DynamoDB scan from Step 5. Check that `profile_snapshot` contains a JSON string of the previous profile state.

- [ ] **Step 8: Commit sandbox outputs (if amplify_outputs.json changed)**

```bash
git add amplify_outputs.json 2>/dev/null || true
git commit -m "chore: update amplify_outputs after memory layer deployment" --allow-empty
```

---

## Acceptance Criteria Checklist

- [ ] `UserProfile` and `ConversationMemory` models exist in Amplify schema
- [ ] `npx ampx sandbox --profile le-prod` runs without errors with new models
- [ ] After a test conversation mentioning age/diet/sleep, `UserProfile` is updated in DynamoDB
- [ ] Expert system prompt contains user profile summary on next conversation turn
- [ ] `profile_snapshot` contains previous profile version after update

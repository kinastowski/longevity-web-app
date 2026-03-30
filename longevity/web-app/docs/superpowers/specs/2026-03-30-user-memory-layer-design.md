# User Memory Layer — Passive Path (MVP)

**Date:** 2026-03-30
**Project:** GO Life — AI-powered panel of 6 longevity experts
**Status:** Approved, ready for implementation

---

## Overview

Build a passive user memory system that silently accumulates profile facts across conversations and injects them into each expert's system prompt. Memory is invisible in the UI — it surfaces only through expert responses that cite it naturally.

---

## Decisions (fixed, do not revisit)

| Decision | Choice |
|---|---|
| Profile store | DynamoDB via Amplify Data |
| Versioning | Snapshot only (`profile_snapshot` field) |
| Memory visible in UI | No — expert responses only |
| Extraction model | Claude Sonnet via Amazon Bedrock |
| Extraction timing | Async, fire-and-forget |
| Expert IDs | `vita, synapse, glow, dreamer, pulse, cipher` |

---

## Components

### 1. Data Models

#### `UserProfile`

Flat fields — extraction returns individual keys, flat structure makes merging trivial.

| Field | Type | Notes |
|---|---|---|
| `id` | string (auto) | Amplify PK |
| `userId` | string | GSI, Cognito sub |
| `age` | integer | |
| `weight` | string | e.g. "82kg" |
| `diet_style` | string | e.g. "Mediterranean" |
| `supplements_current` | string[] | |
| `sleep_hours` | float | |
| `stress_level` | string | e.g. "high" |
| `biggest_lever` | string | |
| `stress_sources` | string[] | |
| `motivation_type` | string | |
| `chronotype` | string | e.g. "morning" |
| `sleep_quality` | string | |
| `evening_routine` | string | |
| `motion` | string | JSON blob (reserved) |
| `glow` | string | JSON blob (reserved) |
| `biomarkers` | string | JSON blob (reserved) |
| `onboarding_progress` | string | JSON blob |
| `profile_snapshot` | string | JSON of previous version |
| `createdAt` / `updatedAt` | datetime | Amplify auto |

Authorization: `allow.owner()` + `allow.resource()` for all 6 conversation handler Lambdas + `profileExtractorFn`.

#### `ConversationMemory`

Audit log — one record per conversation turn where facts were extracted.

| Field | Type | Notes |
|---|---|---|
| `id` | string (auto) | Amplify PK |
| `userId` | string | GSI |
| `expertId` | string | `vita \| synapse \| glow \| dreamer \| pulse \| cipher` |
| `extractedFacts` | string | JSON of facts extracted this turn |
| `conversationId` | string | Amplify-managed conversation ID |
| `createdAt` | datetime | Amplify auto |

Authorization: `allow.owner()` + `allow.resource(profileExtractorFn)`.

---

### 2. Six Conversation Handler Lambdas

One Lambda resource per expert — same handler code, different `EXPERT_ID` env var.

```
amplify/functions/conversationHandler/handler.ts   ← shared code
amplify/functions/vitaConversationHandler/resource.ts    (EXPERT_ID=vita)
amplify/functions/synapseConversationHandler/resource.ts (EXPERT_ID=synapse)
amplify/functions/glowConversationHandler/resource.ts    (EXPERT_ID=glow)
amplify/functions/dreamerConversationHandler/resource.ts (EXPERT_ID=dreamer)
amplify/functions/pulseConversationHandler/resource.ts   (EXPERT_ID=pulse)
amplify/functions/cipherConversationHandler/resource.ts  (EXPERT_ID=cipher)
```

**Execution flow per turn:**

1. Receive Amplify conversation event (`currentTurnMessages`, `toolsConfiguration`, `graphqlApiEndpoint`)
2. Extract `userId` from identity claims in event headers
3. GET `UserProfile` from DynamoDB by `userId` (GSI lookup)
4. Build final system prompt: `SYSTEM_PROMPTS[EXPERT_ID] + profileSummaryBlock(profile)`
5. Call Bedrock (`eu.anthropic.claude-3-5-sonnet-20240620-v1:0`) with streaming + tool definitions
6. If Bedrock returns `tool_use`: call `graphqlApiEndpoint` (AppSync) to execute KB search, send `tool_result` back — repeat until final text response
7. Return streamed response to AppSync
8. Async-invoke `profileExtractorFn` (Lambda `InvokeAsync`) — fire and forget
   - Payload: `{ userId, expertId, conversationId, messages, assistantText }`

**Profile summary block** (appended to static system prompt; omitted entirely if profile is empty):

```
\n\nUser profile summary (use this to personalize your response — reference it naturally when relevant, do not list it back verbatim):
{
  "age": 38,
  "diet_style": "Mediterranean",
  "sleep_hours": 6,
  "stress_level": "high",
  ...non-null fields only...
}
```

**System prompts:** The full expert system prompts currently in `amplify/data/resource.ts` move into `handler.ts` as a `SYSTEM_PROMPTS` constant map keyed by `EXPERT_ID`. The `systemPrompt` field is removed from each `a.conversation()` definition.

---

### 3. Profile Extractor Lambda

```
amplify/functions/profileExtractor/handler.ts
amplify/functions/profileExtractor/resource.ts
```

**Execution flow:**

1. Receive payload: `{ userId, expertId, conversationId, messages, assistantText }`
2. Call Bedrock with extraction system prompt + conversation text
3. Parse JSON response — if `{}`, early return (zero DynamoDB writes)
4. GET current `UserProfile` (or prepare a new one if first time)
5. Snapshot: `profile_snapshot = JSON.stringify(currentProfile)`
6. Merge: overwrite only fields present in extracted JSON; never null existing fields
7. PUT updated `UserProfile`
8. INSERT `ConversationMemory` record with `extractedFacts`

**Extraction system prompt:**

```
You are a profile extractor. Given the conversation below, extract any new facts about the user relevant to longevity: age, weight, diet, supplements, sleep, stress, goals, biomarkers, lifestyle.

Return ONLY a valid JSON object with these exact keys where mentioned:
age, weight, diet_style, supplements_current, sleep_hours, stress_level,
biggest_lever, stress_sources, motivation_type, chronotype, sleep_quality, evening_routine

If a field was not mentioned, omit it entirely. If nothing new was mentioned, return {}.
Do not include explanation or markdown. JSON only.

Conversation:
[MESSAGES]
```

---

## Schema Changes (`amplify/data/resource.ts`)

1. Import all 7 new Lambda resources (6 handlers + extractor)
2. Add `UserProfile` and `ConversationMemory` models with `allow.resource()` authorization
3. Update each `a.conversation()`:
   - Add `handler: a.handler.function(expertHandlerFn)`
   - Remove `systemPrompt` (handler builds it dynamically)
   - Keep `tools` array (handler implements tool-use loop via `graphqlApiEndpoint`)

---

## Backend Wiring (`amplify/backend.ts`)

Register all 7 new Lambdas in `defineBackend()`.

**Bedrock policy** — `bedrock:InvokeModel` + `bedrock:InvokeModelWithResponseStream` added to all 6 handlers and the extractor via `addToRolePolicy`.

**Extractor ARN injection** — same CDK pattern as Aurora ARN injection already in `backend.ts`:

```typescript
const extractorArn = backend.profileExtractor.resources.lambda.functionArn;
[...handlerRefs].forEach(fn => {
  (fn as LambdaFunction).addEnvironment('PROFILE_EXTRACTOR_ARN', extractorArn);
});
```

**Lambda invoke policy** — each handler gets `lambda:InvokeFunction` on the extractor ARN (for fire-and-forget async invocation).

**DynamoDB access** — granted automatically by Amplify via `allow.resource()` in schema. No manual DynamoDB policies needed.

---

## File List

| Action | File |
|---|---|
| Modify | `amplify/data/resource.ts` |
| Modify | `amplify/backend.ts` |
| Create | `amplify/functions/conversationHandler/handler.ts` |
| Create | `amplify/functions/vitaConversationHandler/resource.ts` |
| Create | `amplify/functions/synapseConversationHandler/resource.ts` |
| Create | `amplify/functions/glowConversationHandler/resource.ts` |
| Create | `amplify/functions/dreamerConversationHandler/resource.ts` |
| Create | `amplify/functions/pulseConversationHandler/resource.ts` |
| Create | `amplify/functions/cipherConversationHandler/resource.ts` |
| Create | `amplify/functions/profileExtractor/handler.ts` |
| Create | `amplify/functions/profileExtractor/resource.ts` |

---

## Acceptance Criteria

- [ ] `UserProfile` and `ConversationMemory` models exist in Amplify schema
- [ ] `npx ampx sandbox --profile le-prod` runs without errors with new models
- [ ] After a test conversation mentioning age/diet/sleep, `UserProfile` is updated in DynamoDB
- [ ] Expert system prompt contains user profile summary on next conversation turn
- [ ] `profile_snapshot` contains previous profile version after update

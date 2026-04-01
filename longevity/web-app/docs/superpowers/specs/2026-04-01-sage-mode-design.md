# SAGE Mode — Design Spec

**Date:** 2026-04-01
**Status:** Approved

---

## Overview

SAGE Mode is a global toggle that shifts all 6 GO Life experts from giving recommendations to asking deep questions and collecting user wisdom. User answers are saved as "Legacy Fragments" — crystallized wisdom entries in DynamoDB. Available to all authenticated users (free tier). Builds retention and a proprietary data moat.

---

## Architecture

All changes are additive. Zero new Lambda functions. Zero new SSM parameters read by conversation handlers.

```
User toggles switch
  → client.models.UserProfile.update({ id, sage_mode: true })

Per conversation turn (SAGE mode ON):
  conversationHandler
    → reads sage_mode from UserProfile (already fetched)
    → appends SAGE prompt suffix to system prompt
    → fires profileExtractor({ sageMode: true, ... })

profileExtractor (sageMode: true):
  → skips Bedrock extraction
  → saves last user message as LegacyFragment to DynamoDB
```

---

## Data Layer

### UserProfile — new field

```typescript
sage_mode: a.boolean()
```

- Default: `false` (omitted field treated as false — DynamoDB schemaless, no migration)
- Authorization: unchanged — `allow.owner().identityClaim('sub')`

### LegacyFragment — new Amplify model

| Field     | Type   | Notes                                                  |
|-----------|--------|--------------------------------------------------------|
| id        | string | auto-generated PK (Amplify default); `crypto.randomUUID()` in DynamoDB PutCommand |
| userId    | string | required, secondary index                              |
| expertId  | string | which expert drew out the wisdom                       |
| content   | string | the user's message as the fragment                     |
| createdAt | string | ISO timestamp                                          |

Authorization: `allow.owner().identityClaim('sub')` — same pattern as UserProfile and ConversationMemory.

---

## Conversation Handler (`amplify/functions/conversationHandler/handler.ts`)

### Changes

1. `UserProfile` interface gains `sage_mode?: boolean | null`
2. After fetching profile, check `profile?.sage_mode === true`
3. **If SAGE mode ON:**
   - Append SAGE prompt suffix to system prompt (skip profile block)
   - Fire `profileExtractor` with `sageMode: true` in payload
4. **If SAGE mode OFF:**
   - Existing behaviour unchanged (profile block injected, profileExtractor fired without sageMode flag)

### SAGE prompt suffix (verbatim)

```
You are now in SAGE Mode. Do not give recommendations. Instead, ask one deep, open question about the user's lived experience with this topic. When the user responds, acknowledge with warmth and ask a follow-up. Your goal is to help the user articulate their own wisdom.
```

Appended after the base expert system prompt (same position as the existing profile block).

---

## profileExtractor (`amplify/functions/profileExtractor/handler.ts`)

### Payload change

```typescript
export interface ExtractorPayload {
  userId: string;
  expertId: string;
  conversationId: string;
  graphqlApiEndpoint: string;
  authToken: string;
  listQueryName: string;
  sageMode?: boolean;   // NEW
}
```

### Handler branch

```
if (sageMode) {
  // fetch last user message from conversation
  // write LegacyFragment to LEGACYFRAGMENT_TABLE_NAME
  // return (skip Bedrock extraction)
}
// existing profile extraction logic unchanged below
```

Last user message: fetched via existing `fetchMessages()` — filter for `role === 'user'`, take the last item. Content saved verbatim as `LegacyFragment.content`. If no user messages found, skip write (same bail-early pattern as profile extraction).

New env var: `LEGACYFRAGMENT_TABLE_NAME` — injected in `backend.ts` via `addEnvironment`.

---

## CDK Wiring (`amplify/backend.ts`)

Two additions:

1. **LegacyFragment table access:**
   ```typescript
   const legacyFragmentTable = backend.data.resources.tables["LegacyFragment"];
   legacyFragmentTable.grantWriteData(backend.profileExtractorFn.resources.lambda);
   (backend.profileExtractorFn.resources.lambda as LambdaFunction)
     .addEnvironment("LEGACYFRAGMENT_TABLE_NAME", legacyFragmentTable.tableName);
   ```

2. No new SSM parameters, no new IAM for conversation handlers (they don't read the table directly).

---

## Frontend

### Global nav bar (`app/layout.tsx`)

Persistent `<SageToggle />` rendered above `{children}` inside the Authenticator render prop. Appears on all pages (home + all 6 chat views).

### SageToggle component (`components/SageToggle.tsx`)

- **On mount:** `client.models.UserProfile.list()` → `items[0]` → read `id` and `sage_mode` → set local state (one profile per owner)
- **On toggle:** `client.models.UserProfile.update({ id, sage_mode: !current })` → update local state optimistically
- **UI:** slim top bar, shadcn `Switch` + label "SAGE Mode", visible to all authenticated users

---

## Acceptance Criteria

- [ ] `UserProfile` has `sage_mode: a.boolean()` field
- [ ] `LegacyFragment` table exists and is accessible by authenticated owners
- [ ] All 6 expert Lambdas switch to SAGE behaviour when `sage_mode = true` (single handler.ts change)
- [ ] In SAGE mode: profileExtractor skips Bedrock, saves LegacyFragment instead
- [ ] In normal mode: profileExtractor behaviour unchanged
- [ ] UI toggle visible and functional for all authenticated users
- [ ] `npx ampx sandbox --profile le-prod` runs without errors

---

## Files to Create / Edit

| File | Change |
|------|--------|
| `amplify/data/resource.ts` | Add `sage_mode` to UserProfile; add `LegacyFragment` model |
| `amplify/functions/conversationHandler/handler.ts` | Read `sage_mode`, branch prompt + payload |
| `amplify/functions/profileExtractor/handler.ts` | Add `sageMode` to payload type; add LegacyFragment write branch |
| `amplify/backend.ts` | Grant LegacyFragment table write to profileExtractor; inject env var |
| `app/layout.tsx` | Add `<SageToggle />` to global nav |
| `components/SageToggle.tsx` | New component — Switch + UserProfile read/update |

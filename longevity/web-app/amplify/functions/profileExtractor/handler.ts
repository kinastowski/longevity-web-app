// ─── AWS clients ──────────────────────────────────────────────
import {
  BedrockRuntimeClient,
  ConverseCommand,
} from '@aws-sdk/client-bedrock-runtime';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, PutCommand } from '@aws-sdk/lib-dynamodb';

// Direct DynamoDB SDK — generateClient requires full Amplify outputs, not available in Lambdas without allow.resource()
const ddb = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: process.env.AWS_REGION ?? 'eu-west-1' })
);
const USERPROFILE_TABLE = process.env.USERPROFILE_TABLE_NAME!;
const CONVERSATIONMEMORY_TABLE = process.env.CONVERSATIONMEMORY_TABLE_NAME!;

const bedrockClient = new BedrockRuntimeClient({
  region: process.env.AWS_REGION ?? 'eu-west-1',
});

const MODEL_ID = 'eu.anthropic.claude-3-5-sonnet-20240620-v1:0';

// ─── Pure functions ───────────────────────────────────────────

export const EXTRACTABLE_KEYS = new Set([
  'age', 'weight', 'diet_style', 'supplements_current',
  'sleep_hours', 'stress_level', 'biggest_lever', 'stress_sources',
  'motivation_type', 'chronotype', 'sleep_quality', 'evening_routine',
]);

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

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

// ─── UserProfile shape (mirrors DynamoDB item fields) ────────
interface UserProfile {
  id: string;
  userId: string;
  owner?: string;
  createdAt?: string;
  updatedAt?: string;
  age?: number | null;
  weight?: string | null;
  diet_style?: string | null;
  supplements_current?: string[] | null;
  sleep_hours?: number | null;
  stress_level?: string | null;
  biggest_lever?: string | null;
  stress_sources?: string[] | null;
  motivation_type?: string | null;
  chronotype?: string | null;
  sleep_quality?: string | null;
  evening_routine?: string | null;
  profile_snapshot?: string | null;
}

// ─── Payload type ─────────────────────────────────────────────
export interface ExtractorPayload {
  userId: string;
  expertId: string;
  conversationId: string;
  graphqlApiEndpoint: string;
  authToken: string;
  listQueryName: string;
}

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
          ${listQueryName}(filter: { conversationId: { eq: "${conversationId}" } }, limit: 20) {
            items {
              role
              content { text }
            }
          }
        }`,
      }),
    });
    const json = (await resp.json()) as Record<string, unknown>;
    if (json?.errors) {
      console.error('[profileExtractor] GraphQL errors:', JSON.stringify(json.errors));
    }
    const data = (json?.data as Record<string, unknown>)?.[listQueryName] as
      | { items: Array<{ role: string; content: Array<{ text?: string }> }> }
      | undefined;
    const items = data?.items ?? [];
    console.log(`[profileExtractor] fetchMessages: got ${items.length} messages for conversationId=${conversationId}`);
    return items.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: (m.content ?? []).map((c) => c.text ?? '').join(' '),
    }));
  } catch (err) {
    console.error('[profileExtractor] fetchMessages error:', err);
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
  if (messages.length === 0) {
    console.log('[profileExtractor] No messages found — skipping extraction');
    return;
  }

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
  if (Object.keys(extracted).length === 0) {
    console.log('[profileExtractor] No extractable facts found — skipping DynamoDB write');
    return;
  }

  // 4. Fetch existing UserProfile (or null for first conversation)
  const profileResp = await ddb.send(
    new QueryCommand({
      TableName: USERPROFILE_TABLE,
      IndexName: 'userProfilesByUserId',
      KeyConditionExpression: 'userId = :uid',
      ExpressionAttributeValues: { ':uid': userId },
      Limit: 1,
    })
  );
  const existing = (profileResp.Items?.[0] as UserProfile | undefined) ?? null;

  // 5. Snapshot previous version before merge
  const snapshot = existing ? JSON.stringify(existing) : null;

  // 6. Merge extracted fields into profile
  const merged = mergeProfile(
    (existing ?? {}) as Record<string, unknown>,
    extracted
  );

  const now = new Date().toISOString();

  // 7. Write UserProfile (upsert via PutCommand)
  await ddb.send(
    new PutCommand({
      TableName: USERPROFILE_TABLE,
      Item: {
        id: existing?.id ?? crypto.randomUUID(),
        userId,
        // owner = sub so Cognito owner-auth (identityClaim('sub')) allows user reads
        owner: existing?.owner ?? userId,
        ...merged,
        profile_snapshot: snapshot,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      },
    })
  );

  // 8. Write ConversationMemory audit record
  await ddb.send(
    new PutCommand({
      TableName: CONVERSATIONMEMORY_TABLE,
      Item: {
        id: crypto.randomUUID(),
        userId,
        owner: userId,
        expertId,
        conversationId,
        extractedFacts: JSON.stringify(extracted),
        createdAt: now,
        updatedAt: now,
      },
    })
  );
};

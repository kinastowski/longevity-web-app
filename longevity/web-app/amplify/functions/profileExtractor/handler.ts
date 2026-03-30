const EXTRACTABLE_KEYS = new Set([
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

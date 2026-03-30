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

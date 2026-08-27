import { describe, it, expect } from 'vitest';
import { classifyIntent } from '../src/utils/protectedText/intentClassifier';

describe('Local intent classifier (Protected Text v2)', () => {
  it('classifies empty string as GENERAL', () => {
    expect(classifyIntent('')).toBe('GENERAL');
  });

  it('classifies urgent messages', () => {
    expect(classifyIntent('This is urgent, please respond now!!')).toBe('URGENT');
    expect(classifyIntent('emergency!!!')).toBe('URGENT');
  });

  it('classifies questions', () => {
    expect(classifyIntent('Are you coming tonight?')).toBe('QUESTION');
    expect(classifyIntent('How are you')).toBe('QUESTION');
  });

  it('classifies time-related messages', () => {
    expect(classifyIntent("Let's meet tomorrow morning")).toBe('TIME');
    expect(classifyIntent('See you at 8pm')).toBe('TIME');
  });

  it('classifies location-related messages', () => {
    expect(classifyIntent('Meet me at the station')).toBe('LOCATION');
  });

  it('classifies requests', () => {
    expect(classifyIntent('Please send the file')).toBe('REQUEST');
    expect(classifyIntent('Could you help with this')).toBe('QUESTION');
  });

  it('classifies negation', () => {
    expect(classifyIntent("No, I don't think so")).toBe('NEGATION');
  });

  it('classifies affirmation', () => {
    expect(classifyIntent('Yes, sounds good')).toBe('AFFIRMATION');
  });

  it('classifies greetings', () => {
    expect(classifyIntent('Hello there')).toBe('GREETING');
    expect(classifyIntent('Good morning!')).toBe('GREETING');
  });

  it('classifies farewells', () => {
    expect(classifyIntent('Bye, take care')).toBe('FAREWELL');
  });

  it('classifies acknowledgements', () => {
    expect(classifyIntent('Got it, thanks')).toBe('ACKNOWLEDGEMENT');
  });

  it('falls back to GENERAL for unclassifiable content', () => {
    expect(classifyIntent('The quarterly report numbers look fine')).toBe('GENERAL');
  });

  it('is deterministic', () => {
    const input = 'Meet me at the station tomorrow at 8pm, urgent!!';
    expect(classifyIntent(input)).toBe(classifyIntent(input));
  });

  it('never throws on unusual input', () => {
    expect(() => classifyIntent('😊'.repeat(50))).not.toThrow();
    expect(() => classifyIntent('你好，世界！')).not.toThrow();
  });
});

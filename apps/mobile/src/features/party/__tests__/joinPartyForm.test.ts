import {
  isValidJoinCode,
  sanitizeJoinCodeInput,
  validateJoinPartyForm,
} from '@/features/party/joinPartyForm';

describe('sanitizeJoinCodeInput', () => {
  it('uppercases input', () => {
    expect(sanitizeJoinCodeInput('abc23x')).toBe('ABC23X');
  });

  it('drops characters outside the allowed alphabet (0/O/I/1)', () => {
    expect(sanitizeJoinCodeInput('O0I1AB')).toBe('AB');
  });

  it('strips whitespace and punctuation', () => {
    expect(sanitizeJoinCodeInput('AB 23-X')).toBe('AB23X');
  });

  it('caps length at 6', () => {
    expect(sanitizeJoinCodeInput('ABCDEFGH')).toBe('ABCDEF');
  });
});

describe('isValidJoinCode', () => {
  it('accepts a valid 6-character code', () => {
    expect(isValidJoinCode('ABC23X')).toBe(true);
  });

  it('rejects a code shorter than 6', () => {
    expect(isValidJoinCode('ABC23')).toBe(false);
  });

  it('rejects a code containing a disallowed character', () => {
    expect(isValidJoinCode('ABC2O0')).toBe(false);
  });

  it('rejects a lowercase code (must be sanitized first)', () => {
    expect(isValidJoinCode('abc23x')).toBe(false);
  });
});

describe('validateJoinPartyForm', () => {
  it('accepts a valid code and name, returning normalized params', () => {
    const result = validateJoinPartyForm({ joinCode: 'abc23x', displayName: '  Kashawn  ' });
    expect(result).toEqual({ ok: true, params: { joinCode: 'ABC23X', displayName: 'Kashawn' } });
  });

  it('rejects an incomplete join code', () => {
    const result = validateJoinPartyForm({ joinCode: 'ABC', displayName: 'Kashawn' });
    expect(result.ok).toBe(false);
  });

  it('rejects an empty display name', () => {
    const result = validateJoinPartyForm({ joinCode: 'ABC23X', displayName: '   ' });
    expect(result.ok).toBe(false);
  });
});

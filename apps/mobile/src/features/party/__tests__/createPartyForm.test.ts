import {
  formatDefaultPartyName,
  validateCreatePartyForm,
  type CreatePartyFormInput,
} from '@/features/party/createPartyForm';

// A valid baseline; each test overrides only the field under inspection.
function baseInput(overrides: Partial<CreatePartyFormInput> = {}): CreatePartyFormInput {
  return {
    partyName: 'Friday Night Shots',
    startingIntervalMinutes: '5',
    intervalIncrementMinutes: '2',
    shotWindowSeconds: '30',
    eliminationEnabled: true,
    graceMode: 'enabled',
    hostDisplayName: 'Kashawn',
    hostOnly: false,
    ...overrides,
  };
}

describe('validateCreatePartyForm', () => {
  it('accepts a valid form and converts minutes to seconds', () => {
    const result = validateCreatePartyForm(baseInput());
    expect(result).toEqual({
      ok: true,
      params: {
        partyName: 'Friday Night Shots',
        startingIntervalSecs: 300,
        intervalIncrementSecs: 120,
        shotWindowSecs: 30,
        eliminationEnabled: true,
        graceMode: 'enabled',
        hostDisplayName: 'Kashawn',
        hostOnly: false,
      },
    });
  });

  it('threads host_only through to the params', () => {
    const result = validateCreatePartyForm(baseInput({ hostOnly: true }));
    expect(result.ok && result.params.hostOnly).toBe(true);
  });

  it('trims the party name before length-checking and sending', () => {
    const result = validateCreatePartyForm(baseInput({ partyName: '  Party  ' }));
    expect(result.ok && result.params.partyName).toBe('Party');
  });

  it('rejects an empty party name', () => {
    const result = validateCreatePartyForm(baseInput({ partyName: '   ' }));
    expect(result.ok).toBe(false);
  });

  it('rejects a party name longer than 60 characters', () => {
    const result = validateCreatePartyForm(baseInput({ partyName: 'a'.repeat(61) }));
    expect(result.ok).toBe(false);
  });

  it('counts party-name length in code points, not UTF-16 units', () => {
    // 60 astral-plane emoji = 60 code points (120 UTF-16 units) — must pass.
    const result = validateCreatePartyForm(baseInput({ partyName: '😀'.repeat(60) }));
    expect(result.ok).toBe(true);
  });

  it('allows a zero interval increment', () => {
    const result = validateCreatePartyForm(baseInput({ intervalIncrementMinutes: '0' }));
    expect(result.ok && result.params.intervalIncrementSecs).toBe(0);
  });

  it('rejects a non-integer starting interval', () => {
    const result = validateCreatePartyForm(baseInput({ startingIntervalMinutes: '5.5' }));
    expect(result.ok).toBe(false);
  });

  it('rejects an empty numeric field', () => {
    const result = validateCreatePartyForm(baseInput({ shotWindowSeconds: '' }));
    expect(result.ok).toBe(false);
  });

  it('rejects a starting interval above the 60-minute max', () => {
    const result = validateCreatePartyForm(baseInput({ startingIntervalMinutes: '61' }));
    expect(result.ok).toBe(false);
  });

  it('rejects an interval increment above the 10-minute max', () => {
    const result = validateCreatePartyForm(baseInput({ intervalIncrementMinutes: '11' }));
    expect(result.ok).toBe(false);
  });

  it('rejects a shot window below the 15-second min', () => {
    const result = validateCreatePartyForm(baseInput({ shotWindowSeconds: '14' }));
    expect(result.ok).toBe(false);
  });

  it('accepts a shot window at the 15-second min', () => {
    const result = validateCreatePartyForm(baseInput({ shotWindowSeconds: '15' }));
    expect(result.ok && result.params.shotWindowSecs).toBe(15);
  });

  it('rejects a shot window above the 300-second max', () => {
    const result = validateCreatePartyForm(baseInput({ shotWindowSeconds: '301' }));
    expect(result.ok).toBe(false);
  });

  it('collapses grace mode to disabled when elimination is off', () => {
    const result = validateCreatePartyForm(
      baseInput({ eliminationEnabled: false, graceMode: 'unlimited' }),
    );
    expect(result.ok && result.params.graceMode).toBe('disabled');
  });

  it('preserves the chosen grace mode when elimination is on', () => {
    const result = validateCreatePartyForm(
      baseInput({ eliminationEnabled: true, graceMode: 'unlimited' }),
    );
    expect(result.ok && result.params.graceMode).toBe('unlimited');
  });

  it('rejects a missing display name', () => {
    const result = validateCreatePartyForm(baseInput({ hostDisplayName: null }));
    expect(result.ok).toBe(false);
  });
});

describe('formatDefaultPartyName', () => {
  it('formats as "Shot O\'Clock MM/DD/YY"', () => {
    // Month is 0-indexed: 5 = June.
    expect(formatDefaultPartyName(new Date(2026, 5, 8))).toBe("Shot O'Clock 06/08/26");
  });

  it('zero-pads single-digit month and day', () => {
    expect(formatDefaultPartyName(new Date(2026, 0, 3))).toBe("Shot O'Clock 01/03/26");
  });

  it('uses the last two digits of the year', () => {
    expect(formatDefaultPartyName(new Date(2030, 11, 25))).toBe("Shot O'Clock 12/25/30");
  });
});

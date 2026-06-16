import { joinCodeShareMessage } from '@/features/party/shareJoinCode';

describe('joinCodeShareMessage', () => {
  it('includes the party name when present', () => {
    expect(joinCodeShareMessage('Friday Night Shots', 'ABC123')).toBe(
      'Join my Shot O\'Clock party "Friday Night Shots"! Enter join code ABC123 in the app.',
    );
  });

  it('drops the name cleanly when missing (null / undefined / blank)', () => {
    const expected = "Join my Shot O'Clock party! Enter join code ABC123 in the app.";
    expect(joinCodeShareMessage(null, 'ABC123')).toBe(expected);
    expect(joinCodeShareMessage(undefined, 'ABC123')).toBe(expected);
    expect(joinCodeShareMessage('   ', 'ABC123')).toBe(expected);
  });

  it('trims surrounding whitespace from the party name', () => {
    expect(joinCodeShareMessage('  Beach Day  ', 'XYZ789')).toBe(
      'Join my Shot O\'Clock party "Beach Day"! Enter join code XYZ789 in the app.',
    );
  });
});

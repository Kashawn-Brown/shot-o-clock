import { selfOutCopy } from '@/features/game/selfOutCopy';

describe('selfOutCopy', () => {
  describe('elimination off', () => {
    it('labels the action "Skip" and promises no consequence', () => {
      const copy = selfOutCopy({
        eliminationEnabled: false,
        graceMode: 'disabled',
        usedGrace: false,
        selfOutRecorded: false,
      });
      expect(copy.label).toBe('Skip');
      expect(copy.confirmButton).toBe('Skip');
      expect(copy.confirmTitle).toBe('Skip this round?');
      expect(copy.confirmMessage).toContain('No consequence');
    });

    it('wins over grace mode (grace is irrelevant when elimination is off)', () => {
      const copy = selfOutCopy({
        eliminationEnabled: false,
        graceMode: 'enabled',
        usedGrace: false,
        selfOutRecorded: false,
      });
      expect(copy.label).toBe('Skip');
      expect(copy.confirmMessage).toContain('No consequence');
    });
  });

  describe('elimination on, grace in hand', () => {
    it('labels the action "Skip this shot" and warns it consumes grace', () => {
      const copy = selfOutCopy({
        eliminationEnabled: true,
        graceMode: 'enabled',
        usedGrace: false,
        selfOutRecorded: false,
      });
      expect(copy.label).toBe('Skip this shot');
      expect(copy.confirmButton).toBe('Skip');
      expect(copy.confirmMessage).toContain('use your grace');
      expect(copy.confirmMessage).toContain('can still be eliminated');
    });
  });

  describe('elimination on, no grace left', () => {
    it('labels the action "I\'m Out" and warns it is permanent', () => {
      const copy = selfOutCopy({
        eliminationEnabled: true,
        graceMode: 'enabled',
        usedGrace: true,
        selfOutRecorded: false,
      });
      expect(copy.label).toBe("I'm Out");
      expect(copy.confirmButton).toBe("I'm Out");
      expect(copy.confirmTitle).toBe("I'm Out?");
      expect(copy.confirmMessage).toContain('only the host can bring you back');
    });

    it('treats grace disabled the same as grace exhausted', () => {
      const copy = selfOutCopy({
        eliminationEnabled: true,
        graceMode: 'disabled',
        usedGrace: false,
        selfOutRecorded: false,
      });
      expect(copy.label).toBe("I'm Out");
    });
  });

  describe('once recorded', () => {
    it('reads "Skipped" when the action was a skip', () => {
      const copy = selfOutCopy({
        eliminationEnabled: false,
        graceMode: 'disabled',
        usedGrace: false,
        selfOutRecorded: true,
      });
      expect(copy.label).toBe('Skipped');
    });

    it('reads "You\'re out" when the action was a permanent out', () => {
      const copy = selfOutCopy({
        eliminationEnabled: true,
        graceMode: 'disabled',
        usedGrace: false,
        selfOutRecorded: true,
      });
      expect(copy.label).toBe("You're out");
    });
  });
});

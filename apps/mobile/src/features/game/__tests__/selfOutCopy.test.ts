import { selfOutCopy } from '@/features/game/selfOutCopy';

describe('selfOutCopy', () => {
  describe('elimination off', () => {
    it('labels the action "Skip" and needs no confirmation (no consequence)', () => {
      const copy = selfOutCopy({
        eliminationEnabled: false,
        graceMode: 'disabled',
        usedGrace: false,
        selfOutRecorded: false,
      });
      expect(copy.label).toBe('Skip');
      expect(copy.confirmButton).toBe('Skip');
      expect(copy.requiresConfirm).toBe(false);
    });

    it('wins over grace mode (grace is irrelevant when elimination is off)', () => {
      const copy = selfOutCopy({
        eliminationEnabled: false,
        graceMode: 'enabled',
        usedGrace: false,
        selfOutRecorded: false,
      });
      expect(copy.label).toBe('Skip');
      expect(copy.requiresConfirm).toBe(false);
    });
  });

  describe('elimination on, grace in hand', () => {
    it('labels the action "Use Grace", confirms, and mentions grace', () => {
      const copy = selfOutCopy({
        eliminationEnabled: true,
        graceMode: 'enabled',
        usedGrace: false,
        selfOutRecorded: false,
      });
      expect(copy.label).toBe('Use Grace');
      expect(copy.confirmButton).toBe('Use Grace');
      expect(copy.confirmTitle).toBe('Use your grace?');
      expect(copy.requiresConfirm).toBe(true);
      expect(copy.confirmMessage).toContain('grace');
    });
  });

  describe('elimination on, no grace left', () => {
    it('labels the action "I\'m Out", confirms, and says it is permanent', () => {
      const copy = selfOutCopy({
        eliminationEnabled: true,
        graceMode: 'enabled',
        usedGrace: true,
        selfOutRecorded: false,
      });
      expect(copy.label).toBe("I'm Out");
      expect(copy.confirmButton).toBe("I'm Out");
      expect(copy.confirmTitle).toBe("I'm Out?");
      expect(copy.requiresConfirm).toBe(true);
      expect(copy.confirmMessage).toContain('rest of the game');
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
    it('reads "Skipped" when the action was a no-consequence skip', () => {
      const copy = selfOutCopy({
        eliminationEnabled: false,
        graceMode: 'disabled',
        usedGrace: false,
        selfOutRecorded: true,
      });
      expect(copy.label).toBe('Skipped');
    });

    it('reads "Grace used" when the action consumed grace', () => {
      const copy = selfOutCopy({
        eliminationEnabled: true,
        graceMode: 'enabled',
        usedGrace: false,
        selfOutRecorded: true,
      });
      expect(copy.label).toBe('Grace used');
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

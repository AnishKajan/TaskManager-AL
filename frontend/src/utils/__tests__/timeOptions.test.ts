// src/utils/__tests__/timeOptions.test.ts
import { 
  hourOptions, 
  minuteOptions, 
  AMPMOptions, 
  priorityOptions, 
  recurringOptions 
} from '../timeOptions';

describe('timeOptions utilities', () => {
  describe('hourOptions', () => {
    it('should contain valid hours from 1 to 12', () => {
      expect(hourOptions).toHaveLength(12);
      expect(hourOptions).toContain('1');
      expect(hourOptions).toContain('12');
      expect(hourOptions).not.toContain('0');
      expect(hourOptions).not.toContain('13');
    });
  });

  describe('minuteOptions', () => {
    it('should contain common minute intervals', () => {
      expect(minuteOptions).toContain('00');
      expect(minuteOptions).toContain('15');
      expect(minuteOptions).toContain('30');
      expect(minuteOptions).toContain('45');
    });
  });

  describe('AMPMOptions', () => {
    it('should contain exactly AM and PM', () => {
      expect(AMPMOptions).toHaveLength(2);
      expect(AMPMOptions).toEqual(['AM', 'PM']);
    });
  });

  describe('priorityOptions', () => {
    it('should contain expected priority levels', () => {
      expect(priorityOptions).toContain('High');
      expect(priorityOptions).toContain('Medium');
      expect(priorityOptions).toContain('Low');
    });
  });

  describe('recurringOptions', () => {
    it('should contain expected recurrence types', () => {
      expect(recurringOptions).toContain('Daily');
      expect(recurringOptions).toContain('Weekly');
      expect(recurringOptions).toContain('Monthly');
      expect(recurringOptions).toContain('Yearly');
      expect(recurringOptions).toContain('Weekdays');
    });
  });
});
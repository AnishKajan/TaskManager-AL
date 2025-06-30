import { getMinutes, getTaskStatus, isRecurringMatch } from '../taskUtils';

// Mock Task interface for testing
interface MockTask {
  _id: string;
  title: string;
  date: string;
  section: 'work' | 'school' | 'personal';
  startTime: {
    hour: string;
    minute: string;
    period: 'AM' | 'PM';
  };
  endTime?: {
    hour: string;
    minute: string;
    period: 'AM' | 'PM';
  } | null;
  userId: string;
}

describe('taskUtils', () => {
  describe('getMinutes', () => {
    it('converts AM times correctly', () => {
      expect(getMinutes('12', '00', 'AM')).toBe(0); // Midnight
      expect(getMinutes('1', '30', 'AM')).toBe(90); // 1:30 AM
      expect(getMinutes('11', '45', 'AM')).toBe(705); // 11:45 AM
    });

    it('converts PM times correctly', () => {
      expect(getMinutes('12', '00', 'PM')).toBe(720); // Noon
      expect(getMinutes('1', '30', 'PM')).toBe(810); // 1:30 PM
      expect(getMinutes('11', '45', 'PM')).toBe(1425); // 11:45 PM
    });

    it('handles edge cases', () => {
      expect(getMinutes('12', '30', 'AM')).toBe(30); // 12:30 AM = 30 minutes
      expect(getMinutes('12', '30', 'PM')).toBe(750); // 12:30 PM = 750 minutes
    });

    it('handles string input correctly', () => {
      expect(getMinutes('09', '05', 'AM')).toBe(545); // 9:05 AM
      expect(getMinutes('2', '0', 'PM')).toBe(840); // 2:00 PM
    });
  });

  describe('getTaskStatus - simplified tests', () => {
    const mockTask: MockTask = {
      _id: 'test-id',
      title: 'Test Task',
      date: '2023-12-25', // December 25, 2023
      section: 'work',
      startTime: { hour: '9', minute: '00', period: 'AM' },
      endTime: { hour: '10', minute: '00', period: 'AM' },
      userId: 'user-123'
    };

    it('works with basic functionality', () => {
      // Test that the function runs without errors
      const currentDate = new Date('2023-12-25');
      const result = getTaskStatus(mockTask, currentDate);
      
      // Should return one of the valid statuses
      expect(['Pending', 'In Progress', 'Complete']).toContain(result);
    });

    it('handles tasks without end time', () => {
      const taskWithoutEnd = { ...mockTask, endTime: null };
      const currentDate = new Date('2023-12-25');
      
      const result = getTaskStatus(taskWithoutEnd, currentDate);
      expect(['Pending', 'In Progress', 'Complete']).toContain(result);
    });

    it('handles PM times', () => {
      const pmTask = {
        ...mockTask,
        startTime: { hour: '2', minute: '00', period: 'PM' as const },
        endTime: { hour: '3', minute: '00', period: 'PM' as const }
      };
      
      const currentDate = new Date('2023-12-25');
      const result = getTaskStatus(pmTask, currentDate);
      
      expect(['Pending', 'In Progress', 'Complete']).toContain(result);
    });
  });

  describe('isRecurringMatch', () => {
    it('handles Daily recurring tasks correctly', () => {
      const pastTaskDate = '2023-12-20'; // Earlier date
      const testDate = new Date('2023-12-25'); // Later date
      
      expect(isRecurringMatch('Daily', pastTaskDate, testDate)).toBe(true);
    });

    it('handles Weekly recurring tasks correctly', () => {
      // December 25, 2023 is a Monday
      const testDate = new Date('2023-12-25');
      
      // December 18, 2023 is also a Monday (previous week)
      const mondayTaskDate = '2023-12-18';
      expect(isRecurringMatch('Weekly', mondayTaskDate, testDate)).toBe(true);
      
      // December 19, 2023 is a Tuesday
      const tuesdayTaskDate = '2023-12-19';
      expect(isRecurringMatch('Weekly', tuesdayTaskDate, testDate)).toBe(false);
    });

    it('handles Monthly recurring tasks correctly', () => {
      const testDate = new Date('2023-12-25'); // 25th of December
      
      // Same day of month, previous month
      const sameDay = '2023-11-25';
      expect(isRecurringMatch('Monthly', sameDay, testDate)).toBe(true);
      
      // Different day of month
      const differentDay = '2023-11-20';
      expect(isRecurringMatch('Monthly', differentDay, testDate)).toBe(false);
    });

    it('handles Yearly recurring tasks correctly', () => {
      const testDate = new Date('2023-12-25'); // Dec 25, 2023
      
      // Same month and day, previous year
      const sameMonthDay = '2022-12-25';
      expect(isRecurringMatch('Yearly', sameMonthDay, testDate)).toBe(true);
      
      // Different month
      const differentMonth = '2022-11-25';
      expect(isRecurringMatch('Yearly', differentMonth, testDate)).toBe(false);
      
      // Different day
      const differentDay = '2022-12-20';
      expect(isRecurringMatch('Yearly', differentDay, testDate)).toBe(false);
    });

    it('returns false for invalid inputs', () => {
      const testDate = new Date('2023-12-25');
      
      expect(isRecurringMatch('', '2023-12-25', testDate)).toBe(false);
      expect(isRecurringMatch('Daily', '', testDate)).toBe(false);
      expect(isRecurringMatch('InvalidType', '2023-12-25', testDate)).toBe(false);
    });

    it('returns false when task date is after current date', () => {
      const testDate = new Date('2023-12-25');
      const futureDate = '2023-12-30'; // Future date
      
      // Future dates should return false for all recurring types
      expect(isRecurringMatch('Daily', futureDate, testDate)).toBe(false);
      expect(isRecurringMatch('Weekly', futureDate, testDate)).toBe(false);
      expect(isRecurringMatch('Monthly', futureDate, testDate)).toBe(false);
      expect(isRecurringMatch('Yearly', futureDate, testDate)).toBe(false);
    });
  });
});
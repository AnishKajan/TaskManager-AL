const { format, addDays, addWeeks, nextMonday, nextTuesday, nextWednesday, nextThursday, nextFriday, nextSaturday, nextSunday } = require('date-fns');

class DateProcessor {
  constructor() {
    this.dayMap = {
      monday: nextMonday,
      tuesday: nextTuesday,
      wednesday: nextWednesday,
      thursday: nextThursday,
      friday: nextFriday,
      saturday: nextSaturday,
      sunday: nextSunday
    };
  }

  parseDate(dateString) {
    if (!dateString) return this.formatDate(new Date());

    const input = dateString.toLowerCase().trim();
    const now = new Date();

    try {
      // Handle relative dates
      switch (input) {
        case 'today':
          return this.formatDate(now);
        
        case 'tomorrow':
          return this.formatDate(addDays(now, 1));
        
        case 'next week':
          return this.formatDate(addWeeks(now, 1));
        
        default:
          // Handle "next [day]"
          const nextDayMatch = input.match(/^next\s+(\w+)$/);
          if (nextDayMatch) {
            const day = nextDayMatch[1];
            if (this.dayMap[day]) {
              return this.formatDate(this.dayMap[day](now));
            }
          }

          // Handle "in X days"
          const inDaysMatch = input.match(/^in\s+(\d+)\s+days?$/);
          if (inDaysMatch) {
            const days = parseInt(inDaysMatch[1]);
            return this.formatDate(addDays(now, days));
          }

          // Handle specific date formats
          const dateFormats = [
            // MM/DD/YYYY
            /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,
            // YYYY-MM-DD
            /^(\d{4})-(\d{1,2})-(\d{1,2})$/,
            // MM-DD-YYYY
            /^(\d{1,2})-(\d{1,2})-(\d{4})$/
          ];

          for (const format of dateFormats) {
            const match = input.match(format);
            if (match) {
              let year, month, day;
              
              if (format.source.includes('(\\d{4})')) {
                // YYYY-MM-DD format
                year = parseInt(match[1]);
                month = parseInt(match[2]) - 1; // JS months are 0-indexed
                day = parseInt(match[3]);
              } else {
                // MM/DD/YYYY or MM-DD-YYYY format
                month = parseInt(match[1]) - 1; // JS months are 0-indexed
                day = parseInt(match[2]);
                year = parseInt(match[3]);
              }
              
              const date = new Date(year, month, day);
              if (this.isValidDate(date)) {
                return this.formatDate(date);
              }
            }
          }

          // If no pattern matches, try native Date parsing as fallback
          const fallbackDate = new Date(dateString);
          if (this.isValidDate(fallbackDate)) {
            return this.formatDate(fallbackDate);
          }

          console.warn('Could not parse date:', dateString);
          return this.formatDate(now); // Default to today
      }
    } catch (error) {
      console.error('Error parsing date:', error);
      return this.formatDate(now); // Default to today on error
    }
  }

  parseTime(timeString) {
    if (!timeString) return null;

    const input = timeString.toLowerCase().trim();

    // Time patterns
    const patterns = [
      // 3:30 PM, 3:30PM, 3:30 pm
      /^(\d{1,2}):(\d{2})\s*(am|pm)$/,
      // 3 PM, 3PM, 3 pm
      /^(\d{1,2})\s*(am|pm)$/,
      // 15:30 (24-hour format)
      /^(\d{1,2}):(\d{2})$/,
      // 15 (24-hour format, hour only)
      /^(\d{1,2})$/
    ];

    for (const pattern of patterns) {
      const match = input.match(pattern);
      if (match) {
        let hour = parseInt(match[1]);
        let minute = match[2] ? parseInt(match[2]) : 0;
        let period = match[3] ? match[3].toUpperCase() : null;

        // Handle 24-hour format conversion
        if (!period) {
          if (hour >= 12) {
            period = 'PM';
            if (hour > 12) hour -= 12;
          } else if (hour === 0) {
            hour = 12;
            period = 'AM';
          } else {
            // For ambiguous cases (1-11), default to AM for early hours, PM for later
            period = hour < 7 ? 'PM' : 'AM';
          }
        }

        // Validate and adjust hour for 12-hour format
        if (period === 'PM' && hour !== 12) {
          // Don't modify hour for PM (already handled above)
        } else if (period === 'AM' && hour === 12) {
          hour = 12; // 12 AM stays as 12
        }

        // Ensure hour is in valid range (1-12)
        if (hour < 1 || hour > 12) {
          continue; // Skip invalid hours
        }

        // Ensure minute is in valid range (0-59)
        if (minute < 0 || minute > 59) {
          continue; // Skip invalid minutes
        }

        return {
          hour: hour.toString(),
          minute: minute.toString().padStart(2, '0'),
          period: period
        };
      }
    }

    console.warn('Could not parse time:', timeString);
    return null;
  }

  formatDate(date) {
    try {
      return format(date, 'yyyy-MM-dd');
    } catch (error) {
      console.error('Error formatting date:', error);
      return format(new Date(), 'yyyy-MM-dd');
    }
  }

  isValidDate(date) {
    return date instanceof Date && !isNaN(date.getTime());
  }

  // Helper method to get relative date descriptions
  getRelativeDateDescription(dateString) {
    const targetDate = new Date(dateString);
    const today = new Date();
    const tomorrow = addDays(today, 1);

    // Normalize dates to compare just the date part
    const normalizeDate = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
    
    const normalizedTarget = normalizeDate(targetDate);
    const normalizedToday = normalizeDate(today);
    const normalizedTomorrow = normalizeDate(tomorrow);

    if (normalizedTarget.getTime() === normalizedToday.getTime()) {
      return 'today';
    } else if (normalizedTarget.getTime() === normalizedTomorrow.getTime()) {
      return 'tomorrow';
    } else {
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      return dayNames[targetDate.getDay()];
    }
  }

  // Helper method to format time for display
  formatTimeForDisplay(timeObj) {
    if (!timeObj || !timeObj.hour || !timeObj.minute || !timeObj.period) {
      return 'Invalid time';
    }
    
    return `${timeObj.hour}:${timeObj.minute} ${timeObj.period}`;
  }

  // Helper method to validate if a date string is a future date
  isFutureDate(dateString) {
    const targetDate = new Date(dateString);
    const today = new Date();
    
    // Normalize to compare just dates, not times
    const normalizedTarget = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
    const normalizedToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    
    return normalizedTarget.getTime() >= normalizedToday.getTime();
  }
}

// Export singleton instance
module.exports = new DateProcessor();
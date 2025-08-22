import nlp from 'compromise';
import { addDays, addMonths, addYears, format, parse, isValid } from 'date-fns';

// Define types for the NLP service
interface TimeInfo {
  hour: string;
  minute: string;
  period: string;
  ampm: string;
}

interface DateInfo {
  date: string | null;
  originalText: string | null;
}

interface TaskData {
  title: string;
  section: string;
  date: string;
  startTime: TimeInfo;
  endTime?: TimeInfo;
  priority?: string;
  recurring?: string;
  collaborators: any[];
}

interface ParseResult {
  type: string;
  message: string;
  taskData?: TaskData;
  section?: string;
  date?: string;
  userEmail?: string;
  originalMessage?: string;
  missingFields?: string[];
  suggestions?: string[];
  taskId?: string;
  updates?: any;
}

interface PendingConfirmation {
  type: string;
  originalMessage: string;
  timestamp: number;
}

class EnhancedNlpService {
  private pendingConfirmations: Map<string, PendingConfirmation>;

  constructor() {
    this.pendingConfirmations = new Map();
  }

  // Main parsing function
  parseMessage(message: string, userEmail: string, currentSection: string = 'personal'): ParseResult {
    const normalizedMessage = message.toLowerCase().trim();
    
    console.log('🧠 NLP Service: Parsing message:', message, 'Current section:', currentSection);
    
    // Check if this is a confirmation response
    if (this.pendingConfirmations.has(userEmail)) {
      return this.handleConfirmation(normalizedMessage, userEmail);
    }

    // Determine intent
    const intent = this.detectIntent(normalizedMessage);
    
    switch (intent.type) {
      case 'create_task':
        return this.parseCreateTask(message, currentSection);
      case 'show_tasks':
        return this.parseShowTasks(message);
      case 'update_task':
        return this.parseUpdateTask(message, userEmail);
      case 'delete_task':
        return this.parseDeleteTask(message, userEmail);
      case 'schedule_query':
        return this.parseScheduleQuery(message);
      default:
        return {
          type: 'unknown',
          message: "I can help you create, show, update, or delete tasks. Try saying something like 'create workout task at 7am' or 'show my tasks'."
        };
    }
  }

  // Enhanced intent detection
  private detectIntent(message: string): { type: string } {
    const doc = nlp(message);
    
    // Create task patterns
    if (
      message.includes('create') || 
      message.includes('add') || 
      message.includes('make') || 
      message.includes('new task')
    ) {
      return { type: 'create_task' };
    }
    
    // Show/list tasks patterns
    if (
      message.includes('show') || 
      message.includes('list') || 
      message.includes('display') || 
      message.includes('my tasks') ||
      message.includes('see my')
    ) {
      return { type: 'show_tasks' };
    }
    
    // Schedule query patterns
    if (
      message.includes('schedule') || 
      message.includes('agenda') ||
      (message.includes('what') && (message.includes('today') || message.includes('tomorrow')))
    ) {
      return { type: 'schedule_query' };
    }
    
    // Update task patterns
    if (
      message.includes('update') || 
      message.includes('change') || 
      message.includes('modify') || 
      message.includes('edit') ||
      message.includes('move')
    ) {
      return { type: 'update_task' };
    }
    
    // Delete task patterns
    if (
      message.includes('delete') || 
      message.includes('remove') || 
      message.includes('cancel')
    ) {
      return { type: 'delete_task' };
    }
    
    return { type: 'unknown' };
  }

  // Enhanced task creation parsing
  private parseCreateTask(message: string, currentSection: string = 'personal'): ParseResult {
    console.log('🔍 Parsing create task:', message, 'Default section:', currentSection);
    
    const doc = nlp(message);
    
    // Extract task name (everything between create/add/make and "for" or section words)
    let taskName = this.extractTaskName(message);
    console.log('📝 Extracted task name:', taskName);
    
    // Extract section - use current section as default if not specified in message
    let section = this.extractSection(message);
    if (!section || section === 'personal') {
      // If no section specified in message or defaulted to personal, use current section
      section = currentSection;
    }
    console.log('📂 Extracted section:', section, '(using current section as default)');
    
    // Extract date
    const dateInfo = this.extractDate(message);
    console.log('📅 Extracted date info:', dateInfo);
    
    // Extract time
    const timeInfo = this.extractTime(message);
    console.log('⏰ Extracted time info:', timeInfo);
    
    // Extract priority
    const priority = this.extractPriority(message);
    
    // Extract recurring pattern
    const recurring = this.extractRecurring(message);
    
    // Validation - check required fields
    const missingFields: string[] = [];
    if (!taskName || taskName.trim() === '') {
      missingFields.push('task name');
    }
    if (!dateInfo.date) {
      missingFields.push('starting date');
    }
    if (!timeInfo.startTime) {
      missingFields.push('start time');
    }
    
    if (missingFields.length > 0) {
      return {
        type: 'validation_error',
        message: `I need the following information to create a task: ${missingFields.join(', ')}. Please provide all required fields.`,
        missingFields,
        suggestions: [
          `Create workout task at 7am tomorrow`,
          `Add meeting task on Friday at 2pm`,
          `Make study task for next week at 3:30pm`
        ]
      };
    }
    
    return {
      type: 'create_task',
      taskData: {
        title: taskName.trim(),
        section: section,
        date: dateInfo.date!,
        startTime: timeInfo.startTime!,
        endTime: timeInfo.endTime,
        priority: priority || undefined,
        recurring: recurring || undefined,
        collaborators: []
      },
      message: `Creating task "${taskName}" for ${section} on ${dateInfo.date} at ${this.formatTime(timeInfo.startTime!)}`
    };
  }

  // Enhanced task name extraction
  private extractTaskName(message: string): string {
    const doc = nlp(message);
    
    // Pattern 1: "create [task name] for [section]"
    let match = message.match(/(?:create|add|make|new)\s+(.+?)\s+(?:for|on|at|in)/i);
    if (match && match[1]) {
      let taskName = match[1].trim();
      // Remove common words that might be mistakenly included
      taskName = taskName.replace(/\b(task|new|a)\b/gi, '').trim();
      if (taskName) return taskName;
    }
    
    // Pattern 2: "create [task name] task"
    match = message.match(/(?:create|add|make)\s+(.+?)\s+task/i);
    if (match && match[1]) {
      return match[1].trim();
    }
    
    // Pattern 3: Look for nouns after create/add/make
    const words = message.split(' ');
    const createIndex = words.findIndex(word => 
      ['create', 'add', 'make', 'new'].includes(word.toLowerCase())
    );
    
    if (createIndex !== -1) {
      const afterCreate = words.slice(createIndex + 1);
      const stopWords = ['for', 'on', 'at', 'in', 'tomorrow', 'today', 'work', 'personal', 'school'];
      const taskWords: string[] = [];
      
      for (const word of afterCreate) {
        if (stopWords.includes(word.toLowerCase()) || this.isTimeWord(word) || this.isDateWord(word)) {
          break;
        }
        if (word.toLowerCase() !== 'task') {
          taskWords.push(word);
        }
      }
      
      if (taskWords.length > 0) {
        return taskWords.join(' ');
      }
    }
    
    return '';
  }

  // Enhanced date extraction with relative dates
  private extractDate(message: string): DateInfo {
    const today = new Date();
    
    // Check for relative dates first
    if (message.includes('today')) {
      return { date: format(today, 'yyyy-MM-dd'), originalText: 'today' };
    }
    
    if (message.includes('tomorrow')) {
      return { date: format(addDays(today, 1), 'yyyy-MM-dd'), originalText: 'tomorrow' };
    }
    
    // Enhanced "one month from tomorrow" parsing
    const oneMonthMatch = message.match(/one month from (tomorrow|today)/i);
    if (oneMonthMatch) {
      const baseDate = oneMonthMatch[1].toLowerCase() === 'tomorrow' ? addDays(today, 1) : today;
      const futureDate = addMonths(baseDate, 1);
      return { 
        date: format(futureDate, 'yyyy-MM-dd'), 
        originalText: `one month from ${oneMonthMatch[1].toLowerCase()}` 
      };
    }
    
    // Check for "next week", "next month", etc.
    if (message.includes('next week')) {
      return { date: format(addDays(today, 7), 'yyyy-MM-dd'), originalText: 'next week' };
    }
    
    if (message.includes('next month')) {
      return { date: format(addMonths(today, 1), 'yyyy-MM-dd'), originalText: 'next month' };
    }
    
    // Check for day names (Monday, Tuesday, etc.)
    const dayNames = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    for (const day of dayNames) {
      if (message.toLowerCase().includes(day)) {
        const targetDay = dayNames.indexOf(day);
        const currentDay = today.getDay();
        const daysUntilTarget = (targetDay + 1 - currentDay + 7) % 7 || 7;
        return { 
          date: format(addDays(today, daysUntilTarget), 'yyyy-MM-dd'), 
          originalText: day 
        };
      }
    }
    
    // Look for specific dates (July 25, 7/25, etc.)
    const datePatterns = [
      /(\w+)\s+(\d{1,2})(?:st|nd|rd|th)?/i, // "July 25th"
      /(\d{1,2})\/(\d{1,2})\/(\d{4})/,      // "7/25/2025"
      /(\d{1,2})\/(\d{1,2})/,               // "7/25"
      /(\d{4})-(\d{1,2})-(\d{1,2})/        // "2025-07-25"
    ];
    
    for (const pattern of datePatterns) {
      const match = message.match(pattern);
      if (match) {
        try {
          let date: Date;
          if (pattern.source.includes('\\w+')) {
            // Month name format
            const monthName = match[1];
            const day = parseInt(match[2]);
            const year = today.getFullYear();
            date = parse(`${monthName} ${day} ${year}`, 'MMMM d yyyy', new Date());
          } else if (match[3]) {
            // Full date with year
            date = new Date(parseInt(match[3]), parseInt(match[1]) - 1, parseInt(match[2]));
          } else if (match.length === 3) {
            // MM/DD format
            date = new Date(today.getFullYear(), parseInt(match[1]) - 1, parseInt(match[2]));
          } else {
            // YYYY-MM-DD format
            date = new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]));
          }
          
          if (isValid(date)) {
            return { date: format(date, 'yyyy-MM-dd'), originalText: match[0] };
          }
        } catch (error) {
          console.warn('Date parsing error:', error);
        }
      }
    }
    
    return { date: null, originalText: null };
  }

  // Enhanced time extraction
  private extractTime(message: string): { startTime: TimeInfo | null; endTime?: TimeInfo } {
    const timePatterns = [
      /(\d{1,2}):(\d{2})\s*(am|pm)/gi,      // 7:30am, 2:15pm
      /(\d{1,2})\s*(am|pm)/gi,              // 7am, 2pm
      /(\d{1,2}):(\d{2})/g                  // 7:30 (assume 24h or context)
    ];
    
    let startTime: TimeInfo | null = null;
    let endTime: TimeInfo | undefined = undefined;
    
    const matches: Array<{
      hour: string;
      minute: string;
      period: string | null;
      fullMatch: string;
    }> = [];
    
    for (const pattern of timePatterns) {
      let match;
      while ((match = pattern.exec(message)) !== null) {
        matches.push({
          hour: match[1],
          minute: match[2] || '00',
          period: match[3] ? match[3].toUpperCase() : null,
          fullMatch: match[0]
        });
      }
    }
    
    if (matches.length > 0) {
      // First time is start time
      const first = matches[0];
      const inferredPeriod = first.period || this.inferPeriod(first.hour);
      startTime = {
        hour: first.hour,
        minute: first.minute,
        period: inferredPeriod,
        ampm: inferredPeriod // Set both for compatibility
      };
      
      // Look for end time indicators
      if (matches.length > 1 && message.includes('to')) {
        const second = matches[1];
        const secondInferredPeriod = second.period || this.inferPeriod(second.hour);
        endTime = {
          hour: second.hour,
          minute: second.minute,
          period: secondInferredPeriod,
          ampm: secondInferredPeriod // Set both for compatibility
        };
      }
    }
    
    return { startTime, endTime };
  }

  // Infer AM/PM based on hour
  private inferPeriod(hour: string): string {
    const h = parseInt(hour);
    if (h >= 1 && h <= 11) return 'AM';
    if (h === 12) return 'PM';
    if (h >= 13 && h <= 23) return 'PM';
    if (h === 0) return 'AM';
    return 'AM'; // default
  }

  // Extract section (work, school, personal) - improved to not override current section
  private extractSection(message: string): string | null {
    const sections = ['work', 'school', 'personal'];
    
    // Only extract section if explicitly mentioned in the message
    for (const section of sections) {
      if (message.toLowerCase().includes(`for ${section}`) || 
          message.toLowerCase().includes(`${section} task`) ||
          message.toLowerCase().includes(`in ${section}`) ||
          message.toLowerCase().includes(`on ${section}`)) {
        console.log('📂 Found explicit section in message:', section);
        return section;
      }
    }
    
    console.log('📂 No explicit section found in message, will use current section');
    return null; // Let the calling function use currentSection
  }

  // Extract priority
  private extractPriority(message: string): string | null {
    if (message.includes('high priority') || message.includes('urgent')) return 'High';
    if (message.includes('medium priority')) return 'Medium';
    if (message.includes('low priority')) return 'Low';
    return null;
  }

  // Extract recurring pattern
  private extractRecurring(message: string): string | null {
    if (message.includes('daily') || message.includes('every day')) return 'Daily';
    if (message.includes('weekly') || message.includes('every week')) return 'Weekly';
    if (message.includes('monthly') || message.includes('every month')) return 'Monthly';
    if (message.includes('weekdays') || message.includes('weekday')) return 'Weekdays';
    return null;
  }

  // Parse show tasks request
  private parseShowTasks(message: string): ParseResult {
    const section = this.extractSection(message);
    const dateInfo = this.extractDate(message);
    
    return {
      type: 'show_tasks',
      section: message.includes('work') ? 'work' : 
              message.includes('school') ? 'school' : 
              message.includes('personal') ? 'personal' : 'all',
      date: dateInfo.date || undefined,
      message: `Showing ${section || 'all'} tasks`
    };
  }

  // Parse schedule query
  private parseScheduleQuery(message: string): ParseResult {
    const dateInfo = this.extractDate(message);
    
    return {
      type: 'schedule_query',
      date: dateInfo.date || format(new Date(), 'yyyy-MM-dd'),
      message: `Showing your schedule for ${dateInfo.originalText || 'today'}`
    };
  }

  // Parse update task (requires confirmation)
  private parseUpdateTask(message: string, userEmail: string): ParseResult {
    // This should prompt for confirmation before executing
    return {
      type: 'update_confirmation_needed',
      userEmail: userEmail,
      originalMessage: message,
      message: `To update a task, I need confirmation. Please type "Confirm" to proceed with: "${message}"`
    };
  }

  // Parse delete task (requires confirmation)
  private parseDeleteTask(message: string, userEmail: string): ParseResult {
    // This should prompt for confirmation before executing
    return {
      type: 'delete_confirmation_needed',
      userEmail: userEmail,
      originalMessage: message,
      message: `To delete a task, I need confirmation. Please type "Confirm" to proceed with: "${message}"`
    };
  }

  // Handle confirmation responses
  private handleConfirmation(message: string, userEmail: string): ParseResult {
    const pending = this.pendingConfirmations.get(userEmail);
    
    if (!pending) {
      return {
        type: 'error',
        message: 'No pending confirmation found.'
      };
    }
    
    if (message === 'confirm') {
      // Execute the pending action
      this.pendingConfirmations.delete(userEmail);
      
      if (pending.type === 'update') {
        return this.executeUpdateTask(pending.originalMessage);
      } else if (pending.type === 'delete') {
        return this.executeDeleteTask(pending.originalMessage);
      }
    } else {
      this.pendingConfirmations.delete(userEmail);
      return {
        type: 'cancelled',
        message: 'Operation cancelled. How else can I help you?'
      };
    }
    
    return {
      type: 'error',
      message: 'Unknown confirmation type.'
    };
  }

  // Execute actual update
  private executeUpdateTask(message: string): ParseResult {
    // Parse the update message to extract task identifier and changes
    return {
      type: 'update_task',
      taskId: 'extracted_task_id', // This would need proper task identification
      updates: {
        // Parse what needs to be updated
      },
      message: 'Task updated successfully!'
    };
  }

  // Execute actual delete
  private executeDeleteTask(message: string): ParseResult {
    return {
      type: 'delete_task',
      taskId: 'extracted_task_id', // This would need proper task identification
      message: 'Task deleted successfully!'
    };
  }

  // Store pending confirmation
  private setPendingConfirmation(userEmail: string, type: string, originalMessage: string): void {
    this.pendingConfirmations.set(userEmail, {
      type: type,
      originalMessage: originalMessage,
      timestamp: Date.now()
    });
  }

  // Helper methods
  private isTimeWord(word: string): boolean {
    const timeWords = ['am', 'pm', 'morning', 'afternoon', 'evening', 'noon', 'midnight'];
    return timeWords.includes(word.toLowerCase());
  }

  private isDateWord(word: string): boolean {
    const dateWords = ['today', 'tomorrow', 'yesterday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    return dateWords.includes(word.toLowerCase());
  }

  private formatTime(timeObj: TimeInfo): string {
    if (!timeObj) return '';
    return `${timeObj.hour}:${timeObj.minute.padStart(2, '0')} ${timeObj.period}`;
  }
}

const enhancedNlpService = new EnhancedNlpService();
export default enhancedNlpService;
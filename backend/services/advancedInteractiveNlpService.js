/**
 * services/advancedInteractiveNlpService.js
 * FIXED: Proper archive context handling + TIME FALLBACK + PRIORITY/ENDTIME DEFAULTS
 */

const { addDays, format } = require('date-fns');
const OpenAI = require('openai');

class AdvancedInteractiveNlpService {
  constructor() {
    this.sessionData = new Map();
    this.conversationHistory = new Map();
    this.taskContexts = new Map();
    
    // Initialize OpenAI
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }

  // -------- Session helpers --------
  initializeSession(userEmail) {
    let s = this.sessionData.get(userEmail);
    if (!s) {
      s = {
        sessionId: `sess_${Math.random().toString(36).slice(2, 10)}`,
        lastActivity: Date.now(),
        currentFocus: 'tasks',
        lastViewedType: 'active',
        pendingConfirmation: null,
        pendingEdit: null,
        pendingCreate: null,
        lastMentionedTasks: [],
        lastFocusTask: null,
        assumedDate: null,
        contextualReferences: new Map()
      };
      this.sessionData.set(userEmail, s);
    } else {
      s.lastActivity = Date.now();
    }
    return s;
  }
  
  getSessionData(userEmail) {
    return this.sessionData.get(userEmail) || this.initializeSession(userEmail);
  }
  
  cleanupSessions() {
    const THIRTY_MIN = 30 * 60 * 1000;
    const now = Date.now();
    for (const [email, s] of this.sessionData.entries()) {
      if (now - s.lastActivity > THIRTY_MIN) {
        this.sessionData.delete(email);
        this.taskContexts.delete(email);
        this.conversationHistory.delete(email);
      }
    }
  }

  // -------- Context management --------
  setConversationContext(userEmail, key, value) {
    const arr = this.conversationHistory.get(userEmail) || [];
    arr.push({ ts: Date.now(), key, value });
    if (arr.length > 50) arr.shift();
    this.conversationHistory.set(userEmail, arr);
  }
  
  getConversationContext(userEmail) {
    return this.conversationHistory.get(userEmail) || [];
  }

  // FIXED: Enhanced context setting with proper source tracking
  setLastTaskContext(userEmail, tasks = [], primary = null) {
    const s = this.getSessionData(userEmail);
    
    // CRITICAL: Determine the actual source type based on the tasks content
    let actualSource = 'active'; // default
    if (tasks.length > 0) {
      // Check if any task has deletedAt (archived) or explicit source marking
      const hasArchivedTasks = tasks.some(t => 
        t.deletedAt || 
        t.source === 'archive' || 
        t.status === 'Deleted' ||
        t.isArchived === true
      );
      
      if (hasArchivedTasks || s.currentFocus === 'archived_tasks') {
        actualSource = 'archive';
        s.lastViewedType = 'archived';
        s.currentFocus = 'archived_tasks';
      } else {
        actualSource = 'active';
        s.lastViewedType = 'active';
        s.currentFocus = 'tasks';
      }
    }
    
    const enriched = (tasks || []).map((t, i) => ({
      ...t,
      index: i + 1,
      source: actualSource // Use the determined source consistently
    }));
    
    this.taskContexts.set(userEmail, { 
      tasks: enriched, 
      primary: primary || enriched[0] || null,
      source: actualSource // Store the source at context level too
    });
    
    // ENHANCED: Better task ID storage for context references
    s.lastMentionedTasks = enriched.map(t => {
      const taskId = t._id?.toString?.() || `${t._id}`;
      return {
        _id: taskId,
        title: t.title,
        section: t.section,
        index: t.index,
        source: actualSource,
        isArchived: actualSource === 'archive'
      };
    });
    
    s.lastFocusTask = primary || enriched[0] || null;
    s.contextualReferences.set('last_tasks', Date.now());
    s.contextualReferences.set('last_source', actualSource);
    
    // ENHANCED: Debug logging for context setting
    console.log(`🔄 Context set for ${userEmail}:`, {
      taskCount: enriched.length,
      source: actualSource,
      viewType: s.lastViewedType,
      focus: s.currentFocus,
      taskIds: s.lastMentionedTasks.map(t => `${t.index}: ${t._id} (${t.title}) [${t.source}]`)
    });
  }
  
  getLastTaskContext(userEmail) {
    return this.taskContexts.get(userEmail) || { tasks: [], primary: null, source: 'active' };
  }

  // -------- Helper methods --------
  setPendingCreate(userEmail, taskData) {
    const s = this.getSessionData(userEmail);
    s.pendingCreate = taskData || null;
  }
  
  consumePendingCreate(userEmail) {
    const s = this.getSessionData(userEmail);
    const d = s.pendingCreate || null;
    s.pendingCreate = null;
    return d;
  }

  formatDateLocal(daysOffset = 0) {
    const date = addDays(new Date(), daysOffset);
    return format(date, 'yyyy-MM-dd');
  }

  cleanTaskNameEnhanced(raw = '') {
    if (!raw) return '';
    return String(raw).trim().replace(/^(create|add|make|task)\s+/i, '').trim();
  }

  // ⭐ NEW: Fallback time extraction for when GPT-4 misses times
  parseTimesFromText(utterance) {
    // matches: "at 10:00 AM to 11:00 AM", "10am-11am", "10 am to 11 am", "at 6pm", "tomorrow at 6pm"
    const s = String(utterance).toLowerCase();
    const hhmm = /(\b\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/;
    const range1 = new RegExp(`${hhmm.source}\\s*(?:to|-)\\s*${hhmm.source}`, 'i');
    const mRange = s.match(range1);
    const toTimeObj = (h, m, ap) => ({ 
      hour: String(h), 
      minute: String(m ?? '0'), 
      period: ap.toUpperCase() 
    });

    if (mRange) {
      const [, h1, m1, ap1, h2, m2, ap2] = mRange;
      return {
        startTime: toTimeObj(h1, m1, ap1),
        endTime: toTimeObj(h2, m2, ap2)
      };
    }
    
    const mSingle = s.match(hhmm);
    if (mSingle) {
      const [, h, m, ap] = mSingle;
      return { startTime: toTimeObj(h, m, ap) };
    }
    
    return {};
  }

  // -------- GPT-4 Enhanced Message Parsing --------
  async parseMessage(message, userEmail) {
    const s = this.getSessionData(userEmail);
    const text = message.trim();
    const currentDate = format(new Date(), 'yyyy-MM-dd');
    const tomorrow = format(addDays(new Date(), 1), 'yyyy-MM-dd');

    // Handle YES/NO confirmations first (simple regex is fine for this)
    if (/^(yes|yeah|yep|confirm|do it|create it|ok|okay|update it)\b/i.test(text)) {
      if (s.pendingCreate) {
        return { type: 'create_confirmed', taskData: s.pendingCreate };
      }
      if (s.pendingConfirmation) {
        const kind = s.pendingConfirmation.kind;
        const payload = s.pendingConfirmation.payload;
        s.pendingConfirmation = null;
        if (kind === 'delete')  return { type: 'delete_confirmed', deleteData: payload };
        if (kind === 'edit')    return { type: 'edit_confirmed', editData: payload };
        if (kind === 'restore') return { type: 'restore_confirmed', restoreData: payload };
        if (kind === 'create')  return { type: 'create_confirmed', createData: payload };
      }
      return { type: 'generic_yes' };
    }
    
    if (/^(no|cancel|stop|don\'?t)/i.test(text)) {
      if (s.pendingConfirmation) {
        const kind = s.pendingConfirmation.kind;
        s.pendingConfirmation = null;
        return { type: `${kind}_cancelled`, message: 'Okay, cancelled.' };
      }
      if (s.pendingCreate) {
        s.pendingCreate = null;
        return { type: 'create_cancelled', message: 'Okay, cancelled.' };
      }
      return { type: 'generic_no' };
    }

    // CRITICAL FIX: Handle restore commands directly when in archive context
    const currentContext = this.getLastTaskContext(userEmail);
    const contextSource = currentContext.source || s.lastViewedType || 'active';
    const lastTasks = s.lastMentionedTasks || [];
    const archivedTasks = lastTasks.filter(t => t.source === 'archive' || t.isArchived);

    // Direct restore command parsing when in archive context
    if (contextSource === 'archive' && s.currentFocus === 'archived_tasks' && archivedTasks.length > 0) {
      console.log(`🔍 Direct restore parsing - archived tasks available: ${archivedTasks.length}`);
      
      // Parse "restore task N" or "restore the Nth task"
      const taskNumberMatch = text.match(/restore\s+(?:task\s+)?(?:the\s+)?(\d+)(?:st|nd|rd|th)?(?:\s+task)?/i);
      if (taskNumberMatch) {
        const taskNumber = parseInt(taskNumberMatch[1], 10);
        console.log(`🎯 Restore task by number: ${taskNumber}`);
        
        if (taskNumber >= 1 && taskNumber <= archivedTasks.length) {
          const targetTask = archivedTasks[taskNumber - 1]; // Convert to 0-based index
          console.log(`✅ Found target task: ${targetTask.title} (${targetTask._id})`);
          
          return {
            type: 'restore_task_confirmation',
            message: `Restore '${targetTask.title}'?`,
            restoreData: {
              type: 'specific_contextual_task',
              taskId: targetTask._id
            },
            suggestions: ['Yes, restore it', 'No, cancel']
          };
        } else {
          return {
            type: 'validation_error',
            message: `Task ${taskNumber} not found. You have ${archivedTasks.length} archived tasks.`,
            suggestions: ['Show my archived tasks', 'Restore the first task']
          };
        }
      }

      // Parse "restore the first task", "restore the second task", etc.
      const ordinalMatch = text.match(/restore\s+(?:the\s+)?(first|second|third|fourth|fifth|last)(?:\s+task)?/i);
      if (ordinalMatch) {
        const ordinal = ordinalMatch[1].toLowerCase();
        let taskIndex = -1;
        
        switch (ordinal) {
          case 'first': taskIndex = 0; break;
          case 'second': taskIndex = 1; break;
          case 'third': taskIndex = 2; break;
          case 'fourth': taskIndex = 3; break;
          case 'fifth': taskIndex = 4; break;
          case 'last': taskIndex = archivedTasks.length - 1; break;
        }
        
        console.log(`🎯 Restore task by ordinal: ${ordinal} (index ${taskIndex})`);
        
        if (taskIndex >= 0 && taskIndex < archivedTasks.length) {
          const targetTask = archivedTasks[taskIndex];
          console.log(`✅ Found target task: ${targetTask.title} (${targetTask._id})`);
          
          return {
            type: 'restore_task_confirmation',
            message: `Restore '${targetTask.title}'?`,
            restoreData: {
              type: 'specific_contextual_task',
              taskId: targetTask._id
            },
            suggestions: ['Yes, restore it', 'No, cancel']
          };
        }
      }

      // Parse "restore [task name]"
      const nameMatch = text.match(/restore\s+(?:task\s+)?(?:"|')?([^"'\n]+?)(?:"|')?$/i);
      if (nameMatch) {
        const taskName = nameMatch[1].trim();
        console.log(`🎯 Restore task by name: "${taskName}"`);
        
        // Find task by name in archived context
        const targetTask = archivedTasks.find(t => 
          t.title.toLowerCase().includes(taskName.toLowerCase()) ||
          taskName.toLowerCase().includes(t.title.toLowerCase())
        );
        
        if (targetTask) {
          console.log(`✅ Found target task by name: ${targetTask.title} (${targetTask._id})`);
          
          return {
            type: 'restore_task_confirmation',
            message: `Restore '${targetTask.title}'?`,
            restoreData: {
              type: 'specific_contextual_task',
              taskId: targetTask._id
            },
            suggestions: ['Yes, restore it', 'No, cancel']
          };
        } else {
          return {
            type: 'validation_error',
            message: `No archived task found matching "${taskName}".`,
            suggestions: ['Show my archived tasks', 'Restore the first task']
          };
        }
      }

      // Parse "restore tasks X-Y" or "restore the first X tasks"
      const rangeMatch = text.match(/restore\s+(?:tasks?\s+)?(\d+)[-–](\d+)/i) || 
                        text.match(/restore\s+(?:the\s+)?first\s+(\d+)\s+tasks?/i);
      if (rangeMatch) {
        let startNum, endNum;
        
        if (text.includes('first')) {
          startNum = 1;
          endNum = parseInt(rangeMatch[1], 10);
        } else {
          startNum = parseInt(rangeMatch[1], 10);
          endNum = parseInt(rangeMatch[2], 10);
        }
        
        console.log(`🎯 Restore tasks range: ${startNum}-${endNum}`);
        
        if (startNum >= 1 && endNum <= archivedTasks.length && startNum <= endNum) {
          const tasksToRestore = archivedTasks.slice(startNum - 1, endNum);
          const taskIds = tasksToRestore.map(t => t._id);
          const taskNames = tasksToRestore.map(t => t.title).join(', ');
          
          console.log(`✅ Found ${tasksToRestore.length} tasks to restore: ${taskNames}`);
          
          return {
            type: 'restore_multiple_tasks_confirmation',
            message: `Restore ${tasksToRestore.length} tasks (${taskNames})?`,
            restoreData: {
              type: 'multiple_contextual_tasks',
              taskIds: taskIds
            },
            suggestions: ['Yes, restore all', 'No, cancel']
          };
        } else {
          return {
            type: 'validation_error',
            message: `Invalid range. You have ${archivedTasks.length} archived tasks.`,
            suggestions: ['Show my archived tasks', 'Restore the first task']
          };
        }
      }
    }

    // Check if restore command but not in archive context
    if (/restore/i.test(text)) {
      if (contextSource !== 'archive' || s.currentFocus !== 'archived_tasks') {
        return {
          type: 'validation_error',
          message: 'To restore tasks, please show your archive first.',
          suggestions: ['What tasks do I have in archive?', 'Show archived tasks', 'List archive']
        };
      }
    }

    // FIXED: Get current context and prepare for GPT-4
    const relevantTasks = contextSource === 'archive' 
      ? lastTasks.filter(t => t.source === 'archive' || t.isArchived)
      : lastTasks.filter(t => t.source === 'active' && !t.isArchived);
    
    const taskContext = relevantTasks.length > 0 
      ? relevantTasks.map((t, i) => 
          `${i + 1}. "${t.title}" (${t.section}) [ID: ${t._id}] [Source: ${t.source}]`
        ).join('\n')
      : `No ${contextSource} tasks currently in context`;

    // ENHANCED: Master system prompt with much better context awareness and restore handling
    const masterSystemPrompt = `You are an expert task management assistant. Parse user messages and return precise JSON responses for CRUD operations.

CURRENT CONTEXT:
- Today's date: ${currentDate}
- Tomorrow's date: ${tomorrow}
- Current viewing context: ${contextSource} tasks
- User's current focus: ${s.currentFocus}
- Last viewed type: ${s.lastViewedType}
- Available ${contextSource} tasks:
${taskContext}

CRITICAL CONTEXT RULES:

🔴 RESTORE OPERATIONS (MOST IMPORTANT):
- ONLY operate on ARCHIVED tasks when user is viewing archived context
- Current context type: ${contextSource}
- Task count in ${contextSource} context: ${relevantTasks.length}
- If contextSource is NOT "archive", BLOCK restore requests
- When contextSource IS "archive", use EXACT task IDs from archived context

RESTORE COMMAND MAPPING (when in archive context):
- "restore task 1" = FIRST task in archived context (index 0)
- "restore the first task" = FIRST task in archived context (index 0)  
- "restore Testing" = find "Testing" ONLY in archived context by title match
- "restore task 16" = 16th task in archived context (index 15)
- "restore the second task" = SECOND task in archived context (index 1)
- "restore both tasks" = first TWO tasks in archived context (indices 0,1)

CONTEXT VALIDATION FOR RESTORE:
- If ${contextSource} !== "archive": Return validation_error asking user to view archive first
- If ${contextSource} === "archive" AND ${relevantTasks.length} === 0: Return validation_error saying no archived tasks found
- If ${contextSource} === "archive" AND ${relevantTasks.length} > 0: Process restore request using archived task IDs

OTHER OPERATION RULES:

1. SCHEDULE & TASK QUERIES:
   - "what is my schedule" = show_tasks with date: "${currentDate}" (TODAY)
   - "what tasks do I have" (no date) = show_tasks with date: "${currentDate}" (default TODAY)
   - "show my tasks" = show_tasks with date: "${currentDate}" (default TODAY)

2. CREATE OPERATIONS:
   - For simple creates: return "create_task_direct" (immediate creation)
   - For complex creates: return "create_task_confirmation" (preview first)
   - Extract: title, section, startTime (required), endTime, priority, recurring, collaborators
   - Default section to "personal" if not specified
   - Default date to "${currentDate}" if not specified
   - CRITICAL: DO NOT include priority unless explicitly mentioned by user
   - CRITICAL: DO NOT include endTime unless explicitly mentioned by user
   - CRITICAL: DO NOT include recurring unless explicitly mentioned by user
   - CRITICAL: DO NOT include collaborators unless explicitly mentioned by user
   - REQUIRED: ALWAYS include proper startTime object with hour, minute, period
   - Simple creates: "create homework at 6pm" = direct creation
   - Complex creates: "create meeting with john and high priority" = confirmation

3. DELETE OPERATIONS:
   - Use EXACT task IDs from ACTIVE context when available
   - "delete that task" = primary task from active context
   - "delete the first task" = task at index 1 from active context

4. EDIT OPERATIONS:
   - Use EXACT task IDs from ACTIVE context when available
   - Parse time changes: "start at 9pm" → newTime, "end at 10pm" → newEndTime
   - Parse priority changes: "make priority high" → newPriority, "remove priority" → newPriority: null
   - Parse title changes: "rename to X" → newTitle, "change name to X" → newTitle
   - Parse section changes: "move to work" → newSection
   - Parse date changes: "move to tomorrow" → newDate
   - EDIT PATTERNS TO RECOGNIZE:
     * "edit that task starting time to 5:30 PM" → edit first/primary task startTime
     * "edit that task to end at 6:30 PM" → edit first/primary task endTime  
     * "make task have priority High" → edit first/primary task priority
     * "edit Chatbot Testing to end at 6:30 PM" → find task by name and edit endTime
     * "change the time to 5:30 PM" → edit first/primary task startTime
     * "make it high priority" → edit first/primary task priority
   - Current active tasks available: ${relevantTasks.length > 0 ? relevantTasks.map(t => `"${t.title}" (ID: ${t._id})`).join(', ') : 'none'}

5. ARCHIVE QUERIES:
   - "what's in archive" / "what tasks in archive" = show_archived_tasks

6. CONTEXT RESOLUTION:
   - ALWAYS use EXACT task ID from context when referring to tasks by position
   - For RESTORE: ONLY use archived context task IDs  
   - For DELETE/EDIT: ONLY use active context task IDs
   - "edit that task" = primary/first task from active context
   - "edit the first task" = task at index 0 from active context
   - "edit Chatbot Testing" = find task by title match in active context

RESPONSE FORMATS:

For DIRECT CREATE (simple cases - no priority/endTime/collaborators mentioned):
{
  "type": "create_task_direct",
  "taskData": {
    "title": "Task Title",
    "section": "work|school|personal",
    "date": "${currentDate}",
    "startTime": {
      "hour": "6",
      "minute": "0", 
      "period": "PM"
    }
    // DO NOT include endTime unless explicitly mentioned
    // DO NOT include priority unless explicitly mentioned  
    // DO NOT include recurring unless explicitly mentioned
    // DO NOT include collaborators unless explicitly mentioned
  },
  "message": "Creating task...",
  "suggestions": ["Create another task", "Show my tasks"]
}

For CREATE TASK CONFIRMATION (complex cases - priority/endTime/collaborators mentioned):
{
  "type": "create_task_confirmation",
  "taskData": {
    "title": "Task Title",
    "section": "work|school|personal", 
    "date": "${currentDate}",
    "startTime": {
      "hour": "6",
      "minute": "0",
      "period": "PM"
    },
    "endTime": {
      "hour": "7",
      "minute": "0",
      "period": "PM"
    },
    "priority": "high|medium|low",
    "recurring": "daily|weekly|monthly",
    "collaborators": ["email@example.com"]
  },
  "message": "Create task preview message",
  "suggestions": ["Yes, create it", "No, cancel"]
}

For EDIT TASK CONFIRMATION:
{
  "type": "edit_task_confirmation", 
  "message": "Edit 'Chatbot Testing' to end at 6:30 PM?",
  "editData": {
    "type": "specific_contextual_task",
    "taskId": "EXACT_ID_FROM_ACTIVE_CONTEXT",
    "newEndTime": {
      "hour": "6",
      "minute": "30",
      "period": "PM"
    }
  },
  "suggestions": ["Yes, update it", "No, cancel"]
}

For RESTORE (when in archived context):
{
  "type": "restore_task_confirmation",
  "message": "Restore 'Testing'?",
  "restoreData": {
    "type": "specific_contextual_task",
    "taskId": "EXACT_ID_FROM_ARCHIVED_CONTEXT"
  },
  "suggestions": ["Yes, restore it", "No, cancel"]
}

For RESTORE (when NOT in archived context):
{
  "type": "validation_error",
  "message": "To restore tasks, please show your archive first.",
  "suggestions": ["What tasks do I have in archive?", "Show archived tasks"]
}

For RESTORE (multiple from archived context):
{
  "type": "restore_multiple_tasks_confirmation", 
  "message": "Restore 3 tasks (tasks 1-3)?",
  "restoreData": {
    "type": "multiple_contextual_tasks",
    "taskIds": ["EXACT_ID_1", "EXACT_ID_2", "EXACT_ID_3"]
  },
  "suggestions": ["Yes, restore all", "No, cancel"]
}

DEBUGGING INFO FOR RESTORE:
- Current context source: ${contextSource}
- Archived tasks available: ${contextSource === 'archive' ? relevantTasks.length : 0}
- Context is valid for restore: ${contextSource === 'archive' && relevantTasks.length > 0}

CRITICAL: 
- ALWAYS validate context before allowing restore operations
- ALWAYS use exact task IDs from the correct context type
- NEVER mix active and archived task contexts
- FOR CREATE OPERATIONS: ALWAYS include startTime with hour, minute, period
- FOR CREATE OPERATIONS: NEVER include priority/endTime/recurring/collaborators unless explicitly mentioned`;

    try {
      const response = await this.openai.chat.completions.create({
        model: "gpt-4o-mini", // ⭐ FIXED: Use modern model with better JSON support
        messages: [
          { role: "system", content: masterSystemPrompt },
          { role: "user", content: `Parse this message as strict JSON only (no prose): "${text}"` }
        ],
        temperature: 0.1,
        response_format: { type: "json_object" }, // ⭐ FIXED: Force JSON response
        max_tokens: 1200
      });

      const gptResponse = response.choices[0].message.content;
      
      // Parse the JSON response
      let parsedResponse;
      try {
        parsedResponse = JSON.parse(gptResponse);
      } catch (parseError) {
        console.error('GPT response parsing error:', parseError, 'Response:', gptResponse);
        return {
          type: 'validation_error',
          message: "I had trouble understanding that. Could you rephrase?",
          suggestions: ['Show my tasks', 'Create a task', 'Edit the first task']
        };
      }

      // Post-process the GPT response to ensure it works with our router
      return this.processGPTResponse(parsedResponse, userEmail, text);

    } catch (error) {
      console.error('OpenAI API error:', error);
      // Fallback to basic pattern matching if GPT fails
      return this.fallbackParsing(text, userEmail);
    }
  }

  // ⭐ ENHANCED: Process and validate GPT response with TIME FALLBACK
  processGPTResponse(gptResponse, userEmail, originalText) {
    const s = this.getSessionData(userEmail);
    const currentContext = this.getLastTaskContext(userEmail);
    const contextSource = currentContext.source || s.lastViewedType || 'active';
    
    // Ensure we have a valid response type
    if (!gptResponse.type) {
      return {
        type: 'validation_error',
        message: "I didn't understand that. Can you be more specific?",
        suggestions: ['Show my tasks', 'Create a task', 'Delete that task']
      };
    }

    // CRITICAL: Enhanced restore validation
    if (gptResponse.type === 'restore_task_confirmation' || gptResponse.type === 'restore_multiple_tasks_confirmation') {
      console.log(`🔍 Restore validation - Context: ${contextSource}, Focus: ${s.currentFocus}, ViewType: ${s.lastViewedType}`);
      
      // Only allow restore if we're actually viewing archived tasks
      if (contextSource !== 'archive' || s.currentFocus !== 'archived_tasks') {
        console.log(`❌ Restore blocked - not in archived context`);
        return {
          type: 'validation_error',
          message: 'To restore tasks, please show your archive first.',
          suggestions: ['What tasks do I have in archive?', 'Show archived tasks', 'List archive']
        };
      }
      
      // Validate that the task IDs exist in archived context
      if (gptResponse.restoreData) {
        const archivedTasks = s.lastMentionedTasks.filter(t => t.source === 'archive' || t.isArchived);
        
        if (gptResponse.restoreData.type === 'specific_contextual_task') {
          const taskId = gptResponse.restoreData.taskId;
          const taskExists = archivedTasks.some(t => t._id === taskId);
          if (!taskExists) {
            console.log(`❌ Task ID ${taskId} not found in archived context`);
            return {
              type: 'validation_error',
              message: 'That task was not found in your archive. Please check your archived tasks.',
              suggestions: ['Show my archived tasks', 'What tasks do I have in archive?']
            };
          }
        } else if (gptResponse.restoreData.type === 'multiple_contextual_tasks') {
          const taskIds = gptResponse.restoreData.taskIds || [];
          const invalidIds = taskIds.filter(id => !archivedTasks.some(t => t._id === id));
          if (invalidIds.length > 0) {
            console.log(`❌ Task IDs not found in archived context:`, invalidIds);
            return {
              type: 'validation_error',
              message: 'Some of those tasks were not found in your archive. Please check your archived tasks.',
              suggestions: ['Show my archived tasks', 'What tasks do I have in archive?']
            };
          }
        }
      }
    }

    // Handle different response types and set up confirmations
    switch (gptResponse.type) {
      case 'create_task_confirmation':
      case 'create_task_direct':
        if (gptResponse.taskData) {
          const { title, section, startTime } = gptResponse.taskData;
          
          // 🔧 CRITICAL FIX: Fallback time extraction if GPT missed it
          if (!startTime) {
            console.log(`⚠️ GPT missed startTime, attempting fallback extraction from: "${originalText}"`);
            const inferred = this.parseTimesFromText(originalText);
            if (inferred.startTime) {
              console.log(`✅ Fallback extracted startTime:`, inferred.startTime);
              gptResponse.taskData.startTime = inferred.startTime;
              if (inferred.endTime) {
                console.log(`✅ Fallback extracted endTime:`, inferred.endTime);
                gptResponse.taskData.endTime = inferred.endTime;
              }
            }
          }
          
          // Fill date if missing
          if (!gptResponse.taskData.date) {
            gptResponse.taskData.date = this.formatDateLocal();
          }
          
          // Validate required fields AFTER fallback attempt
          if (!gptResponse.taskData.title || !gptResponse.taskData.section || !gptResponse.taskData.startTime) {
            return {
              type: 'validation_error',
              message: 'Missing required fields (need title, section, and a start time).',
              suggestions: ['Create homework task for school at 6pm', 'Add meeting to work at 3pm tomorrow']
            };
          }
          
          // Set up confirmation only for create_task_confirmation type
          if (gptResponse.type === 'create_task_confirmation') {
            this.setPendingCreate(userEmail, gptResponse.taskData);
            s.pendingConfirmation = { kind: 'create', payload: { taskData: gptResponse.taskData } };
          }
        }
        break;

      case 'edit_task_confirmation':
        if (gptResponse.editData) {
          s.pendingConfirmation = { kind: 'edit', payload: gptResponse.editData };
        }
        break;

      case 'delete_single_task_confirmation':
      case 'delete_multiple_tasks_confirmation':
        if (gptResponse.deleteData) {
          s.pendingConfirmation = { kind: 'delete', payload: gptResponse.deleteData };
        }
        break;

      case 'restore_task_confirmation':
      case 'restore_multiple_tasks_confirmation':
        if (gptResponse.restoreData) {
          s.pendingConfirmation = { kind: 'restore', payload: gptResponse.restoreData };
        }
        break;

      case 'show_tasks':
        s.currentFocus = 'tasks';
        s.lastViewedType = 'active';
        // Ensure default to today if no date specified
        if (!gptResponse.date) {
          gptResponse.date = this.formatDateLocal();
        }
        break;

      case 'show_archived_tasks':
        s.currentFocus = 'archived_tasks';
        s.lastViewedType = 'archived';
        break;
    }

    return gptResponse;
  }

  // ENHANCED: Fallback parsing with better archive handling
  fallbackParsing(text, userEmail) {
    const lower = text.toLowerCase();
    const s = this.getSessionData(userEmail);
    const currentDate = this.formatDateLocal();
    
    // Handle restore commands with context checking
    if (/restore/i.test(text)) {
      if (s.lastViewedType !== 'archived' && s.currentFocus !== 'archived_tasks') {
        return {
          type: 'validation_error',
          message: 'To restore tasks, please show your archive first.',
          suggestions: ['What tasks do I have in archive?', 'Show archived tasks', 'List archive']
        };
      }
      return {
        type: 'validation_error',
        message: 'Which task would you like to restore?',
        suggestions: ['Restore the first task', 'Show my archived tasks first']
      };
    }
    
    // Schedule queries should default to today
    if (/schedule|what.*tasks.*today|tasks.*today|show.*tasks/i.test(text)) {
      return { type: 'show_tasks', section: 'all', date: currentDate };
    }
    
    if (/show.*archive|what.*archive|list.*archive|archive.*tasks|what.*in.*archive/i.test(text)) {
      return { type: 'show_archived_tasks', section: null, date: null };
    }
    
    if (/collaborators.*add|who.*collaborat|what.*collaborat|list.*collaborat|show.*collaborat/i.test(text)) {
      return { type: 'list_collaborators' };
    }
    
    if (/create|add|make/i.test(text)) {
      // ⭐ CRITICAL: Try fallback time extraction in fallback parsing too
      const inferred = this.parseTimesFromText(text);
      if (inferred.startTime) {
        console.log(`✅ Fallback parsing extracted time from "${text}":`, inferred);
        
        // Try to extract basic task info for fallback creation
        const titleMatch = text.match(/(?:create|add|make)\s+(?:a\s+)?(?:task\s+)?(?:called\s+)?([^"'\n]+?)(?:\s+(?:for|in|at|on|tomorrow|today))/i) ||
                          text.match(/(?:create|add|make)\s+(?:a\s+)?(?:task\s+)?(?:called\s+)?([^"'\n]+?)$/i);
        
        const sectionMatch = text.match(/(?:for|in)\s+(work|school|personal)/i);
        
        if (titleMatch) {
          const taskData = {
            title: this.cleanTaskNameEnhanced(titleMatch[1].trim()),
            section: sectionMatch ? sectionMatch[1].toLowerCase() : 'personal',
            date: /tomorrow/i.test(text) ? this.formatDateLocal(1) : this.formatDateLocal(),
            startTime: inferred.startTime
          };
          
          // Only add endTime if it was extracted
          if (inferred.endTime) {
            taskData.endTime = inferred.endTime;
          }
          
          return {
            type: 'create_task_direct',
            taskData: taskData,
            message: `Creating "${taskData.title}" for ${taskData.section}...`,
            suggestions: ['Create another task', 'Show my tasks', 'Edit the details']
          };
        }
      }
      
      return {
        type: 'validation_error',
        message: 'I need more details to create a task. Please specify the title, section, and time.',
        suggestions: ['Create homework task for school at 6pm', 'Add meeting to work at 3pm']
      };
    }
    
    if (/edit/i.test(text)) {
      return {
        type: 'validation_error',
        message: 'Which task would you like to edit?',
        suggestions: ['Edit the first task', 'Show my tasks first']
      };
    }

    return {
      type: 'unknown',
      message: "I didn't understand that. Here's what I can help with:",
      suggestions: [
        'What is my schedule today?',
        'Create homework task for school at 6pm',
        'Show my tasks',
        'Edit the first task',
        'Delete both tasks'
      ]
    };
  }
}

module.exports = AdvancedInteractiveNlpService;
// routes/chatbot.js
const express = require('express');
const jwt = require('jsonwebtoken');
const router = express.Router();
const connectDB = require('../db/mongoClient');
const { ObjectId } = require('mongodb');
const AdvancedInteractiveNlpService = require('../services/advancedInteractiveNlpService');
const { format } = require('date-fns');

// ---------------------------
// Helpers
// ---------------------------
const nlpService = new AdvancedInteractiveNlpService();
setInterval(() => nlpService.cleanupSessions(), 30 * 60 * 1000);

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Missing or invalid authorization header' });
  }
  const token = authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Missing token' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.id;
    req.userEmail = decoded.email;
    next();
  } catch (error) {
    return res.status(403).json({ message: 'Invalid token' });
  }
}

function formatTime(t) {
  if (!t?.hour || !t?.minute || !t?.period) return 'No time set';
  const minute = String(t.minute).padStart(2, '0');
  return `${t.hour}:${minute} ${t.period}`;
}

function time12ToMinutes(t) {
  if (!t || !t.hour || !t.period) return null;
  
  let hour = parseInt(t.hour, 10);
  const minute = parseInt(t.minute || '0', 10);
  const period = t.period.toUpperCase();
  
  if (period === 'AM' && hour === 12) {
    hour = 0;
  } else if (period === 'PM' && hour !== 12) {
    hour = hour + 12;
  }
  
  return hour * 60 + minute;
}

function isRangeValid(startTime, endTime) {
  const startMins = time12ToMinutes(startTime);
  const endMins = time12ToMinutes(endTime);
  
  if (startMins === null) return false;
  if (endMins === null) return true;
  
  return endMins > startMins;
}

function rangesOverlap(aStart, aEnd, bStart, bEnd) {
  const aS = time12ToMinutes(aStart);
  const aE = aEnd ? time12ToMinutes(aEnd) : aS + 1;
  const bS = time12ToMinutes(bStart);
  const bE = bEnd ? time12ToMinutes(bEnd) : bS + 1;
  return Math.max(aS, bS) < Math.min(aE, bE);
}

async function getAvailableCollaborators(db) {
  try {
    const users = await db.collection('users').find({}, { projection: { name: 1, email: 1 } }).toArray();
    return users.map(user => ({
      username: user.name || user.email?.split('@')[0] || 'unknown',
      email: user.email || '',
      fullName: user.name || user.email?.split('@')[0] || 'unknown'
    }));
  } catch (error) {
    console.error('Error fetching collaborators:', error);
    return [];
  }
}

async function resolveCollaboratorNames(db, collaboratorNames) {
  if (!collaboratorNames || !collaboratorNames.length) return [];
  
  const availableCollaborators = await getAvailableCollaborators(db);
  const resolved = [];
  
  for (const name of collaboratorNames) {
    const cleanName = name.trim().toLowerCase();
    const found = availableCollaborators.find(collab => 
      collab.username.toLowerCase() === cleanName || 
      collab.fullName.toLowerCase() === cleanName ||
      collab.email.toLowerCase() === cleanName
    );
    
    if (found) {
      resolved.push(found.email);
    } else if (name.includes('@')) {
      resolved.push(name);
    }
  }
  
  return [...new Set(resolved)];
}

// ---------------------------
// Main Chatbot Endpoint
// ---------------------------
router.post('/message', authMiddleware, async (req, res) => {
  try {
    const { message, lastTaskContext } = req.body;
    const userEmail = req.userEmail;

    if (!message?.trim()) {
      return res.status(400).json({
        success: false,
        reply: 'Please provide a message.',
        suggestions: ['What is my schedule today?', 'Create homework task for school at 6pm', 'Show my tasks'],
      });
    }

    const session = nlpService.initializeSession(userEmail);
    if (lastTaskContext?.tasks?.length) {
      // Only accept if it's explicitly archive, or tasks clearly look archived
      const looksArchived =
        lastTaskContext.source === 'archive' ||
        lastTaskContext.tasks.some(t => t.deletedAt || t.isArchived || t.status === 'Deleted');
      const looksActive =
        lastTaskContext.source === 'active' ||
        lastTaskContext.tasks.every(t => !t?.deletedAt && !t?.isArchived && t?.status !== 'Deleted');

      // If we're currently focused on archive, don't let an active payload clobber it
      const sess = nlpService.getSessionData(userEmail);
      const viewingArchive = (sess.currentFocus === 'archived_tasks' || sess.lastViewedType === 'archived');

      console.log(`🔄 Context protection check:`, {
        looksArchived,
        looksActive,
        viewingArchive,
        currentFocus: sess.currentFocus,
        lastViewedType: sess.lastViewedType
      });

      if (looksArchived || (!viewingArchive && looksActive)) {
        try { 
          nlpService.setLastTaskContext(userEmail, lastTaskContext.tasks); 
        } catch (_) {}
      } else {
        console.log(`🛡️ Protected archive context from active task override`);
      }
    }

    const yesRe = /^\s*(yes|yeah|yep|confirm|do it|ok|okay|create it|update it|restore it|delete it)\b/i;
    const noRe = /^\s*(no|cancel|stop|never\s?mind|don't)\b/i;

    // Log for debugging
    console.log(`🔍 Confirmation check - pendingConfirmation:`, session.pendingConfirmation);
    console.log(`🔍 Message: "${message}"`);

    if (session.pendingConfirmation && yesRe.test(message)) {
      const { kind, payload } = session.pendingConfirmation;
      session.pendingConfirmation = null;
      
      console.log(`✅ Processing ${kind} confirmation with payload:`, payload);
      
      if (kind === 'create')  return await actuallyCreateTask(req, res, payload.taskData, { bypassOverlap: true });
      if (kind === 'edit')    return await handleEditConfirmed(req, res, { editData: payload });
      if (kind === 'delete')  return await handleDeleteConfirmed(req, res, { deleteData: payload });
      if (kind === 'restore') return await handleRestoreConfirmed(req, res, { restoreData: payload });
    }

    if (session.pendingConfirmation && noRe.test(message)) {
      const { kind } = session.pendingConfirmation;
      session.pendingConfirmation = null;
      
      console.log(`❌ Cancelled ${kind} operation`);
      
      return res.json({ 
        success: true, 
        reply: 'Okay, cancelled.', 
        suggestions: ['Show my tasks', 'Create a task', "What's my schedule today?"] 
      });
    }

    const parsed = await nlpService.parseMessage(message, userEmail);

    switch (parsed.type) {
      case 'validation_error':
        return res.json({
          success: false,
          reply: parsed.message,
          suggestions: parsed.suggestions || ['What is my schedule today?', 'Create homework task for school at 6pm', 'Show my tasks'],
        });

      case 'create_task_direct':
        // Direct creation without confirmation for simple tasks
        return await actuallyCreateTask(req, res, parsed.taskData, { bypassOverlap: false, direct: true });

      case 'create_task_confirmation':
        nlpService.setPendingCreate(req.userEmail, parsed.taskData);
        const session2 = nlpService.getSessionData(req.userEmail);
        session2.pendingConfirmation = { kind: 'create', payload: { taskData: parsed.taskData } };
        
        const { title, section, date, startTime, endTime, priority, recurring, collaborators } = parsed.taskData;
        const timeStr = endTime 
          ? `${formatTime(startTime)} to ${formatTime(endTime)}`
          : formatTime(startTime);
        
        let previewMsg = `Create "${title}" in ${section} on ${date} at ${timeStr}`;
        const extras = [];
        if (priority) extras.push(`Priority: ${priority}`);
        if (recurring) extras.push(`Recurring: ${recurring}`);
        if (collaborators?.length) extras.push(`With: ${collaborators.join(', ')}`);
        if (extras.length) previewMsg += `\n${extras.join(' • ')}`;
        
        return res.json({
          success: true,
          reply: previewMsg + '\n\nConfirm to create this task?',
          suggestions: ["Yes, create it", "No, cancel", "Edit the time", "Add collaborators"],
          awaitingConfirmation: true
        });

      case 'create_confirmed':
        return await actuallyCreateTask(req, res, parsed.taskData, { bypassOverlap: true });

      case 'create_task':
        return await handleCreateTask(req, res, parsed);

      case 'show_tasks':
        return await handleShowTasks(req, res, parsed);

      case 'schedule_query':
        return await handleScheduleQuery(req, res, parsed);

      case 'delete_multiple_tasks_confirmation':
        return res.json({
          success: true,
          reply: parsed.message,
          suggestions: parsed.suggestions || ["Yes, delete all", "No, cancel"],
          awaitingConfirmation: true
        });

      case 'restore_task_confirmation':
        // ✅ SET ROUTER SESSION STATE TOO
        session.pendingConfirmation = { kind: 'restore', payload: parsed.restoreData };
        return res.json({
          success: true,
          reply: parsed.message,
          suggestions: parsed.suggestions || ["Yes, restore it", "No, cancel"],
          awaitingConfirmation: true
        });

      case 'restore_multiple_tasks_confirmation':
        // ✅ SET ROUTER SESSION STATE TOO
        session.pendingConfirmation = { kind: 'restore', payload: parsed.restoreData };
        return res.json({
          success: true,
          reply: parsed.message,
          suggestions: parsed.suggestions || ["Yes, restore all", "No, cancel"],
          awaitingConfirmation: true
        });

      case 'edit_task_confirmation':
        // ✅ SET ROUTER SESSION STATE TOO
        session.pendingConfirmation = { kind: 'edit', payload: parsed.editData };
        return res.json({
          success: true,
          reply: parsed.message,
          suggestions: parsed.suggestions || ["Yes, update it", "No, cancel"],
          awaitingConfirmation: true
        });

      case 'delete_single_task_confirmation':
        // ✅ SET ROUTER SESSION STATE TOO
        session.pendingConfirmation = { kind: 'delete', payload: parsed.deleteData };
        return res.json({
          success: true,
          reply: parsed.message,
          suggestions: parsed.suggestions || ["Yes, delete it", "No, cancel"],
          awaitingConfirmation: true
        });

      case 'delete_multiple_tasks_confirmation':
        // ✅ SET ROUTER SESSION STATE TOO
        session.pendingConfirmation = { kind: 'delete', payload: parsed.deleteData };
        return res.json({
          success: true,
          reply: parsed.message,
          suggestions: parsed.suggestions || ["Yes, delete all", "No, cancel"],
          awaitingConfirmation: true
        });

      case 'delete_confirmed':
        return await handleDeleteConfirmed(req, res, parsed);

      case 'edit_confirmed':
        return await handleEditConfirmed(req, res, parsed);

      case 'restore_confirmed':
        return await handleRestoreConfirmed(req, res, parsed);

      case 'delete_cancelled':
      case 'edit_cancelled':
      case 'restore_cancelled':
        return res.json({
          success: true,
          reply: parsed.message,
          suggestions: ['Create a new task', 'Show my tasks', "What's my schedule today?"],
        });

      case 'show_archived_tasks':
        return await handleShowArchivedTasks(req, res, parsed);

      case 'list_collaborators':
        return await handleListCollaborators(req, res, parsed);

      case 'generic_yes':
        return res.json({
          success: false,
          reply: "Got it — which action should I confirm? (create/edit/delete/restore)",
          suggestions: ["Yes, create it", "Yes, update it", "Yes, delete it"]
        });

      case 'generic_no':
        return res.json({
          success: true,
          reply: "Cancelled.",
          suggestions: ["Show my tasks", "Create a task"]
        });

      default:
        return res.json({
          success: false,
          reply: parsed.message || "I didn't understand that. Here's what I can help with:",
          suggestions: parsed.suggestions || ["What's my schedule today?", 'Create homework task for school at 6pm', 'Show my tasks', 'Edit the first task'],
        });
    }
  } catch (error) {
    console.error('Chatbot error:', error);
    // ⭐ FIXED: Return friendly 200 response instead of 500 to prevent red error bubbles
    return res.json({
      success: false,
      reply: 'Sorry, I encountered an error. Please try again.',
      suggestions: ['Show my tasks', 'Create a task'],
    });
  }
});

// ---------------------------
// CREATE FUNCTIONS
// ---------------------------
async function handleCreateTask(req, res, parsed) {
  return await actuallyCreateTask(req, res, parsed.taskData, { bypassOverlap: false });
}

async function actuallyCreateTask(req, res, incomingTaskData, { bypassOverlap, direct = false }) {
  try {
    const db = await connectDB();

    const taskData = {
      ...incomingTaskData,
      createdBy: req.userEmail,
      userId: req.userId,
      status: 'Pending',
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };

    taskData.title = nlpService.cleanTaskNameEnhanced(taskData.title || 'Untitled');
    
    // ⭐ FIX: Don't set default values for priority and endTime - only include if explicitly provided
    if (!taskData.priority) {
      delete taskData.priority; // Remove undefined priority
    }
    
    if (!taskData.endTime) {
      delete taskData.endTime; // Remove undefined endTime
    }
    
    if (!taskData.recurring) {
      delete taskData.recurring; // Remove undefined recurring
    }
    
    if (taskData.collaborators && taskData.collaborators.length) {
      taskData.collaborators = await resolveCollaboratorNames(db, taskData.collaborators);
    } else {
      taskData.collaborators = [];
    }

    if (!taskData.title || !taskData.section || !taskData.date || !taskData.startTime) {
      return res.json({
        success: false,
        reply: 'Missing required fields for task creation.',
        suggestions: ['Create homework task for school tomorrow at 6pm', 'Add meeting to work at 3pm', 'Schedule workout for personal at 7am'],
      });
    }

    if (!isRangeValid(taskData.startTime, taskData.endTime)) {
      return res.json({
        success: false,
        reply: 'The end time must be after the start time. Please adjust your times (e.g., 1:30 PM to 2:30 PM).',
        suggestions: ['Set end time to 2:30 PM', 'Create it without an end time'],
      });
    }

    const sameDayTasks = await db.collection('tasks').find({
      createdBy: req.userEmail,
      date: taskData.date,
      $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }],
    }).toArray();

    const overlaps = sameDayTasks.filter((t) =>
      rangesOverlap(taskData.startTime, taskData.endTime, t.startTime, t.endTime),
    );

    // ⭐ FIX: For direct creation, show overlap warning but still create
    if (!bypassOverlap && overlaps.length && !direct) {
      const overlapLines = overlaps.map((t) =>
        `• ${t.title} (${t.section}) ${formatTime(t.startTime)}${t.endTime ? ' - ' + formatTime(t.endTime) : ''}`
      ).join('\n');

      const session = nlpService.getSessionData(req.userEmail);
      session.pendingConfirmation = { kind: 'create', payload: { taskData } };

      const timeRange = taskData.endTime
        ? `${formatTime(taskData.startTime)} to ${formatTime(taskData.endTime)}`
        : `${formatTime(taskData.startTime)}`;

      return res.json({
        success: false,
        reply: `⚠️ The task "${taskData.title}" (${taskData.section}) at ${timeRange} overlaps with:\n\n${overlapLines}\n\nProceed anyway?`,
        suggestions: ['Yes, create anyway', 'No, cancel'],
        awaitingConfirmation: true,
      });
    }

    // Check for duplicates
    const dupQuery = {
      createdBy: req.userEmail,
      title: taskData.title,
      section: taskData.section,
      date: taskData.date,
      'startTime.hour': taskData.startTime.hour,
      'startTime.minute': taskData.startTime.minute,
      'startTime.period': taskData.startTime.period,
      $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }],
    };
    if (taskData.endTime) {
      dupQuery['endTime.hour'] = taskData.endTime.hour;
      dupQuery['endTime.minute'] = taskData.endTime.minute;
      dupQuery['endTime.period'] = taskData.endTime.period;
    }
    
    const existingTask = await db.collection('tasks').findOne(dupQuery);
    if (existingTask) {
      const timeRange = taskData.endTime
        ? `${formatTime(taskData.startTime)} to ${formatTime(taskData.endTime)}`
        : `${formatTime(taskData.startTime)}`;
      return res.json({
        success: false,
        reply: `⚠️ A task "${taskData.title}" already exists on ${taskData.date} at ${timeRange}.`,
        suggestions: [`Create "${taskData.title} 2" at ${formatTime(taskData.startTime)}`, 'Create at a different time', 'Show my existing tasks'],
      });
    }

    const result = await db.collection('tasks').insertOne(taskData);

    nlpService.setConversationContext(req.userEmail, 'task_created', {
      taskId: result.insertedId,
      title: taskData.title,
      section: taskData.section,
      date: taskData.date,
      startTime: taskData.startTime,
      endTime: taskData.endTime,
    });

    const timeRange = taskData.endTime
      ? `${formatTime(taskData.startTime)} to ${formatTime(taskData.endTime)}`
      : `${formatTime(taskData.startTime)}`;

    const opt = [];
    if (taskData.priority) opt.push(`${taskData.priority} priority`);
    if (taskData.recurring) opt.push(`${taskData.recurring} recurring`);
    if (taskData.collaborators?.length) opt.push(`collaborators: ${taskData.collaborators.join(', ')}`);
    const optTxt = opt.length ? ` (${opt.join(', ')})` : '';

    // ⭐ FIX: Better success message for direct creation
    const successMessage = direct 
      ? `✅ Task "${taskData.title}" successfully created for ${taskData.section} on ${taskData.date} at ${timeRange}${optTxt}!`
      : `✅ Task "${taskData.title}" created for ${taskData.section} on ${taskData.date} at ${timeRange}${optTxt}!`;

    return res.json({
      success: true,
      action: 'task_created',
      taskId: result.insertedId,
      reply: successMessage,
      suggestions: ['Create another task', 'Show my tasks', "What's my schedule today?"],
    });
  } catch (error) {
    console.error('Error creating task:', error);
    return res.json({
      success: false,
      reply: `Failed to create task: ${error.message}`,
      suggestions: ['Create homework task for school tomorrow at 6pm', 'Add meeting to work at 3pm'],
    });
  }
}

// ---------------------------
// SHOW TASKS
// ---------------------------
async function handleShowTasks(req, res, parsed) {
  try {
    const db = await connectDB();
    const dateFilter = parsed.date || format(new Date(), 'yyyy-MM-dd');

    const query = {
      createdBy: req.userEmail,
      $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }],
      ...(parsed.section && parsed.section !== 'all' ? { section: parsed.section } : {}),
      date: dateFilter,
    };

    const tasks = await db.collection('tasks').find(query).sort({ createdAt: -1 }).toArray();

    if (tasks.length) {
      const formatted = tasks.map((t) => ({ ...t, _id: t._id.toString(), source: 'active' }));
      nlpService.setLastTaskContext(req.userEmail, formatted, formatted[0]);
      const s = nlpService.getSessionData(req.userEmail);
      s.currentFocus = 'tasks';
      s.lastViewedType = 'active';
    }

    if (!tasks.length) {
      const sectionText = parsed.section && parsed.section !== 'all' ? ` ${parsed.section}` : '';
      return res.json({
        success: true,
        reply: `No${sectionText} tasks found for ${dateFilter}.`,
        suggestions: ['Create a new task', 'Show all tasks', "Show tomorrow's schedule"],
      });
    }

    const list = tasks.map((task, i) => {
      const timeStr = formatTime(task.startTime) + (task.endTime ? ` - ${formatTime(task.endTime)}` : '');
      const priorityStr = task.priority ? ` [${task.priority}]` : '';
      const recurringStr = task.recurring ? ` (${task.recurring})` : '';
      return `${i + 1}. ${task.title} (${task.section}) - ${timeStr}${priorityStr}${recurringStr}`;
    }).join('\n');

    const sectionText = parsed.section && parsed.section !== 'all' ? ` ${parsed.section}` : '';

    const suggestions = tasks.length === 1
      ? ['Delete that task', 'Edit that task', 'Create another task']
      : tasks.length === 2
      ? ['Delete both tasks', 'Delete those tasks', 'Edit the first task', 'Create another task']
      : ['Delete all those tasks', 'Delete those tasks', 'Edit a specific task', 'Create another task'];

    return res.json({
      success: true,
      reply: `Here are your${sectionText} tasks for ${dateFilter} (newest first):\n\n${list}`,
      suggestions,
    });
  } catch (error) {
    console.error('Error showing tasks:', error);
    return res.json({
      success: false,
      reply: 'Failed to retrieve tasks. Please try again.',
      suggestions: ['Show my tasks', 'Create a task'],
    });
  }
}

// ---------------------------
// SCHEDULE QUERY
// ---------------------------
async function handleScheduleQuery(req, res, parsed) {
  try {
    const db = await connectDB();
    const dateFilter = parsed.date || format(new Date(), 'yyyy-MM-dd');
    
    const query = {
      createdBy: req.userEmail,
      date: dateFilter,
      $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }],
      ...(parsed.section && parsed.section !== 'all' ? { section: parsed.section } : {}),
    };

    const tasks = await db.collection('tasks').find(query).sort({ 'startTime.hour': 1, 'startTime.minute': 1 }).toArray();

    if (tasks.length) {
      const formatted = tasks.map((t) => ({ ...t, _id: t._id.toString(), source: 'active' }));
      nlpService.setLastTaskContext(req.userEmail, formatted, formatted[0]);
      const s = nlpService.getSessionData(req.userEmail);
      s.currentFocus = 'tasks';
      s.lastViewedType = 'active';
    }

    if (!tasks.length) {
      const sectionText = parsed.section ? ` ${parsed.section}` : '';
      return res.json({
        success: true,
        reply: `No${sectionText} tasks found for ${dateFilter}.`,
        suggestions: ['Create a task for today', 'Show all my tasks', "What's my schedule tomorrow?"],
      });
    }

    let text;
    if (parsed.section && parsed.section !== 'all') {
      text = `Your ${parsed.section} tasks for ${dateFilter}:\n\n`;
      tasks.forEach((t) => {
        const timeStr = formatTime(t.startTime) + (t.endTime ? ` - ${formatTime(t.endTime)}` : '');
        const pr = t.priority ? ` [${t.priority}]` : '';
        text += `• ${t.title} at ${timeStr}${pr}\n`;
      });
    } else {
      text = `Your schedule for ${dateFilter}:\n\n`;
      const by = {
        work: tasks.filter((t) => t.section === 'work'),
        school: tasks.filter((t) => t.section === 'school'),
        personal: tasks.filter((t) => t.section === 'personal'),
      };
      for (const [sec, arr] of Object.entries(by)) {
        if (!arr.length) continue;
        text += `**${sec.toUpperCase()}:**\n`;
        arr.forEach((t) => {
          const timeStr = formatTime(t.startTime) + (t.endTime ? ` - ${formatTime(t.endTime)}` : '');
          const pr = t.priority ? ` [${t.priority}]` : '';
          text += `• ${t.title} at ${timeStr}${pr}\n`;
        });
        text += '\n';
      }
    }

    return res.json({
      success: true,
      reply: text.trim(),
      suggestions: tasks.length === 1
        ? ['Edit that task', 'Delete that task', 'Create another task']
        : ['Edit a task', 'Delete some tasks', 'Create another task', "Show tomorrow's schedule"],
    });
  } catch (error) {
    console.error('Error showing schedule:', error);
    return res.json({
      success: false,
      reply: 'Failed to retrieve your schedule. Please try again.',
      suggestions: ["What's my schedule today?", 'Show my tasks'],
    });
  }
}

// ---------------------------
// DELETE CONFIRMED
// ---------------------------
async function handleDeleteConfirmed(req, res, parsed) {
  try {
    const db = await connectDB();
    const d = parsed.deleteData;

    if (d.type === 'multiple_contextual_tasks' || d.type === 'multiple_similar_tasks') {
      const ids = (d.taskIds || [])
        .map((id) => (typeof id === 'object' && id?._id ? id._id.toString() : id?.toString?.()))
        .filter((s) => s && ObjectId.isValid(s))
        .map((s) => new ObjectId(s));

      if (!ids.length) {
        return res.json({
          success: false,
          reply: 'Invalid task references. Please show your tasks again.',
          suggestions: ['Show my tasks', 'Create a new task'],
        });
      }

      const q = {
        _id: { $in: ids },
        createdBy: req.userEmail,
        $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }],
      };

      const toDelete = await db.collection('tasks').find(q).toArray();
      if (!toDelete.length) {
        return res.json({
          success: false,
          reply: 'No matching tasks found to delete.',
          suggestions: ['Show my tasks', 'Create a new task'],
        });
      }

      const result = await db.collection('tasks').updateMany(q, { $set: { status: 'Deleted', deletedAt: new Date(), updatedAt: new Date() } });

      const names = toDelete.map((t) => t.title).join(', ');
      return res.json({
        success: true,
        action: 'multiple_tasks_deleted',
        reply: `✅ Deleted ${result.modifiedCount} tasks: ${names}!`,
        suggestions: ['Create a new task', 'Show my remaining tasks', "What's my schedule today?"],
      });
    } else if (d.type === 'by_section') {
      const section = d.section;
      const tasksToDelete = await db.collection('tasks').find({
        createdBy: req.userEmail,
        section,
        $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }]
      }).toArray();

      if (!tasksToDelete.length) {
        return res.json({
          success: false,
          reply: `No active ${section} tasks to delete.`,
          suggestions: ["Show my tasks", "Create a task"]
        });
      }

      const ids = tasksToDelete.map(t => t._id);
      const result = await db.collection('tasks').updateMany(
        { _id: { $in: ids } },
        { $set: { status:'Deleted', deletedAt:new Date(), updatedAt:new Date() } }
      );

      return res.json({
        success: true,
        action: 'multiple_tasks_deleted',
        reply: `✅ Deleted ${result.modifiedCount} ${section} task(s).`,
        suggestions: ["Show my remaining tasks", "What's my schedule today?"]
      });
    }

    // Single task deletion
    let q;
    if (d.taskId) {
      const s = d.taskId.toString();
      if (!ObjectId.isValid(s)) {
        return res.json({ success: false, reply: 'Invalid task reference.', suggestions: ['Show my tasks'] });
      }
      q = {
        _id: new ObjectId(s),
        createdBy: req.userEmail,
        $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }],
      };
    } else if (d.taskIdentifier) {
      q = {
        createdBy: req.userEmail,
        $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }],
        title: { $regex: new RegExp(d.taskIdentifier, 'i') },
      };
    } else {
      return res.json({
        success: false,
        reply: 'No task reference found.',
        suggestions: ['Show my tasks', 'Create a new task'],
      });
    }

    const found = await db.collection('tasks').findOne(q);
    if (!found) {
      return res.json({
        success: false,
        reply: d.taskIdentifier ? `Task "${d.taskIdentifier}" not found.` : 'Task not found or already deleted.',
        suggestions: ['Show my tasks', 'Create a new task'],
      });
    }

    await db.collection('tasks').updateOne(q, { $set: { status: 'Deleted', deletedAt: new Date(), updatedAt: new Date() } });

    return res.json({
      success: true,
      action: 'task_deleted',
      reply: `✅ Task "${found.title}" has been deleted!`,
      suggestions: ['Create a new task', 'Show my remaining tasks', "What's my schedule today?"],
    });
  } catch (error) {
    console.error('Delete error:', error);
    return res.json({
      success: false,
      reply: 'Failed to delete task(s). Please try again.',
      suggestions: ['Show my tasks', 'Create a task'],
    });
  }
}

// ---------------------------
// EDIT CONFIRMED
// ---------------------------
async function handleEditConfirmed(req, res, parsed) {
  try {
    const db = await connectDB();
    const e = parsed.editData;

    let q;
    if (e.taskId) {
      const s = e.taskId.toString();
      if (!ObjectId.isValid(s)) {
        return res.json({ success: false, reply: 'Invalid task reference.', suggestions: ['Show my tasks'] });
      }
      q = {
        _id: new ObjectId(s),
        createdBy: req.userEmail,
        $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }],
      };
    } else if (e.taskIdentifier) {
      q = {
        createdBy: req.userEmail,
        $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }],
        title: { $regex: new RegExp(e.taskIdentifier, 'i') },
      };
    } else {
      return res.json({
        success: false,
        reply: 'No task reference found.',
        suggestions: ['Show my tasks', 'Create a new task'],
      });
    }

    const task = await db.collection('tasks').findOne(q);
    if (!task) {
      return res.json({
        success: false,
        reply: e.taskIdentifier ? `Task "${e.taskIdentifier}" not found.` : 'Task not found.',
        suggestions: ['Show my tasks', 'Create a new task'],
      });
    }

    let $set = { updatedAt: new Date() };
    let $unset = {};
    let $addToSet = {};
    let $pullAll = {};

    if (e.newTitle) $set.title = nlpService.cleanTaskNameEnhanced(e.newTitle);
    if (e.newTime) $set.startTime = e.newTime;
    if (e.newEndTime) $set.endTime = e.newEndTime;
    if (e.newDate) $set.date = e.newDate;
    if (e.newSection) $set.section = e.newSection;
    if (e.newPriority) $set.priority = e.newPriority;

    if (e.newRecurring === '__NONE__') {
      $unset.recurring = "";
    } else if (e.newRecurring) {
      $set.recurring = e.newRecurring;
    }

    if (Array.isArray(e.collaboratorsAdd) && e.collaboratorsAdd.length) {
      const resolvedAdd = await resolveCollaboratorNames(db, e.collaboratorsAdd);
      if (resolvedAdd.length) {
        $addToSet.collaborators = { $each: resolvedAdd };
      }
    }
    if (Array.isArray(e.collaboratorsRemove) && e.collaboratorsRemove.length) {
      const resolvedRemove = await resolveCollaboratorNames(db, e.collaboratorsRemove);
      if (resolvedRemove.length) {
        $pullAll.collaborators = resolvedRemove;
      }
    }
    if (Array.isArray(e.collaboratorsSet)) {
      const resolvedSet = await resolveCollaboratorNames(db, e.collaboratorsSet);
      $set.collaborators = resolvedSet;
    }

    if ($set.startTime && $set.endTime) {
      const startHour = parseInt($set.startTime.hour, 10);
      const startMin = parseInt($set.startTime.minute || 0, 10);
      const startPeriod = ($set.startTime.period || '').toUpperCase();
      
      const endHour = parseInt($set.endTime.hour, 10);
      const endMin = parseInt($set.endTime.minute || 0, 10);
      const endPeriod = ($set.endTime.period || '').toUpperCase();
      
      let start24Hour = startHour;
      if (startPeriod === 'AM' && startHour === 12) start24Hour = 0;
      if (startPeriod === 'PM' && startHour !== 12) start24Hour = startHour + 12;
      
      let end24Hour = endHour;
      if (endPeriod === 'AM' && endHour === 12) end24Hour = 0;
      if (endPeriod === 'PM' && endHour !== 12) end24Hour = endHour + 12;
      
      const startMinutes = start24Hour * 60 + startMin;
      const endMinutes = end24Hour * 60 + endMin;
      
      if (endMinutes <= startMinutes) {
        return res.json({
          success: false,
          reply: "End time must be after start time.",
          suggestions: ["Set end time to 6:00 PM", "Change start time"]
        });
      }
    }

    const hasSignificantChanges = (
      (e.newTitle && e.newTitle !== task.title) ||
      (e.newTime && JSON.stringify(e.newTime) !== JSON.stringify(task.startTime)) ||
      (e.newEndTime !== undefined && JSON.stringify(e.newEndTime) !== JSON.stringify(task.endTime)) ||
      (e.newDate && e.newDate !== task.date) ||
      (e.newSection && e.newSection !== task.section)
    );

    if (hasSignificantChanges) {
      const dupQuery = {
        createdBy: req.userEmail,
        _id: { $ne: new ObjectId(task._id) },
        title: $set.title || task.title,
        section: $set.section || task.section,
        date: $set.date || task.date,
        $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }],
      };

      const newStartTime = $set.startTime || task.startTime;
      const newEndTime = $set.endTime !== undefined ? $set.endTime : task.endTime;

      dupQuery['startTime.hour'] = newStartTime.hour;
      dupQuery['startTime.minute'] = newStartTime.minute;
      dupQuery['startTime.period'] = newStartTime.period;

      if (newEndTime) {
        dupQuery['endTime.hour'] = newEndTime.hour;
        dupQuery['endTime.minute'] = newEndTime.minute;
        dupQuery['endTime.period'] = newEndTime.period;
      } else {
        dupQuery.endTime = { $exists: false };
      }

      const existingTask = await db.collection('tasks').findOne(dupQuery);
      if (existingTask) {
        const timeRange = newEndTime
          ? `${formatTime(newStartTime)} to ${formatTime(newEndTime)}`
          : `${formatTime(newStartTime)}`;
        return res.json({
          success: false,
          reply: `⚠️ A task "${dupQuery.title}" already exists on ${dupQuery.date} at ${timeRange}.`,
          suggestions: ['Choose a different time', 'Edit the title to make it unique', 'Show my existing tasks'],
        });
      }
    }

    const updateDoc = {};
    if (Object.keys($set).length) updateDoc.$set = $set;
    if (Object.keys($unset).length) updateDoc.$unset = $unset;
    if (Object.keys($addToSet).length) updateDoc.$addToSet = $addToSet;
    if (Object.keys($pullAll).length) updateDoc.$pullAll = $pullAll;

    const result = await db.collection('tasks').updateOne(q, updateDoc);

    if (!result.modifiedCount) {
      return res.json({
        success: false,
        reply: 'No changes were applied.',
        suggestions: ['Show my tasks', 'Create a new task'],
      });
    }

    const changed = [];
    if (e.newTitle) changed.push(`name to "${$set.title}"`);
    if (e.newTime) changed.push(`time to ${formatTime(e.newTime)}`);
    if (e.newEndTime !== undefined)
      changed.push(e.newEndTime ? `end time to ${formatTime(e.newEndTime)}` : 'removed end time');
    if (e.newDate) changed.push(`date to ${e.newDate}`);
    if (e.newSection) changed.push(`section to ${e.newSection}`);
    if (e.newPriority) changed.push(`priority to ${e.newPriority}`);
    if (e.newRecurring === '__NONE__') changed.push('recurring to none');
    else if (e.newRecurring) changed.push(`recurring to ${e.newRecurring}`);
    if (e.collaboratorsAdd?.length) changed.push(`added collaborators: ${e.collaboratorsAdd.join(', ')}`);
    if (e.collaboratorsRemove?.length) changed.push(`removed collaborators: ${e.collaboratorsRemove.join(', ')}`);

    return res.json({
      success: true,
      action: 'task_edited',
      reply: `✅ Task "${task.title}" updated successfully! Changed: ${changed.join(', ')}.`,
      suggestions: ['Show my tasks', 'Create another task', "What's my schedule today?"],
    });
  } catch (error) {
    console.error('Edit error:', error);
    return res.json({
      success: false,
      reply: 'Failed to edit task. Please try again.',
      suggestions: ['Show my tasks', 'Create a task'],
    });
  }
}

// ---------------------------
// ARCHIVE FUNCTIONS
// ---------------------------
async function handleShowArchivedTasks(req, res, parsed) {
  try {
    const db = await connectDB();
    const query = {
      createdBy: req.userEmail,
      deletedAt: { $exists: true, $ne: null },
      ...(parsed.section && parsed.section !== 'all' ? { section: parsed.section } : {}),
      ...(parsed.date ? { date: parsed.date } : {}),
    };

    const tasks = await db.collection('tasks').find(query).sort({ deletedAt: -1 }).toArray();

    const formatted = tasks.map((t) => ({ 
      ...t, 
      _id: t._id.toString(), 
      source: 'archive',
      isArchived: true 
    }));
    
    nlpService.setLastTaskContext(req.userEmail, formatted, formatted[0] || null);
    const s = nlpService.getSessionData(req.userEmail);
    s.currentFocus = 'archived_tasks';
    s.lastViewedType = 'archived';

    console.log(`🗂️ Archive context set for ${req.userEmail}:`, {
      taskCount: formatted.length,
      source: 'archive',
      focus: s.currentFocus,
      viewType: s.lastViewedType,
      taskTitles: formatted.map((t, i) => `${i + 1}. ${t.title}`)
    });

    if (!tasks.length) {
      const sectionText = parsed.section && parsed.section !== 'all' ? ` ${parsed.section}` : '';
      const dateText = parsed.date ? ` for ${parsed.date}` : '';
      return res.json({
        success: true,
        reply: `No${sectionText} archived tasks found${dateText}.`,
        suggestions: ['Show my active tasks', 'Create a new task', "What's my schedule today?"],
      });
    }

    const list = tasks.map((t, i) => {
      const timeStr = formatTime(t.startTime) + (t.endTime ? ` - ${formatTime(t.endTime)}` : '');
      const pr = t.priority ? ` [${t.priority}]` : '';
      const rec = t.recurring ? ` (${t.recurring})` : '';
      const collabStr = t.collaborators?.length ? ` [with: ${t.collaborators.map(email => email.split('@')[0]).join(', ')}]` : '';
      const del = t.deletedAt ? ` (deleted: ${format(new Date(t.deletedAt), 'MM/dd/yyyy')})` : '';
      return `${i + 1}. ${t.title} (${t.section}) - ${timeStr} on ${t.date}${pr}${rec}${collabStr}${del}`;
    }).join('\n');

    const sectionText = parsed.section && parsed.section !== 'all' ? ` ${parsed.section}` : '';
    const dateText = parsed.date ? ` for ${parsed.date}` : '';

    let suggestions;
    if (tasks.length === 1) {
      suggestions = ['Restore that task', 'Restore the first task', 'Delete permanently', 'Show active tasks'];
    } else if (tasks.length === 2) {
      suggestions = ['Restore both tasks', 'Restore the first task', 'Restore the second task', 'Show active tasks'];
    } else if (tasks.length <= 5) {
      suggestions = ['Restore the first task', 'Restore the first two tasks', 'Restore all tasks', 'Show active tasks'];
    } else {
      suggestions = ['Restore the first task', 'Restore tasks 1-3', 'Restore the first 5 tasks', 'Show active tasks'];
    }

    return res.json({
      success: true,
      reply: `Here are your${sectionText} archived tasks${dateText} (${tasks.length} total):\n\n${list}\n\nYou can restore by saying "restore the first task", "restore tasks 1-3", or "restore [task name]".`,
      suggestions,
    });
  } catch (error) {
    console.error('Archive show error:', error);
    return res.json({
      success: false,
      reply: 'Failed to retrieve archived tasks. Please try again.',
      suggestions: ['Show my tasks', 'Create a task'],
    });
  }
}

async function handleRestoreConfirmed(req, res, parsed) {
  try {
    const db = await connectDB();
    const r = parsed.restoreData;

    console.log(`🔄 Restore confirmed for ${req.userEmail}:`, {
      type: r.type,
      taskId: r.taskId,
      taskIds: r.taskIds,
      taskIdentifier: r.taskIdentifier
    });

    if (r.type === 'multiple_contextual_tasks') {
      const ids = (r.taskIds || [])
        .map((id) => {
          if (typeof id === 'object' && id?._id) {
            return id._id.toString();
          }
          return id?.toString?.() || '';
        })
        .filter((s) => s && ObjectId.isValid(s))
        .map((s) => new ObjectId(s));

      console.log(`🔄 Multiple restore - processed IDs:`, ids.map(id => id.toString()));

      if (!ids.length) {
        console.error('❌ Invalid task IDs for multiple restore:', r.taskIds);
        return res.json({
          success: false,
          reply: 'Invalid task references. Please show your archived tasks again.',
          suggestions: ['Show my archived tasks', 'What tasks do I have in archive?'],
        });
      }

      const q = { _id: { $in: ids }, createdBy: req.userEmail, deletedAt: { $exists: true, $ne: null } };
      const toRestore = await db.collection('tasks').find(q).toArray();
      
      console.log(`🔍 Found ${toRestore.length} tasks to restore from ${ids.length} IDs`);
      
      if (!toRestore.length) {
        return res.json({
          success: false,
          reply: 'No matching archived tasks found to restore.',
          suggestions: ['Show my archived tasks', 'Create a new task'],
        });
      }

      const result = await db.collection('tasks').updateMany(q, { $set: { status: 'Pending', updatedAt: new Date() }, $unset: { deletedAt: '' } });

      const names = toRestore.map((t) => t.title).join(', ');
      return res.json({
        success: true,
        action: 'multiple_tasks_restored',
        reply: `✅ Restored ${result.modifiedCount} tasks: ${names}!`,
        suggestions: ['Show my tasks', 'Create another task', "What's my schedule today?"],
      });
    }

    let q;
    if (r.taskId) {
      let taskIdStr;
      if (typeof r.taskId === 'object' && r.taskId?._id) {
        taskIdStr = r.taskId._id.toString();
      } else {
        taskIdStr = r.taskId.toString();
      }
      
      console.log(`🔄 Single restore - task ID: ${taskIdStr}`);
      
      if (!ObjectId.isValid(taskIdStr)) {
        console.error('❌ Invalid task ID for single restore:', r.taskId, 'converted to:', taskIdStr);
        return res.json({ 
          success: false, 
          reply: 'Invalid task reference. Please show your archived tasks again.', 
          suggestions: ['Show my archived tasks', 'What tasks do I have in archive?'] 
        });
      }
      
      q = { _id: new ObjectId(taskIdStr), createdBy: req.userEmail, deletedAt: { $exists: true, $ne: null } };
    } else if (r.taskIdentifier) {
      console.log(`🔄 Single restore - task identifier: ${r.taskIdentifier}`);
      q = {
        createdBy: req.userEmail,
        deletedAt: { $exists: true, $ne: null },
        title: { $regex: new RegExp(r.taskIdentifier, 'i') },
      };
    } else {
      console.error('❌ No task reference found in restore data:', r);
      return res.json({
        success: false,
        reply: 'No task reference found.',
        suggestions: ['Show my archived tasks', 'What tasks do I have in archive?'],
      });
    }

    const found = await db.collection('tasks').findOne(q);
    if (!found) {
      console.error('❌ Archived task not found with query:', q);
      return res.json({
        success: false,
        reply: r.taskIdentifier ? `Archived task "${r.taskIdentifier}" not found.` : 'Archived task not found.',
        suggestions: ['Show my archived tasks', 'What tasks do I have in archive?'],
      });
    }

    console.log(`✅ Found task to restore: ${found.title} (${found._id})`);

    await db.collection('tasks').updateOne(q, { $set: { status: 'Pending', updatedAt: new Date() }, $unset: { deletedAt: '' } });

    return res.json({
      success: true,
      action: 'task_restored',
      reply: `✅ Task "${found.title}" has been restored!`,
      suggestions: ['Show my tasks', 'Create another task', "What's my schedule today?"],
    });
  } catch (error) {
    console.error('❌ Restore error:', error);
    return res.json({
      success: false,
      reply: 'Failed to restore task(s). Please try again.',
      suggestions: ['Show my archived tasks', 'Create a task'],
    });
  }
}

// ---------------------------
// LIST COLLABORATORS
// ---------------------------
async function handleListCollaborators(req, res, parsed) {
  try {
    const db = await connectDB();
    
    const availableCollaborators = await getAvailableCollaborators(db);
    
    if (!availableCollaborators.length) {
      return res.json({
        success: true,
        reply: 'No collaborators found in the system.',
        suggestions: ['Create a task', 'Show my tasks']
      });
    }

    const tasks = await db.collection('tasks').find({
      createdBy: req.userEmail,
      $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }],
      collaborators: { $exists: true, $ne: [] }
    }).toArray();

    const usedEmails = new Set();
    tasks.forEach(task => {
      if (Array.isArray(task.collaborators)) {
        task.collaborators.forEach(email => {
          if (email && typeof email === 'string') {
            usedEmails.add(email.trim());
          }
        });
      }
    });

    const collaboratorList = availableCollaborators.map((collab, i) => {
      const isUsed = usedEmails.has(collab.email);
      const status = isUsed ? ' (currently in use)' : '';
      return `${i + 1}. ${collab.username}${status}`;
    }).join('\n');

    return res.json({
      success: true,
      reply: `Available collaborators (use their username):\n\n${collaboratorList}`,
      suggestions: ['Create task with tester4', 'Create meeting with tester and newuser1', 'Show my tasks']
    });

  } catch (error) {
    console.error('List collaborators error:', error);
    return res.json({
      success: false,
      reply: 'Failed to retrieve collaborators. Please try again.',
      suggestions: ['Show my tasks', 'Create a task']
    });
  }
}

// ---------------------------
// SESSION & HEALTH
// ---------------------------
router.get('/session-info', authMiddleware, (req, res) => {
  try {
    const s = nlpService.getSessionData(req.userEmail);
    const conv = nlpService.getConversationContext(req.userEmail);
    const ctx = nlpService.getLastTaskContext(req.userEmail);
    return res.json({
      success: true,
      sessionData: {
        sessionId: s.sessionId,
        currentFocus: s.currentFocus,
        lastViewedType: s.lastViewedType,
        lastActivity: new Date(s.lastActivity).toISOString(),
        contextualReferences: Array.from(s.contextualReferences.keys()),
        lastMentionedTasksCount: s.lastMentionedTasks.length,
      },
      conversationHistoryCount: conv?.length || 0,
      taskContextCount: ctx?.tasks?.length || 0,
      contextSource: ctx?.source || 'unknown'
    });
  } catch (error) {
    console.error('Session info error:', error);
    return res.json({
      success: false,
      reply: 'Failed to retrieve session info.',
      suggestions: ['Show my tasks', 'Create a task']
    });
  }
});

router.get('/health', (_req, res) => {
  res.json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    activeSessions: nlpService.sessionData.size,
    activeConversations: nlpService.conversationHistory.size,
    version: '6.9.2-priority-endtime-fixes',
  });
});

module.exports = router;
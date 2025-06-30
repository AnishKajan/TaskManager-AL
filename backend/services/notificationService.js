const connectDB = require('../db/mongoClient');

class NotificationService {
  constructor() {
    this.io = null;
    this.checkInterval = null;
    // Store user timezone information: { userEmail: { timezone: 'America/New_York', offset: -5 } }
    this.userTimezones = new Map();
    // All possible UTC offsets (covers every timezone on Earth)
    this.allUtcOffsets = this.getAllUtcOffsets();
  }

  // Get all possible UTC offsets (UTC-12 to UTC+14)
  getAllUtcOffsets() {
    const offsets = [];
    // From UTC-12 to UTC+14 (covers all world timezones including Pacific islands)
    for (let offset = -12; offset <= 14; offset++) {
      offsets.push(offset);
    }
    // Add half-hour offsets for places like India (UTC+5.5), Australia (UTC+9.5), etc.
    const halfHourOffsets = [-9.5, -4.5, 3.5, 4.5, 5.5, 6.5, 9.5, 10.5, 12.75];
    offsets.push(...halfHourOffsets);
    
    console.log(`🌍 Supporting ${offsets.length} UTC offsets including half-hour zones`);
    return offsets.sort((a, b) => a - b);
  }

  initialize(io) {
    this.io = io;
    this.startNotificationChecker();
    console.log(`🔔 Notification service initialized with timezone detection`);
    
    // Clean connection handling - no test notifications
    io.on('connection', (socket) => {
      console.log('🔌 New socket connection:', socket.id);
      
      // Clean: Join user room with timezone detection (no welcome notification)
      socket.on('join-user-room', (data) => {
        let userEmail, userTimezone, userOffset;
        
        // Handle both old format (just email) and new format (object with timezone)
        if (typeof data === 'string') {
          userEmail = data;
          userTimezone = null;
          userOffset = null;
        } else {
          userEmail = data.email;
          userTimezone = data.timezone;
          userOffset = data.offset;
        }
        
        socket.join(userEmail);
        console.log(`👤 User ${userEmail} joined room with socket ${socket.id}`);
        
        // Store user timezone information
        if (userTimezone && userOffset !== null) {
          this.userTimezones.set(userEmail, {
            timezone: userTimezone,
            offset: userOffset,
            lastSeen: new Date()
          });
          console.log(`🌍 Stored timezone for ${userEmail}: ${userTimezone} (UTC${userOffset >= 0 ? '+' : ''}${userOffset})`);
        }
      });
    });
  }

  startNotificationChecker() {
    // Check every 60 seconds for precise timing
    this.checkInterval = setInterval(() => {
      this.checkUpcomingTasks();
    }, 60000); // 60 seconds for better precision

    // Also run immediately on startup
    this.checkUpcomingTasks();
  }

  async checkUpcomingTasks() {
    try {
      const db = await connectDB();
      
      // SMART CHECKING: Only check timezones where we have active users OR all timezones
      const activeUserOffsets = new Set();
      
      // Get offsets from active users
      this.userTimezones.forEach((userData) => {
        activeUserOffsets.add(userData.offset);
      });
      
      // If we have active users, prioritize their timezones, otherwise check all
      const offsetsToCheck = activeUserOffsets.size > 0 
        ? Array.from(activeUserOffsets) 
        : this.allUtcOffsets;
      
      console.log(`🌍 Checking ${offsetsToCheck.length} timezone offsets (${activeUserOffsets.size} active users)`);
      
      // Check each timezone offset
      for (const utcOffset of offsetsToCheck) {
        await this.checkTasksForTimezoneOffset(db, utcOffset);
      }

    } catch (error) {
      console.error('❌ Error checking upcoming tasks:', error);
    }
  }

  async checkTasksForTimezoneOffset(db, utcOffset) {
    try {
      // Calculate current time for this UTC offset
      const now = new Date();
      const offsetTime = new Date(now.getTime() + (utcOffset * 60 * 60 * 1000));
      
      // Get current date in YYYY-MM-DD format for this timezone
      const today = offsetTime.toISOString().split('T')[0];
      
      // Find tasks that match this date and are not deleted/complete
      const tasks = await db.collection('tasks')
        .find({
          date: today,
          status: { $nin: ['Deleted', 'Complete'] }
        })
        .toArray();

      if (tasks.length === 0) {
        return; // No tasks for this timezone today
      }

      console.log(`📋 [UTC${utcOffset >= 0 ? '+' : ''}${utcOffset}] Found ${tasks.length} tasks for ${today} at ${offsetTime.toLocaleTimeString()}`);

      for (const task of tasks) {
        const result = this.shouldNotifyForTask(task, offsetTime, utcOffset);
        
        if (result.shouldNotify) {
          console.log(`📝 [UTC${utcOffset >= 0 ? '+' : ''}${utcOffset}] Task "${task.title}" - ${result.message}`);
          await this.sendTaskNotification(task, db, utcOffset, result.notificationType, result.minutesUntilStart);
        }
      }

    } catch (error) {
      console.error(`❌ Error checking tasks for UTC${utcOffset >= 0 ? '+' : ''}${utcOffset}:`, error);
    }
  }

  shouldNotifyForTask(task, currentTime, utcOffset) {
    if (!task.startTime || !task.startTime.hour || !task.startTime.minute || !task.startTime.period) {
      return {
        shouldNotify: false,
        message: `⚠️ Missing time information`
      };
    }

    const taskStartTime = this.getTaskDateTimeInOffset(task, currentTime);
    
    // Calculate time difference in minutes
    const timeDiff = taskStartTime.getTime() - currentTime.getTime();
    const minutesUntilStart = Math.floor(timeDiff / (60 * 1000));
    
    // PRECISE 1-HOUR NOTIFICATION TIMING - Expanded window to catch exact hour
    const is1HourNotice = minutesUntilStart >= 59 && minutesUntilStart <= 61; // window for 1 hour (60 min)

    const shouldNotify = is1HourNotice
    
    let message = `${minutesUntilStart} minutes until start`;
    let notificationType = 'reminder';
    
    if (is1HourNotice) {
      message += ' - 1 HOUR NOTICE';
      notificationType = '1hour';
    }
    if (shouldNotify) message += ' 🔔 WILL NOTIFY';
    
    return {
      shouldNotify,
      message,
      minutesUntilStart,
      taskStartTime,
      utcOffset,
      notificationType
    };
  }

  getTaskDateTimeInOffset(task, baseTime) {
    const { hour, minute, period } = task.startTime;
    let taskHour = parseInt(hour);
    
    // Convert 12-hour to 24-hour format
    if (period === 'PM' && taskHour !== 12) {
      taskHour += 12;
    } else if (period === 'AM' && taskHour === 12) {
      taskHour = 0;
    }
    
    // Create the task time using the base time's date but task's time
    const taskDateTime = new Date(baseTime);
    taskDateTime.setHours(taskHour, parseInt(minute), 0, 0);
    
    return taskDateTime;
  }

  async sendTaskNotification(task, db, utcOffset, notificationType, minutesUntilStart) {
    try {
      // Prevent duplicate notifications by including notification type in the notification ID
      const today = new Date().toISOString().split('T')[0];
      const notificationId = `${task._id}_${today}_${notificationType}_UTC${utcOffset >= 0 ? '+' : ''}${utcOffset}`;
      
      const existingNotification = await db.collection('notifications')
        .findOne({ notificationId });
      
      if (existingNotification) {
        return; // Already notified today for this timezone offset and notification type
      }

      // Record that we've sent this notification
      await db.collection('notifications').insertOne({
        notificationId,
        taskId: task._id,
        utcOffset: utcOffset,
        notificationType: notificationType,
        sentAt: new Date(),
        type: 'task_reminder'
      });

      const startTimeString = `${task.startTime.hour}:${String(task.startTime.minute).padStart(2, '0')} ${task.startTime.period}`;
      
      console.log(`🔔 [UTC${utcOffset >= 0 ? '+' : ''}${utcOffset}] SENDING ${notificationType.toUpperCase()} NOTIFICATION for task: "${task.title}" at ${startTimeString}`);

      // IMPROVED: More accurate messages - show exact minutes unless it's very close to 1 hour
      // Since we only send notifications for tasks starting in 59-61 minutes, simplify to:
        const message = `"${task.title}" starts in 1 hour at ${startTimeString}`;

      const notificationData = {
        id: task._id,
        title: task.title,
        startTime: startTimeString,
        message: message,
        type: 'reminder',
        notificationType: notificationType,
        utcOffset: utcOffset
      };

      // Send notification to task creator
      if (task.userId) {
        try {
          const creator = await db.collection('users').findOne({ _id: task.userId });
          if (creator && creator.email) {
            // SMART TARGETING: Only send if user is in this timezone OR we don't know their timezone
            const userTzData = this.userTimezones.get(creator.email);
            if (!userTzData || Math.abs(userTzData.offset - utcOffset) < 0.1) {
              this.io.to(creator.email).emit('task-reminder', notificationData);
              console.log(`✅ [UTC${utcOffset >= 0 ? '+' : ''}${utcOffset}] Sent ${notificationType} notification to creator: ${creator.email}`);
            }
          }
        } catch (err) {
          console.error(`Error finding creator for UTC${utcOffset >= 0 ? '+' : ''}${utcOffset}:`, err);
        }
      }

      // Send notification to collaborators
      if (task.collaborators && task.collaborators.length > 0) {
        for (const collaboratorEmail of task.collaborators) {
          // SMART TARGETING: Only send if user is in this timezone OR we don't know their timezone
          const userTzData = this.userTimezones.get(collaboratorEmail);
          if (!userTzData || Math.abs(userTzData.offset - utcOffset) < 0.1) {
            this.io.to(collaboratorEmail).emit('task-reminder', notificationData);
            console.log(`✅ [UTC${utcOffset >= 0 ? '+' : ''}${utcOffset}] Sent ${notificationType} notification to collaborator: ${collaboratorEmail}`);
          }
        }
      }

      // Also send to createdBy email if it exists and is different
      if (task.createdBy && task.createdBy !== task.userId) {
        const userTzData = this.userTimezones.get(task.createdBy);
        if (!userTzData || Math.abs(userTzData.offset - utcOffset) < 0.1) {
          this.io.to(task.createdBy).emit('task-reminder', notificationData);
          console.log(`✅ [UTC${utcOffset >= 0 ? '+' : ''}${utcOffset}] Sent ${notificationType} notification to task creator: ${task.createdBy}`);
        }
      }

    } catch (error) {
      console.error(`❌ Error sending task notification for UTC${utcOffset >= 0 ? '+' : ''}${utcOffset}:`, error);
    }
  }

  // Immediate notification check for create/edit/restore operations
  async checkImmediateNotification(task, userEmail) {
    try {
      let notificationSent = false;

      // First, try to use the user's known timezone
      const userTzData = this.userTimezones.get(userEmail);
      
      if (userTzData) {
        // We know the user's timezone - check only their timezone
        const now = new Date();
        const userTime = new Date(now.getTime() + (userTzData.offset * 60 * 60 * 1000));
        
        const result = this.shouldNotifyForTask(task, userTime, userTzData.offset);
        
        console.log(`🔍 [User's TZ: UTC${userTzData.offset >= 0 ? '+' : ''}${userTzData.offset}] Immediate check for "${task.title}": ${result.message}`);
        
        // Check if task starts within the next 65 minutes (to catch 1-hour notifications)
        if (result.minutesUntilStart > 0 && result.minutesUntilStart <= 65) {
          notificationSent = await this.sendImmediateNotification(task, userEmail, result, userTzData.offset);
        }
      } else {
        // We don't know user's timezone - check common timezone offsets
        console.log(`🔍 Unknown timezone for ${userEmail}, checking common offsets`);
        const commonOffsets = [-8, -7, -6, -5, -4, 0, 1, 2, 5.5, 8, 9]; // Common timezones
        
        for (const utcOffset of commonOffsets) {
          const now = new Date();
          const offsetTime = new Date(now.getTime() + (utcOffset * 60 * 60 * 1000));
          
          const result = this.shouldNotifyForTask(task, offsetTime, utcOffset);
          
          // Check if task starts within the next 65 minutes
          if (result.minutesUntilStart > 0 && result.minutesUntilStart <= 65) {
            notificationSent = await this.sendImmediateNotification(task, userEmail, result, utcOffset);
            break; // Send only one immediate notification
          }
        }
      }
      
      if (!notificationSent) {
        console.log(`⏰ Task "${task.title}" - no immediate notification needed for ${userEmail} (starts in more than 1 hour or has already started)`);
      }
      
      return notificationSent;
    } catch (error) {
      console.error('❌ Error checking immediate notification:', error);
      return false;
    }
  }

  async sendImmediateNotification(task, userEmail, result, utcOffset) {
    const startTimeString = `${task.startTime.hour}:${String(task.startTime.minute).padStart(2, '0')} ${task.startTime.period}`;
    
    // More accurate immediate notification messages
    let message;
        if (result.minutesUntilStart === 60) {
            message = `"${task.title}" starts in exactly 1 hour at ${startTimeString}`;
        } else {
        // For 59 or 61 minutes (or any other value in the 59-61 range)
            message = `"${task.title}" starts in 1 hour at ${startTimeString}`;
        }

    console.log(`🔔 [UTC${utcOffset >= 0 ? '+' : ''}${utcOffset}] Sending immediate notification: ${message}`);

    const notificationData = {
      id: task._id,
      title: task.title,
      startTime: startTimeString,
      message,
      type: 'immediate',
      utcOffset: utcOffset
    };

    // Send to the user who created/edited/restored the task
    this.io.to(userEmail).emit('task-reminder', notificationData);

    // Also send to collaborators if any (check their timezones too)
    if (task.collaborators && task.collaborators.length > 0) {
      for (const collaboratorEmail of task.collaborators) {
        const collabTzData = this.userTimezones.get(collaboratorEmail);
        // Only send if collaborator is in same timezone or we don't know their timezone
        if (!collabTzData || Math.abs(collabTzData.offset - utcOffset) < 0.1) {
          this.io.to(collaboratorEmail).emit('task-reminder', notificationData);
        }
      }
    }

    console.log(`✅ [UTC${utcOffset >= 0 ? '+' : ''}${utcOffset}] Sent immediate notification for task: ${task.title}`);
    return true;
  }

  // Cleanup old user timezone data periodically
  cleanupOldUserData() {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    for (const [email, data] of this.userTimezones.entries()) {
      if (data.lastSeen < oneDayAgo) {
        this.userTimezones.delete(email);
        console.log(`🧹 Cleaned up old timezone data for ${email}`);
      }
    }
  }

  stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }
}

const notificationService = new NotificationService();
module.exports = notificationService;
import React, { useEffect, useState } from 'react';
import {
  Box, Typography, Chip, IconButton, TextField, Avatar, Stack, Button, Snackbar, Alert
} from '@mui/material';
import { CalendarToday, Settings } from '@mui/icons-material';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import io from 'socket.io-client';
import { Task } from '../types/task';
import SettingsModal from '../components/SettingsModal';
import ChatBot from '../components/ChatBot'; // Updated import
import { useGlobalUI } from '../App'; // Import global state

const API = 'http://localhost:5050/api';

const sectionColors: Record<string, string> = {
  work: '#8000B2',
  school: '#1E90FF',
  personal: '#FFA500'
};

const getPriorityColor = (priority: string) => {
  switch (priority?.toLowerCase()) {
    case 'high': return 'red';
    case 'medium': return 'orange';
    case 'low': return 'green';
    default: return 'gray';
  }
};

const Archive: React.FC = () => {
  const navigate = useNavigate();
  
  // Use global state for chatbot
  const { setSelectedTab, showChatBot, setShowChatBot } = useGlobalUI();
  
  const [tasks, setTasks] = useState<Task[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDate] = useState(new Date());
  const [showSettings, setShowSettings] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0); // Add refresh trigger
  const [snackbar, setSnackbar] = useState({
    open: false,
    message: '',
    severity: 'success' as 'success' | 'error'
  });
  // SEPARATE STATE FOR NOTIFICATION SNACKBAR
  const [notificationSnackbar, setNotificationSnackbar] = useState({
    open: false,
    message: ''
  });
  const [socket, setSocket] = useState<any>(null);
  const token = localStorage.getItem('token');
  const userEmail = localStorage.getItem('email');

  // Listen for chatbot task actions to refresh data
  useEffect(() => {
    const handleChatbotAction = (event: any) => {
      console.log('🤖 Archive: Chatbot action detected:', event.detail);
      // Refresh tasks when chatbot performs actions
      fetchTasks();
      
      // Force component re-render
      setRefreshTrigger(prev => prev + 1);
      
      // Show success message
      setSnackbar({
        open: true,
        message: `Task ${event.detail.action.replace('task_', '')} successfully via chatbot`,
        severity: 'success'
      });
    };

    window.addEventListener('chatbotTaskAction', handleChatbotAction);
    
    return () => {
      window.removeEventListener('chatbotTaskAction', handleChatbotAction);
    };
  }, []);

  // WebSocket connection and notification handling
  useEffect(() => {
    if (userEmail && token) {
      console.log('🔌 Archive: Connecting to notification service...', { userEmail });
      
      try {
        // DETECT USER'S TIMEZONE (same as Dashboard)
        const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const now = new Date();
        const utcOffset = -now.getTimezoneOffset() / 60; // Convert to hours, flip sign
        
        console.log('🌍 Archive: User timezone:', userTimezone, `(UTC${utcOffset >= 0 ? '+' : ''}${utcOffset})`);
        
        // Initialize socket connection
        const newSocket = io('http://localhost:5050', {
          transports: ['websocket', 'polling'],
          timeout: 20000,
          forceNew: true,
          reconnection: true,
          reconnectionAttempts: 5,
          reconnectionDelay: 1000
        });

        newSocket.on('connect', () => {
          console.log('🔌 ✅ Connected to notification service (Archive)');
          
          // Join user's personal room with timezone information
          newSocket.emit('join-user-room', {
            email: userEmail,
            timezone: userTimezone,
            offset: utcOffset
          });
          console.log(`👤 Archive: Joined notification room for ${userEmail}`);
        });

        newSocket.on('disconnect', (reason: string) => {
          console.log('🔌 ❌ Disconnected from notification service (Archive):', reason);
        });

        newSocket.on('reconnect', (attemptNumber: number) => {
          console.log('🔌 🔄 Reconnected to notification service (Archive, attempt', attemptNumber + ')');
          // Rejoin user room with timezone info after reconnection
          newSocket.emit('join-user-room', {
            email: userEmail,
            timezone: userTimezone,
            offset: utcOffset
          });
        });

        // Listen for task reminder notifications (ONLY REAL NOTIFICATIONS)
        newSocket.on('task-reminder', (notification: any) => {
          // FILTER: Only show real task reminders, not test notifications
          if (notification.type === 'reminder' || notification.type === 'immediate') {
            console.log('Archive: Task reminder received:', notification.message);
            
            // Show notification snackbar at top center with blue styling
            setNotificationSnackbar({
              open: true,
              message: notification.message
            });

            // Optional: Play notification sound
            if ('Notification' in window && Notification.permission === 'granted') {
              new Notification('Task Reminder', {
                body: notification.message,
                icon: '/favicon.ico'
              });
            }
          }
          // IGNORED: test notifications, connection confirmations, etc.
        });

        newSocket.on('connect_error', (error: any) => {
          console.error('❌ Archive: Notification service connection error:', error);
        });

        setSocket(newSocket);

        // Request notification permission on component mount
        if ('Notification' in window && Notification.permission === 'default') {
          Notification.requestPermission().then((permission) => {
            console.log('🔔 Archive: Browser notification permission:', permission);
          });
        }

        // Cleanup on unmount
        return () => {
          console.log('🔌 Archive: Disconnecting from notification service...');
          if (newSocket) {
            newSocket.disconnect();
          }
        };
      } catch (error) {
        console.error('❌ Archive: Failed to initialize notification service:', error);
      }
    }
  }, [userEmail, token]);

  const fetchTasks = async () => {
    try {
      if (!token) {
        navigate('/login');
        return;
      }

      const res = await axios.get(`${API}/tasks/archive`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      console.log('Archive tasks:', res.data);
      setTasks(res.data || []);

      // 🔁 Tell the chatbot what list we just showed (ARCHIVE list)
      try {
        const archived = (res.data || []);
        window.dispatchEvent(
          new CustomEvent('updateNlpContext', {
            detail: {
              source: 'archive',
              tasks: archived.map((t: Task, i: number) => ({
                _id: t._id,
                title: t.title,
                date: t.date,
                startTime: t.startTime,
                endTime: t.endTime,
                priority: t.priority,
                recurring: t.recurring,
                collaborators: t.collaborators,
                index: i + 1,
                source: 'archive',
                isArchived: true
              }))
            }
          })
        );
      } catch {}
    } catch (err) {
      console.error('Error fetching archive tasks:', err);
      setSnackbar({
        open: true,
        message: 'Failed to fetch archived tasks',
        severity: 'error'
      });
    }
  };

  const daysLeftToDelete = (deletedAt: string) => {
    const deletionDate = new Date(deletedAt);
    const now = new Date();
    const diffInDays = Math.floor((now.getTime() - deletionDate.getTime()) / (1000 * 60 * 60 * 24));
    return Math.max(0, 5 - diffInDays);
  };

  // ENHANCED: Handle restore with immediate notification check
  const handleRecover = async (taskId: string) => {
    try {
      console.log('🔄 Archive: Starting task restore process for task:', taskId);
      
      const response = await axios.patch(`${API}/tasks/restore/${taskId}`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      console.log('✅ Archive: Task restored successfully:', response.data);
      
      setSnackbar({
        open: true,
        message: 'Task restored successfully',
        severity: 'success'
      });

      // ENHANCED: Check for immediate notification after successful restore
      try {
        const userEmail = localStorage.getItem('email');
        if (userEmail && token) {
          console.log('🔔 Archive: Checking for immediate notification after restore...');
          
          // Make API call to check immediate notification for the restored task
          const notifResponse = await fetch(`${API}/notifications/test/${taskId}`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          });
          
          if (notifResponse.ok) {
            const result = await notifResponse.json();
            console.log('✅ Archive: Immediate notification check completed for restored task:', result);
            
            // Log if notification was sent
            if (result.notificationSent) {
              console.log('📬 Archive: Immediate notification was sent for restored task');
            } else {
              console.log('⏰ Archive: No immediate notification needed for restored task (starts >1 hour away or already started)');
            }
          } else {
            console.warn('⚠️ Archive: Immediate notification check failed with status:', notifResponse.status);
            const errorText = await notifResponse.text();
            console.warn('⚠️ Archive: Error response:', errorText);
          }
        }
      } catch (notifError) {
        console.warn('⚠️ Archive: Immediate notification check failed (non-blocking):', notifError);
        // Don't fail the restore if notification check fails
      }
      
      // Refresh the task list
      fetchTasks();
      
    } catch (err) {
      console.error('❌ Archive: Failed to recover task:', err);
      setSnackbar({
        open: true,
        message: 'Failed to restore task',
        severity: 'error'
      });
    }
  };

  const handlePermanentDelete = async (taskId: string) => {
    if (window.confirm('Are you sure you want to permanently delete this task? This action cannot be undone.')) {
      try {
        await axios.delete(`${API}/tasks/permanent/${taskId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        
        setSnackbar({
          open: true,
          message: 'Task permanently deleted',
          severity: 'success'
        });
        
        fetchTasks();
      } catch (err) {
        console.error('Failed to permanently delete task:', err);
        setSnackbar({
          open: true,
          message: 'Failed to permanently delete task',
          severity: 'error'
        });
      }
    }
  };

  // FIXED NAVIGATION HANDLERS - Now correctly maps to tab indices and updates global state
  const handleTabNavigation = (tabIndex: number) => {
    console.log('🎯 Archive: Navigating to tab:', tabIndex);
    // Update global state first
    setSelectedTab(tabIndex);
    // Navigate to dashboard with specific tab in URL
    const tabParam = tabIndex === 0 ? '' : `?tab=${tabIndex}`;
    navigate(`/dashboard${tabParam}`);
  };

  // CHANGED: Open settings modal locally instead of navigating
  const handleSettingsClick = () => {
    setShowSettings(true);
  };

  useEffect(() => { 
    fetchTasks(); 
  }, []);

  const filtered = tasks.filter(task =>
    task.title && task.title.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const grouped = filtered.reduce((acc: Record<string, Task[]>, task) => {
    const date = new Date(task.date).toLocaleDateString();
    if (!acc[date]) acc[date] = [];
    acc[date].push(task);
    return acc;
  }, {});

  return (
    <Box height="100vh" bgcolor="#fff">
      {/* Top Navbar */}
      <Box display="flex" alignItems="center" bgcolor="red" px={4} py={2}>
        <Box display="flex" gap={4}>
          {['Work', 'School', 'Personal'].map((tab, index) => (
            <Typography
              key={tab}
              color="white"
              fontSize="1.5rem"
              fontWeight={400}
              sx={{ cursor: 'pointer' }}
              onClick={() => handleTabNavigation(index)} // This now correctly maps: Work=0, School=1, Personal=2
            >
              {tab}
            </Typography>
          ))}
        </Box>

        <Box ml="auto" display="flex" alignItems="center" gap={3}>
          {/* Archive tab aligned right */}
          <Box bgcolor="white" px={3} py={1} borderRadius={1}>
            <Typography color="red" fontWeight={700} fontSize="1.2rem">
              Archive
            </Typography>
          </Box>

          {/* Task Assistant Button - Using Global State */}
          <Button 
            onClick={() => setShowChatBot(!showChatBot)} 
            sx={{ 
              color: 'white', 
              fontWeight: 600, 
              textTransform: 'uppercase', 
              fontSize: '1rem',
              backgroundColor: showChatBot ? 'rgba(255, 255, 255, 0.2)' : 'transparent',
              '&:hover': {
                backgroundColor: 'rgba(255, 255, 255, 0.1)'
              }
            }}
          >
            🤖 Task Assistant
          </Button>

          {/* Settings icon - CHANGED: Use local handler */}
          <IconButton onClick={handleSettingsClick}>
            <Settings sx={{ color: 'white' }} />
          </IconButton>
        </Box>
      </Box>

      {/* Date Below Navbar */}
      <Box display="flex" justifyContent="flex-end" alignItems="center" px={4} mt={1} gap={1}>
        <Typography fontWeight={600} fontSize="1.1rem" color="black">
          Date:
        </Typography>
        <Typography fontWeight={600} fontSize="1.1rem" color="black">
          {selectedDate.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}
        </Typography>
        <CalendarToday sx={{ color: 'black' }} />
      </Box>

      {/* Header */}
      <Box textAlign="center" mt={3}>
        <Typography variant="h5" color="red" fontWeight="bold">
          Completed & Deleted Tasks
        </Typography>
        <Box display="flex" justifyContent="center" mt={1} gap={2}>
          <TextField 
            size="small" 
            placeholder="Search Tasks" 
            value={searchTerm} 
            onChange={(e) => setSearchTerm(e.target.value)} 
          />
          <Button variant="outlined">Search</Button>
        </Box>
        <Typography mt={1} color="red" fontSize="0.85rem">
          Note: Deleted tasks will be permanently removed after 5 days
        </Typography>
      </Box>

      {/* Task Cards */}
      <Box px={6} mt={3} maxHeight="60vh" overflow="auto">
        {filtered.length === 0 ? (
          <Box display="flex" justifyContent="center" alignItems="center" minHeight="200px">
            <Typography variant="h6" color="text.secondary">
              No archived tasks found
            </Typography>
          </Box>
        ) : (
          Object.entries(grouped).map(([date, tasksOnDate]) => (
            <React.Fragment key={date}>
              {tasksOnDate.map((task) => {
                const isDeleted = task.status === 'Deleted';
                const statusColor = isDeleted ? 'red' : 'green';
                const statusLabel = isDeleted ? 'Deleted' : 'Complete';
                const daysLeft = isDeleted && task.deletedAt ? daysLeftToDelete(task.deletedAt) : null;

                return (
                  <Box
                    key={`${task._id}-${refreshTrigger}`} // Force re-render with refresh trigger
                    display="flex"
                    alignItems="center"
                    bgcolor="#f2ecf4"
                    borderRadius="10px"
                    p={2}
                    mb={2}
                  >
                    {/* Section color + date */}
                    <Box mr={2} display="flex" flexDirection="column" alignItems="center">
                      <Box 
                        width={14} 
                        height={14} 
                        borderRadius="50%" 
                        bgcolor={sectionColors[task.section] || 'gray'} 
                        mb={1} 
                      />
                      <Typography fontSize="0.7rem" fontWeight={600}>
                        {new Date(task.date).toLocaleDateString()}
                      </Typography>
                    </Box>

                    {/* Main content */}
                    <Box flexGrow={1}>
                      <Stack direction="row" spacing={-1} mb={0.5}>
                        {task.collaborators && task.collaborators.length > 0 ? (
                          <>
                            {task.collaborators.slice(0, 3).map((email: string, idx: number) => (
                              <Avatar key={idx} sx={{ width: 24, height: 24, fontSize: '0.75rem' }}>
                                {email.charAt(0).toUpperCase()}
                              </Avatar>
                            ))}
                            {task.collaborators.length > 3 && (
                              <Avatar sx={{ width: 24, height: 24, fontSize: '0.75rem' }}>
                                +{task.collaborators.length - 3}
                              </Avatar>
                            )}
                          </>
                        ) : (
                          <Avatar sx={{ width: 24, height: 24, fontSize: '0.75rem', bgcolor: sectionColors[task.section] }}>
                            {task.title.charAt(0).toUpperCase()}
                          </Avatar>
                        )}
                      </Stack>
                      <Typography fontWeight="bold">{task.title}</Typography>
                      <Typography fontSize="0.9rem" mb={1}>
                        {task.startTime && task.startTime.hour && task.startTime.minute && task.startTime.period ? 
                          `${task.startTime.hour}:${String(task.startTime.minute).padStart(2, '0')} ${task.startTime.period}` : 
                          'No time set'
                        }
                        {task.endTime && task.endTime.hour && task.endTime.minute && task.endTime.period ? 
                          ` - ${task.endTime.hour}:${String(task.endTime.minute).padStart(2, '0')} ${task.endTime.period}` : 
                          ''
                        }
                      </Typography>
                    </Box>

                    {/* Right side */}
                    <Box display="flex" flexDirection="column" alignItems="flex-end" gap={1}>
                      <Box>
                        <Typography fontWeight="bold" sx={{ color: getPriorityColor(task.priority || '') }}>
                          • Priority: {task.priority || 'None'}
                        </Typography>
                        <Typography>• Recurring: {task.recurring || 'None'}</Typography>
                      </Box>
                      <Chip 
                        label={statusLabel} 
                        sx={{ bgcolor: statusColor, color: 'white', fontWeight: 'bold' }} 
                      />
                      {isDeleted && daysLeft !== null && (
                        <Typography fontSize="0.75rem" color="red">
                          {daysLeft} day{daysLeft !== 1 ? 's' : ''} remaining
                        </Typography>
                      )}
                      <Box display="flex" gap={1}>
                        <Button 
                          onClick={() => handleRecover(task._id)} 
                          size="small" 
                          variant="outlined"
                          color="primary"
                        >
                          Restore
                        </Button>
                        {isDeleted && (
                          <Button 
                            onClick={() => handlePermanentDelete(task._id)} 
                            size="small" 
                            variant="outlined"
                            color="error"
                          >
                            Delete
                          </Button>
                        )}
                      </Box>
                    </Box>
                  </Box>
                );
              })}
            </React.Fragment>
          ))
        )}
      </Box>

      {/* Settings Modal */}
      <SettingsModal open={showSettings} onClose={() => setShowSettings(false)} />

      {/* Global ChatBot Component */}
      <ChatBot onTaskUpdate={fetchTasks} />

      {/* Regular Snackbar for notifications (bottom-left) */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      >
        <Alert 
          severity={snackbar.severity} 
          sx={{ width: '100%' }}
          onClose={() => setSnackbar({ ...snackbar, open: false })}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>

      {/* NOTIFICATION SNACKBAR - FIXED POSITIONING AND STYLING (same as Dashboard) */}
      <Snackbar
        open={notificationSnackbar.open}
        autoHideDuration={8000}
        onClose={() => setNotificationSnackbar({ ...notificationSnackbar, open: false })}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        sx={{ 
          zIndex: 9999,
          position: 'fixed',
          top: '20px !important',
          left: '50% !important',
          transform: 'translateX(-50%) !important',
          width: 'auto !important'
        }}
      >
        <Alert 
          severity="info"
          sx={{ 
            minWidth: '300px',
            backgroundColor: '#2196F3 !important',
            color: 'white !important',
            fontSize: '16px',
            fontWeight: 'bold',
            boxShadow: '0 4px 12px rgba(33, 150, 243, 0.3)',
            border: '2px solid #1976D2',
            '& .MuiAlert-icon': {
              color: 'white !important'
            },
            '& .MuiAlert-action': {
              color: 'white !important'
            }
          }}
          onClose={() => setNotificationSnackbar({ ...notificationSnackbar, open: false })}
        >
           {notificationSnackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default Archive;
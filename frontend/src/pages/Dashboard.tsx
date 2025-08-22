import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Box,
  Tabs,
  Tab,
  Typography,
  Button,
  IconButton,
  Popover,
  Avatar,
  Chip,
  Stack,
  Snackbar,
  Alert
} from '@mui/material';
import { Settings, CalendarToday, MoreVert } from '@mui/icons-material';
import { DateCalendar } from '@mui/x-date-pickers/DateCalendar';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { useNavigate, useLocation } from 'react-router-dom';
import io from 'socket.io-client';
import AddTaskModal from '../components/AddTaskModal';
import EditTaskModal from '../components/EditTaskModal';
import SettingsModal from '../components/SettingsModal';
import ChatBot from '../components/ChatBot'; // Updated import
import { useGlobalUI } from '../App'; // Import global state
import { Task, UserType } from '../types/task';

const API = 'http://localhost:5050/api';
const tabColors = ['#8000B2', '#1E90FF', '#FFA500'];
const tabBackgrounds = ['#f4edf9', '#e6f0fb', '#fff3e6'];
const tabLabels = ['Work', 'School', 'Personal'];

export default function Dashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  
  // Use global state for tab and chatbot
  const { selectedTab, setSelectedTab, showChatBot, setShowChatBot } = useGlobalUI();
  
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [currentUser, setCurrentUser] = useState<UserType | null>(null);
  const [usersCache, setUsersCache] = useState<Map<string, UserType>>(new Map());
  const [snackbar, setSnackbar] = useState({
    open: false,
    message: '',
    severity: 'success' as 'success' | 'error'
  });
  const [notificationSnackbar, setNotificationSnackbar] = useState({
    open: false,
    message: ''
  });
  const [socket, setSocket] = useState<any>(null);
  const [forceUpdate, setForceUpdate] = useState(0);
  const token = localStorage.getItem('token');
  const userEmail = localStorage.getItem('email');

  // Listen for chatbot task actions to refresh data
  useEffect(() => {
    const handleChatbotAction = (event: any) => {
      console.log('🤖 Dashboard: Chatbot action detected:', event.detail);
      
      fetchTasks();
      fetchAllUsers();
      
      const actionText = getActionDisplayText(event.detail.action);
      setSnackbar({
        open: true,
        message: `Task ${actionText} successfully via chatbot`,
        severity: 'success'
      });
    };

    const handleTaskListUpdate = () => {
      console.log('🔄 Dashboard: Task list update event detected');
      fetchTasks();
      fetchAllUsers();
    };

    const getActionDisplayText = (action: string): string => {
      switch (action) {
        case 'task_created': return 'created';
        case 'task_edited': return 'updated';
        case 'task_deleted': return 'deleted';
        case 'multiple_tasks_deleted': return 'deleted';
        case 'task_restored': return 'restored';
        case 'multiple_tasks_restored': return 'restored';
        default: return 'modified';
      }
    };

    window.addEventListener('chatbotTaskAction', handleChatbotAction);
    window.addEventListener('taskListUpdated', handleTaskListUpdate);
    
    return () => {
      window.removeEventListener('chatbotTaskAction', handleChatbotAction);
      window.removeEventListener('taskListUpdated', handleTaskListUpdate);
    };
  }, []);

  // WebSocket connection and notification handling
  useEffect(() => {
    if (userEmail && token) {
      console.log('🔌 Connecting to notification service...', { userEmail });
      
      try {
        const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const now = new Date();
        const utcOffset = -now.getTimezoneOffset() / 60;
        
        console.log('🌍 User timezone:', userTimezone, `(UTC${utcOffset >= 0 ? '+' : ''}${utcOffset})`);
        
        const newSocket = io('http://localhost:5050', {
          transports: ['websocket', 'polling'],
          timeout: 20000,
          forceNew: true,
          reconnection: true,
          reconnectionAttempts: 5,
          reconnectionDelay: 1000
        });

        newSocket.on('connect', () => {
          console.log('🔌 ✅ Connected to notification service');
          newSocket.emit('join-user-room', {
            email: userEmail,
            timezone: userTimezone,
            offset: utcOffset
          });
          console.log(`👤 Joined notification room for ${userEmail}`);
        });

        newSocket.on('disconnect', (reason: string) => {
          console.log('🔌 ❌ Disconnected from notification service:', reason);
        });

        newSocket.on('reconnect', (attemptNumber: number) => {
          console.log('🔌 🔄 Reconnected to notification service (attempt', attemptNumber + ')');
          newSocket.emit('join-user-room', {
            email: userEmail,
            timezone: userTimezone,
            offset: utcOffset
          });
        });

        newSocket.on('task-reminder', (notification: any) => {
          if (notification.type === 'reminder' || notification.type === 'immediate') {
            console.log('Task reminder received:', notification.message);
            
            setNotificationSnackbar({
              open: true,
              message: notification.message
            });

            if ('Notification' in window && Notification.permission === 'granted') {
              new Notification('Task Reminder', {
                body: notification.message,
                icon: '/favicon.ico'
              });
            }
          }
        });

        newSocket.on('connect_error', (error: any) => {
          console.error('❌ Notification service connection error:', error);
        });
        
        setSocket(newSocket);

        if ('Notification' in window && Notification.permission === 'default') {
          Notification.requestPermission().then((permission) => {
            console.log('Browser notification permission:', permission);
          });
        }

        return () => {
          console.log('🔌 Disconnecting from notification service...');
          if (newSocket) {
            newSocket.disconnect();
          }
        };
      } catch (error) {
        console.error('❌ Failed to initialize notification service:', error);
      }
    }
  }, [userEmail, token]);

  // Handle navigation state from Archive page or URL params
  useEffect(() => {
    if (location.state) {
      if (location.state.selectedTab !== undefined) {
        console.log('🎯 Dashboard: Setting tab from navigation state:', location.state.selectedTab);
        setSelectedTab(location.state.selectedTab);
      }
      
      if (location.state.openSettings) {
        setShowSettings(true);
      }
      
      navigate('/dashboard', { replace: true, state: null });
    }
    
    const urlParams = new URLSearchParams(location.search);
    const tabParam = urlParams.get('tab');
    if (tabParam) {
      const tabIndex = parseInt(tabParam, 10);
      if (!isNaN(tabIndex) && tabIndex >= 0 && tabIndex <= 2) {
        console.log('🎯 Dashboard: Setting tab from URL param:', tabIndex);
        setSelectedTab(tabIndex);
        navigate('/dashboard', { replace: true });
      }
    }
  }, [location.state, location.search, navigate, setSelectedTab]);

  const handleChange = (_: React.SyntheticEvent, newTab: number) => {
    console.log('🎯 Dashboard: Tab changed to:', newTab);
    setSelectedTab(newTab);
    const newUrl = newTab === 0 ? '/dashboard' : `/dashboard?tab=${newTab}`;
    navigate(newUrl, { replace: true });
  };

  const handleCalendarOpen = (event: React.MouseEvent<HTMLElement>) => setAnchorEl(event.currentTarget);
  const handleCalendarClose = () => setAnchorEl(null);
  const isCalendarOpen = Boolean(anchorEl);
  const handleDateChange = (newDate: Date | null) => {
    if (newDate) setSelectedDate(newDate);
    handleCalendarClose();
  };

  const getCurrentSection = () => ['work', 'school', 'personal'][selectedTab];

  const fetchAllUsers = async (): Promise<void> => {
    try {
      const res = await axios.get(`${API}/users/all`);
      const users = res.data;
      
      const newCache = new Map<string, UserType>();
      users.forEach((user: UserType) => {
        newCache.set(user.email, user);
      });
      
      setUsersCache(newCache);
      
      const currentUserEmail = localStorage.getItem('email');
      if (currentUserEmail) {
        const user = users.find((u: UserType) => u.email === currentUserEmail);
        if (user) {
          setCurrentUser(user);
        }
      }
    } catch (err) {
      console.error('Failed to fetch users:', err);
    }
  };

  const refreshUserData = async () => {
    await fetchAllUsers();
  };

  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'userSettingsUpdated') {
        refreshUserData();
        localStorage.removeItem('userSettingsUpdated');
      }
    };

    const handleCustomEvent = () => {
      refreshUserData();
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('userSettingsUpdated', handleCustomEvent);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('userSettingsUpdated', handleCustomEvent);
    };
  }, []);

  const renderUserAvatar = (userData: UserType | null | undefined, fallbackText: string, size: number = 32) => {
    if (!userData) {
      return (
        <Avatar sx={{ width: size, height: size, fontSize: '0.875rem', bgcolor: '#607d8b' }}>
          {fallbackText.charAt(0).toUpperCase()}
        </Avatar>
      );
    }

    const displayText = userData.username || userData.email.split('@')[0];
    
    if (userData.avatarImage) {
      return (
        <Avatar 
          src={userData.avatarImage}
          sx={{ width: size, height: size, fontSize: '0.875rem' }}
        >
          {displayText.charAt(0).toUpperCase()}
        </Avatar>
      );
    }

    return (
      <Avatar sx={{ 
        width: size, 
        height: size, 
        fontSize: '0.875rem', 
        bgcolor: userData.avatarColor || '#607d8b' 
      }}>
        {displayText.charAt(0).toUpperCase()}
      </Avatar>
    );
  };

  const getTaskStatus = (task: Task): string => {
    if (task.status === 'Deleted') {
      return 'Deleted';
    }

    const now = new Date();
    const currentDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const viewingDate = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());
    
    const taskDateParts = task.date.split('-');
    const taskDate = new Date(
      parseInt(taskDateParts[0]),
      parseInt(taskDateParts[1]) - 1,
      parseInt(taskDateParts[2])
    );
    
    const normalizeDate = (date: Date): string => {
      const year = date.getFullYear();
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const day = date.getDate().toString().padStart(2, '0');
      return `${year}-${month}-${day}`;
    };
    
    const taskDateNormalized = normalizeDate(taskDate);
    const viewingDateNormalized = normalizeDate(viewingDate);
    const currentDateNormalized = normalizeDate(currentDate);
    
    let isTaskActiveOnSelectedDate = false;
    
    if (taskDateNormalized === viewingDateNormalized) {
      isTaskActiveOnSelectedDate = true;
    } else if (task.recurring) {
      isTaskActiveOnSelectedDate = isRecurringMatch(task.recurring, task.date, new Date(selectedDate));
    }
    
    if (!isTaskActiveOnSelectedDate) {
      return 'Pending';
    }
    
    const isViewingToday = viewingDateNormalized === currentDateNormalized;
    
    if (!isViewingToday) {
      if (viewingDate.getTime() < currentDate.getTime()) {
        return 'Complete';
      } else {
        return 'Pending';
      }
    }
    
    if (!task.startTime || !task.startTime.hour || !task.startTime.minute || !task.startTime.period) {
      return 'Pending';
    }
    
    const parseTime = (hour: string, minute: string, period: string): number => {
      let h = parseInt(hour);
      const m = parseInt(minute);
      
      if (period === 'AM') {
        if (h === 12) h = 0;
      } else {
        if (h !== 12) h += 12;
      }
      
      return h * 60 + m;
    };
    
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const startMinutes = parseTime(task.startTime.hour, task.startTime.minute, task.startTime.period);
    
    let endMinutes = null;
    if (task.endTime && task.endTime.hour && task.endTime.minute && task.endTime.period) {
      endMinutes = parseTime(task.endTime.hour, task.endTime.minute, task.endTime.period);
    }
    
    if (currentMinutes < startMinutes) {
      return 'Pending';
    } else if (endMinutes !== null && endMinutes > startMinutes) {
      if (currentMinutes >= startMinutes && currentMinutes < endMinutes) {
        return 'In Progress';
      } else if (currentMinutes >= endMinutes) {
        return 'Complete';
      } else {
        return 'Pending';
      }
    } else {
      return 'Complete';
    }
  };

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'Complete': return 'green';
      case 'In Progress': return 'blue';
      case 'Pending': return 'orange';
      default: return 'gray';
    }
  };

  const isRecurringMatch = (recurringType: string, taskDate: string, currentDate: Date) => {
    if (!recurringType || !taskDate) return false;
    const tDate = new Date(taskDate);
    const cDate = new Date(currentDate);
    
    switch (recurringType) {
      case 'Daily': 
        return tDate <= cDate;
      case 'Weekdays': {
        const currentDay = cDate.getDay();
        const isCurrentWeekday = currentDay >= 1 && currentDay <= 5;
        return tDate <= cDate && isCurrentWeekday;
      }
      case 'Weekly': 
        return tDate <= cDate && tDate.getDay() === cDate.getDay();
      case 'Monthly': 
        return tDate <= cDate && tDate.getDate() === cDate.getDate();
      case 'Yearly': 
        return tDate <= cDate && tDate.getDate() === cDate.getDate() && tDate.getMonth() === cDate.getMonth();
      default: 
        return false;
    }
  };

  const fetchTasks = async () => {
    try {
      if (!token) {
        console.error('No token found');
        navigate('/login');
        return;
      }

      const res = await axios.get(`${API}/tasks`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const section = getCurrentSection();

      const filtered = res.data
        .filter((task: Task) => {
          if (!task || !task.title || !task.date || !task.section || !task.startTime) {
            return false;
          }

          const taskDate = new Date(task.date);
          const isInSection = task.section?.toLowerCase() === section;
          
          const taskDateString = taskDate.toISOString().split('T')[0];
          const selectedDateString = selectedDate.toISOString().split('T')[0];
          const isForSelectedDate = taskDateString === selectedDateString;
          
          const matchesRecurring = isRecurringMatch(task.recurring || '', task.date, selectedDate);
          
          return isInSection && (isForSelectedDate || matchesRecurring);
        })
        .sort((a: Task, b: Task) => {
          const toMinutes = (h: string, m: string, p: string) => {
            const hour = parseInt(h) % 12 + (p === 'PM' ? 12 : 0);
            return hour * 60 + parseInt(m);
          };
          return (
            toMinutes(a.startTime.hour, a.startTime.minute, a.startTime.period) -
            toMinutes(b.startTime.hour, b.startTime.minute, b.startTime.period)
          );
        });

      setTasks(filtered);

      try {
        window.dispatchEvent(
          new CustomEvent('updateNlpContext', {
            detail: {
              source: 'active',
              tasks: filtered.map((t: Task, i: number) => ({
                _id: t._id,
                title: t.title,
                date: t.date,
                startTime: t.startTime,
                endTime: t.endTime,
                priority: t.priority,
                recurring: t.recurring,
                collaborators: t.collaborators,
                index: i + 1,
                source: 'active'
              }))
            }
          })
        );
      } catch {}

    } catch (err) {
      console.error('Failed to fetch tasks:', err);
      if (axios.isAxiosError(err) && err.response?.status === 401) {
        localStorage.removeItem('token');
        navigate('/login');
      }
    }
  };

  useEffect(() => {
    if (token) {
      fetchAllUsers();
      fetchTasks();
      
      const interval = setInterval(() => {
        fetchTasks();
        setForceUpdate(prev => prev + 1);
      }, 30000);
      
      return () => clearInterval(interval);
    } else {
      navigate('/login');
    }
  }, [selectedTab, selectedDate, token, navigate]);

  useEffect(() => {
    const statusInterval = setInterval(() => {
      setForceUpdate(prev => prev + 1);
    }, 60000);
    return () => clearInterval(statusInterval);
  }, []);

  const handleAddTask = async (taskData: any) => {
    if (!token) {
      console.error('No token found');
      navigate('/login');
      return;
    }

    try {
      const response = await axios.post(`${API}/tasks`, taskData, {
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
      });
      
      setShowAddModal(false);
      
      try {
        const createdTask = response.data;
        if (createdTask && createdTask._id && userEmail) {
          const notifResponse = await fetch(`${API}/notifications/test/${createdTask._id}`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          });
          
          if (notifResponse.ok) {
            const result = await notifResponse.json();
            console.log('✅ Dashboard: Immediate notification check completed for new task:', result);
          }
        }
      } catch (notifError) {
        console.warn('⚠️ Dashboard: Immediate notification check failed (non-blocking):', notifError);
      }
      
      await fetchTasks();
      
    } catch (err: unknown) {
      console.error('❌ Failed to create task:', err);
      if (axios.isAxiosError(err)) {
        if (err.response?.status === 401) {
          localStorage.removeItem('token');
          navigate('/login');
        }
      }
    }
  };

  const handleEditOpen = (taskId: string) => {
    const task = tasks.find((t) => t._id === taskId);
    if (task) {
      setEditTask(task);
      setShowEditModal(true);
    }
  };

  const handleSaveEdit = async (updatedTask: Task) => {
    if (!updatedTask._id) {
      throw new Error('Task ID is missing');
    }

    const token = localStorage.getItem('token');
    if (!token) {
      navigate('/login');
      throw new Error('Authentication required');
    }

    const normalizedDate = new Date(updatedTask.date).toISOString().split('T')[0];

    const normalized = {
      ...updatedTask,
      date: normalizedDate,
    };

    try {
      const url = `${API}/tasks/${updatedTask._id}`;
      
      const response = await axios.put(url, normalized, {
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });
      
      setTimeout(async () => {
        try {
          await Promise.all([
            fetchTasks(),
            fetchAllUsers()
          ]);
        } catch (refreshError) {
          console.warn('⚠️ Background data refresh failed:', refreshError);
        }
      }, 100);
      
      return;
      
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        if (err.response?.status === 401) {
          localStorage.removeItem('token');
          localStorage.removeItem('email');
          navigate('/login');
          throw new Error('Authentication expired. Please log in again.');
        }
        
        if (err.response?.status === 404) {
          setTimeout(() => {
            fetchTasks().catch(console.warn);
          }, 100);
          
          return;
        }
        
        if (err.response?.status === 400) {
          throw new Error('Invalid task data. Please check all fields.');
        }
        
        if (err.code === 'ECONNABORTED') {
          throw new Error('Request timed out. Please try again.');
        }

        if (err.response?.data?.message) {
          throw new Error(err.response.data.message);
        }
        
        throw new Error(`Server error: ${err.response?.status || 'Unknown'}`);
      }
      
      if (err instanceof Error) {
        throw new Error(`Update failed: ${err.message}`);
      }
      
      throw new Error('Failed to update task. Please try again.');
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    try {
      await axios.delete(`${API}/tasks/${taskId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      setSnackbar({
        open: true,
        message: 'Task moved to archive',
        severity: 'success'
      });
      
      setShowEditModal(false);
      await fetchTasks();
    } catch (err) {
      console.error('❌ Failed to delete task:', err);
      setSnackbar({
        open: true,
        message: 'Failed to delete task',
        severity: 'error'
      });
    }
  };

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      <Box bgcolor="#fff">
        <Box display="flex" justifyContent="space-between" alignItems="center" bgcolor={tabColors[selectedTab]} px={4} py={2}>
          <Tabs value={selectedTab} onChange={handleChange} textColor="inherit" TabIndicatorProps={{ style: { backgroundColor: 'white' } }}>
            {tabLabels.map((label) => (
              <Tab key={label} label={label} sx={{ color: 'white', fontSize: '1.2rem', fontWeight: 500 }} />
            ))}
          </Tabs>
          <Box display="flex" alignItems="center" gap={2}>
            <Button onClick={() => navigate('/archive')} sx={{ color: 'white', fontWeight: 600, textTransform: 'uppercase', fontSize: '1rem' }}>
              Archive
            </Button>
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
            <IconButton onClick={() => setShowSettings(true)}>
              <Settings sx={{ color: 'white' }} />
            </IconButton>
          </Box>
        </Box>

        <Box mt={4} display="flex" flexDirection="column" alignItems="center">
          <Typography variant="h4" fontWeight={700} mb={2} color={tabColors[selectedTab]}>
            Schedule
          </Typography>
          <Button variant="outlined" onClick={() => setShowAddModal(true)}>
            Click here to Add Task
          </Button>
          <Box mt={2} display="flex" alignItems="center" gap={2}>
            <Typography variant="body1" fontWeight={600} color={tabColors[selectedTab]}>
              Date: {selectedDate.toDateString()}
            </Typography>
            <IconButton onClick={handleCalendarOpen}>
              <CalendarToday />
            </IconButton>
            <Popover open={isCalendarOpen} anchorEl={anchorEl} onClose={handleCalendarClose} anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}>
              <DateCalendar value={selectedDate} onChange={handleDateChange} />
            </Popover>
          </Box>
        </Box>

        <Box px={4} mt={4} maxHeight="55vh" overflow="auto">
          {tasks.length === 0 ? (
            <Box display="flex" justifyContent="center" alignItems="center" minHeight="200px">
              <Typography variant="h6" color="text.secondary">
                No tasks for {tabLabels[selectedTab]} on {selectedDate.toDateString()}
              </Typography>
            </Box>
          ) : (
            <Box>
              {tasks.map((task, index) => {
                const creatorData = task.createdBy ? usersCache.get(task.createdBy) || null : null;
                
                return (
                  <Box
                    key={task._id}
                    mb={2}
                    p={2}
                    borderRadius="10px"
                    bgcolor={tabBackgrounds[selectedTab]}
                    boxShadow="0 2px 5px rgba(0,0,0,0.1)"
                    display="flex"
                    justifyContent="space-between"
                    alignItems="center"
                    minHeight="80px"
                    sx={{
                      cursor: 'default',
                      transition: 'all 0.2s ease-in-out',
                      '&:hover': {
                        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                        transform: 'translateY(-2px)',
                        bgcolor: tabBackgrounds[selectedTab]
                      }
                    }}
                  >
                    <Box display="flex" alignItems="center" gap={2}>
                      <Stack direction="row" spacing={-1}>
                        {renderUserAvatar(creatorData, task.title, 32)}
                        
                        {task.collaborators && task.collaborators.length > 0 && (
                          <>
                            {task.collaborators.slice(0, 2).map((email: string, i: number) => {
                              const collaboratorData = usersCache.get(email) || null;
                              return (
                                <Box key={i} ml={-0.5}>
                                  {renderUserAvatar(collaboratorData, email, 28)}
                                </Box>
                              );
                            })}
                            {task.collaborators.length > 2 && (
                              <Avatar sx={{ width: 28, height: 28, fontSize: '0.75rem', ml: -0.5 }}>
                                +{task.collaborators.length - 2}
                              </Avatar>
                            )}
                          </>
                        )}
                      </Stack>
                      <Box>
                        <Typography fontWeight={600} fontSize="1.1rem" mb={0.5}>
                          {task.title}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
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
                    </Box>
                    <Box textAlign="right" display="flex" alignItems="center" gap={2}>
                      <Box>
                        <Typography 
                          sx={{ 
                            color: task.priority === 'High' ? 'red' : task.priority === 'Medium' ? 'orange' : task.priority === 'Low' ? 'green' : 'gray', 
                            fontWeight: 'bold',
                            fontSize: '0.875rem'
                          }}
                        >
                          • Priority: {task.priority || 'None'}
                        </Typography>
                        <Typography fontSize="0.875rem" color="text.secondary">
                          • Recurring: {task.recurring || 'None'}
                        </Typography>
                      </Box>
                      {(() => {
                        const currentStatus = getTaskStatus(task);
                        const statusColor = getStatusColor(currentStatus);
                        
                        return (
                          <Chip 
                            key={`${task._id}-${forceUpdate}`}
                            label={currentStatus} 
                            sx={{ 
                              bgcolor: statusColor, 
                              color: 'white', 
                              fontWeight: 600,
                              minWidth: '80px'
                            }} 
                            size="small" 
                          />
                        );
                      })()}
                      <IconButton onClick={() => handleEditOpen(task._id)}>
                        <MoreVert />
                      </IconButton>
                    </Box>
                  </Box>
                );
              })}
            </Box>
          )}
        </Box>

        <AddTaskModal open={showAddModal} onClose={() => setShowAddModal(false)} onAdd={handleAddTask} section={getCurrentSection()} />
        <EditTaskModal 
          open={showEditModal} 
          onClose={() => setShowEditModal(false)} 
          task={editTask} 
          onSave={handleSaveEdit}
          onDelete={() => editTask && handleDeleteTask(editTask._id)}
        />
        <SettingsModal open={showSettings} onClose={() => setShowSettings(false)} />

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

        {/* NOTIFICATION SNACKBAR - FIXED POSITIONING AND STYLING */}
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

        {/* Global ChatBot Component */}
        <ChatBot onTaskUpdate={fetchTasks} />
      </Box>
    </LocalizationProvider>
  );
}
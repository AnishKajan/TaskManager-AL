import React, { useState, useEffect } from 'react';
import { Box, Button, Typography, Paper, Alert, Chip } from '@mui/material';
import io from 'socket.io-client';

const NotificationDebug: React.FC = () => {
  const [socket, setSocket] = useState<any>(null);
  const [connectionStatus, setConnectionStatus] = useState('Disconnected');
  const [lastNotification, setLastNotification] = useState<string>('');
  const [notifications, setNotifications] = useState<any[]>([]);
  const userEmail = localStorage.getItem('email');

  useEffect(() => {
    if (userEmail) {
      const newSocket = io('http://localhost:5050', {
        transports: ['websocket', 'polling'],
        timeout: 10000,
        forceNew: true
      });

      newSocket.on('connect', () => {
        console.log('🔌 Debug: Connected to WebSocket');
        setConnectionStatus('Connected');
        newSocket.emit('join-user-room', userEmail);
      });

      newSocket.on('disconnect', () => {
        console.log('🔌 Debug: Disconnected from WebSocket');
        setConnectionStatus('Disconnected');
      });

      newSocket.on('task-reminder', (notification: any) => {
        console.log('Debug: Received notification:', notification);
        setLastNotification(JSON.stringify(notification, null, 2));
        setNotifications(prev => [...prev.slice(-4), { ...notification, timestamp: new Date().toLocaleString() }]);
      });

      newSocket.on('connect_error', (error: any) => {
        console.error('❌ Debug: Connection error:', error);
        setConnectionStatus('Connection Error');
      });

      setSocket(newSocket);

      return () => {
        if (newSocket) {
          newSocket.disconnect();
        }
      };
    }
  }, [userEmail]);

  const sendTestNotification = () => {
    if (socket) {
      console.log('🧪 Debug: Sending test notification');
      socket.emit('test-notification', { message: 'Test from debug component' });
    }
  };

  const testManualAPI = async () => {
    try {
      const response = await fetch('http://localhost:5050/api/debug/test-notification', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userEmail,
          message: 'Manual API test notification'
        })
      });
      const result = await response.json();
      console.log('🧪 Manual API test result:', result);
    } catch (error) {
      console.error('❌ Manual API test failed:', error);
    }
  };

  const checkSockets = async () => {
    try {
      const response = await fetch('http://localhost:5050/api/debug/sockets');
      const result = await response.json();
      console.log('🔌 Connected sockets:', result);
    } catch (error) {
      console.error('❌ Failed to check sockets:', error);
    }
  };
    const now = new Date();
    const timeIn2Minutes = new Date(now.getTime() + 2 * 60 * 1000);
    
  const testCurrentTime = () => {
    const now = new Date();
    const timeIn2Minutes = new Date(now.getTime() + 2 * 60 * 1000);
    
    console.log('Current time:', now.toLocaleString());
    console.log('Time in 2 minutes:', timeIn2Minutes.toLocaleString());
    console.log('Create a task for:', {
      hour: timeIn2Minutes.getHours() % 12 || 12,
      minute: timeIn2Minutes.getMinutes(),
      period: timeIn2Minutes.getHours() >= 12 ? 'PM' : 'AM'
    });
  };

  return (
    <Paper sx={{ p: 3, m: 2, maxWidth: 600 }}>
      <Typography variant="h6" gutterBottom>
        🔔 Notification Debug Panel
      </Typography>
      
      <Box mb={2}>
        <Typography variant="body2">
          <strong>User Email:</strong> {userEmail || 'Not found'}
        </Typography>
        <Typography variant="body2">
          <strong>Socket Status:</strong> {connectionStatus}
        </Typography>
        <Typography variant="body2">
          <strong>Socket ID:</strong> {socket?.id || 'N/A'}
        </Typography>
      </Box>

      <Box mb={2} display="flex" gap={2} flexWrap="wrap">
        <Button 
          variant="contained" 
          onClick={sendTestNotification}
          disabled={!socket || connectionStatus !== 'Connected'}
          size="small"
        >
          Test Socket
        </Button>
        <Button 
          variant="contained" 
          color="secondary"
          onClick={testManualAPI}
          size="small"
        >
          Test API
        </Button>
        <Button 
          variant="outlined" 
          onClick={testCurrentTime}
          size="small"
        >
          Log Time Info
        </Button>
        <Button 
          variant="outlined" 
          onClick={checkSockets}
          size="small"
        >
          Check Sockets
        </Button>
      </Box>

      {notifications.length > 0 && (
        <Box mt={2}>
          <Typography variant="body2" fontWeight="bold" mb={1}>
            Recent Notifications:
          </Typography>
          {notifications.map((notif, index) => (
            <Box key={index} mb={1} p={1} bgcolor="#f5f5f5" borderRadius={1}>
              <Box display="flex" gap={1} alignItems="center" mb={0.5}>
                <Chip 
                  label={notif.type} 
                  size="small" 
                  color={notif.type === 'test' ? 'primary' : 'default'}
                />
                <Typography variant="caption">
                  {notif.timestamp}
                </Typography>
              </Box>
              <Typography variant="body2">
                {notif.message}
              </Typography>
            </Box>
          ))}
        </Box>
      )}

      {lastNotification && (
        <Alert severity="info" sx={{ mt: 2 }}>
          <Typography variant="body2">
            <strong>Last Raw Notification:</strong>
          </Typography>
          <pre style={{ fontSize: '12px', margin: '8px 0 0 0', maxHeight: '200px', overflow: 'auto' }}>
            {lastNotification}
          </pre>
        </Alert>
      )}

      <Alert severity="warning" sx={{ mt: 2 }}>
        <Typography variant="body2">
          <strong>Testing Steps:</strong><br/>
          1. Click "Test Socket" → Should see blue snackbar immediately<br/>
          2. Click "Test API" → Should see notification via server API<br/>
          3. Create a task that starts in exactly 2 minutes from now<br/>
          4. Watch browser console for: 🔔 ✅ RECEIVED TASK REMINDER<br/>
          5. Look for blue snackbar at top-center of screen
        </Typography>
      </Alert>
    </Paper>
  );
};

export default NotificationDebug;
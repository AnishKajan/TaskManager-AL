import React, { useEffect, useState } from 'react';
import {
  Modal,
  Box,
  Typography,
  IconButton,
  Button,
  TextField,
  Avatar,
  MenuItem,
  FormControl,
  InputLabel,
  Select,
  SelectChangeEvent,
  Snackbar,
  Alert,
} from '@mui/material';
import { createPortal } from 'react-dom';
import CloseIcon from '@mui/icons-material/Close';
import LogoutIcon from '@mui/icons-material/Logout';
import axios from 'axios';

interface Props {
  open: boolean;
  onClose: () => void;
}

const style = {
  position: 'absolute' as const,
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  width: 500,
  bgcolor: 'white',
  borderRadius: '8px',
  boxShadow: 24,
  p: 4,
};

const avatarColors = [
  '#9c27b0', '#3f51b5', '#2196f3', '#00bcd4', '#009688', 
  '#4caf50', '#8bc34a', '#cddc39', '#ffeb3b', '#ffc107',
  '#ff9800', '#ff5722', '#795548', '#607d8b', '#f44336'
];

// SECURITY: Function to strip HTML tags and validate input
const sanitizeInput = (input: string): string => {
  // Remove HTML tags
  const withoutTags = input.replace(/<[^>]*>/g, '');
  // Remove extra whitespace
  return withoutTags.trim();
};

export default function SettingsModal({ open, onClose }: Props) {
  const [privacy, setPrivacy] = useState<'private' | 'public'>('public');
  const [username, setUsername] = useState('');
  const [avatarImage, setAvatarImage] = useState<string | null>(null);
  const [avatarColor, setAvatarColor] = useState('#9c27b0');
  
  // ORIGINAL VALUES: Store the original values when modal opens for proper revert functionality
  const [originalValues, setOriginalValues] = useState({
    privacy: 'public' as 'private' | 'public',
    username: '',
    avatarImage: null as string | null,
    avatarColor: '#9c27b0'
  });
  
  const [snackbar, setSnackbar] = useState({
    open: false,
    message: '',
    severity: 'success' as 'success' | 'error'
  });

  const email = localStorage.getItem('email') || '';

  useEffect(() => {
    const fetchUserData = async () => {
      if (!open) return;
      
      try {
        const res = await axios.get(`http://localhost:5050/api/users`);
        const user = res.data.find((u: any) => u.email === email);
        
        if (user) {
          const userData = {
            privacy: user.privacy || 'public',
            username: user.username || email.split('@')[0],
            avatarColor: user.avatarColor || '#9c27b0',
            avatarImage: user.avatarImage || null
          };
          
          // Set current values
          setPrivacy(userData.privacy);
          setUsername(userData.username);
          setAvatarColor(userData.avatarColor);
          setAvatarImage(userData.avatarImage);
          
          // STORE ORIGINAL VALUES: Save these as the "original" state for revert functionality
          setOriginalValues(userData);
        } else {
          // Default values if user not found
          const defaultUsername = email.split('@')[0];
          const defaultData = {
            privacy: 'public' as 'private' | 'public',
            username: defaultUsername,
            avatarColor: '#9c27b0',
            avatarImage: null
          };
          
          setPrivacy(defaultData.privacy);
          setUsername(defaultData.username);
          setAvatarColor(defaultData.avatarColor);
          setAvatarImage(defaultData.avatarImage);
          
          // Store defaults as original values
          setOriginalValues(defaultData);
        }
      } catch (err) {
        console.error('Failed to fetch user data:', err);
        // Fallback to email-based username
        const defaultUsername = email.split('@')[0];
        const fallbackData = {
          privacy: 'public' as 'private' | 'public',
          username: defaultUsername,
          avatarColor: '#9c27b0',
          avatarImage: null
        };
        
        setPrivacy(fallbackData.privacy);
        setUsername(fallbackData.username);
        setAvatarColor(fallbackData.avatarColor);
        setAvatarImage(fallbackData.avatarImage);
        
        // Store fallback as original values
        setOriginalValues(fallbackData);
      }
    };

    fetchUserData();
  }, [email, open]);

  // VALIDATION: Handle username input with sanitization and length limit
  const handleUsernameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value;
    const sanitized = sanitizeInput(rawValue);
    
    // LIMIT: Maximum 50 characters for username
    if (sanitized.length <= 50) {
      setUsername(sanitized);
    }
  };

  const handleSave = async () => {
    try {
      // VALIDATION: Check if username is valid
      if (!username.trim()) {
        setSnackbar({
          open: true,
          message: 'Username cannot be empty',
          severity: 'error'
        });
        return;
      }

      // VALIDATION: Check for HTML content
      if (username !== sanitizeInput(username)) {
        setSnackbar({
          open: true,
          message: 'Username cannot contain HTML tags',
          severity: 'error'
        });
        return;
      }

      if (email) {
        await axios.patch(`http://localhost:5050/api/users/profile`, {
          email,
          privacy,
          username: username.trim(),
          avatarColor,
          avatarImage
        });

        setSnackbar({
          open: true,
          message: 'Settings saved successfully!',
          severity: 'success'
        });

        // Update localStorage if username changed
        if (username !== originalValues.username) {
          localStorage.setItem('username', username);
        }

        // Signal to Dashboard that user settings have been updated
        localStorage.setItem('userSettingsUpdated', Date.now().toString());
        
        // Dispatch events to notify other components
        window.dispatchEvent(new CustomEvent('userSettingsUpdated'));
        window.dispatchEvent(new StorageEvent('storage', {
          key: 'userSettingsUpdated',
          newValue: Date.now().toString(),
          storageArea: localStorage
        }));
        
        // AUTO-CLOSE: Close modal after successful save
        setTimeout(() => {
          onClose();
        }, 1000); // Close after 1 second to let user see success message
      }
    } catch (err) {
      console.error('Failed to update settings:', err);
      setSnackbar({
        open: true,
        message: 'Failed to save settings',
        severity: 'error'
      });
    }
  };

  const handleAvatarImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      
      reader.onload = (event) => {
        if (event.target?.result) {
          setAvatarImage(event.target.result as string);
        }
      };
      
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveImage = () => {
    setAvatarImage(null);
  };

  const handleRevert = () => {
    // FIXED REVERT: Reset to the original values when the modal was opened, not hardcoded defaults
    setUsername(originalValues.username);
    setAvatarImage(originalValues.avatarImage);
    setAvatarColor(originalValues.avatarColor);
    setPrivacy(originalValues.privacy);
  };

  const handleLogout = () => {
    localStorage.clear();
    window.location.href = '/login';
  };

  const getAvatarContent = () => {
    if (avatarImage) {
      return <Avatar src={avatarImage} sx={{ width: 80, height: 80 }} />;
    }
    
    return (
      <Avatar 
        sx={{ 
          width: 80, 
          height: 80, 
          bgcolor: avatarColor,
          fontSize: '2rem',
          fontWeight: 'bold'
        }}
      >
        {username.charAt(0).toUpperCase()}
      </Avatar>
    );
  };

  // Render snackbar using portal
  const renderSnackbar = () => {
    if (typeof document === 'undefined') return null;
    
    return createPortal(
      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() => setSnackbar(prev => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        sx={{ zIndex: 9999 }}
      >
        <Alert 
          severity={snackbar.severity} 
          sx={{ width: '100%' }}
          onClose={() => setSnackbar(prev => ({ ...prev, open: false }))}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>,
      document.body
    );
  };

  return (
    <>
      <Modal open={open} onClose={onClose}>
        <Box sx={style}>
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
            <Typography variant="h5" fontWeight="bold">Settings</Typography>
            <IconButton onClick={onClose}>
              <CloseIcon />
            </IconButton>
          </Box>

          {/* Privacy Setting */}
          <FormControl fullWidth sx={{ mb: 3 }}>
            <InputLabel>Privacy</InputLabel>
            <Select
              value={privacy}
              label="Privacy"
              onChange={(e: SelectChangeEvent<'private' | 'public'>) =>
                setPrivacy(e.target.value as 'private' | 'public')
              }
            >
              <MenuItem value="public">Public</MenuItem>
              <MenuItem value="private">Private</MenuItem>
            </Select>
          </FormControl>

          {/* Username Field with Character Limit */}
          <TextField
            fullWidth
            label="Edit Username"
            value={username}
            onChange={handleUsernameChange}
            sx={{ mb: 3 }}
            helperText={`${username.length}/50 characters`}
            inputProps={{ maxLength: 50 }}
            error={username.length === 0}
          />

          {/* Avatar Section */}
          <Box mb={3}>
            <Typography variant="h6" mb={2}>Avatar</Typography>
            
            <Box display="flex" alignItems="center" gap={2} mb={2}>
              {getAvatarContent()}
              <Box>
                <Button 
                  variant="outlined" 
                  component="label"
                  sx={{ mb: 1, display: 'block' }}
                >
                  Choose Image
                  <input 
                    type="file" 
                    accept="image/*" 
                    hidden 
                    onChange={handleAvatarImageChange} 
                  />
                </Button>
                {avatarImage && (
                  <Button 
                    variant="outlined" 
                    color="error" 
                    onClick={handleRemoveImage}
                    size="small"
                  >
                    Remove Image
                  </Button>
                )}
              </Box>
            </Box>

            {/* Color Picker */}
            {!avatarImage && (
              <Box>
                <Typography variant="body2" mb={1}>Background Color:</Typography>
                <Box display="flex" flexWrap="wrap" gap={1}>
                  {avatarColors.map((color: string) => (
                    <Box
                      key={color}
                      component="div"
                      onClick={() => setAvatarColor(color)}
                      sx={{
                        width: 32,
                        height: 32,
                        backgroundColor: color,
                        borderRadius: '50%',
                        cursor: 'pointer',
                        border: avatarColor === color ? '3px solid #000' : '2px solid #ccc',
                        transition: 'transform 0.2s',
                        '&:hover': {
                          transform: 'scale(1.1)',
                        },
                      }}
                    />
                  ))}
                </Box>
              </Box>
            )}
          </Box>

          {/* Action Buttons */}
          <Box display="flex" justifyContent="space-between" mt={3}>
            <Button 
              onClick={handleLogout} 
              color="error" 
              startIcon={<LogoutIcon />}
              variant="outlined"
            >
              Log Out
            </Button>
            <Box display="flex" gap={1}>
              <Button onClick={handleRevert} variant="outlined">
                Revert
              </Button>
              <Button onClick={handleSave} variant="contained" color="success">
                Save
              </Button>
            </Box>
          </Box>
        </Box>
      </Modal>

      {/* Render snackbar outside modal using portal */}
      {renderSnackbar()}
    </>
  );
}
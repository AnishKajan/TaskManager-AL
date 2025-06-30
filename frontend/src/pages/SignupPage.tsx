import React, { useState } from 'react';
import {
  Box,
  TextField,
  Button,
  Typography,
  Snackbar,
  Alert,
  IconButton,
  InputAdornment,
  Avatar,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { Visibility, VisibilityOff } from '@mui/icons-material';
import axios from 'axios';

const API = 'http://localhost:5050/api/auth';

// SECURITY: Function to strip HTML tags and validate input
const sanitizeInput = (input: string): string => {
  // Remove HTML tags
  const withoutTags = input.replace(/<[^>]*>/g, '');
  // Remove extra whitespace
  return withoutTags.trim();
};

export default function SignupPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: 'error' | 'success';
  }>({ open: false, message: '', severity: 'error' });

  // Function to get username from email with validation
  const getUsername = (email: string): string => {
    const username = email.split('@')[0] || '';
    const sanitized = sanitizeInput(username);
    
    // LIMIT: Maximum 50 characters for username
    return sanitized.length <= 50 ? sanitized : sanitized.substring(0, 50);
  };

  // VALIDATION: Handle email input with sanitization
  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value;
    const sanitized = sanitizeInput(rawValue);
    setEmail(sanitized);
  };

  const handleSignup = async () => {
    try {
      // VALIDATION: Check if email is valid
      if (!email.trim()) {
        setSnackbar({
          open: true,
          message: 'Email is required',
          severity: 'error',
        });
        return;
      }

      // VALIDATION: Check for HTML content in email
      if (email !== sanitizeInput(email)) {
        setSnackbar({
          open: true,
          message: 'Email cannot contain HTML tags',
          severity: 'error',
        });
        return;
      }

      // VALIDATION: Basic email format check
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        setSnackbar({
          open: true,
          message: 'Please enter a valid email address',
          severity: 'error',
        });
        return;
      }

      // VALIDATION: Check if password is provided
      if (!password.trim()) {
        setSnackbar({
          open: true,
          message: 'Password is required',
          severity: 'error',
        });
        return;
      }

      // VALIDATION: Check username length (derived from email)
      const username = getUsername(email);
      if (username.length === 0) {
        setSnackbar({
          open: true,
          message: 'Invalid email format for username generation',
          severity: 'error',
        });
        return;
      }

      await axios.post(`${API}/signup`, {
        email: email.toLowerCase().trim(),
        password,
      });

      setSnackbar({
        open: true,
        message: 'User Created Successfully!',
        severity: 'success',
      });

      setTimeout(() => {
        navigate('/login');
      }, 2000);
    } catch (err: any) {
      const msg =
        err?.response?.data?.message === 'Account already exists'
          ? 'Account Already Exists'
          : 'Signup Failed';

      setSnackbar({ open: true, message: msg, severity: 'error' });

      if (msg === 'Account Already Exists') {
        setTimeout(() => navigate('/login'), 1500);
      }
    }
  };

  return (
    <Box
      display="flex"
      flexDirection="column"
      justifyContent="center"
      alignItems="center"
      height="100vh"
      bgcolor="#fff"
      px={2}
    >
      <IconButton
        onClick={() => navigate('/login')}
        sx={{ position: 'absolute', top: 20, left: 20 }}
      >
        <ArrowBackIcon fontSize="large" />
      </IconButton>

      <Typography variant="h3" fontWeight="bold" mb={4}>
        Sign Up
      </Typography>

      {/* Avatar Preview Section */}
      {email && (
        <Box mb={3} display="flex" flexDirection="column" alignItems="center">
          <Typography variant="body2" color="text.secondary" mb={1}>
            Your default avatar will be:
          </Typography>
          <Avatar 
            sx={{ 
              width: 60, 
              height: 60, 
              bgcolor: '#607d8b', // Default grey color
              fontSize: '1.5rem',
              fontWeight: 'bold'
            }}
          >
            {getUsername(email).charAt(0).toUpperCase()}
          </Avatar>
          <Typography variant="caption" color="text.secondary" mt={1}>
            Username: {getUsername(email)} ({getUsername(email).length}/50 chars)
          </Typography>
          {getUsername(email).length === 50 && (
            <Typography variant="caption" color="warning.main">
              Username truncated to 50 characters
            </Typography>
          )}
        </Box>
      )}

      <TextField
        placeholder="Enter Email"
        type="email"
        value={email}
        onChange={handleEmailChange}
        fullWidth
        sx={{ width: 300, mb: 2, backgroundColor: '#ddd' }}
        error={email.length > 0 && (email !== sanitizeInput(email) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))}
        helperText={
          email.length > 0 && email !== sanitizeInput(email) 
            ? 'Email cannot contain HTML tags'
            : email.length > 0 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
            ? 'Please enter a valid email address'
            : ''
        }
      />

      <TextField
        placeholder="Enter Password"
        type={showPassword ? 'text' : 'password'}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        fullWidth
        sx={{ width: 300, mb: 2, backgroundColor: '#ddd' }}
        InputProps={{
          endAdornment: (
            <InputAdornment position="end">
              <IconButton onClick={() => setShowPassword((prev) => !prev)} edge="end">
                {showPassword ? <VisibilityOff /> : <Visibility />}
              </IconButton>
            </InputAdornment>
          ),
        }}
      />

      <Button
        onClick={handleSignup}
        variant="outlined"
        fullWidth
        sx={{ width: 300, fontWeight: 600, backgroundColor: '#eee', boxShadow: 1 }}
        disabled={
          !email.trim() || 
          !password.trim() || 
          email !== sanitizeInput(email) || 
          !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
        }
      >
        Sign Up
      </Button>

      <Box mt={4} display="flex" gap={3} alignItems="center">
        <Typography sx={{ color: 'purple', fontWeight: 600 }}>Work</Typography>
        <Typography sx={{ fontSize: 20 }}>•</Typography>
        <Typography sx={{ color: 'dodgerblue', fontWeight: 600 }}>School</Typography>
        <Typography sx={{ fontSize: 20 }}>•</Typography>
        <Typography sx={{ color: 'orange', fontWeight: 600 }}>Personal</Typography>
      </Box>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      >
        <Alert severity={snackbar.severity} sx={{ width: '100%' }}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
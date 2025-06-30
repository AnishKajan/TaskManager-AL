import React, { useState } from 'react';
import {
  Box,
  Button,
  Snackbar,
  Alert,
  Typography,
  TextField,
  IconButton,
  InputAdornment,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Visibility, VisibilityOff } from '@mui/icons-material';

const API = 'http://localhost:5050/api/auth';

export default function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: 'error' | 'success';
  }>({ open: false, message: '', severity: 'error' });

  const handleLogin = async () => {
    try {
      const res = await axios.post(`${API}/login`, { email, password });

      const token = res.data?.token;
      const username = res.data?.username;

      if (token) {
        console.log('✅ Token stored:', token);
        localStorage.setItem('token', token);
        localStorage.setItem('email', username || email);

        setSnackbar({
          open: true,
          message: 'Login successful',
          severity: 'success',
        });

        navigate('/dashboard');
      } else {
        console.warn('⚠️ No token received from backend.');
        setSnackbar({
          open: true,
          message: 'Login failed: No token received',
          severity: 'error',
        });
      }
    } catch (err: any) {
      console.error('❌ Login error:', err?.response || err);
      const msg =
        err?.response?.data?.message === 'Incorrect Password'
          ? 'Incorrect Password'
          : err?.response?.data?.message || 'Login failed';
      setSnackbar({ open: true, message: msg, severity: 'error' });
    }
  };

  return (
    <Box
      display="flex"
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      height="100vh"
      bgcolor="#fff"
      px={2}
    >
      <Typography variant="h3" fontWeight="bold" mb={4}>
        Task Manager
      </Typography>

      <TextField
        placeholder="Username or Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        fullWidth
        sx={{ width: 300, mb: 2, backgroundColor: '#ddd' }}
      />

      <TextField
        placeholder="Password"
        type={showPassword ? 'text' : 'password'}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        fullWidth
        sx={{ width: 300, mb: 2, backgroundColor: '#ddd' }}
        InputProps={{
          endAdornment: (
            <InputAdornment position="end">
              <IconButton
                onClick={() => setShowPassword((prev) => !prev)}
                edge="end"
              >
                {showPassword ? <VisibilityOff /> : <Visibility />}
              </IconButton>
            </InputAdornment>
          ),
        }}
      />

      <Box display="flex" justifyContent="center" gap={2} mt={1}>
        <Button
          variant="outlined"
          onClick={() => navigate('/signup')}
          sx={{ backgroundColor: '#eee', boxShadow: 1 }}
        >
          Sign Up
        </Button>
        <Button
          variant="outlined"
          onClick={handleLogin}
          sx={{ backgroundColor: '#eee', boxShadow: 1 }}
        >
          Login
        </Button>
      </Box>

      <Box mt={4} display="flex" gap={3} alignItems="center">
        <Typography sx={{ color: 'purple', fontWeight: 600 }}>Work</Typography>
        <Typography sx={{ fontSize: 20 }}>•</Typography>
        <Typography sx={{ color: 'dodgerblue', fontWeight: 600 }}>School</Typography>
        <Typography sx={{ fontSize: 20 }}>•</Typography>
        <Typography sx={{ color: 'orange', fontWeight: 600 }}>Personal</Typography>
      </Box>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
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

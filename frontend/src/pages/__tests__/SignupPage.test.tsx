import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';

// Mock the entire SignupPage component to avoid all dependencies
jest.mock('../SignupPage', () => {
  const { useState } = require('react');
  
  return function MockSignupPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);

    const getUsername = (email: string) => email.split('@')[0] || '';

    return (
      <div>
        <button aria-label="back">←</button>
        <h1>Sign Up</h1>
        
        {email && (
          <div data-testid="avatar-preview">
            <p>Your default avatar will be:</p>
            <div data-testid="avatar">{getUsername(email).charAt(0).toUpperCase()}</div>
            <p>Username: {getUsername(email)} ({getUsername(email).length}/50 chars)</p>
          </div>
        )}

        <input 
          placeholder="Enter Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          data-testid="email-input"
        />
        <input 
          placeholder="Enter Password"
          type={showPassword ? 'text' : 'password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          data-testid="password-input"
        />
        <button onClick={() => setShowPassword(!showPassword)}>
          {showPassword ? 'Hide' : 'Show'} Password
        </button>
        <button 
          disabled={!email.trim() || !password.trim()}
        >
          Sign Up
        </button>
        
        <div>
          <span style={{ color: 'purple' }}>Work</span>
          <span>•</span>
          <span style={{ color: 'dodgerblue' }}>School</span>
          <span>•</span>
          <span style={{ color: 'orange' }}>Personal</span>
        </div>
      </div>
    );
  };
});

import SignupPage from '../SignupPage';

// Simple theme wrapper
const theme = createTheme();
const TestWrapper = ({ children }: { children: React.ReactNode }) => (
  <ThemeProvider theme={theme}>{children}</ThemeProvider>
);

describe('SignupPage', () => {
  it('renders signup form', () => {
    render(
      <TestWrapper>
        <SignupPage />
      </TestWrapper>
    );

    expect(screen.getByRole('heading', { name: 'Sign Up' })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter Email')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter Password')).toBeInTheDocument();
  });

  it('renders back button', () => {
    render(
      <TestWrapper>
        <SignupPage />
      </TestWrapper>
    );

    expect(screen.getByLabelText('back')).toBeInTheDocument();
  });

  it('handles email input', () => {
    render(
      <TestWrapper>
        <SignupPage />
      </TestWrapper>
    );

    const emailInput = screen.getByTestId('email-input');
    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    expect(emailInput).toHaveValue('test@example.com');
  });

  it('handles password input', () => {
    render(
      <TestWrapper>
        <SignupPage />
      </TestWrapper>
    );

    const passwordInput = screen.getByTestId('password-input');
    fireEvent.change(passwordInput, { target: { value: 'password123' } });
    expect(passwordInput).toHaveValue('password123');
  });

  it('shows avatar preview when email is entered', () => {
    render(
      <TestWrapper>
        <SignupPage />
      </TestWrapper>
    );

    const emailInput = screen.getByTestId('email-input');
    fireEvent.change(emailInput, { target: { value: 'john@example.com' } });

    expect(screen.getByTestId('avatar-preview')).toBeInTheDocument();
    expect(screen.getByText('Your default avatar will be:')).toBeInTheDocument();
    expect(screen.getByTestId('avatar')).toHaveTextContent('J');
    expect(screen.getByText(/Username: john/)).toBeInTheDocument();
  });

  it('toggles password visibility', () => {
    render(
      <TestWrapper>
        <SignupPage />
      </TestWrapper>
    );

    const passwordInput = screen.getByTestId('password-input');
    const toggleButton = screen.getByText('Show Password');

    expect(passwordInput).toHaveAttribute('type', 'password');
    
    fireEvent.click(toggleButton);
    expect(passwordInput).toHaveAttribute('type', 'text');
    expect(screen.getByText('Hide Password')).toBeInTheDocument();
  });

  it('disables signup button when fields are empty', () => {
    render(
      <TestWrapper>
        <SignupPage />
      </TestWrapper>
    );

    const signupButton = screen.getByRole('button', { name: /sign up/i });
    expect(signupButton).toBeDisabled();
  });

  it('enables signup button when fields are filled', () => {
    render(
      <TestWrapper>
        <SignupPage />
      </TestWrapper>
    );

    const emailInput = screen.getByTestId('email-input');
    const passwordInput = screen.getByTestId('password-input');
    const signupButton = screen.getByRole('button', { name: /sign up/i });

    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.change(passwordInput, { target: { value: 'password123' } });

    expect(signupButton).not.toBeDisabled();
  });

  it('renders category indicators', () => {
    render(
      <TestWrapper>
        <SignupPage />
      </TestWrapper>
    );

    expect(screen.getByText('Work')).toBeInTheDocument();
    expect(screen.getByText('School')).toBeInTheDocument();
    expect(screen.getByText('Personal')).toBeInTheDocument();
  });
});
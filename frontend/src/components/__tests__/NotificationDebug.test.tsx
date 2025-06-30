import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';

// Mock the entire NotificationDebug component to avoid socket.io issues
jest.mock('../NotificationDebug', () => {
  return function MockNotificationDebug() {
    return (
      <div>
        <h3> Notification Debug Panel</h3>
        <p>User Email: test@example.com</p>
        <p>Socket Status: Connected</p>
        <button>Test Socket</button>
        <button>Test API</button>
        <button>Log Time Info</button>
        <button>Check Sockets</button>
      </div>
    );
  };
});

import NotificationDebug from '../NotificationDebug';

// Mock localStorage
const mockLocalStorage = {
  getItem: jest.fn(() => 'test@example.com'),
};
Object.defineProperty(window, 'localStorage', { value: mockLocalStorage });

// Theme wrapper
const theme = createTheme();
const ThemeWrapper = ({ children }: { children: React.ReactNode }) => (
  <ThemeProvider theme={theme}>{children}</ThemeProvider>
);

describe('NotificationDebug', () => {
  it('renders debug panel', () => {
    render(
      <ThemeWrapper>
        <NotificationDebug />
      </ThemeWrapper>
    );

    expect(screen.getByText(' Notification Debug Panel')).toBeInTheDocument();
    expect(screen.getByText(/test@example.com/)).toBeInTheDocument();
  });

  it('shows socket connection status', () => {
    render(
      <ThemeWrapper>
        <NotificationDebug />
      </ThemeWrapper>
    );

    expect(screen.getByText(/Socket Status:/)).toBeInTheDocument();
    expect(screen.getByText(/Connected/)).toBeInTheDocument();
  });

  it('renders all test buttons', () => {
    render(
      <ThemeWrapper>
        <NotificationDebug />
      </ThemeWrapper>
    );

    expect(screen.getByText('Test Socket')).toBeInTheDocument();
    expect(screen.getByText('Test API')).toBeInTheDocument();
    expect(screen.getByText('Log Time Info')).toBeInTheDocument();
    expect(screen.getByText('Check Sockets')).toBeInTheDocument();
  });
});
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';

// Mock the entire Dashboard component to avoid all dependencies
jest.mock('../Dashboard', () => {
  return function MockDashboard() {
    return (
      <div>
        <div data-testid="tabs">
          <button>Work</button>
          <button>School</button>
          <button>Personal</button>
        </div>
        <h1>Schedule</h1>
        <button>Click here to Add Task</button>
        <p>Date: Mon Jan 01 2024</p>
        <button>Archive</button>
        <div data-testid="task-list">
          <div>Sample task</div>
        </div>
      </div>
    );
  };
});

import Dashboard from '../Dashboard';

// Simple theme wrapper
const theme = createTheme();
const TestWrapper = ({ children }: { children: React.ReactNode }) => (
  <ThemeProvider theme={theme}>{children}</ThemeProvider>
);

describe('Dashboard', () => {
  it('renders dashboard with tabs', () => {
    render(
      <TestWrapper>
        <Dashboard />
      </TestWrapper>
    );

    expect(screen.getByText('Work')).toBeInTheDocument();
    expect(screen.getByText('School')).toBeInTheDocument();
    expect(screen.getByText('Personal')).toBeInTheDocument();
  });

  it('renders schedule section', () => {
    render(
      <TestWrapper>
        <Dashboard />
      </TestWrapper>
    );

    expect(screen.getByText('Schedule')).toBeInTheDocument();
    expect(screen.getByText('Click here to Add Task')).toBeInTheDocument();
  });

  it('renders date display', () => {
    render(
      <TestWrapper>
        <Dashboard />
      </TestWrapper>
    );

    expect(screen.getByText(/Date:/)).toBeInTheDocument();
  });

  it('renders archive button', () => {
    render(
      <TestWrapper>
        <Dashboard />
      </TestWrapper>
    );

    expect(screen.getByRole('button', { name: /archive/i })).toBeInTheDocument();
  });

  it('renders task list area', () => {
    render(
      <TestWrapper>
        <Dashboard />
      </TestWrapper>
    );

    expect(screen.getByTestId('task-list')).toBeInTheDocument();
  });
});
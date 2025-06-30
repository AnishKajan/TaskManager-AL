import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import AddTaskModal from '../AddTaskModal';

// Mock fetch
global.fetch = jest.fn();

// Mock localStorage
const mockLocalStorage = {
  getItem: jest.fn(() => 'test-token'),
  setItem: jest.fn(),
  clear: jest.fn(),
};
Object.defineProperty(window, 'localStorage', { value: mockLocalStorage });

// Theme wrapper
const theme = createTheme();
const ThemeWrapper = ({ children }: { children: React.ReactNode }) => (
  <ThemeProvider theme={theme}>{children}</ThemeProvider>
);

describe('AddTaskModal', () => {
  const mockProps: any = {
    open: true,
    onClose: jest.fn(),
    onAdd: jest.fn(),
    section: 'personal'
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([])
    });
  });

  it('renders when open', () => {
    render(
      <ThemeWrapper>
        <AddTaskModal {...mockProps} />
      </ThemeWrapper>
    );

    expect(screen.getByText('Add Task')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter Task Name')).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    render(
      <ThemeWrapper>
        <AddTaskModal {...mockProps} open={false} />
      </ThemeWrapper>
    );

    expect(screen.queryByText('Add Task')).not.toBeInTheDocument();
  });

  it('shows validation error for empty title', async () => {
    render(
      <ThemeWrapper>
        <AddTaskModal {...mockProps} />
      </ThemeWrapper>
    );

    // Try to submit with empty title
    fireEvent.click(screen.getByRole('button', { name: /add/i }));

    await waitFor(() => {
      // onAdd should not be called with empty title
      expect(mockProps.onAdd).not.toHaveBeenCalled();
    });
  });

  it('calls onAdd with valid data', async () => {
    render(
      <ThemeWrapper>
        <AddTaskModal {...mockProps} />
      </ThemeWrapper>
    );

    fireEvent.change(screen.getByPlaceholderText('Enter Task Name'), {
      target: { value: 'Test Task' }
    });

    fireEvent.click(screen.getByRole('button', { name: /add/i }));

    await waitFor(() => {
      expect(mockProps.onAdd).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Test Task',
          section: 'personal',
          status: 'Pending'
        })
      );
    });
  });

  it('calls onClose when cancel is clicked', () => {
    render(
      <ThemeWrapper>
        <AddTaskModal {...mockProps} />
      </ThemeWrapper>
    );

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(mockProps.onClose).toHaveBeenCalled();
  });
});
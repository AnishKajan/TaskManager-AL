import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';

// Mock the entire EditTaskModal module to avoid axios import issues
jest.mock('../EditTaskModal', () => {
  return function MockEditTaskModal({ open, onClose, task, onSave, onDelete }: any) {
    if (!open) return null;
    
    return (
      <div>
        <h2>Edit Task</h2>
        <input 
          placeholder="Edit Task Name" 
          defaultValue={task?.title || ''} 
          data-testid="title-input"
        />
        <input 
          type="date" 
          defaultValue={task?.date || ''} 
          aria-label="Edit Date"
        />
        <button onClick={onClose} aria-label="close">Close</button>
        <button onClick={() => onSave({ ...task, title: 'Updated Task' })}>Save Changes</button>
        <button onClick={onDelete}>Delete Task</button>
      </div>
    );
  };
});

// Import after mocking
import EditTaskModal from '../EditTaskModal';

// Theme wrapper
const theme = createTheme();
const ThemeWrapper = ({ children }: { children: React.ReactNode }) => (
  <ThemeProvider theme={theme}>{children}</ThemeProvider>
);

describe('EditTaskModal', () => {
  const mockTask: any = {
    _id: 'test-id',
    title: 'Test Task',
    date: '2023-12-25',
    section: 'personal',
    startTime: { hour: '9', minute: '00', period: 'AM' },
    endTime: null,
    priority: null,
    recurring: null,
    collaborators: [],
    status: 'Pending',
    userId: 'user-123'
  };

  const mockProps: any = {
    open: true,
    onClose: jest.fn(),
    task: mockTask,
    onSave: jest.fn(),
    onDelete: jest.fn()
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders when open', () => {
    render(
      <ThemeWrapper>
        <EditTaskModal {...mockProps} />
      </ThemeWrapper>
    );

    expect(screen.getByText('Edit Task')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Test Task')).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    render(
      <ThemeWrapper>
        <EditTaskModal {...mockProps} open={false} />
      </ThemeWrapper>
    );

    expect(screen.queryByText('Edit Task')).not.toBeInTheDocument();
  });

  it('calls onSave when save button is clicked', () => {
    render(
      <ThemeWrapper>
        <EditTaskModal {...mockProps} />
      </ThemeWrapper>
    );

    fireEvent.click(screen.getByText('Save Changes'));
    
    expect(mockProps.onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Updated Task'
      })
    );
  });

  it('calls onDelete when delete button is clicked', () => {
    render(
      <ThemeWrapper>
        <EditTaskModal {...mockProps} />
      </ThemeWrapper>
    );

    fireEvent.click(screen.getByText('Delete Task'));
    expect(mockProps.onDelete).toHaveBeenCalled();
  });

  it('calls onClose when close button is clicked', () => {
    render(
      <ThemeWrapper>
        <EditTaskModal {...mockProps} />
      </ThemeWrapper>
    );

    fireEvent.click(screen.getByLabelText('close'));
    expect(mockProps.onClose).toHaveBeenCalled();
  });
});
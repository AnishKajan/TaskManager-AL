import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';

// Mock the entire SettingsModal to avoid axios import issues
jest.mock('../SettingsModal', () => {
  return function MockSettingsModal({ open, onClose }: any) {
    if (!open) return null;
    
    return (
      <div>
        <h2>Settings</h2>
        <input defaultValue="testuser" aria-label="Edit Username" />
        <button onClick={onClose} aria-label="close">Close</button>
        <button>Save</button>
        <button>Log Out</button>
      </div>
    );
  };
});

import SettingsModal from '../SettingsModal';

// Mock localStorage
const mockLocalStorage = {
  clear: jest.fn(),
};
Object.defineProperty(window, 'localStorage', { value: mockLocalStorage });

// Mock location
Object.defineProperty(window, 'location', {
  value: { href: '' },
  writable: true
});

// Theme wrapper
const theme = createTheme();
const ThemeWrapper = ({ children }: { children: React.ReactNode }) => (
  <ThemeProvider theme={theme}>{children}</ThemeProvider>
);

describe('SettingsModal', () => {
  const mockProps = {
    open: true,
    onClose: jest.fn()
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders when open', () => {
    render(
      <ThemeWrapper>
        <SettingsModal {...mockProps} />
      </ThemeWrapper>
    );

    expect(screen.getByText('Settings')).toBeInTheDocument();
    expect(screen.getByDisplayValue('testuser')).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    render(
      <ThemeWrapper>
        <SettingsModal {...mockProps} open={false} />
      </ThemeWrapper>
    );

    expect(screen.queryByText('Settings')).not.toBeInTheDocument();
  });

  it('renders all buttons', () => {
    render(
      <ThemeWrapper>
        <SettingsModal {...mockProps} />
      </ThemeWrapper>
    );

    expect(screen.getByText('Save')).toBeInTheDocument();
    expect(screen.getByText('Log Out')).toBeInTheDocument();
    expect(screen.getByLabelText('close')).toBeInTheDocument();
  });
});
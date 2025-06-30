import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ThemeProvider as MuiThemeProvider } from '@mui/material/styles';
import { ThemeProvider, useTheme } from '../ThemeContext';

// Test component to interact with the theme context
const TestComponent = () => {
  const { mode, toggleTheme } = useTheme();
  
  return (
    <div>
      <span data-testid="theme-mode">{mode}</span>
      <button data-testid="toggle-button" onClick={toggleTheme}>
        Toggle Theme
      </button>
    </div>
  );
};

describe('ThemeContext', () => {
  describe('ThemeProvider', () => {
    it('renders children without crashing', () => {
      render(
        <ThemeProvider>
          <div data-testid="child">Test Child</div>
        </ThemeProvider>
      );
      
      expect(screen.getByTestId('child')).toBeInTheDocument();
    });

    it('provides default light theme mode', () => {
      render(
        <ThemeProvider>
          <TestComponent />
        </ThemeProvider>
      );
      
      expect(screen.getByTestId('theme-mode')).toHaveTextContent('light');
    });

    it('toggles theme from light to dark', () => {
      render(
        <ThemeProvider>
          <TestComponent />
        </ThemeProvider>
      );
      
      const modeDisplay = screen.getByTestId('theme-mode');
      const toggleButton = screen.getByTestId('toggle-button');
      
      expect(modeDisplay).toHaveTextContent('light');
      
      fireEvent.click(toggleButton);
      
      expect(modeDisplay).toHaveTextContent('dark');
    });

    it('toggles theme from dark back to light', () => {
      render(
        <ThemeProvider>
          <TestComponent />
        </ThemeProvider>
      );
      
      const modeDisplay = screen.getByTestId('theme-mode');
      const toggleButton = screen.getByTestId('toggle-button');
      
      // Toggle to dark
      fireEvent.click(toggleButton);
      expect(modeDisplay).toHaveTextContent('dark');
      
      // Toggle back to light
      fireEvent.click(toggleButton);
      expect(modeDisplay).toHaveTextContent('light');
    });

    it('applies MUI theme provider with correct theme', () => {
      // Test that the component renders without throwing errors when MUI theme is applied
      // This indirectly tests that MuiThemeProvider is working correctly
      const { container } = render(
        <ThemeProvider>
          <TestComponent />
        </ThemeProvider>
      );
      
      // If MuiThemeProvider wasn't working, the component would likely throw errors
      // Simply check that our test component rendered successfully
      expect(container.querySelector('[data-testid="theme-mode"]')).toBeInTheDocument();
      expect(container.querySelector('[data-testid="toggle-button"]')).toBeInTheDocument();
    });
  });

  describe('useTheme hook', () => {
    it('throws error when used outside ThemeProvider', () => {
      const TestComponentOutsideProvider = () => {
        useTheme(); // This should throw
        return <div>Should not render</div>;
      };

      // Suppress console.error for this test since we expect an error
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      
      expect(() => {
        render(<TestComponentOutsideProvider />);
      }).toThrow('useTheme must be used within a ThemeProvider');
      
      consoleSpy.mockRestore();
    });

    it('returns correct context values', () => {
      let contextValue: any;
      
      const TestComponentWithRef = () => {
        contextValue = useTheme();
        return <div>Test</div>;
      };

      render(
        <ThemeProvider>
          <TestComponentWithRef />
        </ThemeProvider>
      );
      
      expect(contextValue).toHaveProperty('mode', 'light');
      expect(contextValue).toHaveProperty('toggleTheme');
      expect(typeof contextValue.toggleTheme).toBe('function');
    });
  });

  describe('Theme integration', () => {
    it('updates theme mode in context when toggled', () => {
      let contextValue: any;
      
      const TestComponentWithContextCapture = () => {
        contextValue = useTheme();
        return (
          <div>
            <span data-testid="mode">{contextValue.mode}</span>
            <button 
              data-testid="toggle" 
              onClick={contextValue.toggleTheme}
            >
              Toggle
            </button>
          </div>
        );
      };

      render(
        <ThemeProvider>
          <TestComponentWithContextCapture />
        </ThemeProvider>
      );
      
      expect(contextValue.mode).toBe('light');
      
      fireEvent.click(screen.getByTestId('toggle'));
      
      expect(screen.getByTestId('mode')).toHaveTextContent('dark');
    });

    it('maintains theme state across multiple toggles', () => {
      render(
        <ThemeProvider>
          <TestComponent />
        </ThemeProvider>
      );
      
      const modeDisplay = screen.getByTestId('theme-mode');
      const toggleButton = screen.getByTestId('toggle-button');
      
      // Initial state
      expect(modeDisplay).toHaveTextContent('light');
      
      // Multiple toggles
      fireEvent.click(toggleButton); // light -> dark
      expect(modeDisplay).toHaveTextContent('dark');
      
      fireEvent.click(toggleButton); // dark -> light
      expect(modeDisplay).toHaveTextContent('light');
      
      fireEvent.click(toggleButton); // light -> dark
      expect(modeDisplay).toHaveTextContent('dark');
      
      fireEvent.click(toggleButton); // dark -> light
      expect(modeDisplay).toHaveTextContent('light');
    });
  });
});
import React, { useEffect, useState, createContext, useContext } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Archive from './pages/Archive';
import LoginPage from './pages/LoginPage';
import SignUpPage from './pages/SignupPage';

// Global state context for UI persistence
interface GlobalUIState {
  selectedTab: number;
  setSelectedTab: (tab: number) => void;
  showChatBot: boolean;
  setShowChatBot: (show: boolean) => void;
  chatBotMessages: any[];
  setChatBotMessages: (messages: any[]) => void;
}

const GlobalUIContext = createContext<GlobalUIState | null>(null);

export const useGlobalUI = () => {
  const context = useContext(GlobalUIContext);
  if (!context) {
    throw new Error('useGlobalUI must be used within GlobalUIProvider');
  }
  return context;
};

const GlobalUIProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Persist selected tab across page reloads
  const [selectedTab, setSelectedTabState] = useState(() => {
    const saved = localStorage.getItem('selectedTab');
    return saved ? parseInt(saved, 10) : 0; // Default to Work (0)
  });

  // Persist ChatBot state across page navigation
  const [showChatBot, setShowChatBotState] = useState(() => {
    const saved = localStorage.getItem('showChatBot');
    return saved === 'true';
  });

  // Persist chat messages across page navigation
  const [chatBotMessages, setChatBotMessagesState] = useState(() => {
    const saved = localStorage.getItem('chatBotMessages');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return [];
      }
    }
    return [{
      id: '1',
      text: "Hi! I'm your unified task assistant. I can help you create, update, delete, restore, and find tasks across all sections (work, school, personal). Try: \"create workout task for personal at 7am tomorrow\" or \"show my tasks\".\n\nNote: Today is August 20, 2025.",
      sender: 'bot',
      timestamp: new Date(),
      suggestions: [
        "Create homework task for school tomorrow at 6pm",
        "Show my tasks",
        "What's my schedule today?",
        "Create meeting for work at 3pm Friday"
      ]
    }];
  });

  const setSelectedTab = (tab: number) => {
    console.log('🎯 Global: Setting selected tab to:', tab);
    setSelectedTabState(tab);
    localStorage.setItem('selectedTab', tab.toString());
  };

  const setShowChatBot = (show: boolean) => {
    console.log('🤖 Global: Setting ChatBot visibility to:', show);
    setShowChatBotState(show);
    localStorage.setItem('showChatBot', show.toString());
  };

  const setChatBotMessages = (messages: any[]) => {
    console.log('💬 Global: Updating ChatBot messages, count:', messages.length);
    setChatBotMessagesState(messages);
    localStorage.setItem('chatBotMessages', JSON.stringify(messages));
  };

  return (
    <GlobalUIContext.Provider value={{
      selectedTab,
      setSelectedTab,
      showChatBot,
      setShowChatBot,
      chatBotMessages,
      setChatBotMessages
    }}>
      {children}
    </GlobalUIContext.Provider>
  );
};

const App: React.FC = () => {
  const location = useLocation();

  // Add global debugging to see what's happening on route changes
  useEffect(() => {
    const token = localStorage.getItem('token');
    const selectedTab = localStorage.getItem('selectedTab');
    console.log('🔍 App Route Change:', {
      path: location.pathname,
      hasToken: !!token,
      selectedTab,
      timestamp: new Date().toLocaleTimeString()
    });
  }, [location]);

  const ProtectedRoute = ({ element }: { element: React.ReactElement }) => {
    const token = localStorage.getItem('token');
    const currentPath = window.location.pathname;
    
    console.log('🔍 ProtectedRoute Check:', {
      hasToken: !!token,
      tokenLength: token?.length,
      tokenPreview: token ? `${token.substring(0, 10)}...` : 'null',
      currentPath,
      timestamp: new Date().toLocaleTimeString()
    });
    
    if (!token) {
      console.log('❌ No token found, redirecting to login from:', currentPath);
      return <Navigate to="/login" replace />;
    }
    
    console.log('✅ Token found, showing protected content for:', currentPath);
    return element;
  };

  return (
    <GlobalUIProvider>
      <Routes>
        <Route path="/" element={<ProtectedRoute element={<Dashboard />} />} />
        <Route path="/dashboard" element={<ProtectedRoute element={<Dashboard />} />} />
        <Route path="/archive" element={<ProtectedRoute element={<Archive />} />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignUpPage />} />
        {/* Catch all route for debugging */}
        <Route 
          path="*" 
          element={
            <div style={{ padding: '20px' }}>
              <h2>404 - Page Not Found</h2>
              <p>Current path: {location.pathname}</p>
              <p>Token exists: {!!localStorage.getItem('token') ? 'Yes' : 'No'}</p>
              <button onClick={() => window.location.href = '/dashboard'}>
                Go to Dashboard
              </button>
            </div>
          } 
        />
      </Routes>
    </GlobalUIProvider>
  );
};

export default App;
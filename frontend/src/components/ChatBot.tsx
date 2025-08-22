import React, { useState, useRef, useEffect } from 'react';
import { useGlobalUI } from '../App'; // Import the global context

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'bot';
  timestamp: Date | string | number; // Allow flexible timestamp types
  suggestions?: string[];
  success?: boolean;
}

interface ChatBotProps {
  onTaskUpdate?: () => void; // optional: parent can force-refresh tasks
}

interface ChatMessageProps {
  message: Message;
  onSuggestionClick: (suggestion: string) => void;
}

/* ---------------- Chat bubble ---------------- */
const ChatMessage: React.FC<ChatMessageProps> = ({ message, onSuggestionClick }) => {
  const isUser = message.sender === 'user';
  const isSuccess = message.success === true;
  const isError = message.success === false;

  // Safe timestamp formatter that handles Date, string, or number
  const formatTimestamp = (ts: Date | string | number): string => {
    try {
      const date = ts instanceof Date ? ts : new Date(ts as any);
      return isNaN(date.getTime()) ? '' : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start', marginBottom: 4 }}>
        <div
          style={{
            maxWidth: '85%',
            padding: '12px 16px',
            borderRadius: isUser ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
            backgroundColor: isUser ? '#1976d2' : isSuccess ? '#4caf50' : isError ? '#f44336' : '#f5f5f5',
            color: isUser || isSuccess || isError ? 'white' : '#333',
            wordBreak: 'break-word',
            whiteSpace: 'pre-wrap',
            fontSize: 14,
            lineHeight: 1.4,
            boxShadow: '0 1px 2px rgba(0,0,0,0.1)'
          } as React.CSSProperties}
        >
          {!isUser ? (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <span style={{ fontSize: 16, flexShrink: 0 }}>
                {isSuccess ? '✅' : isError ? '❌' : '🤖'}
              </span>
              <div style={{ flex: 1 }}>{message.text}</div>
            </div>
          ) : (
            message.text
          )}
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start', marginBottom: message.suggestions?.length ? 8 : 0 }}>
        <span style={{ fontSize: 11, color: '#999', paddingLeft: isUser ? 0 : 8, paddingRight: isUser ? 8 : 0 }}>
          {formatTimestamp(message.timestamp)}
        </span>
      </div>

      {message.suggestions && message.suggestions.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8, paddingLeft: 8 }}>
          {message.suggestions.map((s, i) => (
            <button
              key={i}
              onClick={() => onSuggestionClick(s)}
              style={{
                padding: '6px 12px',
                borderRadius: 16,
                border: '1px solid #e0e0e0',
                background: 'white',
                cursor: 'pointer',
                fontSize: 12,
                color: '#666',
                transition: 'all .2s',
                boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#f5f5f5';
                e.currentTarget.style.borderColor = '#1976d2';
                e.currentTarget.style.color = '#1976d2';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'white';
                e.currentTarget.style.borderColor = '#e0e0e0';
                e.currentTarget.style.color = '#666';
              }}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

/* ---------------- Chat service ---------------- */
class ChatService {
  private lastContext: { source: 'active' | 'archive'; tasks: any[] } | null = null;

  constructor() {
    // Capture latest visible list from Dashboard/Archive
    window.addEventListener('updateNlpContext', (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.tasks?.length) {
        this.lastContext = { source: detail.source, tasks: detail.tasks };
      }
    });
  }

  private getAuthHeaders() {
    const token = localStorage.getItem('token');
    if (!token) throw new Error('Authentication required. Please log in again.');
    return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  }

  async sendMessage(message: string): Promise<any> {
    const res = await fetch('http://localhost:5050/api/chatbot/message', {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify({
        message: message.trim(),
        // ⬇️ Give the server the task list the user is looking at
        lastTaskContext: this.lastContext
      })
    });
    if (!res.ok) {
      if (res.status === 401) {
        localStorage.removeItem('token');
        localStorage.removeItem('email');
        throw new Error('Session expired. Please log in again.');
      }
      throw new Error(`Server error: ${res.status}`);
    }
    return res.json();
  }
}

const chatService = new ChatService();

/* ---------------- Main component with Global State ---------------- */
const ChatBot: React.FC<ChatBotProps> = ({ onTaskUpdate }) => {
  // Use global state instead of local state
  const { showChatBot, setShowChatBot, chatBotMessages, setChatBotMessages } = useGlobalUI();
  
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatBotMessages]);
  useEffect(() => { if (showChatBot && inputRef.current) setTimeout(() => inputRef.current?.focus(), 100); }, [showChatBot]);

  const shouldRefreshTasks = (response: any): boolean => {
    const ops = ['task_created','task_deleted','task_edited','multiple_tasks_deleted','task_restored','multiple_tasks_restored'];
    if (response.action && ops.includes(response.action)) return true;
    if (response.success === true && response.reply) {
      const phrases = ['created successfully','deleted successfully','updated successfully','restored successfully','task deleted','task edited','task created','task restored','successfully deleted','successfully created','successfully updated','successfully restored'];
      if (phrases.some(p => String(response.reply).toLowerCase().includes(p))) return true;
    }
    if (response.type && ops.includes(response.type)) return true;
    return false;
  };

  const send = async (text: string) => {
    const userMsg: Message = { id: Date.now().toString(), text, sender: 'user', timestamp: new Date() };
    const newMessages = [...chatBotMessages, userMsg];
    setChatBotMessages(newMessages);
    setIsLoading(true);
    
    try {
      const resp = await chatService.sendMessage(text);
      const botMsg: Message = {
        id: (Date.now() + 1).toString(),
        text: resp.reply,
        sender: 'bot',
        timestamp: new Date(),
        suggestions: resp.suggestions,
        success: resp.success
      };
      const finalMessages = [...newMessages, botMsg];
      setChatBotMessages(finalMessages);

      if (shouldRefreshTasks(resp)) {
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('chatbotTaskAction', { detail: { action: resp.action, taskId: resp.taskId, timestamp: Date.now() } }));
          window.dispatchEvent(new CustomEvent('taskListUpdated', { detail: { source: 'chatbot', timestamp: Date.now() } }));
          window.dispatchEvent(new CustomEvent('forceTaskRefresh', { detail: { action: resp.action } }));
          onTaskUpdate?.();
        }, 300);
      }
    } catch (e: any) {
      const errorMessages = [...newMessages, {
        id: (Date.now() + 1).toString(),
        text: e?.message || 'Sorry, I ran into an error.',
        sender: 'bot' as const,
        timestamp: new Date(),
        success: false
      }];
      setChatBotMessages(errorMessages);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isLoading) return;
    const toSend = inputValue.trim();
    setInputValue('');
    await send(toSend);
  };

  const handleSuggestionClick = (s: string) => {
    setInputValue(s);
    setTimeout(() => { handleSendMessage(); }, 100);
  };
  
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); }
  };
  
  const handleClearChat = () => {
    const resetMessages = [{
      id: '1',
      text: "Chat cleared! I'm ready to help with your tasks. Note: Today is August 20, 2025.",
      sender: 'bot' as const,
      timestamp: new Date(),
      suggestions: [
        "Create homework task for school tomorrow at 6pm",
        "Show my tasks",
        "What's my schedule today?",
        "Create meeting for work at 3pm Friday"
      ]
    }];
    setChatBotMessages(resetMessages);
  };

  const handleClose = () => {
    setShowChatBot(false);
  };

  if (!showChatBot) return null;

  return (
    <>
      <div style={{
        position: 'fixed', bottom: 24, left: 24, zIndex: 1001, width: 400, maxWidth: 'calc(100vw - 48px)',
        height: 600, maxHeight: 'calc(100vh - 150px)', backgroundColor: 'white', borderRadius: 16,
        boxShadow: '0 8px 32px rgba(0,0,0,0.24)', overflow: 'hidden', display: 'flex', flexDirection: 'column',
        background: 'linear-gradient(135deg,#667eea 0%,#764ba2 100%)', animation: 'slideUp .3s ease-out'
      }}>
        <div style={{ padding: 16, background: 'rgba(255,255,255,.1)', borderBottom: '1px solid rgba(255,255,255,.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 24 }}>🤖</span>
            <div>
              <h3 style={{ color: 'white', margin: 0, fontWeight: 600 }}>Task Assistant</h3>
              <p style={{ color: 'rgba(255,255,255,.8)', margin: 0, fontSize: 12 }}>Global State</p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleClearChat} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontSize: 18, padding: 4 }} title="Clear chat">🗑️</button>
            <button onClick={handleClose} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontSize: 20, padding: 4 }}>✕</button>
          </div>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: 8, background: 'rgba(255,255,255,.95)', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {chatBotMessages.map(m => <ChatMessage key={m.id} message={m} onSuggestionClick={handleSuggestionClick} />)}
          {isLoading && (
            <div style={{ display: 'flex', justifyContent: 'flex-start', padding: 4 }}>
              <div style={{ padding: '12px 16px', background: '#f5f5f5', maxWidth: '70%', borderRadius: '18px 18px 18px 4px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 16, height: 16, border: '2px solid #ddd', borderTop: '2px solid #1976d2', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                <span style={{ fontSize: 14, color: '#666' }}>Thinking...</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div style={{ padding: 16, background: 'rgba(255,255,255,.1)', borderTop: '1px solid rgba(255,255,255,.2)' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <textarea
              ref={inputRef}
              placeholder="Type your message... (e.g., 'delete both', 'edit the first task', 'restore baking')"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={handleKeyPress}
              disabled={isLoading}
              style={{ flex: 1, minHeight: 40, maxHeight: 120, padding: 12, borderRadius: 12, border: 'none', background: 'rgba(255,255,255,.9)', resize: 'none', fontFamily: 'inherit', fontSize: 14, outline: 'none' }}
            />
            <button
              onClick={handleSendMessage}
              disabled={!inputValue.trim() || isLoading}
              style={{ width: 40, height: 40, borderRadius: '50%', border: 'none', background: inputValue.trim() && !isLoading ? '#1976d2' : 'rgba(255,255,255,.3)', color: 'white', cursor: inputValue.trim() && !isLoading ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}
            >
              ➤
            </button>
          </div>

          <div style={{ marginTop: 8, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {[
              "Create homework task for school tomorrow at 6pm",
              "Show my tasks",
              "What's my schedule today?",
              "Create meeting for work at 3pm Friday"
            ].map(q => (
              <button key={q} onClick={() => handleSuggestionClick(q)} style={{ padding: '4px 8px', borderRadius: 12, border: 'none', background: 'rgba(255,255,255,.2)', color: 'white', fontSize: 12, cursor: 'pointer' }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,.3)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,.2)'; }}>
                {q}
              </button>
            ))}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin { 0% {transform: rotate(0)} 100% {transform: rotate(360deg)} }
        @keyframes slideUp { 0% {opacity:0; transform: translateY(100px) scale(.9)} 100% {opacity:1; transform: translateY(0) scale(1)} }
      `}</style>
    </>
  );
};

export default ChatBot;
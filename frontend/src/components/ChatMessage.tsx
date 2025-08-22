import React from 'react';

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'bot';
  timestamp: Date;
  suggestions?: string[];
  success?: boolean;
}

interface ChatMessageProps {
  message: Message;
  onSuggestionClick: (suggestion: string) => void;
}

const ChatMessage: React.FC<ChatMessageProps> = ({ message, onSuggestionClick }) => {
  const isUser = message.sender === 'user';
  const isSuccess = message.success === true;
  const isError = message.success === false;

  return (
    <div style={{ marginBottom: '12px' }}>
      {/* Message bubble */}
      <div
        style={{
          display: 'flex',
          justifyContent: isUser ? 'flex-end' : 'flex-start',
          marginBottom: '4px'
        }}
      >
        <div
          style={{
            maxWidth: '85%',
            padding: '12px 16px',
            borderRadius: isUser ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
            backgroundColor: isUser 
              ? '#1976d2' 
              : isSuccess 
                ? '#4caf50' 
                : isError 
                  ? '#f44336' 
                  : '#f5f5f5',
            color: isUser || isSuccess || isError ? 'white' : '#333',
            wordBreak: 'break-word',
            whiteSpace: 'pre-wrap',
            fontSize: '14px',
            lineHeight: '1.4',
            boxShadow: '0 1px 2px rgba(0, 0, 0, 0.1)'
          }}
        >
          {/* Add status icon for bot messages */}
          {!isUser && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
              <span style={{ fontSize: '16px', flexShrink: 0 }}>
                {isSuccess ? '✅' : isError ? '❌' : '🤖'}
              </span>
              <div style={{ flex: 1 }}>
                {message.text}
              </div>
            </div>
          )}
          
          {/* User messages */}
          {isUser && message.text}
        </div>
      </div>

      {/* Timestamp */}
      <div
        style={{
          display: 'flex',
          justifyContent: isUser ? 'flex-end' : 'flex-start',
          marginBottom: message.suggestions ? '8px' : '0'
        }}
      >
        <span
          style={{
            fontSize: '11px',
            color: '#999',
            paddingLeft: isUser ? '0' : '8px',
            paddingRight: isUser ? '8px' : '0'
          }}
        >
          {message.timestamp.toLocaleTimeString([], { 
            hour: '2-digit', 
            minute: '2-digit' 
          })}
        </span>
      </div>

      {/* Suggestion buttons */}
      {message.suggestions && message.suggestions.length > 0 && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '6px',
            marginTop: '8px',
            paddingLeft: '8px'
          }}
        >
          {message.suggestions.map((suggestion, index) => (
            <button
              key={index}
              onClick={() => onSuggestionClick(suggestion)}
              style={{
                padding: '6px 12px',
                borderRadius: '16px',
                border: '1px solid #e0e0e0',
                backgroundColor: 'white',
                cursor: 'pointer',
                fontSize: '12px',
                color: '#666',
                transition: 'all 0.2s ease',
                boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)'
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
              {suggestion}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default ChatMessage;
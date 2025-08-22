import axios, { AxiosError } from 'axios';

const API_BASE = 'http://localhost:5050/api';

interface ChatResponse {
  reply: string;
  success: boolean;
  suggestions?: string[];
  action?: string;
  taskId?: string;
  tasks?: any[];
  error?: string;
}

class ChatService {
  private getAuthHeaders() {
    const token = localStorage.getItem('token');
    if (!token) {
      throw new Error('Authentication required. Please log in again.');
    }
    
    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
  }

  async sendMessage(message: string): Promise<ChatResponse> {
    try {
      console.log('🤖 ChatService: Sending message:', message);
      
      if (!message.trim()) {
        throw new Error('Message cannot be empty');
      }

      const response = await axios.post(
        `${API_BASE}/chatbot/message`,
        { message: message.trim() },
        { 
          headers: this.getAuthHeaders(),
          timeout: 15000 // 15 second timeout
        }
      );

      console.log('🤖 ChatService: Received response:', response.data);
      return response.data;

    } catch (error: any) {
      console.error('🤖 ChatService: Error sending message:', error);
      
      // Handle different types of errors
      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError<any>;
        
        if (axiosError.response?.status === 401) {
          // Clear invalid token
          localStorage.removeItem('token');
          localStorage.removeItem('email');
          throw new Error('Session expired. Please log in again.');
        }
        
        if (axiosError.response?.status === 403) {
          throw new Error('Access denied. Please check your permissions.');
        }
        
        if (axiosError.response?.data?.reply) {
          // Server sent a structured error response
          return axiosError.response.data;
        }
        
        if (axiosError.code === 'ECONNABORTED') {
          throw new Error('Request timed out. Please try again.');
        }
        
        if (axiosError.response?.status && axiosError.response.status >= 500) {
          throw new Error('Server error. Please try again later.');
        }
        
        throw new Error(axiosError.response?.data?.message || 'Failed to send message');
      }
      
      // Network or other errors
      if (error.message) {
        throw new Error(error.message);
      }
      
      throw new Error('An unexpected error occurred. Please try again.');
    }
  }

  // Helper method to validate if user is authenticated
  isAuthenticated(): boolean {
    const token = localStorage.getItem('token');
    return !!token;
  }

  // Helper method to get current user email
  getCurrentUserEmail(): string | null {
    return localStorage.getItem('email');
  }
}

// Export singleton instance
const chatService = new ChatService();
export default chatService;
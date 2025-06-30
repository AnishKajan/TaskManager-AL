export interface Time {
  hour: string;
  minute: string;
  period: 'AM' | 'PM';
}

export interface Task {
  _id: string;
  title: string;
  date: string;
  section: 'work' | 'school' | 'personal';
  startTime: Time;
  endTime?: Time | null;
  priority?: 'High' | 'Medium' | 'Low' | null;
  recurring?: 'Daily' | 'Weekdays' | 'Weekly' | 'Monthly' | 'Yearly' | null;
  collaborators?: string[];
  status?: 'Pending' | 'In Progress' | 'Complete' | 'Deleted';
  deletedAt?: string | null;
  createdBy?: string; // Email of the user who created the task
  userId: string; // ID of the user who owns the task - THIS WAS MISSING
  createdAt?: string;
  updatedAt?: string;
}

export interface UserType {
  _id: string;
  email: string;
  username?: string;
  avatarColor?: string;
  avatarImage?: string;
  privacy?: 'public' | 'private';
}

// Additional types for better error handling
export interface ApiError {
  message: string;
  status?: number;
  code?: string;
}

export interface AxiosErrorResponse {
  data?: {
    message?: string;
    debugInfo?: any;
  };
  status?: number;
  statusText?: string;
}
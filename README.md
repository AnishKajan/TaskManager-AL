# TASKMANAGER-PROJECT-MAIN - Collaborative Task Management Application

A full-stack collaborative task management web application built with Node.js, React, TypeScript, and MongoDB. The application features real-time notifications, multi-user collaboration, privacy controls, and comprehensive task management capabilities.

## 🚀 Features

### ✨ Core Functionality
- **User Authentication**: Secure signup/login with JWT tokens and bcrypt password hashing
- **Task Management**: Create, edit, delete, and archive tasks with comprehensive CRUD operations
- **Real-time Notifications**: WebSocket-based notification system with timezone-aware scheduling
- **Date & Time Management**: Schedule tasks with start and end times using intuitive dropdowns
- **Recurring Tasks**: Support for Daily, Weekdays, Weekly, Monthly, and Yearly recurring patterns
- **Status Tracking**: Automatic status updates (Pending → In Progress → Complete) based on current time

### 👥 Collaborative Features
- **Task Collaboration**: Add other users as collaborators on tasks via email selection
- **Privacy Controls**: Public/private user profiles control collaboration visibility and permissions
- **Shared Task Management**: Collaborators can view, edit, and delete shared tasks
- **Cross-user Visibility**: Tasks appear in all collaborators' dashboards and archives
- **Authorization System**: Role-based permissions for task owners and collaborators

### 🔔 Notification System
- **Real-time Notifications**: WebSocket-based instant notifications with Socket.IO
- **Timezone Support**: Automatic timezone detection and multi-timezone notification scheduling
- **Smart Scheduling**: Notifications at 1 hour, 15 minutes, 5 minutes, and start time
- **Browser Integration**: Native browser notifications with permission handling
- **Immediate Notifications**: Instant notifications when creating/editing tasks that start soon

### 🎨 User Interface
- **Responsive Design**: Mobile-friendly Material-UI (MUI) interface
- **Custom Avatars**: User profile pictures with color customization and image upload
- **Multi-tab Layout**: Separate views for Work, School, and Personal task categories
- **Archive System**: Automatic task archival with 5-day soft deletion policy
- **Interactive Components**: Hover effects, snackbar notifications, and intuitive modals

### 🔧 Technical Features
- **TypeScript**: Full type safety across frontend and backend
- **MongoDB Integration**: Robust data persistence with connection pooling
- **Docker Containerization**: Complete containerization for easy deployment
- **Error Handling**: Comprehensive error management and user feedback
- **Input Validation**: Server-side validation and XSS protection
- **Authentication Middleware**: JWT-based route protection

## 📁 Project Structure

```
TASKMANAGER-PROJECT-MAIN/
│
├── backend/
│   ├── db/
│   │   └── mongoClient.js          # MongoDB connection with caching
│   ├── routes/
│   │   ├── auth.js                 # Authentication endpoints (signup/login)
│   │   ├── notifications.js        # Notification testing and history endpoints
│   │   ├── tasks.js                # Task CRUD with collaboration support
│   │   └── users.js                # User management and privacy settings
│   ├── services/
│   │   └── notificationService.js  # Real-time notification service with timezone support
│   ├── test/                       # Backend test suite
│   ├── .env                        # Environment variables
│   ├── .env.test                   # Test environment variables
│   ├── docker-compose.yml          # Backend containerization
│   ├── Dockerfile                  # Backend Docker configuration
│   ├── insertUser.js               # User seeding utility
│   ├── package.json                # Backend dependencies
│   └── server.js                   # Express server with Socket.IO
│
├── frontend/
│   ├── public/
│   │   └── index.html              # React app entry point
│   ├── src/
│   │   ├── components/
│   │   │   ├── AddTaskModal.tsx    # Task creation modal with validation
│   │   │   ├── EditTaskModal.tsx   # Task editing modal with immediate notifications
│   │   │   ├── NotificationDebug.tsx # Debug component for notification testing
│   │   │   └── SettingsModal.tsx   # User settings and privacy controls
│   │   ├── contexts/
│   │   │   └── ThemeContext.tsx    # Material-UI theme provider
│   │   ├── pages/
│   │   │   ├── __tests__/          # Jest test suite
│   │   │   ├── Archive.tsx         # Archived tasks management with restore
│   │   │   ├── Dashboard.tsx       # Main task management interface
│   │   │   ├── LoginPage.tsx       # User authentication page
│   │   │   └── SignupPage.tsx      # User registration with avatar preview
│   │   ├── types/
│   │   │   └── task.ts             # TypeScript type definitions
│   │   ├── utils/
│   │   │   ├── __tests__/          # Utility function tests
│   │   │   ├── taskUtils.ts        # Task-related utility functions
│   │   │   └── timeOptions.ts      # Time picker options and utilities
│   │   ├── App.tsx                 # React router with protected routes
│   │   ├── index.css               # Global styles
│   │   ├── index.tsx               # React app initialization
│   │   ├── react-beautiful-dnd.d.ts # Type declarations for drag & drop
│   │   ├── setupTests.ts           # Jest test configuration
│   │   └── types.ts                # Additional TypeScript definitions
│   ├── docker-compose.yml          # Frontend containerization
│   ├── Dockerfile                  # Frontend Docker configuration
│   ├── package.json                # Frontend dependencies
│   └── tsconfig.json               # TypeScript configuration
│
├── docker-compose.yml              # Full-stack orchestration
├── .dockerignore                   # Docker ignore patterns
├── .nvmrc                          # Node.js version specification
├── nginx.conf                      # Nginx configuration for production
└── README.md                       # This file
```

## 🛠️ Technology Stack

### Backend
- **Node.js 18.x**: Runtime environment
- **Express.js**: Web framework with middleware support
- **MongoDB**: NoSQL database with connection pooling
- **Socket.IO**: Real-time WebSocket communication
- **JWT**: Secure authentication tokens
- **bcrypt**: Password hashing with salt rounds
- **Docker**: Container orchestration

### Frontend
- **React 18**: Modern UI framework with hooks
- **TypeScript**: Full type safety and IntelliSense
- **Material-UI (MUI)**: Comprehensive component library
- **React Router v6**: Client-side routing with protected routes
- **Socket.IO Client**: Real-time communication
- **Jest & React Testing Library**: Comprehensive testing framework

## 🚀 Getting Started

### Prerequisites
- Docker and Docker Compose (recommended)
- Node.js 18.x (if running locally)
- MongoDB instance (local or cloud)

### Environment Setup

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd TASKMANAGER-PROJECT-MAIN
   ```

2. **Create environment files:**
   
   Backend `.env`:
   ```env
   PORT=5050
   MONGO_URI=mongodb://localhost:27017/taskmanager
   MONGO_DB_NAME=taskmanager
   JWT_SECRET=your_super_secure_jwt_secret_here
   NODE_ENV=development
   ```

   Backend `.env.test`:
   ```env
   MONGO_URI=mongodb://localhost:27017/taskmanager_test
   MONGO_DB_NAME=taskmanager_test
   JWT_SECRET=test_jwt_secret
   NODE_ENV=test
   ```

### 🐳 Docker Deployment (Recommended)

1. **Start the full application:**
   ```bash
   docker-compose up --build
   ```

2. **Access the application:**
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:5050
   - MongoDB: mongodb://localhost:27017

### 💻 Local Development

1. **Backend setup:**
   ```bash
   cd backend
   npm install
   npm start              # Production mode
   npm run dev           # Development mode with nodemon
   ```

2. **Frontend setup (in new terminal):**
   ```bash
   cd frontend
   npm install
   npm start             # Development server
   npm run build         # Production build
   ```

## 🧪 Testing

### Frontend Testing
```bash
cd frontend
npm test                    # Run all tests
npm run test:coverage      # Run with coverage report
npm run test:ci           # CI/CD friendly test run
```

### Backend Testing
```bash
cd backend
npm test                   # Run backend tests
npm run test:watch        # Watch mode for development
```

## 🔐 Authentication & Security

### Security Features
- **JWT Token Authentication**: Secure user sessions with 2-hour expiration
- **Password Hashing**: bcrypt with configurable salt rounds
- **Protected Routes**: Frontend and backend route guards
- **CORS Configuration**: Controlled cross-origin request handling
- **Input Validation**: Server-side data validation and sanitization
- **XSS Protection**: HTML tag filtering and input sanitization

### Authentication Flow
1. User signs up with email and password
2. Password is hashed using bcrypt
3. JWT token is generated and returned on login
4. Token is stored in localStorage and included in API requests
5. Backend middleware validates tokens on protected routes

## 👥 Collaboration System

### Privacy Settings
- **Public Profile**: User appears in collaborator dropdowns, can be added to tasks
- **Private Profile**: User hidden from collaboration, cannot be added to tasks

### Task Collaboration Features
- **Multi-user Tasks**: Add collaborators via email selection dropdown
- **Shared Permissions**: All collaborators can view, edit, and delete tasks
- **Cross-user Visibility**: Tasks appear in all participants' dashboards
- **Archive Synchronization**: Deleted tasks appear in all collaborators' archives
- **Authorization Control**: Owner and collaborator permission validation

### User Management
- **Avatar System**: Custom profile pictures with color themes
- **Username Generation**: Automatic username from email with customization
- **Profile Settings**: Comprehensive user preference management

## 🔔 Notification System

### Real-time Features
- **WebSocket Integration**: Socket.IO for instant communication
- **Timezone Detection**: Automatic user timezone detection using Intl API
- **Multi-timezone Support**: Notifications work across different timezones
- **Smart Scheduling**: Notifications at 60, 15, 5 minutes, and start time
- **Browser Notifications**: Native OS notification integration

### Notification Types
- **Task Reminders**: Scheduled notifications before task start times
- **Immediate Notifications**: When creating/editing tasks that start soon
- **Status Updates**: Real-time task status changes
- **Collaboration Alerts**: When users are added to or removed from tasks

### Technical Implementation
- **Service Architecture**: Dedicated notification service with timezone handling
- **Duplicate Prevention**: Notification deduplication using unique identifiers
- **Connection Management**: Automatic reconnection and room management
- **Debug Tools**: Built-in notification testing and debugging components

## 📊 Task Management

### Task Properties
- **Basic Information**: Title, description, and category
- **Scheduling**: Date, start time, and optional end time
- **Collaboration**: Multi-user task sharing via email
- **Priority Levels**: High, Medium, Low priority with visual indicators
- **Categories**: Work, School, Personal sections with color coding
- **Recurring Patterns**: Daily, Weekdays, Weekly, Monthly, Yearly options
- **Status Tracking**: Automatic Pending → In Progress → Complete lifecycle

### Status Logic
- **Time-based Updates**: Automatic status calculation based on current time
- **Timezone Awareness**: Status updates respect user timezones
- **Real-time Refresh**: Status updates every 30 seconds for accuracy
- **Manual Control**: Archive, restore, and permanent deletion options

### Archive System
- **Soft Deletion**: Tasks moved to archive instead of immediate deletion
- **5-day Policy**: Automatic permanent deletion after 5 days
- **Restore Functionality**: Restore archived tasks with immediate notification check
- **History Tracking**: Complete audit trail of task operations

## 🔄 API Endpoints

### Authentication
- `POST /api/auth/signup` - User registration with validation
- `POST /api/auth/login` - User authentication with JWT generation

### Tasks
- `GET /api/tasks` - Get user's tasks (including collaborative)
- `POST /api/tasks` - Create new task with immediate notification check
- `PUT /api/tasks/:id` - Update task (owner or collaborator)
- `DELETE /api/tasks/:id` - Archive task (soft delete)
- `GET /api/tasks/archive` - Get archived tasks with cleanup
- `PATCH /api/tasks/restore/:id` - Restore archived task
- `DELETE /api/tasks/permanent/:id` - Permanently delete task
- `PATCH /api/tasks/:id` - Update task status

### Users
- `GET /api/users` - Get public users (for collaboration dropdown)
- `GET /api/users/all` - Get all users (for avatar display)
- `PATCH /api/users/profile` - Update user profile and settings
- `PATCH /api/users/privacy` - Update privacy settings
- `GET /api/users/:email` - Get specific user by email

### Notifications
- `POST /api/notifications/test/:taskId` - Test immediate notification for task
- `GET /api/notifications/history` - Get notification history for user

## 🚀 Deployment

### Production Environment
```env
NODE_ENV=production
MONGO_URI=mongodb://your-production-db:27017/taskmanager
JWT_SECRET=super_secure_production_secret
PORT=5050
```

### Production Considerations
- Use strong, unique JWT secrets (minimum 256 bits)
- Configure MongoDB with proper indexing and replication
- Set up SSL/TLS certificates for HTTPS
- Configure proper CORS origins for your domain
- Implement rate limiting and request validation
- Set up logging and monitoring (Winston, Datadog, etc.)
- Use environment-specific configuration management

### Scaling Options
- **Database**: MongoDB Atlas with clustering and auto-scaling
- **Backend**: PM2 for process management and load balancing
- **Frontend**: CDN deployment (Netlify, Vercel, AWS CloudFront)
- **Notifications**: Redis for session management and notification queuing
- **Monitoring**: Application performance monitoring and error tracking

## 🔧 Development

### Available Scripts

**Backend:**
- `npm start` - Start production server
- `npm run dev` - Start development server with nodemon
- `npm test` - Run test suite
- `npm run test:watch` - Run tests in watch mode

**Frontend:**
- `npm start` - Start development server
- `npm run build` - Create production build
- `npm test` - Run Jest tests
- `npm run test:coverage` - Run tests with coverage
- `npm run eject` - Eject from Create React App

### Code Quality
- **TypeScript**: Strict type checking enabled
- **ESLint**: Code linting and formatting
- **Jest**: Comprehensive testing framework
- **Error Boundaries**: React error handling
- **Input Validation**: Both client and server-side validation

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines
- Follow TypeScript best practices
- Write tests for new features
- Update documentation for API changes
- Use Material-UI components consistently
- Follow the existing code style and naming conventions

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🔍 Troubleshooting

### Common Issues

**MongoDB Connection Failed:**
- Verify MongoDB is running
- Check MONGO_URI in environment variables
- Ensure network connectivity

**WebSocket Connection Issues:**
- Check firewall settings for port 5050
- Verify CORS configuration
- Test with different browsers

**Notification Not Working:**
- Enable browser notifications
- Check timezone settings
- Verify WebSocket connection in browser dev tools

**Task Status Not Updating:**
- Check system time and timezone
- Verify task start/end times are valid
- Refresh the page to force status recalculation
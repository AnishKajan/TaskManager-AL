import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Archive from './pages/Archive';
import LoginPage from './pages/LoginPage';
import SignUpPage from './pages/SignupPage';

const App: React.FC = () => {
  const ProtectedRoute = ({ element }: { element: React.ReactElement }) => {
    const token = localStorage.getItem('token');
    return token ? element : <Navigate to="/login" />;
  };

  return (
    <Routes>
      <Route path="/" element={<ProtectedRoute element={<Dashboard />} />} />
      <Route path="/dashboard" element={<ProtectedRoute element={<Dashboard />} />} />
      <Route path="/archive" element={<ProtectedRoute element={<Archive />} />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignUpPage />} />
    </Routes>
  );
};

export default App;

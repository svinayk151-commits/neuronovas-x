import axios from 'axios';

const defaultApiBaseUrl = import.meta.env.PROD
  ? 'https://neuronovas-x.onrender.com/api'
  : '/api';
const apiBaseUrl = (import.meta.env.VITE_API_URL || defaultApiBaseUrl).replace(/\/+$/, '');

const api = axios.create({
  baseURL: apiBaseUrl,
  withCredentials: true,
});

// Auth
export const authApi = {
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data),
  logout: () => api.post('/auth/logout'),
  me: () => api.get('/auth/me'),
};

// Listings
export const listingsApi = {
  browse: (params) => api.get('/listings', { params }),
  my: () => api.get('/listings/my'),
  get: (id) => api.get(`/listings/${id}`),
  create: (data) => api.post('/listings', data),
  update: (id, data) => api.put(`/listings/${id}`, data),
  remove: (id, reason) => api.delete(`/listings/${id}`, { data: { reason } }),
  cancel: (id, reason) => api.post(`/listings/${id}/cancel`, { reason }),
  complete: (id) => api.post(`/listings/${id}/complete`),
};

// Requests
export const requestsApi = {
  list: () => api.get('/requests'),
  get: (id) => api.get(`/requests/${id}`),
  create: (data) => api.post('/requests', data),
  accept: (id, note) => api.put(`/requests/${id}/accept`, { note }),
  reject: (id, reason) => api.put(`/requests/${id}/reject`, { reason }),
  cancel: (id, reason) => api.put(`/requests/${id}/cancel`, { reason }),
  pickup: (id) => api.put(`/requests/${id}/pickup`),
  confirm: (id) => api.put(`/requests/${id}/confirm`),
};

// Users
export const usersApi = {
  list: () => api.get('/users'),
  profile: (id) => api.get(`/users/${id}/profile`),
  updateProfile: (id, profile) => api.put(`/users/${id}/profile`, { profile }),
  suspend: (id, suspended) => api.put(`/users/${id}/suspend`, { suspended }),
};

// Reports
export const reportsApi = {
  create: (data) => api.post('/reports', data),
  list: () => api.get('/reports'),
  updateStatus: (id, status, admin_note) => api.put(`/reports/${id}/status`, { status, admin_note }),
};

// Notifications
export const notificationsApi = {
  list: () => api.get('/notifications'),
  markRead: (id) => api.put(`/notifications/${id}/read`),
  markAllRead: () => api.put('/notifications/read-all'),
};

export default api;

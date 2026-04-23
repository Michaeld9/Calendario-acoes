import axios from 'axios';

const rawApiUrl = (import.meta.env.VITE_API_URL || '').trim();
const API_BASE_URL = rawApiUrl.replace(/\/+$/, '');

const api = axios.create({
  baseURL: `${API_BASE_URL || ''}/api`,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const authApi = {
  loginLocal: (email: string, password: string) =>
    api.post('/auth/login-local', { email, password }),

  loginGoogleWithToken: (idToken: string) =>
    api.post('/auth/login-google-token', { idToken }),

  verify: () =>
    api.post('/auth/verify'),
};

export const eventsApi = {
  getMyEvents: () =>
    api.get('/events/my-events'),

  getAllEvents: () =>
    api.get('/events/all'),

  getApprovedEvents: () =>
    api.get('/events/approved'),

  getMirrorEvents: (params?: { from?: string; to?: string }) =>
    api.get('/events/mirror', { params }),

  getPendingEvents: () =>
    api.get('/events/pending'),

  getEvent: (id: number) =>
    api.get(`/events/${id}`),

  createEvent: (data: Record<string, unknown>) =>
    api.post('/events/create', data),

  updateEvent: (id: number, data: Record<string, unknown>) =>
    api.put(`/events/${id}`, data),

  deleteEvent: (id: number) =>
    api.delete(`/events/${id}`),

  approveEvent: (eventId: number) =>
    api.post('/events/approve', { eventId }),

  rejectEvent: (eventId: number) =>
    api.post('/events/reject', { eventId }),
};

export const usersApi = {
  listUsers: () =>
    api.get('/users'),

  createLocalUser: (payload: { fullName: string; email: string; password: string; role: 'admin' | 'supervisor' | 'coordenador' }) =>
    api.post('/users/local', payload),

  updateUserRole: (userId: number, role: 'admin' | 'supervisor' | 'coordenador') =>
    api.patch(`/users/${userId}/role`, { role }),

  updateUserActive: (userId: number, active: boolean) =>
    api.patch(`/users/${userId}/active`, { active }),

  updateLocalUserPassword: (userId: number, password: string) =>
    api.patch(`/users/${userId}/password`, { password }),

  deleteUser: (userId: number) =>
    api.post(`/users/${userId}/delete`),
};

export const settingsApi = {
  getGoogleCalendarSettings: () =>
    api.get('/settings/google-calendar'),

  updateGoogleCalendarSettings: (calendarId: string) =>
    api.put('/settings/google-calendar', { calendarId }),
};

export const logsApi = {
  getEventLogs: (params?: { limit?: number; action?: string; fromDate?: string; toDate?: string }) =>
    api.get('/logs/events', { params }),
};

export default api;

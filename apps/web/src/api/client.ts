import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001';

export const api = axios.create({ baseURL: API_URL });

api.interceptors.request.use((config) => {
  const key = localStorage.getItem('adminApiKey');
  if (key) {
    config.headers['X-Admin-Key'] = key;
    config.headers['X-User'] = localStorage.getItem('adminUser') || 'admin';
  }
  return config;
});

export const adminApi = {
  dashboard: () => api.get('/api/admin/dashboard'),
  storageStatus: () => api.get('/api/admin/storage/status'),
  storageTest: () => api.post('/api/admin/storage/test'),
  storageObjects: (prefix = '') => api.get('/api/admin/storage/objects', { params: { prefix } }),
  storageDownload: (key: string) => api.get('/api/admin/storage/objects/download', { params: { key } }),
  storageDelete: (key: string) => api.delete('/api/admin/storage/objects', { params: { key } }),
  pelagicSettings: () => api.get('/api/admin/pelagic/settings'),
  pelagicUpdateSettings: (data: unknown) => api.put('/api/admin/pelagic/settings', data),
  pelagicTest: () => api.post('/api/admin/pelagic/test'),
  pelagicSchedule: () => api.get('/api/admin/pelagic/schedule'),
  pelagicUpdateSchedule: (data: unknown) => api.put('/api/admin/pelagic/schedule', data),
  pelagicMonths: (fromYear = 2020) => api.get('/api/admin/pelagic/months', { params: { fromYear } }),
  pelagicImportMonth: (year: number, month: number, data?: unknown) =>
    api.post(`/api/admin/pelagic/months/${year}/${month}/sync`, data),
  pelagicUpdateMonthPlan: (year: number, month: number, intervalDays: number) =>
    api.put(`/api/admin/pelagic/months/${year}/${month}/plan`, { intervalDays }),
  pelagicSync: (data: unknown) => api.post('/api/admin/pelagic/sync', data),
  pelagicSyncNow: () => api.post('/api/admin/pelagic/sync/now'),
  pelagicJobs: (params: Record<string, string | number>) => api.get('/api/admin/pelagic/jobs', { params }),
  pelagicJob: (id: string) => api.get(`/api/admin/pelagic/jobs/${id}`),
  pelagicRetry: (id: string) => api.post(`/api/admin/pelagic/jobs/${id}/retry`),
  pelagicCancel: (id: string) => api.post(`/api/admin/pelagic/jobs/${id}/cancel`),
};

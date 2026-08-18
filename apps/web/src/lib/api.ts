import axios, { AxiosError, AxiosResponse } from 'axios';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/v1',
  timeout: 30000,
});

api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('dugrizz_token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res: AxiosResponse) => res,
  (err: AxiosError<{ error: { message: string; code: string } }>) => {
    if (err.response?.status === 401 && typeof window !== 'undefined') {
      localStorage.removeItem('dugrizz_token');
      window.location.href = '/';
    }
    return Promise.reject(err);
  },
);

function unwrap<T>(res: AxiosResponse<{ data: T }>): T {
  return res.data.data;
}

export const authApi = {
  createSession: (deviceId: string) =>
    api.post<{ data: { token: string } }>('/auth/session', { deviceId }).then(unwrap),
};

export const usersApi = {
  getMe: () => api.get<{ data: any }>('/users/me').then(unwrap),
  updateMe: (data: any) => api.patch<{ data: any }>('/users/me/preferences', data).then(unwrap),
  getProgress: () => api.get<{ data: any }>('/users/me/progress').then(unwrap),
  addConsent: (consentType: string, documentVersion: string) =>
    api.post<{ data: any }>('/users/me/consents', { consentType, documentVersion }).then(unwrap),
};

export const contactsApi = {
  list: () => api.get<{ data: any[] }>('/contacts').then(unwrap),
  create: (data: any) => api.post<{ data: any }>('/contacts', data).then(unwrap),
  get: (id: string) => api.get<{ data: any }>(`/contacts/${id}`).then(unwrap),
  update: (id: string, data: any) => api.patch<{ data: any }>(`/contacts/${id}`, data).then(unwrap),
  archive: (id: string) => api.patch<{ data: any }>(`/contacts/${id}/archive`).then(unwrap),
};

export const uploadsApi = {
  upload: (files: File[], onProgress?: (pct: number) => void) => {
    const form = new FormData();
    files.forEach((f) => form.append('files', f));
    return api
      .post<{ data: any[] }>('/uploads', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (e) => onProgress && e.total && onProgress(Math.round((e.loaded * 100) / e.total)),
      })
      .then(unwrap);
  },
};

export const analysesApi = {
  create: (uploadIds: string[], contactId?: string) =>
    api.post<{ data: any }>('/analyses', { uploadIds, contactId }).then(unwrap),
  list: () => api.get<{ data: any[] }>('/analyses').then(unwrap),
  get: (id: string) => api.get<{ data: any }>(`/analyses/${id}`).then(unwrap),
  getStatus: (id: string) => api.get<{ data: any }>(`/analyses/${id}/status`).then(unwrap),
  regenerateReplies: (id: string) =>
    api.post<{ data: any[] }>(`/analyses/${id}/replies/regenerate`).then(unwrap),
  markCopied: (replyId: string) =>
    api.post<{ data: any }>(`/analyses/replies/${replyId}/copy`).then(unwrap),
  submitFeedback: (id: string, rating: number, comment?: string) =>
    api.post<{ data: any }>(`/analyses/${id}/feedback`, { rating, comment }).then(unwrap),
  quickReply: (message: string, context: string, tone: string, language: string) =>
    api.post<{ data: any }>('/analyses/quick-reply', { message, context, tone, language }).then(unwrap),
};

export default api;

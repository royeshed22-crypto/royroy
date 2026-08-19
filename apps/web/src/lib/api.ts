import axios, { AxiosError, AxiosResponse } from 'axios';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/v1',
  timeout: 30000,
});

/**
 * The auth store owns the token and pushes it here. Keeping a second copy in
 * localStorage let the two drift apart, which meant a cleared token could still
 * be sent on the next request.
 *
 * These are plain module state rather than an import of the store, because the
 * store imports this file and a cycle would leave one side undefined at load.
 */
let authToken: string | null = null;
let onUnauthorized: (() => void) | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
}

export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

api.interceptors.request.use((config) => {
  if (authToken) config.headers.Authorization = `Bearer ${authToken}`;
  return config;
});

api.interceptors.response.use(
  (res: AxiosResponse) => res,
  (err: AxiosError<{ error: { message: string; code: string } }>) => {
    // A 401 means the token is stale — most often because the API's JWT secret
    // changed. Hand it to the store to clear and re-issue a session. Never
    // navigate via window.location here: a hard reload with a token that is
    // still persisted just 401s again on the next page, forever.
    if (err.response?.status === 401) {
      authToken = null;
      onUnauthorized?.();
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

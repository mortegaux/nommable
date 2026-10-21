import axios from 'axios';
import type {
  Recipe,
  RecipeCreateDto,
  RecipeUpdateDto,
  MealPlan,
  MealPlanCreateDto,
  ShoppingList,
  ShoppingListCreateDto,
  AIConfigCreateDto,
  AIModelInfo,
  UserAIKeyConfig,
  AIMode,
  AIGenerateRecipeRequest,
  AISubstituteIngredientRequest,
  AIMealPlanRequest,
  User,
  UserInvitationResponse,
  AdminResetPasswordResponse,
  UserDirectCreateDto,
  ScannedPantryItem,
  PantryLocationInfo,
  UserDirectCreateResponse,
  UsernameSuggestionsResponse,
  UserRole,
  UpdatePasswordDto,
  UpdateEmailDto,
  UpdateProfileDto,
  Taxonomy,
  TaxonomyCreateDto,
  TaxonomyUpdateDto,
  SystemStatus,
  BackupPreview,
  ServerBackupList,
  TaxonomyType,
  PaginatedResponse,
  RecipeSearchQuery,
  MealPlanSearchQuery,
  ShoppingListSearchQuery,
  RecipeCollection,
  CreateCollectionDto,
  UpdateCollectionDto,
  ContentRecipeSuggestion,
} from '@nommable/shared';

const DEFAULT_TIMEOUT = 30_000;
const AI_TIMEOUT = 120_000;

const api = axios.create({
  baseURL: '/api',
  timeout: DEFAULT_TIMEOUT,
});

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 responses by clearing stale auth and redirecting to login
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 402) {
      window.dispatchEvent(new CustomEvent('nommable:out-of-credits', { detail: error.response.data }));
    }
    if (
      error.response?.status === 401 &&
      !error.config?.url?.includes('/auth/login') &&
      !window.location.pathname.startsWith('/setup')
    ) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Setup / First-Run Onboarding Wizard API
export interface SetupCompletePayload {
  admin: {
    username: string;
    password: string;
    email?: string;
  };
  smtp?: {
    skipped?: boolean;
    host?: string;
    port?: number;
    secure?: boolean;
    username?: string;
    pass?: string;
    fromEmail?: string;
    fromName?: string;
    enabled?: boolean;
  };
  library: {
    mode: 'shared' | 'private';
    sharedRecipes?: boolean;
    showRecipeAuthor?: boolean;
    sharedCollections?: boolean;
    sharedMealPlans?: boolean;
    sharedShoppingLists?: boolean;
    sharedPantry?: boolean;
    sharedBatchCooking?: boolean;
  };
  ai: {
    enabled: boolean;
    geminiApiKey?: string;
    imageProvider?: 'google' | 'none';
    imageModel?: string;
    imageApiKey?: string;
  };
}

export const setupApi = {
  getStatus: () => api.get<{ needsSetup: boolean; managedKeyDetected?: boolean }>('/setup/status'),
  complete: (data: SetupCompletePayload) =>
    api.post<{
      message: string;
      user: User;
      token: string;
      accessToken: string;
      aiModeSelected?: string;
      managedKeyDetected?: boolean;
    }>('/setup/complete', data),
};

// Auth API
export const authApi = {
  registerWithInvite: (data: { token: string; username: string; password: string }) =>
    api.post('/auth/register/invite', data),
  login: (data: { username: string; password: string }) => api.post('/auth/login', data),
  logout: () => api.post('/auth/logout'),
  me: () => api.get('/auth/me'),
};

// Recipe API
export const recipeApi = {
  getAll: async (params?: RecipeSearchQuery): Promise<PaginatedResponse<Recipe>> => {
    const queryParams: Record<string, any> = { ...params };
    if (params?.categories) {
      queryParams.categories = params.categories.join(',');
    }
    if (params?.tags) {
      queryParams.tags = params.tags.join(',');
    }
    if (params?.includeIngredients) {
      queryParams.includeIngredients = params.includeIngredients.join(',');
    }
    if (params?.excludeIngredients) {
      queryParams.excludeIngredients = params.excludeIngredients.join(',');
    }
    if (params?.source && Array.isArray(params.source)) {
      queryParams.source = params.source.join(',');
    }
    const { data } = await api.get<PaginatedResponse<Recipe>>('/recipes', { params: queryParams });
    return data;
  },
  getById: (id: string) => api.get<Recipe>(`/recipes/${id}`),
  create: (data: RecipeCreateDto) => api.post<Recipe>('/recipes', data),
  update: (id: string, data: RecipeUpdateDto) => api.put<Recipe>(`/recipes/${id}`, data),
  delete: (id: string) => api.delete(`/recipes/${id}`),
  importFromUrl: (url: string) => api.post<Recipe>('/recipes/import', { url }),
  generateWithAI: (data: AIGenerateRecipeRequest) => api.post<Recipe>('/recipes/generate', data, { timeout: AI_TIMEOUT }),
  enhanceWithAI: (id: string, enhancementType: string) =>
    api.post(`/recipes/${id}/enhance`, { enhancementType }, { timeout: AI_TIMEOUT }),
  extractFromImages: (files: File[]) => {
    const formData = new FormData();
    files.forEach(file => formData.append('files', file));
    return api.post<RecipeCreateDto>('/recipes/extract-from-images', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: AI_TIMEOUT,
    });
  },
  extractFromText: (text: string) =>
    api.post<RecipeCreateDto>('/recipes/extract-from-text', { text }, { timeout: AI_TIMEOUT }),
  detectIngredientsFromImage: (file: File) => {
    const formData = new FormData();
    formData.append('image', file);
    return api.post<{ ingredients: string[] }>('/recipes/detect-ingredients', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: AI_TIMEOUT,
    });
  },
  uploadImage: (file: File, recipeId?: string) => {
    const formData = new FormData();
    formData.append('image', file);
    const url = recipeId ? `/recipes/${recipeId}/upload-image` : '/recipes/upload-image';
    return api.post<{ imageUrl: string; recipe?: Recipe }>(url, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  generateImage: (recipeId: string, prompt?: string, model?: string) =>
    api.post<{ imageUrl: string; recipe?: Recipe }>(`/recipes/${recipeId}/generate-image`, { prompt, model }, { timeout: AI_TIMEOUT }),
  generateImagePreview: (data: { title?: string; description?: string; cuisine?: string; prompt?: string; model?: string }) =>
    api.post<{ imageUrl: string }>('/recipes/generate-image', data, { timeout: AI_TIMEOUT }),
  bulkDelete: (ids: string[]) => api.post<{ deletedCount: number; message: string }>('/recipes/bulk-delete', { ids }),
  bulkUpdate: (ids: string[], updates: { tags?: string[]; categories?: string[] }) =>
    api.post<{ updatedCount: number; message: string }>('/recipes/bulk-update', { ids, ...updates }),
  getCategories: async (): Promise<string[]> => {
    const { data } = await api.get<string[]>('/recipes/categories');
    return data;
  },
};

// AI API
export const aiApi = {
  getStatus: () => api.get<{ isConfigured: boolean; isEnabled: boolean; provider: string | null; mode: AIMode; managed?: boolean; hasPersonalKey?: boolean }>('/ai/status'),
  getConfig: () => api.get('/ai/config'),
  // Per-user (BYOK) key management — available to any authenticated user
  getMyConfig: () => api.get<UserAIKeyConfig>('/ai/my-config'),
  saveMyConfig: (data: { provider: string; apiKey?: string; baseUrl?: string; enabled?: boolean }) =>
    api.put<UserAIKeyConfig>('/ai/my-config', data),
  deleteMyConfig: () => api.delete<{ deleted: boolean }>('/ai/my-config'),
  testMyConfig: (data: { provider: string; apiKey?: string; baseUrl?: string }) =>
    api.post<{ success: boolean; message: string }>('/ai/my-config/test', data, { timeout: AI_TIMEOUT }),
  createConfig: (data: AIConfigCreateDto) => api.post('/ai/config', data),
  updateConfig: (data: Partial<AIConfigCreateDto>) => api.put('/ai/config', data),
  testConnection: (data?: { provider?: string; apiKey?: string; model?: string; baseUrl?: string }) =>
    api.post<{ success: boolean; message: string }>('/ai/config/test', data || {}, { timeout: AI_TIMEOUT }),
  getModels: (params: { provider: string; apiKey?: string; baseUrl?: string; refresh?: boolean; type?: 'text' | 'image' }) => {
    if (params.apiKey) {
      return api.post<{ models: AIModelInfo[] }>('/ai/models', params, { timeout: AI_TIMEOUT });
    }
    return api.get<{ models: AIModelInfo[] }>('/ai/models', {
      params: { provider: params.provider, baseUrl: params.baseUrl, refresh: params.refresh, type: params.type },
    });
  },
  substituteIngredient: (data: AISubstituteIngredientRequest) =>
    api.post('/ai/substitute-ingredient', data, { timeout: AI_TIMEOUT }),
};

// Meal Plan API
export const mealPlanApi = {
  getAll: async (params?: MealPlanSearchQuery): Promise<PaginatedResponse<MealPlan>> => {
    const { data } = await api.get<PaginatedResponse<MealPlan>>('/meal-plans', { params });
    return data;
  },
  getById: (id: string) => api.get<MealPlan>(`/meal-plans/${id}`),
  create: (data: MealPlanCreateDto) => api.post<MealPlan>('/meal-plans', data),
  update: (id: string, data: Partial<MealPlanCreateDto>) =>
    api.put<MealPlan>(`/meal-plans/${id}`, data),
  delete: (id: string) => api.delete(`/meal-plans/${id}`),
  bulkDelete: (ids: string[]) => api.post<{ deletedCount: number; message: string }>('/meal-plans/bulk-delete', { ids }),
  generateWithAI: (data: AIMealPlanRequest) => api.post('/meal-plans/generate', data, { timeout: AI_TIMEOUT }),
  addMeal: (id: string, meal: any) => api.post(`/meal-plans/${id}/meals`, meal),
  removeMeal: (id: string, mealId: string) => api.delete(`/meal-plans/${id}/meals/${mealId}`),
  exportToCalendar: async (id: string) => {
    const token = localStorage.getItem('token');
    const response = await fetch(`/api/meal-plans/${id}/export/ics`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to export calendar');
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'meal-plan.ics';
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  },
  // Intelligent meal plan generation
  generatePreview: (data: any) => api.post('/meal-plans/preview', data),
  replaceMeal: (data: any) => api.post('/meal-plans/preview/replace-meal', data),
  commitPreview: (data: any) => api.post('/meal-plans/commit', data),
  // Shopping list integration
  getMissingIngredients: (id: string) => api.get(`/meal-plans/${id}/missing-ingredients`),
  addToShoppingList: (id: string, shoppingListId?: string) =>
    api.post(`/meal-plans/${id}/add-to-shopping-list`, { shoppingListId }),
};

// Meal Plan Template API
export const mealPlanTemplateApi = {
  getAll: () => api.get('/meal-plan-templates'),
  getById: (id: string) => api.get(`/meal-plan-templates/${id}`),
  create: (data: any) => api.post('/meal-plan-templates', data),
  createFromMealPlan: (data: { mealPlanId: string; name: string; description?: string; tags?: string[] }) =>
    api.post('/meal-plan-templates/from-meal-plan', data),
  delete: (id: string) => api.delete(`/meal-plan-templates/${id}`),
  apply: (id: string, data: { startDate: string; name?: string; description?: string }) =>
    api.post(`/meal-plan-templates/${id}/apply`, data),
};

// Shopping List API
export const shoppingListApi = {
  getAll: async (params?: ShoppingListSearchQuery): Promise<PaginatedResponse<ShoppingList>> => {
    const { data } = await api.get<PaginatedResponse<ShoppingList>>('/shopping-lists', { params });
    return data;
  },
  getById: (id: string) => api.get<ShoppingList>(`/shopping-lists/${id}`),
  create: (data: ShoppingListCreateDto) => api.post<ShoppingList>('/shopping-lists', data),
  createFromMealPlan: (mealPlanId: string) =>
    api.post<ShoppingList>('/shopping-lists/from-meal-plan', { mealPlanId }),
  update: (id: string, data: Partial<ShoppingListCreateDto>) =>
    api.put<ShoppingList>(`/shopping-lists/${id}`, data),
  delete: (id: string) => api.delete(`/shopping-lists/${id}`),
  toggleItem: (listId: string, itemId: string) =>
    api.patch(`/shopping-lists/${listId}/items/${itemId}/toggle`),
};

// Invitation API
export const invitationApi = {
  create: (data: { email: string; role: 'admin' | 'user' }) =>
    api.post<UserInvitationResponse>('/invitations', data),
  getAll: () => api.get<UserInvitationResponse[]>('/invitations'),
  validate: (token: string) => api.get<{ email: string; role: 'admin' | 'user'; valid: boolean }>(`/invitations/validate/${token}`),
  resend: (id: string) => api.post<UserInvitationResponse>(`/invitations/${id}/resend`),
  revoke: (id: string) => api.delete(`/invitations/${id}`),
};

// User API
export const userApi = {
  getAll: () => api.get<{ users: User[] }>('/users'),
  getUsernameSuggestions: (firstName: string, lastName: string) =>
    api.get<UsernameSuggestionsResponse>('/users/username-suggestions', {
      params: { firstName, lastName },
    }),
  create: (data: UserDirectCreateDto) => api.post<UserDirectCreateResponse>('/users', data),
  updateRole: (userId: string, role: UserRole) =>
    api.patch<{ user: User }>(`/users/${userId}/role`, { role }),
  resetPassword: (userId: string, newPassword?: string) =>
    api.post<AdminResetPasswordResponse>(`/users/${userId}/reset-password`, { newPassword }),
  delete: (userId: string) => api.delete(`/users/${userId}`),
  // Profile management
  updatePassword: (data: UpdatePasswordDto) => api.put('/users/profile/password', data),
  updateEmail: (data: UpdateEmailDto) => api.put<{ user: User }>('/users/profile/email', data),
  updateProfile: (data: UpdateProfileDto) => api.put<{ user: User }>('/users/profile', data),
  uploadProfilePhoto: (file: File) => {
    const formData = new FormData();
    formData.append('photo', file);
    return api.post<{ profilePhotoUrl: string; user: User }>('/users/profile/photo', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};

export interface SmtpSettings {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  hasPassword: boolean;
  fromEmail: string;
  fromName: string;
  enabled: boolean;
  source: 'database' | 'env' | 'unconfigured';
  isConfigured: boolean;
}

export interface SmtpSettingsUpdateDto {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
  clearPassword?: boolean;
  fromEmail?: string;
  fromName?: string;
  enabled?: boolean;
}

export interface GeneralSystemSettings {
  sharedRecipes: boolean;
  showRecipeAuthor: boolean;
  sharedCollections: boolean;
  sharedMealPlans: boolean;
  sharedShoppingLists: boolean;
  sharedPantry: boolean;
  sharedBatchCooking: boolean;
  shareAnonymousFeedback?: boolean;
}

// Settings API
export const settingsApi = {
  clearData: () => api.delete('/settings/data/clear'),
  getGeneralSettings: () => api.get<GeneralSystemSettings>('/settings/general'),
  updateGeneralSettings: (data: Partial<GeneralSystemSettings>) =>
    api.put<GeneralSystemSettings>('/settings/general', data),
  getSmtpSettings: () => api.get<SmtpSettings>('/settings/smtp'),
  saveSmtpSettings: (data: SmtpSettingsUpdateDto) => api.put<SmtpSettings>('/settings/smtp', data),
  testSmtpSettings: (data: Partial<SmtpSettingsUpdateDto> & { toEmail: string }) =>
    api.post<{ success: boolean; message: string }>('/settings/smtp/test', data),
  // System status (issue #23) — read-only admin diagnostics.
  getSystemStatus: () => api.get<SystemStatus>('/settings/system'),
  // Backup & restore (issue #16) — admin-only.
  exportBackup: () =>
    api.get('/settings/backup/export', { responseType: 'blob', timeout: 300_000 }),
  previewRestore: (formData: FormData) =>
    api.post<BackupPreview>('/settings/backup/restore/preview', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 300_000,
    }),
  confirmRestore: (token: string) =>
    api.post<{ message: string; restarting: boolean }>('/settings/backup/restore/confirm', {
      token,
      confirmed: true,
    }),
  // Server-side backups on disk (issue #74) — admin-only.
  listServerBackups: () => api.get<ServerBackupList>('/settings/backup/list'),
  downloadServerBackup: (name: string) =>
    api.get(`/settings/backup/download/${encodeURIComponent(name)}`, {
      responseType: 'blob',
      timeout: 300_000,
    }),
  previewServerRestore: (name: string) =>
    api.post<BackupPreview>('/settings/backup/restore/preview-server', { name }, { timeout: 300_000 }),
};

// Pantry API
export const pantryApi = {
  getAll: () => api.get('/pantry'),
  getById: (id: string) => api.get(`/pantry/${id}`),
  create: (data: any) => api.post('/pantry', data),
  update: (id: string, data: any) => api.put(`/pantry/${id}`, data),
  delete: (id: string) => api.delete(`/pantry/${id}`),
  getExpiring: (days?: number) => api.get(`/pantry/expiring${days ? `?days=${days}` : ''}`),
  getLowStock: () => api.get('/pantry/low-stock'),
  updateQuantity: (id: string, quantityChange: number) =>
    api.patch(`/pantry/${id}/quantity`, { quantityChange }),
  toggleLowStock: (id: string) => api.patch(`/pantry/${id}/toggle-low-stock`),
  getLocations: () => api.get<PantryLocationInfo[]>('/pantry/locations'),
  createLocation: (name: string) => api.post<PantryLocationInfo>('/pantry/locations', { name }),
  updateLocation: (oldName: string, name: string) =>
    api.put<{ success: boolean; name: string }>(`/pantry/locations/${encodeURIComponent(oldName)}`, { name }),
  deleteLocation: (name: string, transferTo?: string) =>
    api.delete<{ success: boolean }>(`/pantry/locations/${encodeURIComponent(name)}${transferTo ? `?transferTo=${encodeURIComponent(transferTo)}` : ''}`),
  /** AI vision scan of pantry/fridge photos. Returns candidates for review — nothing is added until the user confirms. */
  scanImages: (files: File[], location: string) => {
    const formData = new FormData();
    files.forEach((file) => formData.append('files', file));
    formData.append('location', location);
    return api.post<{ items: ScannedPantryItem[] }>('/pantry/scan-images', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};

// Analytics API
export const analyticsApi = {
  getSummary: () => api.get('/analytics/summary'),
  getHistory: (limit?: number) => api.get('/analytics/history', { params: { limit } }),
};

// Preferences API
export const preferencesApi = {
  getPreferences: () => api.get('/preferences'),
  updatePreferences: (data: any) => api.put('/preferences', data),
  deletePreferences: () => api.delete('/preferences'),
  checkCompatibility: (data: { recipeTags: string[]; recipeIngredients: string[] }) =>
    api.post('/preferences/check-compatibility', data),
};

// Batch Cooking API
export const batchCookingApi = {
  getAll: () => api.get('/batch-cooking'),
  getById: (id: string) => api.get(`/batch-cooking/${id}`),
  create: (data: any) => api.post('/batch-cooking', data),
  update: (id: string, data: any) => api.put(`/batch-cooking/${id}`, data),
  delete: (id: string) => api.delete(`/batch-cooking/${id}`),
  updateStatus: (id: string, status: string) => api.patch(`/batch-cooking/${id}/status`, { status }),
  updateChecklist: (id: string, checklist: any) => api.patch(`/batch-cooking/${id}/checklist`, { checklist }),
  getSuggestions: () => api.get('/batch-cooking/suggestions'),
  createShoppingList: (id: string) => api.post(`/batch-cooking/${id}/shopping-list`),
  getAnalytics: () => api.get('/batch-cooking/analytics'),
};

// Gamification API
export const gamificationApi = {
  getStats: () => api.get('/gamification/stats'),
  getAchievements: () => api.get('/gamification/achievements'),
  getAchievementProgress: () => api.get('/gamification/achievements/progress'),
  getAllAchievements: () => api.get('/gamification/achievements/all'),
  getLeaderboard: (limit?: number) => api.get('/gamification/leaderboard', { params: { limit } }),
  recordMeal: () => api.post('/gamification/record-meal'),
};

// Taxonomy API
export const taxonomyApi = {
  getAll: (type?: TaxonomyType) =>
    api.get<Taxonomy[]>('/taxonomies', { params: type ? { type } : {} }),
  create: (data: TaxonomyCreateDto) => api.post<Taxonomy>('/taxonomies', data),
  update: (id: string, data: TaxonomyUpdateDto) => api.put<Taxonomy>(`/taxonomies/${id}`, data),
  delete: (id: string) => api.delete(`/taxonomies/${id}`),
  reorder: (ids: string[]) => api.post('/taxonomies/reorder', { ids }),
};

// Rating API
export const ratingApi = {
  rate: (recipeId: string, rating: number) =>
    api.put(`/recipes/${recipeId}/rate`, { rating }),
  unrate: (recipeId: string) =>
    api.delete(`/recipes/${recipeId}/rate`),
};

// Collections API
export const collectionApi = {
  getAll: async (): Promise<RecipeCollection[]> => {
    const { data } = await api.get<RecipeCollection[]>('/collections');
    return data;
  },
  getById: async (id: string) => {
    const { data } = await api.get<RecipeCollection>(`/collections/${id}`);
    return data;
  },
  create: (data: CreateCollectionDto) => api.post<RecipeCollection>('/collections', data),
  update: (id: string, data: UpdateCollectionDto) => api.put<RecipeCollection>(`/collections/${id}`, data),
  delete: (id: string) => api.delete(`/collections/${id}`),
  addRecipe: (id: string, recipeId: string) => api.post(`/collections/${id}/recipes`, { recipeId }),
  removeRecipe: (id: string, recipeId: string) => api.delete(`/collections/${id}/recipes/${recipeId}`),
  toggleFavorite: async (recipeId: string) => {
    const { data } = await api.post<{ isFavorite: boolean }>('/collections/toggle-favorite', { recipeId });
    return data;
  },
};

// Recently viewed API
export const historyApi = {
  getRecent: async (limit = 10): Promise<Recipe[]> => {
    const { data } = await api.get<Recipe[]>(`/recipes/recent?limit=${limit}`);
    return data;
  },
};

// Suggestions API
export const suggestionApi = {
  get: async (limit = 6) => {
    const { data } = await api.get<ContentRecipeSuggestion[]>(`/recipes/suggestions?limit=${limit}`);
    return data;
  },
};

// Feedback types — minimal local definitions (mirrors @nommable/shared feedback types).
export type FeedbackType = 'bug' | 'feature';

export interface CreateFeedbackDto {
  type: FeedbackType;
  summary: string;
  details?: string;
  route?: string;
  userAgent?: string;
  viewport?: string;
  appVersion?: string;
}

// Feedback API
export const feedbackApi = {
  submit: (data: CreateFeedbackDto) => api.post('/feedback', data),
  list: (params?: { type?: FeedbackType; status?: 'open' | 'in-progress' | 'resolved' }) =>
    api.get('/feedback', { params }),
  updateStatus: (id: string, status: 'open' | 'in-progress' | 'resolved') =>
    api.patch(`/feedback/${id}`, { status }),
};

export default api;


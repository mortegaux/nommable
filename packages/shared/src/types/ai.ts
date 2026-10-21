export type AIProvider = 'openai' | 'anthropic' | 'google' | 'ollama' | 'openrouter' | 'none';

/**
 * Instance-wide AI key distribution mode (stored on the global ai_configs row).
 * - 'shared': every user uses the admin-configured key (default, legacy behavior).
 * - 'per-user': each user supplies their own key in Settings; no fallback to the shared key.
 */
export type AIMode = 'shared' | 'per-user' | 'managed';

export interface AIModelInfo {
  id: string;
  name: string;
  description?: string;
  isDefault?: boolean;
}

export interface AIConfig {
  id: string;
  userId: string;
  /** True for the single instance-wide config managed by the admin AI panel. */
  isGlobal?: boolean;
  /** Key distribution mode; only meaningful on the global row. */
  aiMode?: AIMode;
  provider: AIProvider;
  apiKey?: string; // Encrypted in database
  model?: string;
  imageModel?: string;
  imageApiKey?: string; // Encrypted in database
  baseUrl?: string; // For Ollama
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface AIConfigCreateDto {
  provider: AIProvider;
  apiKey?: string;
  model?: string;
  imageModel?: string;
  imageApiKey?: string;
  baseUrl?: string;
  enabled: boolean;
}

export interface AIConfigUpdateDto extends Partial<AIConfigCreateDto> {
  id: string;
}

/** Shape of GET/PUT /ai/my-config responses. The full key is never returned. */
export interface UserAIKeyConfig {
  mode: AIMode;
  provider: AIProvider | null;
  enabled: boolean;
  hasApiKey: boolean;
  /** Masked suffix (e.g. "••••1234") of the stored key, or null when none is saved. */
  maskedKey: string | null;
  baseUrl: string | null;
}

export interface AIGenerateRecipeRequest {
  prompt: string;
  ingredients?: string[];
  dietary?: string[];
  cuisine?: string;
  servings?: number;
  generateImage?: boolean;
}

export interface AIEnhanceRecipeRequest {
  recipeId: string;
  enhancementType: 'improve_instructions' | 'add_tips' | 'optimize_ingredients';
}

export interface AISubstituteIngredientRequest {
  ingredient: string;
  reason?: string;
  recipeContext?: string;
}

export interface AIMealPlanRequest {
  days: number;
  servings: number;
  dietary?: string[];
  cuisine?: string[];
  excludeIngredients?: string[];
  budget?: 'low' | 'medium' | 'high';
}

export interface AIGeneratedRecipe {
  title: string;
  description: string;
  servings: number;
  prepTime: number;
  cookTime: number;
  difficulty: 'easy' | 'medium' | 'hard';
  ingredients: {
    quantity?: number;
    unit?: string;
    name: string;
    notes?: string;
    section?: string;
  }[];
  instructions: string[];
  tags: string[];
  categories?: string[];
  nutrition?: {
    calories?: number;
    protein?: number;
    carbohydrates?: number;
    fat?: number;
  };
}

export interface AISubstitutionSuggestion {
  original: string;
  substitute: string;
  ratio?: string;
  notes?: string;
}

export interface AIGenerateImageRequest {
  recipeId?: string;
  title?: string;
  description?: string;
  cuisine?: string;
  prompt?: string;
  model?: string;
}

export interface AIGenerateImageResponse {
  imageUrl: string;
  recipe?: any;
}

export interface AIProviderCapabilities {
  generateRecipe: boolean;
  enhanceRecipe: boolean;
  substituteIngredient: boolean;
  generateMealPlan: boolean;
  generateImage: boolean;
}

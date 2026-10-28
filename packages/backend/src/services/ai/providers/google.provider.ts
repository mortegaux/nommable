import axios from 'axios';
import { buildEnhancePrompts } from './enhance-prompts';
import { AIGeneratedRecipe, AISubstitutionSuggestion, ScannedPantryItem } from '@nommable/shared';
import {
  IAIProvider,
  RecipeGenerationOptions,
  MealPlanGenerationOptions,
  MealPlanSuggestion,
  ImageInput,
} from '../types';

export class GoogleProvider implements IAIProvider {
  private apiKey: string;
  private model: string;
  /**
   * Managed-mode fallback chain (resolved model first, then older stable
   * Flash models). Empty for every other construction — BYOK providers never
   * retry with a different model: a BYOK user's chosen model is theirs, and
   * its failure must surface, not silently change.
   */
  private readonly managedFallbackChain: string[];
  /**
   * Managed-mode image chain (resolved Flash image model first, then the
   * static image fallbacks). Empty for every other construction. Without
   * it, generateImage runs its own hardcoded chain starting with the dead
   * `gemini-2.0-flash` — the text resolution above never applied to images.
   */
  private readonly managedImageChain: string[];

  constructor(
    apiKey: string,
    model?: string,
    options?: { managedFallbackChain?: string[]; managedImageChain?: string[] }
  ) {
    this.apiKey = apiKey;
    const clean = model ? model.replace(/^models\//, '').trim() : '';
    this.model = clean || 'gemini-1.5-flash';
    this.managedFallbackChain = options?.managedFallbackChain ?? [];
    this.managedImageChain = options?.managedImageChain ?? [];
  }

  private get cleanModel(): string {
    return this.model.replace(/^models\//, '').trim() || 'gemini-1.5-flash';
  }

  private async generate(parts: Array<any>): Promise<string> {
    // Managed mode only: if the resolved model has disappeared between
    // resolution and request time, Google answers 404 for that model id.
    // Walk down the Flash chain instead of hard-failing the query; the
    // last error still surfaces when every model in the chain is gone.
    // With no chain (BYOK and every other path) this is exactly one attempt.
    const attempts = [
      this.cleanModel,
      ...this.managedFallbackChain.filter((model) => model !== this.cleanModel),
    ];
    let lastError: unknown = null;
    for (const model of attempts) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(this.apiKey)}`;

        const response = await axios.post(
          url,
          {
            contents: [
              {
                parts,
              },
            ],
          },
          {
            headers: { 'Content-Type': 'application/json' },
            timeout: 60000,
          }
        );

        const candidate = response.data?.candidates?.[0];
        if (!candidate) {
          const err = response.data?.error?.message || 'No candidate returned from Google AI';
          throw new Error(err);
        }

        const text = candidate.content?.parts?.map((p: any) => p.text).filter(Boolean).join('');
        if (!text) {
          throw new Error('Empty response from Google AI');
        }

        return text;
      } catch (error: any) {
        lastError = error;
        const nextIndex = attempts.indexOf(model) + 1;
        const next = attempts[nextIndex];
        // A 404 on this endpoint means the model id itself is unknown or
        // retired (Google returns 404 for shut-down models). Other statuses
        // (403 key/permission, 429 quota, 5xx) are not model problems and
        // must surface immediately, never trigger a model change.
        if (this.managedFallbackChain.length > 0 && error?.response?.status === 404 && next) {
          console.warn(
            `Google AI model "${model}" is no longer available, falling back to "${next}"`
          );
          continue;
        }
        throw error;
      }
    }
    throw lastError ?? new Error('Google AI generation failed');
  }

  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.cleanModel)}:generateContent?key=${encodeURIComponent(this.apiKey)}`;

      const response = await axios.post(
        url,
        {
          contents: [
            {
              parts: [{ text: 'Hello' }],
            },
          ],
        },
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 15000,
        }
      );

      const candidate = response.data?.candidates?.[0];
      const text = candidate?.content?.parts?.map((p: any) => p.text).filter(Boolean).join('');

      if (text) {
        return {
          success: true,
          message: `Successfully connected to Google AI using model ${this.cleanModel}`,
        };
      }

      return {
        success: false,
        message: 'Unexpected response from Google AI',
      };
    } catch (error: any) {
      console.error('Google AI test error:', error.response?.data || error.message);

      const googleError = error.response?.data?.error?.message;
      const status = error.response?.status;

      if (status === 400 && (googleError?.includes('API_KEY_INVALID') || googleError?.includes('API key'))) {
        return {
          success: false,
          message: 'Invalid API key. Please verify your Google AI Studio API key.',
        };
      }

      if (status === 404 || googleError?.includes('not found')) {
        return {
          success: false,
          message: `Model "${this.cleanModel}" not found. ${googleError || 'Please select another model from the dropdown.'}`.trim(),
        };
      }

      if (status === 403) {
        return {
          success: false,
          message: `Permission denied: ${googleError || 'Your API key does not have access to this model or region.'}`,
        };
      }

      if (status === 429) {
        return {
          success: false,
          message: `Rate limit or quota exceeded: ${googleError || 'Please try again later or check your quota in Google AI Studio.'}`,
        };
      }

      return {
        success: false,
        message: googleError ? `Google AI error: ${googleError}` : `Error: ${error.message || 'Failed to connect to Google AI'}`,
      };
    }
  }

  async generateRecipe(
    prompt: string,
    options?: RecipeGenerationOptions
  ): Promise<AIGeneratedRecipe> {
    const systemPrompt = `You are a professional chef and recipe creator. Generate detailed, practical recipes in JSON format only.`;
    const userPrompt = this.buildRecipePrompt(prompt, options);

    const text = await this.generate([
      { text: `${systemPrompt}\n\n${userPrompt}` },
    ]);

    // Extract JSON from markdown code blocks if present
    const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) || text.match(/```\n([\s\S]*?)\n```/);
    const jsonText = jsonMatch ? jsonMatch[1] : text;

    return JSON.parse(jsonText);
  }

  async enhanceRecipe(recipe: any, enhancementType: string): Promise<string> {
    const { systemPrompt, userPrompt } = buildEnhancePrompts(recipe, enhancementType);
    return await this.generate([
      { text: `${systemPrompt}\n\n${userPrompt}` },
    ]);
  }

  async substituteIngredient(
    ingredient: string,
    reason?: string,
    context?: string
  ): Promise<AISubstitutionSuggestion[]> {
    const prompt = `Suggest 3 substitutes for "${ingredient}"${reason ? ` (reason: ${reason})` : ''}${context ? ` in the context of: ${context}` : ''}. Return as JSON object with a "substitutions" array, where each item has: substitute, ratio, notes. Only return valid JSON.`;

    const text = await this.generate([{ text: prompt }]);

    // Extract JSON from markdown code blocks if present
    const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) || text.match(/```\n([\s\S]*?)\n```/);
    const jsonText = jsonMatch ? jsonMatch[1] : text;

    const parsed = JSON.parse(jsonText);
    return parsed.substitutions || [];
  }

  async generateMealPlan(options: MealPlanGenerationOptions): Promise<MealPlanSuggestion> {
    const prompt = `Create a ${options.days}-day meal plan for ${options.servings} servings per meal.
${options.dietary?.length ? `Dietary requirements: ${options.dietary.join(', ')}` : ''}
${options.cuisine?.length ? `Preferred cuisines: ${options.cuisine.join(', ')}` : ''}
${options.excludeIngredients?.length ? `Exclude: ${options.excludeIngredients.join(', ')}` : ''}
${options.budget ? `Budget: ${options.budget}` : ''}

Return a JSON object with a 'days' array, where each day has a 'date' and 'meals' array. Each meal should have 'mealType' (breakfast/lunch/dinner/snack) and 'recipeSuggestion' with title, description, and estimatedTime. Only return valid JSON.`;

    const text = await this.generate([{ text: prompt }]);

    // Extract JSON from markdown code blocks if present
    const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) || text.match(/```\n([\s\S]*?)\n```/);
    const jsonText = jsonMatch ? jsonMatch[1] : text;

    return JSON.parse(jsonText);
  }

  async extractRecipeFromImages(images: ImageInput[]): Promise<AIGeneratedRecipe> {
    const prompt = `Extract the complete recipe from the provided image(s). Look for:
- Recipe title
- Description/introduction
- Servings/yield
- Prep time and cook time (in minutes)
- Complete ingredients list with quantities, units, and names
- Step-by-step instructions
- Any notes, tips, or variations
- Dietary information or tags (vegetarian, gluten-free, etc.)
- Category/cuisine type

IMPORTANT: For instructions, extract ONLY the instruction text without any step numbers. For example, if the recipe shows "1. Preheat oven to 350°F", you should return "Preheat oven to 350°F" (without the "1."). The step numbers will be added automatically when displaying the recipe.

Return ONLY a JSON object with: title, description, servings, prepTime (minutes), cookTime (minutes), difficulty (easy/medium/hard), ingredients (array of {quantity, unit, name, notes, section}), instructions (array of strings - each string is the instruction text WITHOUT step numbers), tags (array), categories (array), and nutrition (object with calories, protein, carbohydrates, fat) if available.

If the recipe spans multiple images, combine all information into one complete recipe.`;

    const parts: Array<any> = [{ text: prompt }];

    for (const image of images) {
      const base64Data = (image.data instanceof Buffer
        ? image.data.toString('base64')
        : image.data) as string;

      parts.push({
        inline_data: {
          mime_type: image.mimeType,
          data: base64Data,
        },
      });
    }

    const text = await this.generate(parts);

    // Extract JSON from markdown code blocks if present
    const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) || text.match(/```\n([\s\S]*?)\n```/);
    const jsonText = jsonMatch ? jsonMatch[1] : text;

    return JSON.parse(jsonText);
  }

  async extractRecipeFromText(rawText: string): Promise<AIGeneratedRecipe> {
    const prompt = `You are a professional chef and recipe parser. Extract structured recipe information from the following raw, unformatted, or poorly formatted website/document text, ignoring ads, navigation menus, blog stories, and comments.

Return ONLY a valid JSON object with:
- title (string)
- description (concise 1-2 sentence summary)
- servings (number)
- prepTime (in minutes, number)
- cookTime (in minutes, number)
- difficulty ("easy" | "medium" | "hard")
- ingredients (array of { quantity (number, convert fractions like 1/2 to 0.5), unit (string), name (string), notes (string), section (string) })
- instructions (array of strings — each string is the instruction text WITHOUT leading step numbers like "1.")
- tags (array of strings)
- categories (array of strings)
- nutrition (object with calories, protein, carbohydrates, fat as numbers, if available)

Raw text:
${rawText}`;

    const text = await this.generate([{ text: prompt }]);

    const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) || text.match(/```\n([\s\S]*?)\n```/);
    const jsonText = jsonMatch ? jsonMatch[1] : text;

    return JSON.parse(jsonText.trim());
  }

  async extractIngredientsFromImage(image: ImageInput): Promise<string[]> {
    const prompt = `Analyze this image and identify all food ingredients visible. Return a JSON object with an "ingredients" array containing ingredient names as strings. Only include edible ingredients - ignore containers, equipment, packaging, and non-food items. Be specific (e.g., "red bell pepper" not just "pepper", "cherry tomatoes" not just "tomatoes"). Only return valid JSON.`;

    const base64Data = (image.data instanceof Buffer
      ? image.data.toString('base64')
      : image.data) as string;

    const parts: Array<any> = [
      { text: prompt },
      {
        inline_data: {
          mime_type: image.mimeType,
          data: base64Data,
        },
      },
    ];

    const text = await this.generate(parts);

    // Extract JSON from markdown code blocks if present
    const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) || text.match(/```\n([\s\S]*?)\n```/);
    const jsonText = jsonMatch ? jsonMatch[1] : text;

    const parsed = JSON.parse(jsonText);
    return parsed.ingredients || [];
  }

  async scanPantryFromImages(images: ImageInput[], locationHint?: string): Promise<ScannedPantryItem[]> {
    const prompt = `These ${images.length} photo(s) show food storage${locationHint ? ` (taken in the ${locationHint})` : ''} — wide shots of shelves / fridge / freezer, not one item per photo. Identify every distinct edible food or drink item visible across all photos.

For each item return: name (product name as printed on the label when readable, e.g. "Heinz Ketchup", "Whole Milk" — not generic "sauce"), quantity (count of visible units of that item, e.g. 2 if you see two cans), unit (the container type: "bottle", "can", "box", "bag", "jar", "carton", "item" — use "item" when unsure), category (exactly one of: "Spices & Seasonings", "Grains & Pasta", "Canned Goods", "Baking", "Oils & Vinegars", "Condiments", "Snacks", "Beverages", "Dairy", "Meat & Seafood", "Produce", "Frozen", "Other"), and confidence (0-1, how sure you are this item is really there).

Merge duplicates: the same product appearing in multiple photos is ONE item with summed quantity. Do not list the same product twice.
Only include edible food/drink items — ignore shelves, containers, equipment, appliances, and non-food items. Items partially hidden behind others still count if identifiable. If you cannot identify an item, leave it out rather than guessing.

Return ONLY a JSON object with an "items" array.`;

    const parts: Array<any> = [{ text: prompt }];
    for (const image of images) {
      const base64Data = (image.data instanceof Buffer
        ? image.data.toString('base64')
        : image.data) as string;
      parts.push({
        inline_data: { mime_type: image.mimeType, data: base64Data },
      });
    }

    const text = await this.generate(parts);

    // Extract JSON from markdown code blocks if present
    const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) || text.match(/```\n([\s\S]*?)\n```/);
    const jsonText = jsonMatch ? jsonMatch[1] : text;

    const parsed = JSON.parse(jsonText);
    const items = (parsed.items || []) as ScannedPantryItem[];
    return items.filter((item) => item && typeof item.name === 'string' && item.name.trim());
  }

  private buildRecipePrompt(prompt: string, options?: RecipeGenerationOptions): string {
    let fullPrompt = `Generate a recipe for: ${prompt}\n\n`;

    if (options?.ingredients?.length) {
      fullPrompt += `Must use these ingredients: ${options.ingredients.join(', ')}\n`;
    }
    if (options?.dietary?.length) {
      fullPrompt += `Dietary requirements: ${options.dietary.join(', ')}\n`;
    }
    if (options?.cuisine) {
      fullPrompt += `Cuisine style: ${options.cuisine}\n`;
    }
    if (options?.servings) {
      fullPrompt += `Servings: ${options.servings}\n`;
    }

    fullPrompt += `\nReturn ONLY a JSON object with: title, description, servings, prepTime (minutes), cookTime (minutes), difficulty (easy/medium/hard), ingredients (array of {quantity, unit, name, notes, section}), instructions (array of strings), tags (array of relevant tags like "vegetarian", "quick", "healthy"), categories (array like "Breakfast", "Dinner", "Italian", "Dessert"), and nutrition (object with calories, protein, carbohydrates, fat).`;

    return fullPrompt;
  }

  async generateImage(prompt: string, modelOverride?: string): Promise<{ buffer: Buffer; mimeType: string }> {
    const cleanOverride = modelOverride ? modelOverride.replace(/^models\//, '').trim() : '';

    let lastError: any = null;

    // Strategy 1: Gemini multimodal generateContent with responseModalities: ["TEXT", "IMAGE"]
    const tryGemini = async (model: string): Promise<{ buffer: Buffer; mimeType: string } | null> => {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(this.apiKey)}`;
        const response = await axios.post(
          url,
          {
            contents: [
              {
                parts: [{ text: `Generate a high quality, photorealistic, professional culinary food photograph of: ${prompt}` }],
              },
            ],
            generationConfig: {
              responseModalities: ['TEXT', 'IMAGE'],
            },
          },
          {
            headers: { 'Content-Type': 'application/json' },
            timeout: 60000,
          }
        );

        const candidate = response.data?.candidates?.[0];
        const parts = candidate?.content?.parts || [];
        for (const part of parts) {
          if (part.inlineData?.data) {
            return {
              buffer: Buffer.from(part.inlineData.data, 'base64'),
              mimeType: part.inlineData.mimeType || 'image/png',
            };
          }
        }
      } catch (err: any) {
        lastError = err;
        console.warn(`Google Gemini image generation failed with model ${model}:`, err.response?.data || err.message);
      }
      return null;
    };

    // Strategy 2: Google OpenAI-compatible image endpoint
    const tryOpenAICompat = async (model: string): Promise<{ buffer: Buffer; mimeType: string } | null> => {
      try {
        const url = 'https://generativelanguage.googleapis.com/v1beta/openai/images/generations';
        const response = await axios.post(
          url,
          {
            prompt,
            model,
          },
          {
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${this.apiKey}`,
            },
            timeout: 60000,
          }
        );

        const item = response.data?.data?.[0];
        if (item?.b64_json) {
          return {
            buffer: Buffer.from(item.b64_json, 'base64'),
            mimeType: 'image/jpeg',
          };
        }
        if (item?.url) {
          const imgRes = await axios.get(item.url, {
            responseType: 'arraybuffer',
            timeout: 60000,
          });
          const mimeType = (imgRes.headers['content-type'] as string) || 'image/jpeg';
          return {
            buffer: Buffer.from(imgRes.data),
            mimeType,
          };
        }
      } catch (err: any) {
        lastError = err;
        console.warn(`Google OpenAI-compatible image endpoint failed with model ${model}:`, err.response?.data || err.message);
      }
      return null;
    };

    // Strategy 3: Google Imagen :predict endpoint
    const tryPredict = async (model: string): Promise<{ buffer: Buffer; mimeType: string } | null> => {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:predict?key=${encodeURIComponent(this.apiKey)}`;
        const response = await axios.post(
          url,
          {
            instances: [{ prompt }],
            parameters: {
              sampleCount: 1,
              aspectRatio: '1:1',
            },
          },
          {
            headers: { 'Content-Type': 'application/json' },
            timeout: 60000,
          }
        );

        const prediction = response.data?.predictions?.[0];
        const b64 = prediction?.bytesBase64Encoded;
        if (b64) {
          return {
            buffer: Buffer.from(b64, 'base64'),
            mimeType: prediction.mimeType || 'image/jpeg',
          };
        }
      } catch (err: any) {
        lastError = err;
        console.warn(`Google Imagen predict endpoint failed with model ${model}:`, err.response?.data || err.message);
      }
      return null;
    };

    if (cleanOverride) {
      if (cleanOverride.startsWith('gemini')) {
        const res = await tryGemini(cleanOverride);
        if (res) return res;
      } else if (cleanOverride.startsWith('imagen')) {
        const resCompat = await tryOpenAICompat(cleanOverride);
        if (resCompat) return resCompat;
        const resPredict = await tryPredict(cleanOverride);
        if (resPredict) return resPredict;
        const resGemini = await tryGemini('gemini-2.0-flash');
        if (resGemini) return resGemini;
      } else {
        const res1 = await tryGemini(cleanOverride);
        if (res1) return res1;
        const res2 = await tryOpenAICompat(cleanOverride);
        if (res2) return res2;
        const res3 = await tryPredict(cleanOverride);
        if (res3) return res3;
      }
    } else {
      // Default: no explicit image model.
      if (this.managedImageChain.length > 0) {
        // Managed mode: use the resolved image chain first (newest stable
        // Flash image model from Google's live list), then the resolved
        // text Flash model — multimodal Flash models can also output
        // images — then the Imagen strategies. The dead `gemini-2.0-flash`
        // / `gemini-2.0-flash-exp` entries of the legacy chain below are
        // deliberately NOT attempted here: they only add failed calls.
        for (const imageModel of this.managedImageChain) {
          const resImage = await tryGemini(imageModel);
          if (resImage) return resImage;
        }
        const resTextModel = await tryGemini(this.cleanModel);
        if (resTextModel) return resTextModel;

        const resCompat = await tryOpenAICompat('imagen-3.0-generate-002');
        if (resCompat) return resCompat;

        const resPredict1 = await tryPredict('imagen-3.0-generate-002');
        if (resPredict1) return resPredict1;

        const resPredict2 = await tryPredict('imagen-3.0-fast-generate-001');
        if (resPredict2) return resPredict2;
      } else {
        // Legacy default (BYOK and every other non-managed construction):
        // unchanged — try Gemini multimodal first, then OpenAI compat Imagen, then predict
        const resGemini = await tryGemini('gemini-2.0-flash');
        if (resGemini) return resGemini;

        const resCompat = await tryOpenAICompat('imagen-3.0-generate-002');
        if (resCompat) return resCompat;

        const resPredict1 = await tryPredict('imagen-3.0-generate-002');
        if (resPredict1) return resPredict1;

        const resPredict2 = await tryPredict('imagen-3.0-fast-generate-001');
        if (resPredict2) return resPredict2;

        const resGeminiExp = await tryGemini('gemini-2.0-flash-exp');
        if (resGeminiExp) return resGeminiExp;
      }
    }

    const rawMessage =
      lastError?.response?.data?.error?.message ||
      lastError?.message ||
      '';
    const status = lastError?.response?.status;

    if (
      status === 404 ||
      rawMessage.includes('not found') ||
      rawMessage.includes('not supported for predict') ||
      rawMessage.includes('is not found for API version')
    ) {
      throw new Error(
        `Google AI image generation is unavailable for your API key. Google requires a Google Cloud project with active billing for image generation models (Imagen/Gemini). If you are using a free Google AI Studio key, please enable billing in your Google Cloud project, or select OpenAI (DALL-E 3) for image generation in AI Settings.`
      );
    }

    if (status === 403 || rawMessage.includes('PERMISSION_DENIED')) {
      throw new Error(
        `Google AI permission denied: Your API key does not have permission to generate images. Please check your Google Cloud project permissions or billing status, or switch to OpenAI (DALL-E 3) in AI Settings.`
      );
    }

    if (status === 429 || rawMessage.includes('RESOURCE_EXHAUSTED')) {
      throw new Error(
        `Google AI quota exceeded. Please wait a moment before trying again or check your Google AI Studio quota.`
      );
    }

    throw new Error(`Google AI image generation error: ${rawMessage || 'Failed to generate image'}`);
  }
}

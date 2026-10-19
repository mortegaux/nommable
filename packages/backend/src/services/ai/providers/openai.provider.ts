import OpenAI from 'openai';
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

export class OpenAIProvider implements IAIProvider {
  private client: OpenAI;
  protected model: string;

  constructor(apiKey: string, model?: string, opts?: { baseURL?: string; defaultModel?: string }) {
    this.client = new OpenAI({ apiKey, ...(opts?.baseURL ? { baseURL: opts.baseURL } : {}) });
    this.model = (model && model.trim()) || opts?.defaultModel || 'gpt-4o';
  }

  /**
   * Which model to use for image-input (vision) calls. The base heuristic fits
   * OpenAI's namespace; subclasses with a different model namespace (e.g.
   * OpenRouter's `vendor/slug` ids) override this.
   */
  protected resolveVisionModel(): string {
    return this.model.includes('vision') || this.model.includes('4o') ? this.model : 'gpt-4o';
  }

  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [{ role: 'user', content: 'Hello' }],
        max_tokens: 5,
      });

      if (response.choices && response.choices.length > 0) {
        return {
          success: true,
          message: `Successfully connected to OpenAI using model ${this.model}`,
        };
      }

      return {
        success: false,
        message: 'Unexpected response from OpenAI',
      };
    } catch (error: any) {
      if (error.status === 401) {
        return {
          success: false,
          message: 'Invalid API key',
        };
      }
      if (error.status === 404) {
        return {
          success: false,
          message: `Model "${this.model}" not found`,
        };
      }
      return {
        success: false,
        message: error.message || 'Failed to connect to OpenAI',
      };
    }
  }

  async generateRecipe(
    prompt: string,
    options?: RecipeGenerationOptions
  ): Promise<AIGeneratedRecipe> {
    const systemPrompt = `You are a professional chef and recipe creator. Generate detailed, practical recipes in JSON format.`;

    const userPrompt = this.buildRecipePrompt(prompt, options);

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from OpenAI');
    }

    return JSON.parse(content);
  }

  async enhanceRecipe(recipe: any, enhancementType: string): Promise<string> {
    const { systemPrompt, userPrompt } = buildEnhancePrompts(recipe, enhancementType);

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
    });

    return response.choices[0]?.message?.content || '';
  }

  async substituteIngredient(
    ingredient: string,
    reason?: string,
    context?: string
  ): Promise<AISubstitutionSuggestion[]> {
    const systemPrompt = `You are a culinary expert. Provide ingredient substitution suggestions in JSON array format.`;

    const userPrompt = `Suggest 3 substitutes for "${ingredient}"${reason ? ` (reason: ${reason})` : ''}${context ? ` in the context of: ${context}` : ''}. Return as JSON array with fields: substitute, ratio, notes.`;

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from OpenAI');
    }

    const result = JSON.parse(content);
    return result.substitutions || [];
  }

  async generateMealPlan(options: MealPlanGenerationOptions): Promise<MealPlanSuggestion> {
    const systemPrompt = `You are a meal planning expert. Create balanced, varied meal plans in JSON format.`;

    const userPrompt = `Create a ${options.days}-day meal plan for ${options.servings} servings per meal.
${options.dietary?.length ? `Dietary requirements: ${options.dietary.join(', ')}` : ''}
${options.cuisine?.length ? `Preferred cuisines: ${options.cuisine.join(', ')}` : ''}
${options.excludeIngredients?.length ? `Exclude: ${options.excludeIngredients.join(', ')}` : ''}
${options.budget ? `Budget: ${options.budget}` : ''}

Return a JSON object with a 'days' array, where each day has a 'date' and 'meals' array. Each meal should have 'mealType' (breakfast/lunch/dinner/snack) and 'recipeSuggestion' with title, description, and estimatedTime.`;

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.8,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from OpenAI');
    }

    return JSON.parse(content);
  }

  async extractRecipeFromImages(images: ImageInput[]): Promise<AIGeneratedRecipe> {
    const systemPrompt = `You are a professional chef and recipe expert. Extract recipe information from images (screenshots, photos, or PDF pages) and return structured JSON data.`;

    const userPrompt = `Extract the complete recipe from the provided image(s). Look for:
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

Return a JSON object with: title, description, servings, prepTime (minutes), cookTime (minutes), difficulty (easy/medium/hard), ingredients (array of {quantity, unit, name, notes, section}), instructions (array of strings - each string is the instruction text WITHOUT step numbers), tags (array), categories (array), and nutrition (object with calories, protein, carbohydrates, fat) if available.

If the recipe spans multiple images, combine all information into one complete recipe.`;

    // Convert images to OpenAI format
    const content: Array<any> = [{ type: 'text', text: userPrompt }];

    for (const image of images) {
      const base64Data = image.data instanceof Buffer
        ? image.data.toString('base64')
        : image.data;

      content.push({
        type: 'image_url',
        image_url: {
          url: `data:${image.mimeType};base64,${base64Data}`,
        },
      });
    }

    const visionModel = this.resolveVisionModel();

    const response = await this.client.chat.completions.create({
      model: visionModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 4096,
      temperature: 0.3, // Lower temperature for more accurate extraction
    });

    const responseContent = response.choices[0]?.message?.content;
    if (!responseContent) {
      throw new Error('No response from OpenAI Vision');
    }

    return JSON.parse(responseContent);
  }

  async extractRecipeFromText(rawText: string): Promise<AIGeneratedRecipe> {
    const systemPrompt = `You are a professional chef and recipe parser. Extract structured recipe information from raw, unformatted, or poorly formatted website/document text, ignoring ads, navigation menus, blog stories, and comments. Respond strictly in JSON format.`;

    const userPrompt = `Extract the complete recipe from the text below and return a JSON object with:
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

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 4096,
      temperature: 0.2,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from OpenAI');
    }

    return JSON.parse(content);
  }

  async extractIngredientsFromImage(image: ImageInput): Promise<string[]> {
    const systemPrompt = `You are a food recognition expert. Identify all edible ingredients visible in images.`;

    const userPrompt = `Analyze this image and identify all food ingredients visible. Return a JSON object with an "ingredients" array containing ingredient names as strings. Only include edible ingredients - ignore containers, equipment, packaging, and non-food items. Be specific (e.g., "red bell pepper" not just "pepper", "cherry tomatoes" not just "tomatoes").`;

    const base64Data = image.data instanceof Buffer
      ? image.data.toString('base64')
      : image.data;

    const visionModel = this.resolveVisionModel();

    const response = await this.client.chat.completions.create({
      model: visionModel,
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            { type: 'text', text: userPrompt },
            {
              type: 'image_url',
              image_url: {
                url: `data:${image.mimeType};base64,${base64Data}`,
              },
            },
          ],
        },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 1024,
      temperature: 0.3,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from OpenAI Vision');
    }

    const result = JSON.parse(content);
    return result.ingredients || [];
  }

  async scanPantryFromImages(images: ImageInput[], locationHint?: string): Promise<ScannedPantryItem[]> {
    const systemPrompt = `You are a food recognition expert. Identify food and drink items visible in wide photos of pantry shelves, fridges, freezers, and other food storage. Always respond with valid JSON only.`;

    const userPrompt = `These ${images.length} photo(s) show food storage${locationHint ? ` (taken in the ${locationHint})` : ''} — wide shots of shelves / fridge / freezer, not one item per photo. Identify every distinct edible food or drink item visible across all photos.

For each item return: name (product name as printed on the label when readable, e.g. "Heinz Ketchup", "Whole Milk" — not generic "sauce"), quantity (count of visible units of that item, e.g. 2 if you see two cans), unit (the container type: "bottle", "can", "box", "bag", "jar", "carton", "item" — use "item" when unsure), category (exactly one of: "Spices & Seasonings", "Grains & Pasta", "Canned Goods", "Baking", "Oils & Vinegars", "Condiments", "Snacks", "Beverages", "Dairy", "Meat & Seafood", "Produce", "Frozen", "Other"), and confidence (0-1, how sure you are this item is really there).

Merge duplicates: the same product appearing in multiple photos is ONE item with summed quantity. Do not list the same product twice.
Only include edible food/drink items — ignore shelves, containers, equipment, appliances, and non-food items. Items partially hidden behind others still count if identifiable. If you cannot identify an item, leave it out rather than guessing.

Return a JSON object with an "items" array.`;

    const visionModel = this.resolveVisionModel();

    const imageParts = images.map((image) => {
      const base64Data = image.data instanceof Buffer ? image.data.toString('base64') : image.data;
      return {
        type: 'image_url' as const,
        image_url: { url: `data:${image.mimeType};base64,${base64Data}` },
      };
    });

    const response = await this.client.chat.completions.create({
      model: visionModel,
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [{ type: 'text', text: userPrompt }, ...imageParts],
        },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 2048,
      temperature: 0.3,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from OpenAI Vision');
    }

    const result = JSON.parse(content);
    const items = (result.items || []) as ScannedPantryItem[];
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

    fullPrompt += `\nReturn a JSON object with: title, description, servings, prepTime (minutes), cookTime (minutes), difficulty (easy/medium/hard), ingredients (array of {quantity, unit, name, notes, section}), instructions (array of strings), tags (array of relevant tags like "vegetarian", "quick", "healthy"), categories (array like "Breakfast", "Dinner", "Italian", "Dessert"), and nutrition (object with calories, protein, carbohydrates, fat).`;

    return fullPrompt;
  }

  async generateImage(prompt: string, modelOverride?: string): Promise<{ buffer: Buffer; mimeType: string }> {
    const requested = modelOverride && modelOverride.trim();
    // OpenAI retired dall-e-3 and dall-e-2 in 2026 in favor of the gpt-image series.
    // If the user requested a retired DALL-E model, prioritize modern gpt-image models first
    // to avoid wasting an API round-trip on a known-failing 400 error.
    const isLegacyDalle = requested && (requested === 'dall-e-3' || requested === 'dall-e-2');
    const candidates = isLegacyDalle
      ? ['gpt-image-1.5', 'gpt-image-1', 'gpt-image-2.5-sunburst', requested]
      : requested
      ? [requested, 'gpt-image-1.5', 'gpt-image-1', 'gpt-image-2.5-sunburst', 'dall-e-3', 'dall-e-2']
      : ['gpt-image-1.5', 'gpt-image-1', 'gpt-image-2.5-sunburst', 'dall-e-3', 'dall-e-2'];

    const modelsToTry = [...new Set(candidates)];

    const generateWithModel = async (model: string) => {
      // Do not send response_format parameter as newer OpenAI models, DALL-E, and gateways
      // reject it with: "400 Unknown parameter: 'response_format'."
      // OpenAI returns either a URL or b64_json automatically.
      const response = await this.client.images.generate({
        model,
        prompt,
        n: 1,
        size: '1024x1024',
      });

      const item = response.data?.[0];
      if (!item) {
        throw new Error('No image data returned from OpenAI');
      }

      if (item.b64_json) {
        return {
          buffer: Buffer.from(item.b64_json, 'base64'),
          mimeType: 'image/png',
        };
      }

      if (item.url) {
        const imgRes = await axios.get(item.url, {
          responseType: 'arraybuffer',
          timeout: 60000,
        });
        const mimeType = (imgRes.headers['content-type'] as string) || 'image/png';
        return {
          buffer: Buffer.from(imgRes.data),
          mimeType,
        };
      }

      throw new Error('No image URL or base64 data returned from OpenAI');
    };

    let lastError: any = null;
    for (const model of modelsToTry) {
      try {
        return await generateWithModel(model);
      } catch (err: any) {
        lastError = err;
        const msg = String(err.message || err.error?.message || '').toLowerCase();
        const isModelMissing =
          msg.includes('does not exist') ||
          msg.includes('model_not_found') ||
          msg.includes('not found') ||
          msg.includes('the model') ||
          err.status === 404 ||
          (err.status === 400 && (msg.includes('model') || msg.includes('retired')));

        if (!isModelMissing) {
          throw err;
        }
        console.warn(`OpenAI image generation failed with model ${model}:`, err.message || msg);
      }
    }

    throw lastError || new Error('Failed to generate image with OpenAI');
  }
}

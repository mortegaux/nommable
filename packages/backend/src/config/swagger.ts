import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Nommable API',
      version: '1.0.0',
      description: 'Recipe management system with AI-powered features',
      contact: {
        name: 'Nommable',
      },
    },
    servers: [
      {
        url: 'http://localhost:3001',
        description: 'Development server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
      schemas: {
        Recipe: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            title: { type: 'string' },
            description: { type: 'string' },
            servings: { type: 'number' },
            prepTime: { type: 'number', description: 'Preparation time in minutes' },
            cookTime: { type: 'number', description: 'Cooking time in minutes' },
            totalTime: { type: 'number', description: 'Total time in minutes' },
            difficulty: { type: 'string', enum: ['easy', 'medium', 'hard'] },
            imageUrl: { type: 'string', nullable: true },
            sourceUrl: { type: 'string', nullable: true },
            notes: { type: 'string', nullable: true },
            instructions: { type: 'array', items: { type: 'string' } },
            categories: { type: 'array', items: { type: 'string' } },
            tags: { type: 'array', items: { type: 'string' } },
            nutrition: {
              type: 'object',
              properties: {
                calories: { type: 'number' },
                protein: { type: 'number' },
                carbohydrates: { type: 'number' },
                fat: { type: 'number' },
              },
            },
            isAiGenerated: { type: 'boolean' },
            ingredients: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  quantity: { type: 'number', nullable: true },
                  unit: { type: 'string', nullable: true },
                  name: { type: 'string' },
                  notes: { type: 'string', nullable: true },
                  section: { type: 'string', nullable: true },
                  order: { type: 'number' },
                },
              },
            },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        MealPlan: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            description: { type: 'string', nullable: true },
            startDate: { type: 'string', format: 'date' },
            endDate: { type: 'string', format: 'date' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        ShoppingList: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            notes: { type: 'string', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        AIConfig: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            provider: { type: 'string', enum: ['openai', 'anthropic', 'google', 'ollama', 'openrouter'] },
            model: { type: 'string', nullable: true },
            baseUrl: { type: 'string', nullable: true },
            enabled: { type: 'boolean' },
          },
        },
        User: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            email: { type: 'string', format: 'email' },
            username: { type: 'string' },
            firstName: { type: 'string' },
            lastName: { type: 'string' },
            role: { type: 'string', enum: ['admin', 'user'] },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        UserPreferences: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            userId: { type: 'string', format: 'uuid' },
            dietaryRestrictions: { type: 'array', items: { type: 'string' }, nullable: true },
            allergies: { type: 'array', items: { type: 'string' }, nullable: true },
            dislikes: { type: 'array', items: { type: 'string' }, nullable: true },
            favorites: { type: 'array', items: { type: 'string' }, nullable: true },
            preferredCuisines: { type: 'array', items: { type: 'string' }, nullable: true },
            skillLevel: { type: 'string', enum: ['beginner', 'intermediate', 'advanced'], nullable: true },
            maxCookingTime: { type: 'number', description: 'Maximum cooking time in minutes', nullable: true },
            householdSize: { type: 'number', nullable: true },
            spiceTolerance: { type: 'string', enum: ['none', 'mild', 'medium', 'hot', 'very-hot'], nullable: true },
            budgetLevel: { type: 'string', enum: ['budget', 'moderate', 'splurge'], nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        Error: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' },
          },
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
    tags: [
      { name: 'Auth', description: 'Authentication endpoints' },
      { name: 'Recipes', description: 'Recipe management' },
      { name: 'AI', description: 'AI-powered features' },
      { name: 'Meal Plans', description: 'Meal plan management' },
      { name: 'Shopping Lists', description: 'Shopping list management' },
      { name: 'Pantry', description: 'Pantry item management' },
      { name: 'Batch Cooking', description: 'Batch cooking plans' },
      { name: 'Gamification', description: 'Achievements and stats' },
      { name: 'Analytics', description: 'Analytics and insights' },
      { name: 'Users', description: 'User management (admin only)' },
      { name: 'Preferences', description: 'User dietary preferences' },
      { name: 'Settings', description: 'Data management settings' },
    ],
    paths: {
      '/api/auth/login': {
        post: {
          tags: ['Auth'],
          summary: 'Login user',
          description: 'Authenticate user and return JWT token',
          security: [],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['username', 'password'],
                  properties: {
                    username: { type: 'string' },
                    password: { type: 'string', format: 'password' },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: 'Login successful',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      token: { type: 'string' },
                      user: { $ref: '#/components/schemas/User' },
                    },
                  },
                },
              },
            },
            401: {
              description: 'Invalid credentials',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
          },
        },
      },
      '/api/auth/register/invite': {
        post: {
          tags: ['Auth'],
          summary: 'Register with invitation',
          description: 'Register a new user with an invitation token',
          security: [],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['token', 'username', 'password'],
                  properties: {
                    token: { type: 'string' },
                    username: { type: 'string' },
                    password: { type: 'string', format: 'password' },
                  },
                },
              },
            },
          },
          responses: {
            201: {
              description: 'Registration successful',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      token: { type: 'string' },
                      user: { $ref: '#/components/schemas/User' },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/api/auth/me': {
        get: {
          tags: ['Auth'],
          summary: 'Get current user',
          description: 'Get currently authenticated user information',
          responses: {
            200: {
              description: 'User information',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/User' },
                },
              },
            },
            401: {
              description: 'Unauthorized',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
          },
        },
      },
      '/api/recipes': {
        get: {
          tags: ['Recipes'],
          summary: 'Get all recipes',
          description: 'Retrieve all recipes for the authenticated user',
          parameters: [
            {
              in: 'query',
              name: 'search',
              schema: { type: 'string' },
              description: 'Search recipes by title or ingredients',
            },
            {
              in: 'query',
              name: 'category',
              schema: { type: 'string' },
              description: 'Filter by category',
            },
            {
              in: 'query',
              name: 'tag',
              schema: { type: 'string' },
              description: 'Filter by tag',
            },
          ],
          responses: {
            200: {
              description: 'List of recipes',
              content: {
                'application/json': {
                  schema: {
                    type: 'array',
                    items: { $ref: '#/components/schemas/Recipe' },
                  },
                },
              },
            },
          },
        },
        post: {
          tags: ['Recipes'],
          summary: 'Create recipe',
          description: 'Create a new recipe',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['title', 'instructions'],
                  properties: {
                    title: { type: 'string' },
                    description: { type: 'string' },
                    servings: { type: 'number' },
                    prepTime: { type: 'number' },
                    cookTime: { type: 'number' },
                    difficulty: { type: 'string', enum: ['easy', 'medium', 'hard'] },
                    instructions: { type: 'array', items: { type: 'string' } },
                    ingredients: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          quantity: { type: 'number' },
                          unit: { type: 'string' },
                          name: { type: 'string' },
                          notes: { type: 'string' },
                          section: { type: 'string' },
                        },
                      },
                    },
                    categories: { type: 'array', items: { type: 'string' } },
                    tags: { type: 'array', items: { type: 'string' } },
                  },
                },
              },
            },
          },
          responses: {
            201: {
              description: 'Recipe created',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Recipe' },
                },
              },
            },
          },
        },
      },
      '/api/recipes/{id}': {
        get: {
          tags: ['Recipes'],
          summary: 'Get recipe by ID',
          description: 'Retrieve a specific recipe',
          parameters: [
            {
              in: 'path',
              name: 'id',
              required: true,
              schema: { type: 'string', format: 'uuid' },
              description: 'Recipe ID',
            },
          ],
          responses: {
            200: {
              description: 'Recipe details',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Recipe' },
                },
              },
            },
            404: {
              description: 'Recipe not found',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
          },
        },
        put: {
          tags: ['Recipes'],
          summary: 'Update recipe',
          description: 'Update an existing recipe',
          parameters: [
            {
              in: 'path',
              name: 'id',
              required: true,
              schema: { type: 'string', format: 'uuid' },
              description: 'Recipe ID',
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    title: { type: 'string' },
                    description: { type: 'string' },
                    servings: { type: 'number' },
                    prepTime: { type: 'number' },
                    cookTime: { type: 'number' },
                    difficulty: { type: 'string', enum: ['easy', 'medium', 'hard'] },
                    instructions: { type: 'array', items: { type: 'string' } },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: 'Recipe updated',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Recipe' },
                },
              },
            },
          },
        },
        delete: {
          tags: ['Recipes'],
          summary: 'Delete recipe',
          description: 'Delete a recipe',
          parameters: [
            {
              in: 'path',
              name: 'id',
              required: true,
              schema: { type: 'string', format: 'uuid' },
              description: 'Recipe ID',
            },
          ],
          responses: {
            204: {
              description: 'Recipe deleted',
            },
            404: {
              description: 'Recipe not found',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
          },
        },
      },
      '/api/recipes/generate': {
        post: {
          tags: ['Recipes', 'AI'],
          summary: 'Generate recipe with AI',
          description: 'Generate a new recipe using AI based on a prompt',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['prompt'],
                  properties: {
                    prompt: { type: 'string', description: 'Recipe description or idea' },
                    ingredients: {
                      type: 'array',
                      items: { type: 'string' },
                      description: 'Ingredients to include',
                    },
                    dietary: {
                      type: 'array',
                      items: { type: 'string' },
                      description: 'Dietary restrictions',
                    },
                    cuisine: { type: 'string', description: 'Cuisine type' },
                    servings: { type: 'number', description: 'Number of servings' },
                  },
                },
              },
            },
          },
          responses: {
            201: {
              description: 'Recipe generated and created',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Recipe' },
                },
              },
            },
            400: {
              description: 'AI provider not configured',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
          },
        },
      },
      '/api/recipes/detect-ingredients': {
        post: {
          tags: ['Recipes', 'AI'],
          summary: 'Detect ingredients from image',
          description: 'Use AI vision to detect ingredients in an uploaded image',
          requestBody: {
            required: true,
            content: {
              'multipart/form-data': {
                schema: {
                  type: 'object',
                  required: ['image'],
                  properties: {
                    image: {
                      type: 'string',
                      format: 'binary',
                      description: 'Image file (PNG, JPG, WebP)',
                    },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: 'Ingredients detected',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      ingredients: {
                        type: 'array',
                        items: { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
            400: {
              description: 'Invalid request or AI provider not configured',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
          },
        },
      },
      '/api/recipes/extract-from-images': {
        post: {
          tags: ['Recipes', 'AI'],
          summary: 'Extract recipe from images',
          description: 'Extract recipe information from uploaded images using AI vision',
          requestBody: {
            required: true,
            content: {
              'multipart/form-data': {
                schema: {
                  type: 'object',
                  required: ['files'],
                  properties: {
                    files: {
                      type: 'array',
                      items: {
                        type: 'string',
                        format: 'binary',
                      },
                      maxItems: 5,
                      description: 'Image files (PNG, JPG, WebP) - max 5 files',
                    },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: 'Recipe extracted (not saved)',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      title: { type: 'string' },
                      description: { type: 'string' },
                      instructions: { type: 'array', items: { type: 'string' } },
                      ingredients: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            quantity: { type: 'number' },
                            unit: { type: 'string' },
                            name: { type: 'string' },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/api/ai/config': {
        get: {
          tags: ['AI'],
          summary: 'Get AI configuration',
          description: 'Get current AI provider configuration',
          responses: {
            200: {
              description: 'AI configuration',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/AIConfig' },
                },
              },
            },
          },
        },
        post: {
          tags: ['AI'],
          summary: 'Create AI configuration',
          description: 'Configure AI provider settings',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['provider', 'apiKey'],
                  properties: {
                    provider: { type: 'string', enum: ['openai', 'anthropic', 'google', 'ollama', 'openrouter'] },
                    apiKey: { type: 'string' },
                    model: { type: 'string' },
                    baseUrl: { type: 'string' },
                    enabled: { type: 'boolean' },
                  },
                },
              },
            },
          },
          responses: {
            201: {
              description: 'AI configuration created',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/AIConfig' },
                },
              },
            },
          },
        },
        put: {
          tags: ['AI'],
          summary: 'Update AI configuration',
          description: 'Update AI provider settings',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    provider: { type: 'string', enum: ['openai', 'anthropic', 'google', 'ollama', 'openrouter'] },
                    apiKey: { type: 'string' },
                    model: { type: 'string' },
                    baseUrl: { type: 'string' },
                    enabled: { type: 'boolean' },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: 'AI configuration updated',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/AIConfig' },
                },
              },
            },
          },
        },
      },
      '/api/ai/config/test': {
        post: {
          tags: ['AI'],
          summary: 'Test AI connection',
          description: 'Test the connection to the configured AI provider',
          responses: {
            200: {
              description: 'Test result',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      message: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/api/meal-plans': {
        get: {
          tags: ['Meal Plans'],
          summary: 'Get all meal plans',
          description: 'Retrieve all meal plans for the authenticated user',
          responses: {
            200: {
              description: 'List of meal plans',
              content: {
                'application/json': {
                  schema: {
                    type: 'array',
                    items: { $ref: '#/components/schemas/MealPlan' },
                  },
                },
              },
            },
          },
        },
        post: {
          tags: ['Meal Plans'],
          summary: 'Create meal plan',
          description: 'Create a new meal plan',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['name', 'startDate', 'endDate'],
                  properties: {
                    name: { type: 'string' },
                    description: { type: 'string' },
                    startDate: { type: 'string', format: 'date' },
                    endDate: { type: 'string', format: 'date' },
                  },
                },
              },
            },
          },
          responses: {
            201: {
              description: 'Meal plan created',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/MealPlan' },
                },
              },
            },
          },
        },
      },
      '/api/shopping-lists': {
        get: {
          tags: ['Shopping Lists'],
          summary: 'Get all shopping lists',
          description: 'Retrieve all shopping lists for the authenticated user',
          responses: {
            200: {
              description: 'List of shopping lists',
              content: {
                'application/json': {
                  schema: {
                    type: 'array',
                    items: { $ref: '#/components/schemas/ShoppingList' },
                  },
                },
              },
            },
          },
        },
        post: {
          tags: ['Shopping Lists'],
          summary: 'Create shopping list',
          description: 'Create a new shopping list',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['name'],
                  properties: {
                    name: { type: 'string' },
                    notes: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            201: {
              description: 'Shopping list created',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ShoppingList' },
                },
              },
            },
          },
        },
      },
      '/api/pantry': {
        get: {
          tags: ['Pantry'],
          summary: 'Get all pantry items',
          description: 'Retrieve all pantry items for the authenticated user',
          responses: {
            200: {
              description: 'List of pantry items',
              content: {
                'application/json': {
                  schema: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        id: { type: 'string', format: 'uuid' },
                        name: { type: 'string' },
                        quantity: { type: 'number' },
                        unit: { type: 'string' },
                        category: { type: 'string' },
                        expirationDate: { type: 'string', format: 'date', nullable: true },
                        location: { type: 'string', nullable: true },
                        lowStockThreshold: { type: 'number', nullable: true },
                        isLowStock: { type: 'boolean' },
                        notes: { type: 'string', nullable: true },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        post: {
          tags: ['Pantry'],
          summary: 'Add pantry item',
          description: 'Add a new item to pantry',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['name', 'quantity'],
                  properties: {
                    name: { type: 'string' },
                    quantity: { type: 'number' },
                    unit: { type: 'string' },
                    category: { type: 'string' },
                    expirationDate: { type: 'string', format: 'date' },
                    location: { type: 'string' },
                    lowStockThreshold: { type: 'number' },
                    notes: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            201: {
              description: 'Pantry item created',
            },
          },
        },
      },
      '/api/pantry/expiring': {
        get: {
          tags: ['Pantry'],
          summary: 'Get expiring items',
          description: 'Get pantry items expiring soon',
          responses: {
            200: {
              description: 'List of expiring items',
            },
          },
        },
      },
      '/api/pantry/low-stock': {
        get: {
          tags: ['Pantry'],
          summary: 'Get low stock items',
          description: 'Get pantry items that are low in stock',
          responses: {
            200: {
              description: 'List of low stock items',
            },
          },
        },
      },
      '/api/batch-cooking': {
        get: {
          tags: ['Batch Cooking'],
          summary: 'Get all batch cooking plans',
          description: 'Retrieve all batch cooking plans for the authenticated user',
          responses: {
            200: {
              description: 'List of batch cooking plans',
            },
          },
        },
        post: {
          tags: ['Batch Cooking'],
          summary: 'Create batch cooking plan',
          description: 'Create a new batch cooking plan',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['recipeId', 'name', 'cookingDate', 'batches', 'servingsPerBatch'],
                  properties: {
                    recipeId: { type: 'string', format: 'uuid' },
                    name: { type: 'string' },
                    description: { type: 'string' },
                    cookingDate: { type: 'string', format: 'date' },
                    batches: { type: 'number', minimum: 1, maximum: 20 },
                    servingsPerBatch: { type: 'number', minimum: 1 },
                    storageMethod: { type: 'string', enum: ['refrigerate', 'freeze', 'pantry'] },
                    storageDuration: { type: 'number' },
                    reheatingInstructions: { type: 'string' },
                    prepNotes: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            201: {
              description: 'Batch cooking plan created',
            },
          },
        },
      },
      '/api/batch-cooking/suggestions': {
        get: {
          tags: ['Batch Cooking'],
          summary: 'Get batch cooking suggestions',
          description: 'Get AI-powered suggestions for batch cooking recipes',
          responses: {
            200: {
              description: 'List of suggested recipes for batch cooking',
            },
          },
        },
      },
      '/api/batch-cooking/analytics': {
        get: {
          tags: ['Batch Cooking'],
          summary: 'Get batch cooking analytics',
          description: 'Get analytics and statistics for batch cooking activities',
          responses: {
            200: {
              description: 'Batch cooking analytics data',
            },
          },
        },
      },
      '/api/batch-cooking/{id}/status': {
        patch: {
          tags: ['Batch Cooking'],
          summary: 'Update batch plan status',
          description: 'Update the status of a batch cooking plan',
          parameters: [
            {
              in: 'path',
              name: 'id',
              required: true,
              schema: { type: 'string', format: 'uuid' },
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['status'],
                  properties: {
                    status: { type: 'string', enum: ['planned', 'in-progress', 'completed'] },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: 'Status updated',
            },
          },
        },
      },
      '/api/batch-cooking/{id}/shopping-list': {
        post: {
          tags: ['Batch Cooking'],
          summary: 'Create shopping list from batch plan',
          description: 'Generate a shopping list from a batch cooking plan',
          parameters: [
            {
              in: 'path',
              name: 'id',
              required: true,
              schema: { type: 'string', format: 'uuid' },
            },
          ],
          responses: {
            201: {
              description: 'Shopping list created',
            },
          },
        },
      },
      '/api/gamification/stats': {
        get: {
          tags: ['Gamification'],
          summary: 'Get user stats',
          description: 'Get gamification statistics for the authenticated user',
          responses: {
            200: {
              description: 'User stats',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      totalRecipes: { type: 'number' },
                      totalMealsCooked: { type: 'number' },
                      currentStreak: { type: 'number' },
                      longestStreak: { type: 'number' },
                      level: { type: 'number' },
                      experiencePoints: { type: 'number' },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/api/gamification/achievements': {
        get: {
          tags: ['Gamification'],
          summary: 'Get user achievements',
          description: 'Get achievements earned by the authenticated user',
          responses: {
            200: {
              description: 'List of user achievements',
            },
          },
        },
      },
      '/api/gamification/achievements/progress': {
        get: {
          tags: ['Gamification'],
          summary: 'Get achievement progress',
          description: 'Get progress on all achievements (completed, in-progress, available)',
          responses: {
            200: {
              description: 'Achievement progress data',
            },
          },
        },
      },
      '/api/gamification/achievements/all': {
        get: {
          tags: ['Gamification'],
          summary: 'Get all achievement definitions',
          description: 'Get all available achievement definitions',
          responses: {
            200: {
              description: 'List of all achievements',
            },
          },
        },
      },
      '/api/gamification/leaderboard': {
        get: {
          tags: ['Gamification'],
          summary: 'Get leaderboard',
          description: 'Get the gamification leaderboard',
          responses: {
            200: {
              description: 'Leaderboard data',
            },
          },
        },
      },
      '/api/gamification/record-meal': {
        post: {
          tags: ['Gamification'],
          summary: 'Record meal cooked',
          description: 'Manually record a meal cooked for tracking',
          responses: {
            201: {
              description: 'Meal recorded',
            },
          },
        },
      },
      '/api/analytics/summary': {
        get: {
          tags: ['Analytics'],
          summary: 'Get analytics summary',
          description: 'Get summary of cooking analytics and statistics',
          responses: {
            200: {
              description: 'Analytics summary',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      totalRecipes: { type: 'number' },
                      totalMealsCooked: { type: 'number' },
                      avgMealsPerWeek: { type: 'number' },
                      topCategories: { type: 'array', items: { type: 'object' } },
                      topIngredients: { type: 'array', items: { type: 'object' } },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/api/analytics/history': {
        get: {
          tags: ['Analytics'],
          summary: 'Get meal history',
          description: 'Get historical data of meals cooked',
          responses: {
            200: {
              description: 'Meal history data',
            },
          },
        },
      },
      '/api/users': {
        get: {
          tags: ['Users'],
          summary: 'Get all users',
          description: 'Get list of all users (admin only)',
          responses: {
            200: {
              description: 'List of users',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      users: {
                        type: 'array',
                        items: { $ref: '#/components/schemas/User' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        post: {
          tags: ['Users'],
          summary: 'Create a new user',
          description: 'Create a new user account (admin only)',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['email', 'username', 'firstName', 'lastName'],
                  properties: {
                    email: { type: 'string', format: 'email' },
                    username: { type: 'string' },
                    firstName: { type: 'string' },
                    lastName: { type: 'string' },
                    role: { type: 'string', enum: ['admin', 'user'], default: 'user' },
                  },
                },
              },
            },
          },
          responses: {
            201: {
              description: 'User created successfully',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      user: { $ref: '#/components/schemas/User' },
                      generatedPassword: { type: 'string', description: 'Auto-generated password for the new user' },
                    },
                  },
                },
              },
            },
            400: {
              description: 'Invalid input or user already exists',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
          },
        },
      },
      '/api/users/username-suggestions': {
        get: {
          tags: ['Users'],
          summary: 'Get username suggestions',
          description: 'Get username suggestions based on first and last name (admin only)',
          parameters: [
            {
              in: 'query',
              name: 'firstName',
              required: true,
              schema: { type: 'string' },
              description: 'First name for username generation',
            },
            {
              in: 'query',
              name: 'lastName',
              required: true,
              schema: { type: 'string' },
              description: 'Last name for username generation',
            },
          ],
          responses: {
            200: {
              description: 'List of username suggestions',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      suggestions: {
                        type: 'array',
                        items: { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/api/users/{userId}/role': {
        patch: {
          tags: ['Users'],
          summary: 'Update user role',
          description: 'Update a user\'s role (admin only)',
          parameters: [
            {
              in: 'path',
              name: 'userId',
              required: true,
              schema: { type: 'string', format: 'uuid' },
              description: 'User ID',
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['role'],
                  properties: {
                    role: { type: 'string', enum: ['admin', 'user'] },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: 'User role updated successfully',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      user: { $ref: '#/components/schemas/User' },
                    },
                  },
                },
              },
            },
            400: {
              description: 'Invalid input',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
          },
        },
      },
      '/api/users/{userId}': {
        delete: {
          tags: ['Users'],
          summary: 'Delete a user',
          description: 'Delete a user account (admin only)',
          parameters: [
            {
              in: 'path',
              name: 'userId',
              required: true,
              schema: { type: 'string', format: 'uuid' },
              description: 'User ID',
            },
          ],
          responses: {
            204: {
              description: 'User deleted successfully',
            },
            400: {
              description: 'Cannot delete user',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
          },
        },
      },
      '/api/preferences': {
        get: {
          tags: ['Preferences'],
          summary: 'Get user preferences',
          description: 'Get current user\'s dietary preferences',
          responses: {
            200: {
              description: 'User preferences',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/UserPreferences' },
                },
              },
            },
          },
        },
        put: {
          tags: ['Preferences'],
          summary: 'Update user preferences',
          description: 'Update current user\'s dietary preferences',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    dietaryRestrictions: { type: 'array', items: { type: 'string' } },
                    allergies: { type: 'array', items: { type: 'string' } },
                    dislikes: { type: 'array', items: { type: 'string' } },
                    favorites: { type: 'array', items: { type: 'string' } },
                    preferredCuisines: { type: 'array', items: { type: 'string' } },
                    skillLevel: { type: 'string', enum: ['beginner', 'intermediate', 'advanced'] },
                    maxCookingTime: { type: 'number', description: 'Maximum cooking time in minutes' },
                    householdSize: { type: 'number' },
                    spiceTolerance: { type: 'string', enum: ['none', 'mild', 'medium', 'hot', 'very-hot'] },
                    budgetLevel: { type: 'string', enum: ['budget', 'moderate', 'splurge'] },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: 'Preferences updated successfully',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/UserPreferences' },
                },
              },
            },
          },
        },
        delete: {
          tags: ['Preferences'],
          summary: 'Delete user preferences',
          description: 'Delete current user\'s dietary preferences',
          responses: {
            204: {
              description: 'Preferences deleted successfully',
            },
          },
        },
      },
      '/api/preferences/check-compatibility': {
        post: {
          tags: ['Preferences'],
          summary: 'Check recipe compatibility',
          description: 'Check if a recipe is compatible with user\'s dietary preferences',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    recipeTags: {
                      type: 'array',
                      items: { type: 'string' },
                      description: 'Recipe tags (e.g., vegetarian, gluten-free)',
                    },
                    recipeIngredients: {
                      type: 'array',
                      items: { type: 'string' },
                      description: 'List of ingredient names in the recipe',
                    },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: 'Compatibility check result',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      compatible: { type: 'boolean' },
                      warnings: {
                        type: 'array',
                        items: { type: 'string' },
                        description: 'List of compatibility warnings',
                      },
                      conflicts: {
                        type: 'array',
                        items: { type: 'string' },
                        description: 'List of conflicts with allergies or restrictions',
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/api/settings/data/seed': {
        post: {
          tags: ['Settings'],
          summary: 'Seed sample data',
          description: 'Add sample recipes and data to your account',
          responses: {
            200: {
              description: 'Sample data added successfully',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/api/settings/data/reset': {
        post: {
          tags: ['Settings'],
          summary: 'Reset data to sample data',
          description: 'Clear all user data and reload sample data',
          responses: {
            200: {
              description: 'Data reset successfully',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/api/settings/data/clear': {
        delete: {
          tags: ['Settings'],
          summary: 'Clear all user data',
          description: 'Delete all recipes, meal plans, shopping lists, and other user data',
          responses: {
            200: {
              description: 'All data cleared successfully',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  apis: [],
};

export const swaggerSpec = swaggerJsdoc(options);

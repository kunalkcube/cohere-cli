// Cohere API service

/**
 * Fetch available models from Cohere API
 * @param {string} apiKey - Cohere API key
 * @returns {Promise<Array>} - Array of available models
 */
async function fetchModels(apiKey) {
  try {
    const response = await fetch('https://api.cohere.ai/v1/models', {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`API Error: ${errorData.message || response.statusText}`);
    }

    const data = await response.json();

    // Filter for models that support chat or generate endpoints
    const supportedModels = data.models.filter(model =>
      model.endpoints.includes('chat') ||
      model.endpoints.includes('generate')
    );

    return supportedModels;
  } catch (error) {
    throw new Error(`Failed to fetch models: ${error.message}`);
  }
}

/**
 * Chat with Cohere AI using the chat endpoint
 * @param {string} apiKey - Cohere API key
 * @param {Object} options - Chat options
 * @returns {Promise<Object>} - Chat response
 */
async function chatWithCohere(apiKey, options) {
  const {
    model,
    message,
    chatHistory = [],
    temperature = 0.7,
    maxTokens = 2048
  } = options;

  // System prompt for code block formatting
  const systemPrompt = `You are Cohere CLI Assistant, a helpful AI assistant accessed through a command-line interface.
Your goal is to provide helpful, accurate, and concise responses to user queries.
When providing code, always use code blocks with appropriate syntax highlighting and filenames.
Format code as: \`\`\`[language] filename="[name.ext]"\n[code]\n\`\`\`
You excel at helping with programming tasks, explaining concepts, and providing information.
You should be concise but thorough, focusing on clarity and accuracy in your responses.`;

  try {
    const response = await fetch('https://api.cohere.ai/v1/chat', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: model,
        message: message,
        chat_history: [
          {
            role: 'system',
            message: systemPrompt
          },
          ...chatHistory.map(msg => ({
            role: msg.type === 'user' ? 'user' : 'chatbot',
            message: msg.text
          }))
        ],
        temperature: parseFloat(temperature),
        max_tokens: parseInt(maxTokens)
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`API Error: ${errorData.message || response.statusText}`);
    }

    const data = await response.json();

    return {
      text: data.text,
      type: 'assistant',
      meta: data.meta,
      citations: data.citations,
      documents: data.documents
    };
  } catch (error) {
    throw new Error(`Chat error: ${error.message}`);
  }
}

/**
 * Generate text with Cohere AI using the generate endpoint
 * @param {string} apiKey - Cohere API key
 * @param {Object} options - Generate options
 * @returns {Promise<Object>} - Generate response
 */
async function generateWithCohere(apiKey, options) {
  const {
    model,
    prompt,
    temperature = 0.7,
    maxTokens = 2048
  } = options;

  try {
    const response = await fetch('https://api.cohere.ai/v1/generate', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: model,
        prompt: prompt,
        temperature: parseFloat(temperature),
        max_tokens: parseInt(maxTokens),
        return_likelihoods: 'NONE'
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`API Error: ${errorData.message || response.statusText}`);
    }

    const data = await response.json();

    return {
      text: data.generations[0].text,
      type: 'assistant',
      meta: {
        token_count: {
          prompt_tokens: data.meta.prompt_tokens || 0,
          completion_tokens: data.meta.completion_tokens || 0
        },
        model: data.meta.model || model
      }
    };
  } catch (error) {
    throw new Error(`Generate error: ${error.message}`);
  }
}

module.exports = {
  fetchModels,
  chatWithCohere,
  generateWithCohere
};

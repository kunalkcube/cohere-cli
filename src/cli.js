const chalk = require('chalk');
const inquirer = require('inquirer');
const figlet = require('figlet');
const gradient = require('gradient-string');
const boxen = require('boxen');
const ora = require('ora');
const { table } = require('table');
const MarkdownIt = require('markdown-it');
const md = new MarkdownIt();
const highlight = require('cli-highlight').highlight;
const he = require('he');

const {
  fetchModels,
  chatWithCohere,
  generateWithCohere
} = require('./cohere');

// Define color theme
const primaryGradient = gradient(['#3b5af0', '#35a6f0', '#5ad0f0']);
const secondaryGradient = gradient(['#f04f4b', '#f05f30', '#f08a2e']);

// CLI state
let messages = [];
let selectedModel = 'command-r7b-12-2024';
let modelType = 'chat';
let temperature = 0.7;
let maxTokens = 2048;
let includeChatHistory = true;
let recentFiles = [];

// Display the ASCII logo
function displayLogo() {
  console.log('\n');
  console.log(
    primaryGradient(
      figlet.textSync('Cohere CLI', {
        font: 'ANSI Shadow',
        horizontalLayout: 'default',
        verticalLayout: 'default',
      })
    )
  );
  console.log('\n');
}

// Format the response in a beautiful box
function formatHeaderBar() {
  const now = new Date();
  const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return boxen(
    `${chalk.cyanBright.bold('Model')}: ${chalk.white(selectedModel)}  ` +
    `${chalk.magentaBright('Type')}: ${chalk.white(modelType)}  ` +
    `${chalk.yellow('Temp')}: ${chalk.white(temperature)}  ` +
    `${chalk.green('MaxTokens')}: ${chalk.white(maxTokens)}  ` +
    `${chalk.blue('History')}: ${chalk.white(includeChatHistory ? 'On' : 'Off')}  ` +
    `${chalk.gray('[' + time + ']')}`,
    {
      padding: { left: 2, right: 2, top: 0, bottom: 0 },
      margin: 0,
      borderStyle: 'doubleSingle',
      borderColor: 'cyan',
      backgroundColor: '#232946',
      title: chalk.bold('Cohere AI Session'),
      titleAlignment: 'left',
    }
  );
}

function formatUserMessage(message) {
  const now = new Date();
  const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return boxen(
    `${chalk.bold('🧑 You')} ${chalk.gray('[' + time + ']')}\n\n${chalk.white(message)}`,
    {
      padding: 1,
      margin: { top: 1, bottom: 0, left: 0, right: 0 },
      borderStyle: 'doubleSingle',
      borderColor: 'white',
      backgroundColor: '#212121',
      title: chalk.white.bold('User'),
      titleAlignment: 'left',
    }
  );
}

function formatAssistantMessage(response) {
  // Get the raw text
  let rawText = response.text || response.message || '';
  rawText = he.decode(rawText);
  const tokens = md.parse(rawText, {});
  let output = '';
  for (const token of tokens) {
    if (token.type === 'fence') {
      // Only use the first word as the language for highlighting
      const lang = (token.info.trim().split(' ')[0] || 'plaintext');
      let highlighted = highlight(token.content, { language: lang, ignoreIllegals: true });
      highlighted = highlighted.split('\n').map(line => chalk.gray('│ ') + line).join('\n');
      output += `\n${chalk.bgGray.black(` ${lang.toUpperCase()} `)}\n` + highlighted + '\n';
    } else if (token.type === 'code_inline') {
      output += chalk.bgBlackBright.white(` ${token.content} `);
    } else if (token.type === 'paragraph_open' || token.type === 'paragraph_close') {
      // skip
    } else if (token.type === 'text') {
      output += token.content;
    } else if (token.type === 'heading_open') {
      output += '\n' + chalk.bold.underline('');
    } else if (token.type === 'heading_close') {
      output += '\n';
    } else if (token.type === 'bullet_list_open' || token.type === 'ordered_list_open') {
      output += '\n';
    } else if (token.type === 'list_item_open') {
      output += '  • ';
    } else if (token.type === 'list_item_close') {
      output += '\n';
    } else if (token.type === 'softbreak' || token.type === 'hardbreak') {
      output += '\n';
    } else if (token.type === 'strong_open') {
      output += chalk.bold('');
    } else if (token.type === 'strong_close') {
      // skip
    } else if (token.type === 'em_open') {
      output += chalk.italic('');
    } else if (token.type === 'em_close') {
      // skip
    } else {
      if (token.content) output += token.content;
    }
  }
  // Add token usage if available
  let usageInfo = '';
  if (response.meta && response.meta.token_count) {
    const { prompt_tokens, completion_tokens } = response.meta.token_count;
    const totalTokens = prompt_tokens + completion_tokens;
    usageInfo = chalk.dim(`\nTokens: ${prompt_tokens} prompt + ${completion_tokens} completion = ${totalTokens} total`);
  }
  // Format citations if available
  let citationsText = '';
  if (response.citations && response.citations.length > 0) {
    citationsText = '\n\n' + chalk.bold('Citations:') + '\n';
    const citationData = response.citations.map((citation, index) => [
      chalk.yellow(`[${index + 1}]`),
      citation.title || 'Unknown source',
      citation.url || 'No URL'
    ]);
    citationsText += table(citationData, {
      border: {
        topBody: chalk.dim('─'),
        topJoin: chalk.dim('┬'),
        topLeft: chalk.dim('┌'),
        topRight: chalk.dim('┐'),
        bottomBody: chalk.dim('─'),
        bottomJoin: chalk.dim('┴'),
        bottomLeft: chalk.dim('└'),
        bottomRight: chalk.dim('┘'),
        bodyLeft: chalk.dim('│'),
        bodyRight: chalk.dim('│'),
        bodyJoin: chalk.dim('│'),
        joinBody: chalk.dim('─'),
        joinLeft: chalk.dim('├'),
        joinRight: chalk.dim('┤'),
        joinJoin: chalk.dim('┼')
      }
    });
  }
  const now = new Date();
  const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return boxen(
    `${chalk.bold('🤖 Cohere')} ${chalk.gray('[' + time + ']')}\n\n${output.trim()}${usageInfo}${citationsText}`,
    {
      padding: 1,
      margin: { top: 1, bottom: 1, left: 0, right: 0 },
      borderStyle: 'doubleSingle',
      borderColor: 'cyan',
      backgroundColor: '#181c24',
      title: chalk.cyanBright.bold('Cohere'),
      titleAlignment: 'left',
    }
  );
}

function formatFooterBar() {
  return boxen(
    chalk.gray('Commands: ') +
    chalk.cyan('help') + '  ' +
    chalk.cyan('model') + '  ' +
    chalk.cyan('clear') + '  ' +
    chalk.cyan('settings') + '  ' +
    chalk.cyan('exit'),
    {
      padding: { left: 2, right: 2, top: 0, bottom: 0 },
      margin: { top: 1, bottom: 0, left: 0, right: 0 },
      borderStyle: 'classic',
      borderColor: 'gray',
      backgroundColor: '#232946',
    }
  );
}

// Main formatResponse (assistant message)
function formatResponse(response, userMessage) {
  console.log(formatHeaderBar());
  if (userMessage) {
    console.log(formatUserMessage(userMessage));
  }
  console.log(formatAssistantMessage(response));
  console.log(formatFooterBar());
  return '';
}

// Process special commands
function processCommand(input, apiKey) {
  const input_lower = input.toLowerCase().trim();

  if (input_lower === 'clear') {
    messages = [];
    console.log(chalk.yellow('✨ Chat history cleared'));
    return true;
  }

  if (input_lower === 'help') {
    displayHelp();
    return true;
  }

  if (input_lower === 'model') {
    selectModelInteractive(apiKey);
    return true;
  }

  if (input_lower === 'settings') {
    displaySettings();
    return true;
  }

  if (input_lower.startsWith('model:')) {
    const newModel = input_lower.substring(6).trim();
    selectedModel = newModel;
    console.log(chalk.green(`Model switched to: ${selectedModel}`));
    return true;
  }

  if (input_lower.startsWith('temp:')) {
    const newTemp = parseFloat(input_lower.substring(5).trim());
    if (!isNaN(newTemp) && newTemp >= 0 && newTemp <= 1) {
      temperature = newTemp;
      console.log(chalk.green(`Temperature set to: ${temperature}`));
    } else {
      console.log(chalk.red('Temperature must be a number between 0 and 1'));
    }
    return true;
  }

  if (input_lower.startsWith('tokens:')) {
    const newTokens = parseInt(input_lower.substring(7).trim());
    if (!isNaN(newTokens) && newTokens > 0) {
      maxTokens = newTokens;
      console.log(chalk.green(`Max tokens set to: ${maxTokens}`));
    } else {
      console.log(chalk.red('Max tokens must be a positive number'));
    }
    return true;
  }

  if (input_lower === 'history:on') {
    includeChatHistory = true;
    console.log(chalk.green('Chat history enabled'));
    return true;
  }

  if (input_lower === 'history:off') {
    includeChatHistory = false;
    console.log(chalk.green('Chat history disabled'));
    return true;
  }

  return false;
}

// Display help information
function displayHelp() {
  const helpRows = [
    [chalk.cyan('help'), 'Show this help'],
    [chalk.cyan('clear'), 'Clear chat history'],
    [chalk.cyan('model'), 'Open interactive model selection'],
    [chalk.cyan('model:<name>'), 'Switch to a specific model'],
    [chalk.cyan('temp:<value>'), 'Set temperature (0-1)'],
    [chalk.cyan('tokens:<value>'), 'Set max token limit'],
    [chalk.cyan('history:on'), 'Enable chat history'],
    [chalk.cyan('history:off'), 'Disable chat history'],
    [chalk.cyan('settings'), 'Show current settings'],
    [chalk.cyan('exit'), 'Exit the CLI']
  ];
  const helpTable = table(helpRows, {
    border: {
      topBody: chalk.dim('─'),
      topJoin: chalk.dim('┬'),
      topLeft: chalk.dim('┌'),
      topRight: chalk.dim('┐'),
      bottomBody: chalk.dim('─'),
      bottomJoin: chalk.dim('┴'),
      bottomLeft: chalk.dim('└'),
      bottomRight: chalk.dim('┘'),
      bodyLeft: chalk.dim('│'),
      bodyRight: chalk.dim('│'),
      bodyJoin: chalk.dim('│'),
      joinBody: chalk.dim('─'),
      joinLeft: chalk.dim('├'),
      joinRight: chalk.dim('┤'),
      joinJoin: chalk.dim('┼')
    },
    columnDefault: { alignment: 'left' },
    drawHorizontalLine: (idx, size) => idx === 0 || idx === size
  });
  const header = secondaryGradient('💡 Cohere CLI Help');
  console.log(boxen(header + '\n' + helpTable, {
    padding: 1,
    margin: { top: 1, bottom: 1, left: 0, right: 0 },
    borderStyle: 'classic',
    borderColor: 'yellow',
    title: chalk.yellowBright.bold('Help'),
    titleAlignment: 'left',
    backgroundColor: '#232946'
  }));
}

// Display current settings
function displaySettings() {
  const settingsRows = [
    [chalk.cyan('Model'), chalk.white(selectedModel || 'Not selected')],
    [chalk.cyan('Type'), chalk.white(modelType || 'Not determined')],
    [chalk.cyan('Temperature'), chalk.white(temperature)],
    [chalk.cyan('Max Tokens'), chalk.white(maxTokens)],
    [chalk.cyan('Chat History'), includeChatHistory ? chalk.green('Enabled') : chalk.red('Disabled')],
  ];
  const settingsTable = table(settingsRows, {
    border: {
      topBody: chalk.dim('─'),
      topJoin: chalk.dim('┬'),
      topLeft: chalk.dim('┌'),
      topRight: chalk.dim('┐'),
      bottomBody: chalk.dim('─'),
      bottomJoin: chalk.dim('┴'),
      bottomLeft: chalk.dim('└'),
      bottomRight: chalk.dim('┘'),
      bodyLeft: chalk.dim('│'),
      bodyRight: chalk.dim('│'),
      bodyJoin: chalk.dim('│'),
      joinBody: chalk.dim('─'),
      joinLeft: chalk.dim('├'),
      joinRight: chalk.dim('┤'),
      joinJoin: chalk.dim('┼')
    },
    columnDefault: { alignment: 'left' },
    drawHorizontalLine: (idx, size) => idx === 0 || idx === size
  });
  const header = primaryGradient('⚙️  Cohere CLI Settings');
  console.log(boxen(header + '\n' + settingsTable, {
    padding: 1,
    margin: { top: 1, bottom: 1, left: 0, right: 0 },
    borderStyle: 'classic',
    borderColor: 'green',
    title: chalk.greenBright.bold('Settings'),
    titleAlignment: 'left',
    backgroundColor: '#181c24'
  }));
}

// Select model interactively
async function selectModelInteractive(apiKey) {
  const spinner = ora(primaryGradient('Fetching available models...')).start();
  try {
    const models = await fetchModels(apiKey);
    spinner.succeed(primaryGradient('Models retrieved'));
    const chatModels = models.filter(model => model.endpoints.includes('chat'));
    const generateModels = models.filter(model => model.endpoints.includes('generate'));
    function formatModelName(model) {
      return `${chalk.bold(model.name)} ${chalk.gray('[' + (model.endpoints.includes('chat') ? 'chat' : 'gen') + ']')} ${model.description ? chalk.italic(model.description) : ''}`;
    }
    const choices = [
      new inquirer.Separator(primaryGradient(' — Chat Models — ')),
      ...chatModels.map(model => ({
        name: formatModelName(model),
        value: { id: model.name, type: 'chat' }
      })),
      new inquirer.Separator(primaryGradient(' — Generate Models — ')),
      ...generateModels.map(model => ({
        name: formatModelName(model),
        value: { id: model.name, type: 'generate' }
      }))
    ];
    const { model } = await inquirer.prompt([
      {
        type: 'list',
        name: 'model',
        message: primaryGradient('🧠 Select a model:'),
        choices: choices,
        pageSize: 15
      }
    ]);
    selectedModel = model.id;
    modelType = model.type;
    const boxMsg = boxen(
      `${chalk.greenBright('✔ Model set to:')}\n${chalk.bold(selectedModel)} (${chalk.cyan(modelType)})`,
      {
        padding: 1,
        margin: { top: 1, bottom: 1, left: 0, right: 0 },
        borderStyle: 'classic',
        borderColor: 'cyan',
        title: chalk.cyanBright('Model Selected'),
        titleAlignment: 'left',
        backgroundColor: '#181c24'
      }
    );
    console.log(boxMsg);
  } catch (error) {
    spinner.fail(secondaryGradient('Failed to fetch models'));
    console.error(boxen(chalk.red(`Error: ${error.message}`), {
      padding: 1,
      margin: { top: 1, bottom: 1, left: 0, right: 0 },
      borderStyle: 'classic',
      borderColor: 'red',
      backgroundColor: '#2a1b1b',
      title: chalk.redBright('Model Error'),
      titleAlignment: 'left'
    }));
  }
}

// Interactive chat function
async function interactiveChat(apiKey) {
  displayLogo();
  console.log(chalk.cyan('Welcome to Cohere CLI! Type "help" for available commands or "exit" to quit.\n'));

  // Fetch models at startup if no model was specified
  if (!selectedModel) {
    const spinner = ora('Fetching available models...').start();
    try {
      const models = await fetchModels(apiKey);
      spinner.succeed('Found available models');

      // Default to a chat model if available
      const defaultChatModel = models.find(model => model.endpoints.includes('chat'));
      if (defaultChatModel) {
        selectedModel = defaultChatModel.name;
        modelType = 'chat';
        console.log(chalk.green(`Using default model: ${selectedModel} (chat)`));
      } else {
        // Fall back to a generate model
        const defaultGenerateModel = models.find(model => model.endpoints.includes('generate'));
        if (defaultGenerateModel) {
          selectedModel = defaultGenerateModel.name;
          modelType = 'generate';
          console.log(chalk.green(`Using default model: ${selectedModel} (generate)`));
        } else {
          console.log(chalk.yellow('No default model found. Please use "model" command to select a model.'));
        }
      }
    } catch (error) {
      spinner.fail('Failed to fetch models');
      console.error(chalk.red(`Error: ${error.message}`));
    }
  }

  // Main chat loop
  while (true) {
    const { input } = await inquirer.prompt([
      {
        type: 'input',
        name: 'input',
        message: primaryGradient('You:'),
        prefix: '🧠'
      }
    ]);

    // Exit command
    if (input.toLowerCase() === 'exit') {
      console.log(chalk.yellow('👋 Goodbye!'));
      process.exit(0);
    }

    // Process commands
    if (processCommand(input, apiKey)) {
      continue;
    }

    // Add user message to history
    if (input.trim()) {
      // --- AI-Powered Edit Flow ---
      const editIntent = /\b(edit|update|modify|change|append|replace)\b/i;
      if (editIntent.test(input)) {
        // Try to extract filename from user input
        const fileMatch = input.match(/([\w\-.]+\.[\w\d]+)/);
        let fileToEdit = fileMatch ? fileMatch[1] : null;
        const fs = require('fs').promises;
        const path = require('path');
        // If not specified, prompt user to pick from recentFiles
        if (!fileToEdit) {
          if (recentFiles.length === 0) {
            console.log(chalk.red('No recent files to edit. Please specify a filename.'));
            return;
          }
          const resp = await inquirer.prompt([
            {
              type: 'list',
              name: 'fileToEdit',
              message: 'Which file do you want to edit?',
              choices: recentFiles
            }
          ]);
          fileToEdit = resp.fileToEdit;
        } else {
          // Try to resolve to a recent file path
          const found = recentFiles.find(f => f.endsWith(fileToEdit));
          if (found) fileToEdit = found;
        }
        // Read file content
        let fileContent = '';
        try {
          fileContent = await fs.readFile(fileToEdit, 'utf8');
        } catch (err) {
          console.log(chalk.red(`Could not read file: ${fileToEdit}`));
          return;
        }
        // Send edit request to AI
        const editPrompt = `You are an expert code editor. Edit the following file as per the user's request. If your response includes code, output the FULL updated file as a code block with the filename in the info string, e.g. \u0060\u0060\u0060python filename=\"app.py\". For explanations or non-code answers, use plain text only.\n\n---\nFilename: ${path.basename(fileToEdit)}\n\nCurrent content:\n\n${fileContent}\n\nUser request: ${input}`;
        const spinner = ora(secondaryGradient('Cohere is thinking...')).start();
        let aiEditResponse;
        try {
          if (modelType === 'chat') {
            aiEditResponse = await chatWithCohere(apiKey, {
              model: selectedModel,
              message: editPrompt,
              chatHistory: [],
              temperature,
              maxTokens
            });
          } else {
            aiEditResponse = await generateWithCohere(apiKey, {
              model: selectedModel,
              prompt: editPrompt,
              temperature,
              maxTokens
            });
          }
          spinner.succeed(secondaryGradient('Cohere (edit):'));
        } catch (err) {
          spinner.fail('Edit error');
          console.log(chalk.red(err.message));
          continue;
        }
        // Extract code block from AI response
        const editBlocks = extractCodeBlocks(aiEditResponse.text);
        if (!editBlocks.length) {
          console.log(chalk.red('No code block found in AI response.'));
          continue;
        }
        const updated = editBlocks[0];
        // If AI did not include filename, default to the file being edited
        if (!updated.filename) {
          updated.filename = path.basename(fileToEdit);
        }
        // Confirm overwrite
        const { confirm } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'confirm',
            message: `Overwrite ${fileToEdit} with AI-updated content?`,
            default: true
          }
        ]);
        if (confirm) {
          try {
            await fs.writeFile(fileToEdit, updated.code, 'utf8');
            console.log(chalk.green(`✔ Updated: ${fileToEdit}`));
          } catch (err) {
            console.log(chalk.red(`✖ Failed to update ${fileToEdit}: ${err.message}`));
          }
        } else {
          console.log(chalk.yellow('Edit canceled.'));
        }
        continue;
      }
      // --- End Edit Flow ---
      const userMessage = { type: 'user', text: input };
      messages.push(userMessage);

      // Get response from API
      const spinner = ora(secondaryGradient('Cohere is thinking...')).start();

      try {
        let response;

        if (!selectedModel) {
          spinner.fail('No model selected');
          console.log(chalk.yellow('Please select a model using the "model" command'));
          continue;
        }

        if (modelType === 'chat') {
          response = await chatWithCohere(apiKey, {
            model: selectedModel,
            message: input,
            chatHistory: includeChatHistory ? messages.slice(0, -1) : [],
            temperature,
            maxTokens
          });
        } else {
          response = await generateWithCohere(apiKey, {
            model: selectedModel,
            prompt: input,
            temperature,
            maxTokens
          });

          // Adjust response format to match chat format
          response = {
            text: response.text,
            type: 'assistant',
            meta: response.meta
          };
        }

        spinner.succeed(secondaryGradient('Cohere:'));

        // Output response
        console.log(formatResponse(response));
        // Prompt to create files if code blocks detected
        await maybeCreateFilesFromResponse(response.text);
        // Add response to messages
        messages.push({ type: 'assistant', text: response.text });
      } catch (error) {
        spinner.fail('Error getting response');
        console.error(chalk.red(`Error: ${error.message}`));
      }
    }
  }
}

// Single message function
async function sendSingleMessage(apiKey, options) {
  displayLogo();

  // Prompt for message
  const { input } = await inquirer.prompt([
    {
      type: 'input',
      name: 'input',
      message: primaryGradient('You:'),
      prefix: '🧠'
    }
  ]);

  // Get response
  const spinner = ora(secondaryGradient('Cohere is thinking...')).start();

  try {
    let response;

    if (options.model) {
      selectedModel = options.model;
      // Determine model type - default to chat if unknown
      modelType = 'chat';
    } else {
      spinner.text = 'No model specified, fetching default model...';
      const models = await fetchModels(apiKey);
      const defaultModel = models.find(model => model.endpoints.includes('chat')) || models[0];
      selectedModel = defaultModel.id;
      modelType = defaultModel.endpoints.includes('chat') ? 'chat' : 'generate';
    }

    if (modelType === 'chat') {
      response = await chatWithCohere(apiKey, {
        model: selectedModel,
        message: input,
        chatHistory: [],
        temperature: options.temperature,
        maxTokens: options.maxTokens
      });
    } else {
      response = await generateWithCohere(apiKey, {
        model: selectedModel,
        prompt: input,
        temperature: options.temperature,
        maxTokens: options.maxTokens
      });

      // Adjust response format to match chat format
      response = {
        text: response.text,
        type: 'assistant',
        meta: response.meta
      };
    }

    spinner.succeed(secondaryGradient('Cohere:'));
    console.log(formatResponse(response));
    // Prompt to create files if code blocks detected
    await maybeCreateFilesFromResponse(response.text);
  } catch (error) {
    spinner.fail('Error getting response');
    console.error(chalk.red(`Error: ${error.message}`));
  }
}

// Main CLI function
async function startCLI(options) {
  const {
    apiKey,
    model,
    temperature: initialTemp,
    singleMessage,
    includeHistory,
    maxTokens: initialMaxTokens
  } = options;

  // Initialize settings
  selectedModel = model || '';
  temperature = initialTemp;
  includeChatHistory = includeHistory;
  maxTokens = initialMaxTokens;

  if (singleMessage) {
    await sendSingleMessage(apiKey, options);
  } else {
    await interactiveChat(apiKey);
  }
}

// Utility: Extract code blocks from markdown text
function extractCodeBlocks(text) {
  // Matches triple-backtick code blocks: ```lang [filename] \ncode\n```
  const regex = /```([^\s`]+)([^\n`]*)\n([\s\S]*?)```/g;
  let match;
  const blocks = [];
  while ((match = regex.exec(text)) !== null) {
    // language is the first word before any space
    const language = (match[1] || 'txt').trim();
    const info = match[2] || '';
    let code = match[3].trim();
    let filename = null;
    // Try to extract filename from info string (e.g. filename="main.js")
    const fnameMatch = info.match(/filename\s*=\s*"([^"]+)"/i);
    if (fnameMatch) {
      filename = fnameMatch[1];
    } else {
      // Try to extract filename from first line comment
      const lines = code.split('\n');
      const firstLine = lines[0].trim();
      const commentFile = firstLine.match(/^\/\/\s*([\w\-.]+\.[\w\d]+)$/) || firstLine.match(/^\/\*\s*([\w\-.]+\.[\w\d]+)\s*\*\//);
      if (commentFile) {
        filename = commentFile[1];
        // Remove the comment line from code
        lines.shift();
        code = lines.join('\n');
      }
    }
    blocks.push({
      language,
      code,
      filename
    });
  }
  return blocks;
}

// Utility: Prompt user to create files from code blocks
async function maybeCreateFilesFromResponse(text) {
  const codeBlocks = extractCodeBlocks(text);
  if (!codeBlocks.length) return;
  const { create } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'create',
      message: `Detected ${codeBlocks.length} code block(s). Do you want to create file(s) from them?`,
      default: false
    }
  ]);
  if (!create) return;

  const { basePath } = await inquirer.prompt([
    {
      type: 'input',
      name: 'basePath',
      message: 'Where should the files be saved? (Enter a directory path, or leave blank for current directory)',
      default: process.cwd()
    }
  ]);
  const fs = require('fs').promises;
  const path = require('path');
  for (let i = 0; i < codeBlocks.length; i++) {
    const block = codeBlocks[i];
    let fileName = block.filename;
    // Suggest a filename based on detected filename or language
    if (!fileName) {
      let defaultName = `file${i + 1}`;
      const promptMsg = `Enter filename for code block #${i + 1} (language: ${block.language}):`;
      const resp = await inquirer.prompt([
        {
          type: 'input',
          name: 'fileName',
          message: promptMsg,
          default: defaultName
        }
      ]);
      fileName = resp.fileName;
    } else {
      console.log(chalk.cyan(`Detected filename for code block #${i + 1}: ${fileName}`));
    }
    const fullPath = path.resolve(basePath || process.cwd(), fileName);
    try {
      await fs.writeFile(fullPath, block.code, 'utf8');
      console.log(chalk.green(`✔ Created: ${fullPath}`));
      // Track this file as recently created
      if (!recentFiles.includes(fullPath)) recentFiles.push(fullPath);
    } catch (err) {
      console.log(chalk.red(`✖ Failed to write ${fullPath}: ${err.message}`));
    }
  }
}

module.exports = { startCLI };
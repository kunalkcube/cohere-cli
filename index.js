#!/usr/bin/env node

// Main entry point for the Cohere AI CLI
require('dotenv').config();
const { program } = require('commander');
const { startCLI } = require('./src/cli');
const inquirer = require('inquirer');
const chalk = require('chalk');
const boxen = require('boxen');
const ora = require('ora');

program
  .name('cohere-cli')
  .description('A beautiful CLI for chatting with Cohere AI models')
  .version('1.0.0')
  .option('-k, --api-key <key>', 'Cohere API key (overrides env variable)')
  .option('-m, --model <model>', 'Specify model to use')
  .option('-t, --temperature <temp>', 'Set temperature (0-1)', parseFloat, 0.7)
  .option('-s, --single-message', 'Send a single message and exit')
  .option('--no-history', 'Don\'t include chat history in requests')
  .option('--max-tokens <number>', 'Maximum tokens for response', parseInt, 1024)
  .parse(process.argv);

const options = program.opts();

// Get API key from option or env variable
let apiKey = options.apiKey || process.env.COHERE_API_KEY;

if (!apiKey) {
  const errorBox = boxen(
    chalk.redBright('🔑 API key is required to use Cohere AI CLI'), 
    { 
      padding: 1,
      borderColor: 'red',
      borderStyle: 'round',
      title: 'Authentication Required',
      titleAlignment: 'center'
    }
  );
  console.error(errorBox);
  console.error(chalk.yellow('You can get your API key from ') + chalk.underline('https://dashboard.cohere.ai/api-keys\n'));
  
  (async () => {
    try {
      const { inputKey } = await inquirer.prompt([
        {
          type: 'password',
          name: 'inputKey',
          message: 'Please enter your Cohere API key:',
          validate: input => input.trim().length > 0 ? true : 'API key cannot be empty'
        }
      ]);
      
      const spinner = ora('Validating API key').start();
      apiKey = inputKey.trim();
      spinner.succeed('API key validated');
      
      startCLI({
        apiKey,
        model: options.model,
        temperature: options.temperature,
        singleMessage: options.singleMessage,
        includeHistory: !options.noHistory,
        maxTokens: options.maxTokens
      });
    } catch (err) {
      console.error(chalk.red('Error:'), err.message);
      process.exit(1);
    }
  })();
} else {
  startCLI({
    apiKey,
    model: options.model,
    temperature: options.temperature,
    singleMessage: options.singleMessage,
    includeHistory: !options.noHistory,
    maxTokens: options.maxTokens
  });
}

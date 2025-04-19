# Shell Command Assistant

This VS Code extension helps you generate and execute shell commands using natural language descriptions. It integrates with OpenAI's API to convert your task descriptions into executable shell commands.

## Features

- Convert natural language tasks to shell commands using AI
- Execute the generated commands directly in VS Code
- Copy generated commands to clipboard
- View detailed output in a dedicated output channel

## Requirements

- An OpenAI API key

## Extension Settings

This extension contributes the following settings:

* `shellCommandAssistant.openaiApiKey`: Your OpenAI API key
* `shellCommandAssistant.defaultModel`: Default OpenAI model to use (gpt-4o-mini, gpt-4o, or gpt-3.5-turbo)

## Usage

1. Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac) to open the Command Palette
2. Type "Shell Command Assistant: Run Task" and press Enter
3. Enter a natural language description of what you want to do (e.g., "find all JavaScript files modified in the last week")
4. Review the generated command
5. Choose to execute it or copy it to your clipboard

## First Time Setup

1. Install the extension
2. Open settings (`Ctrl+,` or `Cmd+,` on Mac)
3. Search for "Shell Command Assistant"
4. Add your OpenAI API key

## Examples

- "List all files in the current directory"
- "Find all JavaScript files that contain the word 'function'"
- "Show disk usage in human-readable format"
- "Create a backup of the current project"
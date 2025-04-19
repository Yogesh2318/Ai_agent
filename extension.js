const vscode = require('vscode');
const { OpenAI } = require('openai');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
    console.log('Shell Command Assistant extension is now active');

    // Initialize OpenAI client
    let openai;
    
    // Initialize the OpenAI client with API key from settings
    function initializeOpenAI() {
        const config = vscode.workspace.getConfiguration('shellCommandAssistant');
        const apiKey ="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"
        
        if (!apiKey) {
            vscode.window.showErrorMessage('OpenAI API key is not set. Please set it in the extension settings or as an environment variable.');
            return false;
        }
        
        try {
            openai = new OpenAI({
                apiKey: apiKey
            });
            return true;
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to initialize OpenAI client: ${error.message}`);
            return false;
        }
    }
    
    /**
     * Create a file with the provided code content - USING YOUR ORIGINAL CODE
     * @param {string} filePath - The file path
     * @param {string} content - The content to write to the file
     * @returns {Promise<boolean>} - Whether the file was created successfully
     */
    async function createFile(filePath, content) {
        try {
            // Ensure the directory exists
            const dirPath = path.dirname(filePath);
            if (!fs.existsSync(dirPath)) {
                fs.mkdirSync(dirPath, { recursive: true });
            }
            
            // Write the file
            fs.writeFileSync(filePath, content);
            
            // Open the file in the editor
            const document = await vscode.workspace.openTextDocument(filePath);
            await vscode.window.showTextDocument(document);
            
            return true;
        } catch (error) {
            console.error("File creation error:", error);
            return false;
        }
    }
    
    /**
     * Run a shell command and show output in terminal
     * @param {string} command - The command to execute
     * @returns {Promise<{success: boolean, output: string}>} - The command output and success status
     */
    function runShellCommand(command) {
        return new Promise((resolve, reject) => {
            // Get or create terminal
            let terminal = vscode.window.terminals.find(t => t.name === 'Shell Command Assistant') || 
                vscode.window.createTerminal('Shell Command Assistant');
            
            // Show terminal
            terminal.show();
            
            // Send command to terminal
            terminal.sendText(command);
            
            // For output capturing, we still use exec in the background
            exec(command, (error, stdout, stderr) => {
                if (error) {
                    resolve({
                        success: false,
                        output: `❌ Error: ${error.message}\n${stdout}\n${stderr}`
                    });
                    return;
                }
                if (stderr && !stdout) {
                    resolve({
                        success: false,
                        output: `⚠️ Warning:\n${stderr}`
                    });
                } else {
                    resolve({
                        success: true,
                        output: `${stdout}${stderr ? '\n⚠️ Note:\n' + stderr : ''}`
                    });
                }
            });
        });
    }
    
    /**
     * Get a command plan from OpenAI
     * @param {string} task - The natural language task
     * @param {string} [previousOutput] - Output from previous command execution for refinement
     * @param {string} [feedback] - User feedback on why the previous attempt failed
     * @returns {Promise<string>} - The command plan
     */
    async function getCommandPlan(task, previousOutput = null, feedback = null) {
        if (!openai) {
            if (!initializeOpenAI()) {
                return "Failed to initialize OpenAI client";
            }
        }
        
        const messages = [
            {
                role: "system",
                content: `You are an AI that converts natural language tasks into safe shell commands for execution. You should analyze the task, create a plan, and provide the necessary commands. 

If the task involves creating a file with code, respond with:
FILE_CREATE: {filepath}
\`\`\`{language}
{actual code content}
\`\`\`

For shell commands, respond with:
COMMAND: {command}

Provide a brief explanation of what the command or file does and what to expect.`
            },
            { role: "user", content: `Task: ${task}` }
        ];
        
        // If this is a refinement, add previous output and feedback
        if (previousOutput && feedback) {
            messages.push({ 
                role: "user", 
                content: `The previous command resulted in the following output:\n\n${previousOutput}\n\nUser feedback: ${feedback}\n\nPlease provide a refined command to fix the issue.` 
            });
        }
        
        try {
            const response = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: messages
            });
            
            return response.choices[0].message.content;
        } catch (error) {
            console.error("OpenAI API Error:", error);
            return `OpenAI Error: ${error.message}`;
        }
    }
    
    /**
     * Extract the executable command or file creation instructions from the OpenAI response
     * @param {string} commandText - The text containing the command
     * @returns {object} - The extracted command/file info and explanation
     */
    function extractCommand(commandText) {
        // Check for file creation instruction
        const fileMatch = commandText.match(/FILE_CREATE: (.+?)(\n|$)/);
        if (fileMatch && fileMatch[1]) {
            const filePath = fileMatch[1].trim();
            
            // Extract code content from code block
            const codeBlockMatch = commandText.match(/```(?:\w+)?\n([\s\S]+?)\n```/);
            let codeContent = "";
            
            if (codeBlockMatch && codeBlockMatch[1]) {
                codeContent = codeBlockMatch[1].trim();
            } else {
                // Fallback: Try to find any content between triple backticks
                const fallbackMatch = commandText.match(/```([\s\S]+?)```/);
                if (fallbackMatch && fallbackMatch[1]) {
                    // Remove language identifier if present
                    codeContent = fallbackMatch[1]
                        .replace(/^[\w-]+\n/, '') // Remove language identifier line
                        .trim();
                }
            }
            
            // Get explanation (everything except the file creation marker and code block)
            const explanation = commandText
                .replace(/FILE_CREATE: .+?(\n|$)/, '')
                .replace(/```(?:\w+)?\n[\s\S]+?\n```/, '')
                .trim();
                
            return { 
                type: 'file', 
                filePath, 
                codeContent, 
                explanation 
            };
        }
        
        // Check for command instruction
        const commandMatch = commandText.match(/COMMAND: (.+?)(\n|$)/);
        if (commandMatch && commandMatch[1]) {
            const command = commandMatch[1].trim();
            // Remove the command line from the explanation
            const explanation = commandText.replace(/COMMAND: .+?(\n|$)/, '').trim();
            
            return { 
                type: 'command', 
                command, 
                explanation 
            };
        }
        
        // Basic fallback for commands
        const codeBlockMatch = commandText.match(/```(?:bash|sh)?\n([\s\S]+?)\n```/);
        if (codeBlockMatch && codeBlockMatch[1]) {
            const command = codeBlockMatch[1].trim();
            // Remove the code block from the explanation
            const explanation = commandText.replace(/```(?:bash|sh)?\n[\s\S]+?\n```/, '').trim();
            
            return {
                type: 'command',
                command,
                explanation
            };
        }
        
        // If no pattern matches, use heuristics to find a command-like line
        const lines = commandText.split('\n');
        for (const line of lines) {
            if (line.trim().startsWith('$') || 
                /^(ls|cd|mkdir|touch|echo|cat|rm|cp|mv|git|npm|python|node)/.test(line.trim())) {
                const command = line.trim().replace(/^\$ /, '');
                
                return {
                    type: 'command',
                    command,
                    explanation: commandText
                };
            }
        }
        
        // If still no command found, assume the entire text might be a command
        return {
            type: 'command',
            command: commandText.trim(),
            explanation: "No explicit explanation provided."
        };
    }
    
    /**
     * Process the task in a loop until success or user cancellation
     * @param {string} task - The natural language task
     * @param {vscode.OutputChannel} outputChannel - The output channel to write to
     */
    async function processTaskLoop(task, outputChannel) {
        let isTaskCompleted = false;
        let previousOutput = null;
        let currentTask = task;
        let attempts = 0;
        const MAX_ATTEMPTS = 3;
        
        while (!isTaskCompleted && attempts < MAX_ATTEMPTS) {
            attempts++;
            outputChannel.appendLine(`\n--- Attempt ${attempts} ${attempts > 1 ? '(Refinement)' : ''} ---`);
            outputChannel.appendLine(`Task: ${currentTask}`);
            
            // Step 1: Generate command plan
            outputChannel.appendLine(`Generating command plan...`);
            const feedback = attempts > 1 ? await vscode.window.showInputBox({
                prompt: 'What went wrong with the previous attempt?',
                placeHolder: 'e.g., The file wasn\'t found, permission denied, etc.'
            }) : null;
            
            const plan = await getCommandPlan(currentTask, previousOutput, feedback);
            outputChannel.appendLine(`\nAI Response: \n${plan}\n`);
            
            // Step 2: Extract command/file info and explanation from plan
            const result = extractCommand(plan);
            outputChannel.appendLine(`\nExplanation: ${result.explanation}\n`);
            
            if (result.type === 'file') {
                outputChannel.appendLine(`File to create: ${result.filePath}\n`);
                outputChannel.appendLine(`Code content:\n${result.codeContent}\n`);
                
                // Ask for confirmation before creating file
                const createOption = "Create File";
                const modifyOption = "Modify Content";
                const cancelOption = "Cancel";
                
                const selectedOption = await vscode.window.showInformationMessage(
                    `Ready to create file: ${result.filePath}`, 
                    { modal: true },
                    createOption,
                    modifyOption,
                    cancelOption
                );
                
                if (selectedOption === cancelOption) {
                    outputChannel.appendLine('Operation cancelled by user.');
                    return;
                }
                
                let finalFilePath = result.filePath;
                let finalContent = result.codeContent;
                
                if (selectedOption === modifyOption) {
                    // Allow modification of file path
                    finalFilePath = await vscode.window.showInputBox({
                        prompt: 'Modify the file path before creation',
                        value: result.filePath
                    });
                    
                    if (!finalFilePath) {
                        outputChannel.appendLine('Operation cancelled by user.');
                        return;
                    }
                    
                    // For content modification, create a temporary document for editing
                    const tempDoc = await vscode.workspace.openTextDocument({
                        content: finalContent,
                    });
                    await vscode.window.showTextDocument(tempDoc);
                    
                    // Ask user to confirm when they're done editing
                    const editConfirm = await vscode.window.showInformationMessage(
                        'Edit content in the editor. Click "Done" when finished.',
                        'Done',
                        'Cancel'
                    );
                    
                    if (editConfirm === 'Cancel') {
                        outputChannel.appendLine('Operation cancelled by user.');
                        return;
                    }
                    
                    // Get the updated content
                    finalContent = tempDoc.getText();
                    outputChannel.appendLine(`Modified file path: ${finalFilePath}`);
                }
                
                // Get the full path based on workspace root
                let fullPath = finalFilePath;
                if (!path.isAbsolute(finalFilePath)) {
                    const workspaceFolders = vscode.workspace.workspaceFolders;
                    if (workspaceFolders && workspaceFolders.length > 0) {
                        fullPath = path.join(workspaceFolders[0].uri.fsPath, finalFilePath);
                    }
                }
                
                // Create the file using your original function
                outputChannel.appendLine(`Creating file: ${fullPath}\n`);
                const fileCreated = await createFile(fullPath, finalContent);
                
                if (fileCreated) {
                    outputChannel.appendLine(`✅ File created successfully!\n`);
                    previousOutput = `File ${fullPath} created successfully`;
                } else {
                    outputChannel.appendLine(`❌ Failed to create file: ${fullPath}\n`);
                    previousOutput = `Failed to create file: ${fullPath}`;
                }
            } else {
                // Handle command execution
                outputChannel.appendLine(`Command to execute: ${result.command}\n`);
                
                // Ask for confirmation before executing
                const executeOption = "Execute Command";
                const modifyOption = "Modify Command";
                const cancelOption = "Cancel";
                
                const selectedOption = await vscode.window.showInformationMessage(
                    `Ready to execute: ${result.command}`, 
                    { modal: true },
                    executeOption,
                    modifyOption,
                    cancelOption
                );
                
                if (selectedOption === cancelOption) {
                    outputChannel.appendLine('Operation cancelled by user.');
                    return;
                }
                
                let finalCommand = result.command;
                if (selectedOption === modifyOption) {
                    finalCommand = await vscode.window.showInputBox({
                        prompt: 'Modify the command before execution',
                        value: result.command
                    });
                    
                    if (!finalCommand) {
                        outputChannel.appendLine('Operation cancelled by user.');
                        return;
                    }
                    
                    outputChannel.appendLine(`Modified command: ${finalCommand}`);
                }
                
                // Execute command in terminal
                outputChannel.appendLine(`Executing command: ${finalCommand}\n`);
                
                try {
                    const cmdResult = await runShellCommand(finalCommand);
                    outputChannel.appendLine(`Output:\n${cmdResult.output}\n`);
                    previousOutput = cmdResult.output;
                } catch (error) {
                    outputChannel.appendLine(`Error: ${error}\n`);
                    previousOutput = error.toString();
                }
            }
            
            // Step 4: Check if task was successful
            const successOptions = ["✅ Yes, task completed successfully", "❌ No, task failed"];
            const taskResult = await vscode.window.showInformationMessage(
                `Was the task completed successfully?`,
                ...successOptions
            );
            
            if (taskResult === successOptions[0]) {
                outputChannel.appendLine('✅ Task completed successfully!');
                isTaskCompleted = true;
            } else if (taskResult === successOptions[1]) {
                outputChannel.appendLine('❌ Task failed. Refining approach...');
                // Continue loop - will refine on next iteration
            } else {
                // User cancelled
                outputChannel.appendLine('Operation cancelled by user.');
                return;
            }
        }
        
        if (!isTaskCompleted && attempts >= MAX_ATTEMPTS) {
            outputChannel.appendLine(`\nReached maximum number of attempts (${MAX_ATTEMPTS}). Please try reformulating your task or run the command manually.`);
        }
    }
    
    // Register the main command that handles shell command generation and execution
    let disposable = vscode.commands.registerCommand('shellCommandAssistant.runTask', async function () {
        // Prompt user for the task
        const task = await vscode.window.showInputBox({
            prompt: 'Enter a natural language description of the task you want to perform',
            placeHolder: 'e.g., Create a React app and run it, or Create a Python file with a quick sort algorithm'
        });
        
        if (!task) return; // User cancelled
        
        // Create output channel if it doesn't exist
        const outputChannel = vscode.window.createOutputChannel('Shell Command Assistant');
        outputChannel.show();
        
        // Show progress indicator during the whole process
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Shell Command Assistant",
            cancellable: false
        }, async (progress) => {
            await processTaskLoop(task, outputChannel);
        });
    });
    
    // Register settings command
    let settingsCommand = vscode.commands.registerCommand('shellCommandAssistant.settings', function () {
        vscode.commands.executeCommand('workbench.action.openSettings', 'shellCommandAssistant');
    });
    
    context.subscriptions.push(disposable, settingsCommand);
}

function deactivate() {}

module.exports = {
    activate,
    deactivate
};
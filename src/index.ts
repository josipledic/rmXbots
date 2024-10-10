import readline from 'readline';
import { XBotAPI } from './xBotAPI';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function promptFor2FA(question: string): Promise<string> {
  return new Promise((resolve) => {
    const askFor2FA = () => {
      rl.question(question, (answer) => {
        if (/^\d{6}$/.test(answer)) {
          resolve(answer);
        } else {
          console.log('Invalid 2FA code. Please enter 6 digits.');
          askFor2FA();
        }
      });
    };
    askFor2FA();
  });
}

async function promptYesOrNo(question: string): Promise<boolean> {
  return new Promise((resolve) => {
    const askYesOrNo = () => {
      rl.question(question + ' (Y/N): ', (answer) => {
        const lowerAnswer = answer.toLowerCase();
        if (lowerAnswer === 'y' || lowerAnswer === 'n') {
          resolve(lowerAnswer === 'y');
        } else {
          console.log('Invalid input. Please enter Y or N.');
          askYesOrNo();
        }
      });
    };
    askYesOrNo();
  });
}

async function main() {
  const username = process.env.USERNAME;
  const password = process.env.PASSWORD;

  if (!username || !password) {
    console.error('Please set USERNAME and PASSWORD in your .env.local file.');
    process.exit(1);
  }

  const xBotAPI = new XBotAPI(username, password, promptFor2FA, promptYesOrNo);
  await xBotAPI.login();
  await xBotAPI.analyzeFollowers();
  rl.close();
}

main().catch(console.error);

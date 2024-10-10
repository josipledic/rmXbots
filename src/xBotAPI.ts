import puppeteer, { Browser, ElementHandle, Page } from 'puppeteer';
import { FollowerAnalyzer } from './followerAnalyzer';
import { FollowerInfo } from './types';

export class XBotAPI {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private analyzer: FollowerAnalyzer;

  constructor(
    private username: string,
    private password: string,
    private promptFor2FA: (question: string) => Promise<string>,
    private promptYesOrNo: (question: string) => Promise<boolean>
  ) {
    this.analyzer = new FollowerAnalyzer();
  }

  async login(timeout: number = 200000): Promise<void> {
    return new Promise(async (resolve, reject) => {
      const timeoutId = setTimeout(() => {
        console.log('Login process timed out');
        reject(new Error('Login timed out'));
      }, timeout);

      try {
        console.log('Launching browser...');
        this.browser = await puppeteer.launch({
          headless: false,
          defaultViewport: null,
          args: ['--start-maximized']
        });
        this.page = await this.browser.newPage();
        console.log('Browser launched and new page created');
        
        console.log('Setting navigation timeouts...');
        this.page.setDefaultNavigationTimeout(60000);
        this.page.setDefaultTimeout(60000);

        console.log('Navigating to login page...');
        await this.page.goto('https://twitter.com/i/flow/login', { waitUntil: 'networkidle0' });
        console.log('Login page loaded');

        await this.randomDelay(1000, 2000);

        console.log('Waiting for username input...');
        await this.page.waitForSelector('input[autocomplete="username"]', { visible: true });
        console.log('Username input found');

        console.log('Typing username...');
        await this.typeWithRandomDelay('input[autocomplete="username"]', this.username);
        console.log('Username typed');

        console.log('Waiting for "Next" button...');
        const nextButton = await this.page.$('button:nth-child(6)') as ElementHandle<Element>;
        if (nextButton) {
          console.log('"Next" button found, clicking...');
          await nextButton.click();
        } else {
          console.log('"Next" button not found');
        }
        await this.randomDelay(1000, 2000);

        console.log('Waiting for password input...');
        await this.page.waitForSelector('input[name="password"][type="password"]', { visible: true });
        console.log('Password input found');

        console.log('Typing password...');
        await this.typeWithRandomDelay('input[name="password"][type="password"]', this.password);
        console.log('Password typed');

        console.log('Waiting for login button...');
        const loginButtonSelector = 'button[data-testid="LoginForm_Login_Button"]';
        await this.page.waitForSelector(loginButtonSelector, { visible: true });
        console.log('Login button found');

        console.log('Clicking login button...');
        await this.page.click(loginButtonSelector);
        await this.randomDelay(2000, 3000);

        // Handle 2FA if needed
        try {
          console.log('Checking for 2FA input...');
          await this.page.waitForSelector('input[data-testid="ocfEnterTextTextInput"]', { timeout: 5000 });
          console.log('2FA required. Please check your authentication app or SMS for the code.');
          const twoFactorCode = await this.promptFor2FA('Enter your 2FA code: ');
          await this.typeWithRandomDelay('input[data-testid="ocfEnterTextTextInput"]', twoFactorCode);
          console.log('2FA code entered');

          console.log('Waiting for 2FA confirmation button...');
          const twoFAButtonSelector = 'button[data-testid="ocfEnterTextNextButton"]';
          await this.page.waitForSelector(twoFAButtonSelector, { visible: true });
          console.log('2FA confirmation button found');

          console.log('Clicking 2FA confirmation button...');
          await this.page.click(twoFAButtonSelector);
          await this.randomDelay(2000, 3000);
        } catch (error) {
          console.log('No 2FA required or 2FA process completed.');
        }

        console.log('Waiting for navigation after login...');
        await this.page.waitForNavigation({ waitUntil: 'networkidle0' });
        console.log('Logged in successfully');
        clearTimeout(timeoutId);
        resolve();
      } catch (error) {
        if (this.page) {
          console.log('Capturing screenshot of current page state...');
          await this.page.screenshot({ path: 'login-error-screenshot.png' });
          console.log('Screenshot saved as login-error-screenshot.png');
        }
        console.error('Error during login:', error);
        clearTimeout(timeoutId);
        reject(error);
      }
    });
  }

  async analyzeFollowers(): Promise<void> {
    if (!this.page) throw new Error('Not logged in');

    await this.page.goto(`https://x.com/${this.username}/followers`, { timeout: 60000 });
    const scrollResult = await this.scrollToBottom();
    console.log(scrollResult);

    const followers = await this.getFollowers();
    console.log(`Found ${followers.length} followers`);

    for (const follower of followers) {
      const info = await this.getFollowerInfo(follower);
      const action = this.analyzer.analyzeFollower(info);

      if (action === 'block') {
        const shouldBlock = await this.promptYesOrNo(`Block ${follower}?`);
        if (shouldBlock) {
          await this.blockFollower(follower);
        }
      } else if (action === 'remove') {
        const shouldRemove = await this.promptYesOrNo(`Remove ${follower}?`);
        if (shouldRemove) {
          await this.removeFollower(follower);
        }
      }
    }

    console.log('Finished analyzing followers');
  }

  private async scrollToBottom(): Promise<string> {
    let previousHeight = 0;
    let currentHeight = 0;
    let scrollAttempts = 0;
    const maxScrollAttempts = 20;

    while (scrollAttempts < maxScrollAttempts) {
      previousHeight = currentHeight;
      currentHeight = await this.page!.evaluate(() => document.body.scrollHeight);
      if (previousHeight === currentHeight) break;
      
      await this.page!.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await this.page!.waitForTimeout(2000);
      scrollAttempts++;
    }

    return scrollAttempts >= maxScrollAttempts
      ? 'Reached maximum scroll attempts. Some followers might not be loaded.'
      : 'Reached the bottom of the followers list.';
  }

  private async getFollowers(): Promise<string[]> {
    const followers = await this.page!.$$('div[data-testid="UserCell"] a[role="link"]');
    return Promise.all(followers.map(async (follower) => {
      const username = await follower.evaluate(el => el.textContent);
      return username ? username.replace('@', '') : '';
    }));
  }

  private async getFollowerInfo(username: string): Promise<FollowerInfo> {
    await this.page!.hover(`a[href="/${username}"]`);
    await this.page!.waitForSelector('div[data-testid="HoverCard"]');

    const card = await this.page!.$('div[data-testid="HoverCard"]');
    if (!card) throw new Error('HoverCard not found');

    const nameElement = await card.$('span');
    const name = nameElement ? await nameElement.evaluate(el => el.textContent || '') : '';

    const counts = await card.$$('span[data-testid="UserCell-number"]');
    const followerCount = counts[0] ? await counts[0].evaluate(el => parseInt(el.textContent?.replace(',', '') || '0', 10)) : 0;
    const followingCount = counts[1] ? await counts[1].evaluate(el => parseInt(el.textContent?.replace(',', '') || '0', 10)) : 0;

    const createdAtElement = await card.$('span[data-testid="UserCell-date"]');
    const createdAt = createdAtElement ? await createdAtElement.evaluate(el => el.textContent || '') : '';

    return {
      username,
      name,
      followerCount,
      followingCount,
      createdAt: new Date(createdAt),
      tweetCount: 0, // Placeholder, replace with actual data
      retweetRatio: 0, // Placeholder, replace with actual data
      linkRatio: 0, // Placeholder, replace with actual data
      averageHashtagsPerTweet: 0, // Placeholder, replace with actual data
      hasDefaultProfileImage: false, // Placeholder, replace with actual data
      bio: '', // Placeholder, replace with actual data
    };
  }

  private async blockFollower(username: string): Promise<void> {
    await this.page!.click(`a[href="/${username}"]`);
    await this.page!.waitForSelector('div[data-testid="userActions"]');
    await this.page!.click('div[data-testid="userActions"]');
    await this.page!.waitForSelector('div[data-testid="block"]');
    await this.page!.click('div[data-testid="block"]');
    await this.page!.waitForSelector('div[data-testid="confirmationSheetConfirm"]');
    await this.page!.click('div[data-testid="confirmationSheetConfirm"]');
    console.log(`Blocked follower: ${username}`);
  }

  private async removeFollower(username: string): Promise<void> {
    await this.blockFollower(username);
    await new Promise(resolve => setTimeout(resolve, 1000));
    await this.page!.click('div[data-testid="userActions"]');
    await this.page!.waitForSelector('div[data-testid="unblock"]');
    await this.page!.click('div[data-testid="unblock"]');
    await this.page!.waitForSelector('div[data-testid="confirmationSheetConfirm"]');
    await this.page!.click('div[data-testid="confirmationSheetConfirm"]');
    console.log(`Removed follower: ${username}`);
  }

  private async randomDelay(min: number, max: number): Promise<void> {
    const delay = Math.floor(Math.random() * (max - min + 1) + min);
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  private async typeWithRandomDelay(selector: string, text: string): Promise<void> {
    for (const char of text) {
      await this.page!.type(selector, char, { delay: Math.random() * 100 + 50 });
    }
  }
}

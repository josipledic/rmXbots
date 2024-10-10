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

    console.log(`Navigating to followers page for ${this.username}...`);
    await this.page.goto(`https://twitter.com/${this.username}/followers`, { timeout: 60000 });
    console.log('Followers page loaded');

    console.log('Starting to scroll to bottom...');
    const scrollResult = await this.scrollToBottom();
    console.log(scrollResult);

    const followers = await this.getFollowers();
    console.log(`Found ${followers.length} followers`);

    for (const follower of followers) {
      console.log(`Analyzing follower: ${follower}`);
      const info = await this.getFollowerInfo(follower);
      const action = this.analyzer.analyzeFollower(info);

      if (action === 'block') {
        await this.blockFollower(follower);
      } else if (action === 'remove') {
        // Implement remove functionality if needed
        console.log(`Would remove follower: ${follower}`);
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
    console.log('Fetching followers...');
    const followers: string[] = [];

    const userCells = await this.page!.$$('[data-testid="UserCell"]');
    
    for (const userCell of userCells) {
      const usernameElement = await userCell.$('div[dir="ltr"] span');
      if (usernameElement) {
        const username = await usernameElement.evaluate(el => el.textContent);
        if (username) {
          followers.push(username.replace('@', ''));
        }
      }
    }

    console.log(`Found ${followers.length} followers`);
    return followers;
  }

  private async getFollowerInfo(username: string): Promise<FollowerInfo> {
    const userCell = await this.page!.$(`[data-testid="UserCell"]:has(a[href="/${username}"])`);
    if (!userCell) throw new Error(`UserCell not found for ${username}`);

    const displayNameElement = await userCell.$('div[dir="ltr"] > div:first-child');
    const handleElement = await userCell.$('div[dir="ltr"] > div:nth-child(2)');
    const bioElement = await userCell.$('div[dir="auto"]');

    const displayName = displayNameElement ? await displayNameElement.evaluate(el => el.textContent) : '';
    const handle = handleElement ? await handleElement.evaluate(el => el.textContent) : '';
    const bio = bioElement ? await bioElement.evaluate(el => el.textContent) : '';

    // Other info like follower count, following count, etc. would need to be fetched differently
    // as they're not directly available in the UserCell

    return {
      username,
      name: displayName || '',
      followerCount: 0, // Placeholder
      followingCount: 0, // Placeholder
      createdAt: new Date(), // Placeholder
      tweetCount: 0, // Placeholder
      retweetRatio: 0, // Placeholder
      linkRatio: 0, // Placeholder
      averageHashtagsPerTweet: 0, // Placeholder
      hasDefaultProfileImage: false, // Placeholder
      bio: bio || '',
    };
  }

  private async blockFollower(username: string): Promise<void> {
    const userCell = await this.page!.$(`[data-testid="UserCell"]:has(a[href="/${username}"])`);
    if (!userCell) throw new Error(`UserCell not found for ${username}`);

    const moreButton = await userCell.$('button[aria-label="More"]');
    if (!moreButton) throw new Error('More button not found');

    await moreButton.click();
    await this.page!.waitForSelector('[data-testid="Dropdown"]');

    const blockButton = await this.page!.$('[data-testid="block"]');
    if (!blockButton) throw new Error('Block button not found');

    await blockButton.click();
    await this.page!.waitForSelector('[data-testid="confirmationSheetDialog"]');

    const shouldBlock = await this.promptYesOrNo(`Block ${username}?`);
    if (shouldBlock) {
      const confirmButton = await this.page!.$('[data-testid="confirmationSheetConfirm"]');
      if (!confirmButton) throw new Error('Confirm button not found');
      await confirmButton.click();
      console.log(`Blocked follower: ${username}`);
    } else {
      const cancelButton = await this.page!.$('[data-testid="confirmationSheetCancel"]');
      if (!cancelButton) throw new Error('Cancel button not found');
      await cancelButton.click();
      console.log(`Cancelled blocking follower: ${username}`);
    }

    await this.page!.waitForTimeout(1000); // Wait for the dialog to close
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

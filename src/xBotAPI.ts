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

    console.log('Scrolling back to top...');
    await this.page.evaluate(() => window.scrollTo(0, 0));

    const followers = await this.getFollowers();
    console.log(`Found ${followers.length} followers`);

    let lastUsername = '';
    let currentUsername = '';

    for (let i = 0; i < followers.length; i++) {
      lastUsername = currentUsername;
      currentUsername = followers[i];
      console.log(`Analyzing follower ${i + 1}/${followers.length}: ${currentUsername}`);

      try {
        console.log(`Starting to get info for follower: ${currentUsername}`);
        const info = await this.getFollowerInfo(currentUsername);
        console.log(`Successfully got info for follower: ${currentUsername}`);
        const action = this.analyzeFollower(info);
        console.log(`Analysis result for ${currentUsername}: ${action}`);

        if (action === 'block') {
          await this.blockFollower(currentUsername);
          // After blocking, navigate back to followers page and find the last analyzed user
          await this.page!.goto(`https://twitter.com/${this.username}/followers`, { timeout: 60000 });
          if (lastUsername) {
            await this.scrollToUser(lastUsername);
          } else {
            await this.page!.evaluate(() => window.scrollTo(0, 0));
          }
        } else if (action === 'remove') {
          await this.removeFollower(currentUsername);
        }
        // If action is 'keep', do nothing and continue to the next follower
      } catch (error) {
        console.error(`Error analyzing follower ${currentUsername}:`, error);
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
      const usernameElement = await userCell.$('a[href^="/"]');
      if (usernameElement) {
        const href = await usernameElement.evaluate(el => el.getAttribute('href'));
        if (href) {
          followers.push(href.slice(1)); // Remove the leading '/'
        }
      }
    }

    console.log(`Found ${followers.length} followers`);
    return followers;
  }

  private async getFollowerInfo(username: string): Promise<FollowerInfo> {
    console.log(`Getting info for follower: ${username}`);
    console.log(`Navigating to https://twitter.com/${username}...`);
    try {
      await this.page!.goto(`https://twitter.com/${username}`, { waitUntil: 'networkidle0', timeout: 30000 });
      console.log(`Successfully loaded profile page for ${username}`);
    } catch (error) {
      console.error(`Error loading profile page for ${username}:`, error);
      throw error;
    }

    console.log('Extracting follower information...');
    const info = await this.page!.evaluate(() => {
      console.log('Inside page.evaluate...');
      const nameElement = document.querySelector('h2[aria-level="2"]');
      console.log('Name element:', nameElement?.textContent);

      const statsElements = document.querySelectorAll('span[data-testid="UserProfileHeader_Items"]');
      console.log('Stats elements found:', statsElements.length);

      const bioElement = document.querySelector('div[data-testid="UserDescription"]');
      console.log('Bio element:', bioElement?.textContent);

      const followersElement = Array.from(statsElements).find(el => el.textContent?.includes('Followers'));
      console.log('Followers element:', followersElement?.textContent);

      const followingElement = Array.from(statsElements).find(el => el.textContent?.includes('Following'));
      console.log('Following element:', followingElement?.textContent);

      return {
        name: nameElement?.textContent || '',
        followerCount: followersElement ? parseInt(followersElement.textContent?.replace(/[^0-9]/g, '') || '0') : 0,
        followingCount: followingElement ? parseInt(followingElement.textContent?.replace(/[^0-9]/g, '') || '0') : 0,
        bio: bioElement?.textContent || '',
      };
    });

    console.log('Extracted follower information:', info);

    console.log(`Navigating back to followers page for ${this.username}...`);
    try {
      await this.page!.goto(`https://twitter.com/${this.username}/followers`, { waitUntil: 'networkidle0', timeout: 30000 });
      console.log('Successfully returned to followers page');
    } catch (error) {
      console.error('Error returning to followers page:', error);
      throw error;
    }

    const followerInfo: FollowerInfo = {
      username,
      ...info,
      createdAt: new Date(), // Placeholder
      lastTweetDate: null, // Placeholder
      tweetCount: 0, // Placeholder
      retweetRatio: 0, // Placeholder
      linkRatio: 0, // Placeholder
      averageHashtagsPerTweet: 0, // Placeholder
      hasDefaultProfileImage: false, // Placeholder
    };

    console.log('Final follower info:', followerInfo);
    return followerInfo;
  }

  private analyzeFollower(info: FollowerInfo): 'block' | 'remove' | 'keep' {
    // Check for 5+ consecutive numbers in the username
    const consecutiveNumbersRegex = /\d{5,}/;
    if (consecutiveNumbersRegex.test(info.username)) {
      return 'block';
    }

    // Check for weirdly high following vs follower ratio
    const followRatio = info.followingCount / info.followerCount;
    if (followRatio > 8 && info.followingCount > 800) {
      return 'remove';
    }

    return 'keep';
  }

  private async blockFollower(username: string): Promise<void> {
    console.log(`Attempting to block follower: ${username}`);
    await this.page!.goto(`https://twitter.com/${username}`, { waitUntil: 'networkidle0' });

    const userActionsButton = await this.page!.$('[data-testid="userActions"]');
    if (!userActionsButton) throw new Error('User actions button not found');

    await userActionsButton.click();
    await this.page!.waitForSelector('[data-testid="block"]');

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

    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  private async removeFollower(username: string): Promise<void> {
    console.log(`Attempting to remove follower: ${username}`);
    const userCell = await this.page!.$(`[data-testid="UserCell"]:has(a[href="/${username}"])`);
    if (!userCell) throw new Error(`UserCell not found for ${username}`);

    const moreButton = await userCell.$('button[aria-label="More"]');
    if (!moreButton) throw new Error('More button not found');

    await moreButton.click();
    await this.page!.waitForSelector('[data-testid="Dropdown"]');

    const removeFollowerButton = await this.page!.$('[data-testid="removeFollower"]');
    if (!removeFollowerButton) throw new Error('Remove follower button not found');

    await removeFollowerButton.click();
    await this.page!.waitForSelector('[data-testid="confirmationSheetDialog"]');

    const shouldRemove = await this.promptYesOrNo(`Remove ${username} as a follower?`);
    if (shouldRemove) {
      const confirmButton = await this.page!.$('[data-testid="confirmationSheetConfirm"]');
      if (!confirmButton) throw new Error('Confirm button not found');
      await confirmButton.click();
      console.log(`Removed follower: ${username}`);
    } else {
      const cancelButton = await this.page!.$('[data-testid="confirmationSheetCancel"]');
      if (!cancelButton) throw new Error('Cancel button not found');
      await cancelButton.click();
      console.log(`Cancelled removing follower: ${username}`);
    }

    await this.page!.waitForTimeout(1000); // Wait for the dialog to close
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

  private async scrollToUser(username: string): Promise<void> {
    let found = false;
    while (!found) {
      const userCell = await this.page!.$(`[data-testid="UserCell"]:has(a[href="/${username}"])`);
      if (userCell) {
        found = true;
        await userCell.evaluate(el => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));
      } else {
        await this.page!.evaluate(() => window.scrollBy(0, window.innerHeight));
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
}

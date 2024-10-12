import { FollowerInfo } from './types';

export class FollowerAnalyzer {
  private readonly SUSPICIOUS_RATIO = 50; // Adjust this value as needed
  private readonly MIN_ACCOUNT_AGE_DAYS = 30;
  private readonly SUSPICIOUS_TWEET_FREQUENCY = 100; // tweets per day
  private readonly SUSPICIOUS_RETWEET_RATIO = 0.9; // 90% of tweets are retweets
  private readonly SUSPICIOUS_LINK_RATIO = 0.7; // 70% of tweets contain links
  private readonly SUSPICIOUS_HASHTAG_COUNT = 5; // More than 5 hashtags per tweet on average

  analyzeFollower(info: FollowerInfo): 'block' | 'remove' | 'keep' {
    if (this.isDefinitelyBot(info)) {
      return 'block';
    }

    if (this.isPossiblyBot(info)) {
      return 'remove';
    }

    return 'keep';
  }

  private isDefinitelyBot(info: FollowerInfo): boolean {
    // Use ratio instead of hard values
    if (this.getSuspiciousRatio(info) > this.SUSPICIOUS_RATIO) {
      return true;
    }

    if (this.hasConsecutiveNumbers(info.name, 5)) {
      return true;
    }

    if (this.isNewAccount(info)) {
      return true;
    }

    if (this.hasSuspiciousTweetFrequency(info)) {
      return true;
    }

    if (this.hasSuspiciousRetweetRatio(info)) {
      return true;
    }

    return false;
  }

  private isPossiblyBot(info: FollowerInfo): boolean {
    // Implement possible bot detection logic
    if (info.lastTweetDate && this.isInactiveSixMonths(info.lastTweetDate || new Date())) {
      return true;
    }

    if (this.hasSuspiciousLinkRatio(info)) {
      return true;
    }

    if (this.hasSuspiciousHashtagUsage(info)) {
      return true;
    }

    if (this.hasDefaultProfileImage(info)) {
      return true;
    }

    if (this.hasUnusualBio(info)) {
      return true;
    }

    return false;
  }

  private getSuspiciousRatio(info: FollowerInfo): number {
    if (info.followerCount === 0) {
      return info.followingCount > 0 ? Infinity : 0;
    }
    return info.followingCount / info.followerCount;
  }

  private hasConsecutiveNumbers(str: string, count: number): boolean {
    const regex = new RegExp(`\\d{${count},}`);
    return regex.test(str);
  }

  private isInactiveSixMonths(lastTweetDate: Date): boolean {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    return lastTweetDate < sixMonthsAgo;
  }

  private isNewAccount(info: FollowerInfo): boolean {
    const accountAgeInDays = (Date.now() - info.createdAt.getTime()) / (1000 * 60 * 60 * 24);
    return accountAgeInDays < this.MIN_ACCOUNT_AGE_DAYS;
  }

  private hasSuspiciousTweetFrequency(info: FollowerInfo): boolean {
    const accountAgeInDays = (Date.now() - info.createdAt.getTime()) / (1000 * 60 * 60 * 24);
    const tweetsPerDay = info.tweetCount / accountAgeInDays;
    return tweetsPerDay > this.SUSPICIOUS_TWEET_FREQUENCY;
  }

  private hasSuspiciousRetweetRatio(info: FollowerInfo): boolean {
    return info.retweetRatio > this.SUSPICIOUS_RETWEET_RATIO;
  }

  private hasSuspiciousLinkRatio(info: FollowerInfo): boolean {
    return info.linkRatio > this.SUSPICIOUS_LINK_RATIO;
  }

  private hasSuspiciousHashtagUsage(info: FollowerInfo): boolean {
    return info.averageHashtagsPerTweet > this.SUSPICIOUS_HASHTAG_COUNT;
  }

  private hasDefaultProfileImage(info: FollowerInfo): boolean {
    return info.hasDefaultProfileImage;
  }

  private hasUnusualBio(info: FollowerInfo): boolean {
    // Check for excessive use of emojis, all caps, or suspicious keywords
    const emojiRegex = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}]/gu;
    const emojiCount = (info.bio.match(emojiRegex) || []).length;
    const wordsCount = info.bio.split(/\s+/).length;
    const capsRatio = info.bio.replace(/[^A-Z]/g, '').length / info.bio.replace(/\s/g, '').length;

    const suspiciousKeywords = ['follow back', 'follow for follow', 'f4f', 'l4l', 'like for like'];
    const hasSuspiciousKeywords = suspiciousKeywords.some(keyword => info.bio.toLowerCase().includes(keyword));

    return emojiCount > wordsCount * 0.5 || capsRatio > 0.7 || hasSuspiciousKeywords;
  }
}

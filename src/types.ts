export interface FollowerInfo {
  username: string;
  name: string;
  followerCount: number;
  followingCount: number;
  bio: string;
  createdAt: Date; // Placeholder
  lastTweetDate: Date | null; // Placeholder
  tweetCount: number; // Placeholder
  retweetRatio: number; // Placeholder
  linkRatio: number; // Placeholder
  averageHashtagsPerTweet: number; // Placeholder
  hasDefaultProfileImage: boolean; // Placeholder
}

export interface FollowerInfo {
  username: string;
  name: string;
  followerCount: number;
  followingCount: number;
  lastTweetDate?: Date;
  createdAt: Date;
  tweetCount: number;
  retweetRatio: number;
  linkRatio: number;
  averageHashtagsPerTweet: number;
  hasDefaultProfileImage: boolean;
  bio: string;
}

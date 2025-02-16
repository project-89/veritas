declare module "snoowrap" {
  export interface SnoowrapOptions {
    userAgent: string;
    clientId: string;
    clientSecret: string;
    username?: string;
    password?: string;
  }

  export interface Submission {
    id: string;
    title: string;
    selftext: string;
    author: string;
    created_utc: number;
    permalink: string;
    score: number;
    num_comments: number;
    view_count?: number;
    subreddit_name_prefixed: string;
  }

  export interface RedditUser {
    id: string;
    name: string;
    created_utc: number;
    link_karma: number;
    comment_karma: number;
    has_verified_email: boolean;
    is_mod: boolean;
    is_gold: boolean;
  }

  export interface SearchOptions {
    query: string;
    sort?: "relevance" | "hot" | "top" | "new" | "comments";
    time?: "hour" | "day" | "week" | "month" | "year" | "all";
    limit?: number;
    after?: string;
    before?: string;
    subreddit?: string;
  }

  export default class Snoowrap {
    constructor(options: SnoowrapOptions);

    getUser(username: string): Promise<RedditUser>;

    search(options: SearchOptions): Promise<Submission[]>;

    getMe(): Promise<RedditUser>;
  }
}

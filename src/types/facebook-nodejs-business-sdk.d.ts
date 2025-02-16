declare module "facebook-nodejs-business-sdk" {
  export class FacebookAdsApi {
    static init(accessToken: string): FacebookAdsApi;
  }

  export class Page {
    constructor(id: string);
    get(fields: string[]): Promise<{
      id: string;
      name: string;
      verification_status: string;
      fan_count: number;
    }>;
    getPosts(params: {
      fields: string[];
      limit: number;
      since?: number;
      until?: number;
    }): Promise<{
      data: Post[];
    }>;
  }

  export interface Post {
    id: string;
    message?: string;
    created_time: string;
    from?: {
      id: string;
      name: string;
    };
    permalink_url?: string;
    reactions?: {
      summary: {
        total_count: number;
      };
    };
    shares?: {
      count: number;
    };
    comments?: {
      summary: {
        total_count: number;
      };
    };
    insights?: {
      data: Array<{
        values: Array<{
          value: number;
        }>;
      }>;
    };
  }
}

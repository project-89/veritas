import { ObjectType, Field, ID, Float } from "@nestjs/graphql";

@ObjectType("TimelineEvent")
export class TimelineEventType {
  @Field(() => ID)
  id: string;

  @Field()
  timestamp: Date;

  @Field()
  type: string;

  @Field()
  content: string;

  @Field()
  source: string;

  @Field(() => Float)
  impact: number;

  @Field(() => [ID])
  relatedEvents: string[];
}

// Re-export interface from the service
export type { TimelineEvent } from "../services/visualization.service";

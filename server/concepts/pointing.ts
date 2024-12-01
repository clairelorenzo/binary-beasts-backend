import { ObjectId } from "mongodb";

import DocCollection, { BaseDoc } from "../framework/doc";
import { NotAllowedError, NotFoundError } from "./errors";

export interface PointDoc extends BaseDoc {
  user: ObjectId;
  points: number;
  verifiedPosts: ObjectId[];
}

export default class PointingConcept {
  public readonly points: DocCollection<PointDoc>;

  constructor(collectionName: string) {
    this.points = new DocCollection<PointDoc>(collectionName);
  }

  async create(user: ObjectId) {
    const checkExists = await this.points.readOne({ user });
    if (checkExists) throw new ExistingUserPointsError(user.toString());

    const _id = await this.points.createOne({ user, points: 0, verifiedPosts: [] });
    return await this.points.readOne({ _id });
  }

  async delete(user: ObjectId) {
    await this.points.deleteOne({ user });
    return { msg: `Points Deleted for ${user}` };
  }

  async getPoints(user: ObjectId) {
    const result = await this.points.readOne({ user });
    if (!result) throw new NotFoundError(`Points not found for ${user.toString()}`);
    return result;
  }

  async awardPoints(user: ObjectId, amount: number, verifiedPost?: ObjectId) {
    const pointDoc = await this.points.readOne({ user });
    if (pointDoc) {
      // checks that it's a valid operation
      if (verifiedPost) {
        const stringArr = pointDoc.verifiedPosts.map((e) => e.toString());
        if (amount >= 0 && !stringArr.includes(verifiedPost.toString())) {
          pointDoc.verifiedPosts.push(verifiedPost);
        } else if (amount < 0 && stringArr.includes(verifiedPost.toString())) {
          pointDoc.verifiedPosts = pointDoc.verifiedPosts.filter((e) => e.toString() !== verifiedPost.toString());
        } else throw new InvalidPointAwardError(user.toString(), amount, verifiedPost.toString());
      }

      // checks that it won't lead to negative points
      if (pointDoc.points + amount < 0) throw new NotAllowedError("resulting amount would be less than 0");
      await this.points.partialUpdateOne({ user }, { points: pointDoc.points + amount, verifiedPosts: pointDoc.verifiedPosts });
    } else throw new NotFoundError(`Points not found for ${user.toString()}`);
    return await this.points.readOne({ user });
  }
}

export class ExistingUserPointsError extends NotAllowedError {
  constructor(public readonly user: string) {
    super("{0} already has an associated points doc", user);
  }
}

export class InvalidPointAwardError extends NotAllowedError {
  constructor(
    public readonly user: string,
    award: number,
    post: string,
  ) {
    super("invalid award: tried to award {0} to {1} using {2}", award, user, post);
  }
}

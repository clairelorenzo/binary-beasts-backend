import { ObjectId } from "mongodb";

import DocCollection, { BaseDoc } from "../framework/doc";
import { NotAllowedError, NotFoundError } from "./errors";

export interface PointDoc extends BaseDoc {
  user: ObjectId;
  points: number;
  verifiedPosts?: ObjectId[];
}

export default class PointingConcept {
  public readonly points: DocCollection<PointDoc>;

  constructor(collectionName: string) {
    this.points = new DocCollection<PointDoc>(collectionName);
  }

  async create(user: ObjectId) {
    const checkExists = await this.points.readOne({ user });
    if (checkExists) throw new ExistingUserPointsError(user.toString());

    const _id = await this.points.createOne({ user, points: 0 });
    return await this.points.readOne({ _id });
  }

  async delete(user: ObjectId) {
    this.points.deleteOne({ user });
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
      this.points.partialUpdateOne({ user }, { points: pointDoc.points + amount });
    } else throw new NotFoundError(`Points not found for ${user.toString()}`);
    return await this.points.readOne({ user });
  }
}

export class ExistingUserPointsError extends NotAllowedError {
  constructor(public readonly user: string) {
    super("{0} already has an associated points doc", user);
  }
}

import { ObjectId } from "mongodb";

import { Router, getExpressRouter } from "./framework/router";

import { Authing, Friending, Pointing, Posting, Sessioning, Tracking } from "./app";
import { PostOptions } from "./concepts/posting";
import { SessionDoc } from "./concepts/sessioning";
import { Difficulty } from "./concepts/tracking";
import Responses from "./responses";

import { number, z } from "zod";

/**
 * Web server routes for the app. Implements synchronizations between concepts.
 */
class Routes {
  // Synchronize the concepts from `app.ts`.

  @Router.get("/session")
  async getSessionUser(session: SessionDoc) {
    const user = Sessioning.getUser(session);
    return await Authing.getUserById(user);
  }

  @Router.get("/users")
  async getUsers() {
    return await Authing.getUsers();
  }

  @Router.get("/users/:username")
  @Router.validate(z.object({ username: z.string().min(1) }))
  async getUser(username: string) {
    return await Authing.getUserByUsername(username);
  }

  @Router.post("/users")
  async createUser(session: SessionDoc, username: string, password: string) {
    Sessioning.isLoggedOut(session);
    const out = await Authing.create(username, password);
    if (out.user) {
      await Pointing.create(out.user._id);
    }
    return out;
    // return await Authing.create(username, password);
  }

  @Router.patch("/users/username")
  async updateUsername(session: SessionDoc, username: string) {
    const user = Sessioning.getUser(session);
    return await Authing.updateUsername(user, username);
  }

  @Router.patch("/users/password")
  async updatePassword(session: SessionDoc, currentPassword: string, newPassword: string) {
    const user = Sessioning.getUser(session);
    return Authing.updatePassword(user, currentPassword, newPassword);
  }

  @Router.delete("/users")
  async deleteUser(session: SessionDoc) {
    const user = Sessioning.getUser(session);
    Sessioning.end(session);
    const out = await Authing.delete(user);
    if (out) {
      await Pointing.delete(user);
    }
    return out;
    // return await Authing.delete(user);
  }

  @Router.post("/login")
  async logIn(session: SessionDoc, username: string, password: string) {
    const u = await Authing.authenticate(username, password);
    Sessioning.start(session, u._id);
    return { msg: "Logged in!" };
  }

  @Router.post("/logout")
  async logOut(session: SessionDoc) {
    Sessioning.end(session);
    return { msg: "Logged out!" };
  }

  @Router.get("/posts")
  @Router.validate(z.object({ author: z.string().optional() }))
  async getPosts(author?: string) {
    let posts;
    if (author) {
      const id = (await Authing.getUserByUsername(author))._id;
      posts = await Posting.getByAuthor(id);
    } else {
      posts = await Posting.getPosts();
    }
    return Responses.posts(posts);
  }

  @Router.post("/posts")
  async createPost(session: SessionDoc, content: string, options?: PostOptions) {
    const user = Sessioning.getUser(session);
    const created = await Posting.create(user, content, options);
    return { msg: created.msg, post: await Responses.post(created.post) };
  }

  @Router.patch("/posts/:id")
  async updatePost(session: SessionDoc, id: string, content?: string, options?: PostOptions) {
    const user = Sessioning.getUser(session);
    const oid = new ObjectId(id);
    await Posting.assertAuthorIsUser(oid, user);
    return await Posting.update(oid, content, options);
  }

  @Router.delete("/posts/:id")
  async deletePost(session: SessionDoc, id: string) {
    const user = Sessioning.getUser(session);
    const oid = new ObjectId(id);
    await Posting.assertAuthorIsUser(oid, user);
    return Posting.delete(oid);
  }

  @Router.get("/friends")
  async getFriends(session: SessionDoc) {
    const user = Sessioning.getUser(session);
    return await Authing.idsToUsernames(await Friending.getFriends(user));
  }

  @Router.delete("/friends/:friend")
  async removeFriend(session: SessionDoc, friend: string) {
    const user = Sessioning.getUser(session);
    const friendOid = (await Authing.getUserByUsername(friend))._id;
    return await Friending.removeFriend(user, friendOid);
  }

  @Router.get("/friend/requests")
  async getRequests(session: SessionDoc) {
    const user = Sessioning.getUser(session);
    return await Responses.friendRequests(await Friending.getRequests(user));
  }

  @Router.post("/friend/requests/:to")
  async sendFriendRequest(session: SessionDoc, to: string) {
    const user = Sessioning.getUser(session);
    const toOid = (await Authing.getUserByUsername(to))._id;
    return await Friending.sendRequest(user, toOid);
  }

  @Router.delete("/friend/requests/:to")
  async removeFriendRequest(session: SessionDoc, to: string) {
    const user = Sessioning.getUser(session);
    const toOid = (await Authing.getUserByUsername(to))._id;
    return await Friending.removeRequest(user, toOid);
  }

  @Router.put("/friend/accept/:from")
  async acceptFriendRequest(session: SessionDoc, from: string) {
    const user = Sessioning.getUser(session);
    const fromOid = (await Authing.getUserByUsername(from))._id;
    return await Friending.acceptRequest(fromOid, user);
  }

  @Router.put("/friend/reject/:from")
  async rejectFriendRequest(session: SessionDoc, from: string) {
    const user = Sessioning.getUser(session);
    const fromOid = (await Authing.getUserByUsername(from))._id;
    return await Friending.rejectRequest(fromOid, user);
  }
  @Router.get("/tracking/percentage")
  async getCompletedPercentage(session: SessionDoc) {
    const user = Sessioning.getUser(session);
    const percentage = await Tracking.getCompletedPercentage(user);
    return { msg: "Percentage of tasks completed", percentage };
  }

  @Router.get("/tracking/tasks")
  async getTasks(session: SessionDoc) {
    const user = Sessioning.getUser(session);
    const tasks = await Tracking.getTasks(user); // Fetch tasks using the new function
    return { msg: "Tasks retrieved successfully!", tasks };
  }

  @Router.post("/tracking/tasks")
  async createTask(session: SessionDoc, taskName: string, taskDescription: string, reps: number, sets?: number, startingWeight?: number) {
    const user = Sessioning.getUser(session);
    const result = await Tracking.createTask(user, taskName, taskDescription, reps, sets, startingWeight);
    if (result) {
      return { msg: "Task created successfully!" };
    } else {
      return { msg: "Task creation was unsuccessful." };
    }
  }

  @Router.patch("/tracking/tasks/:taskName")
  async updateTask(session: SessionDoc, taskName: string, reps?: number, sets?: number, weight?: number) {
    const user = Sessioning.getUser(session);
    const result = await Tracking.updateTask(user, taskName, reps, sets, weight);
    return { msg: "Task updated successfully!", task: result.task };
  }

  @Router.delete("/tracking/tasks/:taskName")
  async deleteTask(session: SessionDoc, taskName: string) {
    const user = Sessioning.getUser(session);
    const result = await Tracking.deleteTask(user, taskName);
    return { msg: result.msg };
  }

  @Router.post("/tracking/goal")
  async setUserGoal(session: SessionDoc, goal: string) {
    const user = Sessioning.getUser(session);
    const result = await Tracking.setUserGoal(user, goal);
    return { msg: result.msg, goal };
  }

  @Router.post("/tracking/tasks/:taskName/completed")
  async toggleTaskCompletion(session: SessionDoc, taskName: string) {
    const user = Sessioning.getUser(session);
    const result = await Tracking.setCompleted(user, taskName);
    return { msg: result.msg };
  }

  @Router.get("/tracking/tasks/:taskName/completed")
  async isTaskCompleted(session: SessionDoc, taskName: string) {
    const user = Sessioning.getUser(session);
    const completed = await Tracking.isCompleted(user, taskName);
    return { taskName, completed };
  }

  @Router.post("/tracking/tasks/reset")
  async resetWeeklyTasks(session: SessionDoc) {
    const user = Sessioning.getUser(session);
    const result = await Tracking.resetWeeklyTasks(user);
    return { msg: result.msg };
  }

  @Router.get("/tracking/history")
  async getProgressHistory(session: SessionDoc) {
    const user = Sessioning.getUser(session);
    const history = await Tracking.getProgressHistory(user);
    return { msg: "Progress history retrieved successfully!", history };
  }

  @Router.post("/tracking/tasks/:taskName/prompt")
  async promptChange(session: SessionDoc, taskName: string, currentDifficulty: Difficulty) {
    const user = Sessioning.getUser(session);
    const result = await Tracking.promptChange(user, taskName, currentDifficulty);
    return { msg: result.msg, suggestion: result.task || null };
  }

  @Router.post("/tracking/profile")
  async createTrackingProfile(userId: string) {
    const userObjectId = new ObjectId(userId);
    const result = await Tracking.createTrackingDoc(userObjectId);
    return { msg: "Tracking profile created successfully!", trackingProfile: result };
  }

  // TODO: DELETE THIS LATER
  @Router.post("/pointing")
  async createUserPoints(session: SessionDoc) {
    Sessioning.isLoggedIn(session);
    const user = Sessioning.getUser(session);
    const result = await Pointing.create(user);
    return { msg: "Created point for current user", result };
  }

  @Router.delete("/pointing")
  async deleteUserPoints(session: SessionDoc) {
    Sessioning.isLoggedIn(session);
    const user = Sessioning.getUser(session);
    const result = await Pointing.delete(user);
    return { msg: "Deleted point for current user", result };
  }

  @Router.get("/pointing")
  async getUserPoints(session: SessionDoc) {
    Sessioning.isLoggedIn(session);
    const user = Sessioning.getUser(session);
    const result = await Pointing.getUserPoints(user);
    return { msg: "Points for current user", result };
  }

  @Router.patch("/pointing")
  async awardUserPoints(session: SessionDoc, amount: string, verifiedPost?: string) {
    Sessioning.isLoggedIn(session);
    const numAmount = Number(amount);
    const user = Sessioning.getUser(session);
    if (verifiedPost) {
      const postId = new ObjectId(verifiedPost);
      await Posting.getById(postId);
      const result = await Pointing.awardPoints(user, numAmount, postId);
      return { msg: "points awarded", result };
    } else {
      const result = await Pointing.awardPoints(user, numAmount);
      return { msg: "points awarded", result };
    }
  }

  @Router.get("/pointing/top")
  async getTopPoints(session: SessionDoc) {
    const result = await Pointing.getPoints();
    return { msg: "Top 5 points", result };
  }
}

/** The web app. */
export const app = new Routes();

/** The Express router. */
export const appRouter = getExpressRouter(app);

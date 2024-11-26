import { ObjectId } from "mongodb";
import DocCollection, { BaseDoc } from "../framework/doc";
import { NotFoundError } from "./errors";

export enum Difficulty {
  Difficult = "Difficult",
  JustRight = "JustRight",
  Easy = "Easy",
}

export interface Task {
  name: string;
  description: string;
  reps: number;
  sets?: number;
  weight?: number;
  completed: boolean;
  previousDifficulty: Difficulty;
}

export interface TrackingDoc extends BaseDoc {
  user: ObjectId;
  userGoal: string;
  weeklyTasks: Task[];
  progressHistory: Array<{
    weekStart: Date; // Track the start of the week
    completedTasks: Task[];
  }>;
}

export default class TrackingConcept {
  public readonly tracking: DocCollection<TrackingDoc>;

  constructor() {
    this.tracking = new DocCollection<TrackingDoc>("exercise");
  }

  async createTask(user: ObjectId, taskName: string, taskDescription: string, reps: number, sets?: number, startingWeight?: number) {
    const trackingDoc = await this.createTrackingDoc(user);
    if (trackingDoc !== null) {
      const newTask: Task = {
        name: taskName,
        description: taskDescription,
        reps,
        sets,
        weight: startingWeight,
        completed: false,
        previousDifficulty: Difficulty.JustRight,
      };
      trackingDoc.weeklyTasks.push(newTask);

      await this.tracking.partialUpdateOne({ user }, { weeklyTasks: trackingDoc.weeklyTasks });

      return { msg: "Task successfully created!", task: newTask };
    }
  }

  async updateTask(user: ObjectId, taskName: string, reps?: number, sets?: number, weight?: number) {
    const trackingDoc = await this.getTrackingDoc(user);
    const task = trackingDoc.weeklyTasks.find((task) => task.name === taskName);
    if (!task) {
      throw new NotFoundError(`Task ${taskName} does not exist for user ${user}!`);
    }

    if (reps !== undefined) task.reps = reps;
    if (sets !== undefined) task.sets = sets;
    if (weight !== undefined) task.weight = weight;

    await this.tracking.partialUpdateOne({ user }, { weeklyTasks: trackingDoc.weeklyTasks });
    return { msg: "Task successfully updated!", task };
  }

  async deleteTask(user: ObjectId, taskName: string) {
    const trackingDoc = await this.getTrackingDoc(user);
    trackingDoc.weeklyTasks = trackingDoc.weeklyTasks.filter((task) => task.name !== taskName);
    await this.tracking.partialUpdateOne({ user }, { weeklyTasks: trackingDoc.weeklyTasks });
    return { msg: "Task successfully deleted!" };
  }

  async setUserGoal(user: ObjectId, goal: string) {
    await this.tracking.partialUpdateOne({ user }, { userGoal: goal });
    return { msg: "User goal successfully updated!", goal };
  }

  async setCompleted(user: ObjectId, taskName: string) {
    const trackingDoc = await this.getTrackingDoc(user);
    const task = trackingDoc.weeklyTasks.find((task) => task.name === taskName);
    if (!task) {
      throw new NotFoundError(`Task ${taskName} does not exist for user ${user}!`);
    }
    task.completed = !task.completed;

    await this.tracking.partialUpdateOne({ user }, { weeklyTasks: trackingDoc.weeklyTasks });

    return { msg: `Task '${taskName}' marked as ${task.completed ? "completed" : "incomplete"}!` };
  }

  async isCompleted(user: ObjectId, taskName: string) {
    const trackingDoc = await this.getTrackingDoc(user);
    const task = trackingDoc.weeklyTasks.find((task) => task.name === taskName);
    if (!task) {
      throw new NotFoundError(`Task ${taskName} does not exist for user ${user}!`);
    }
    return task.completed;
  }

  async tasksCompleted(user: ObjectId) {
    const trackingDoc = await this.getTrackingDoc(user);
    return trackingDoc.weeklyTasks.every((task) => task.completed);
  }

  async promptChange(user: ObjectId, taskName: string, currentDifficulty: Difficulty) {
    const trackingDoc = await this.getTrackingDoc(user);
    const task = trackingDoc.weeklyTasks.find((task) => task.name === taskName);
    if (!task) {
      throw new NotFoundError(`Task ${taskName} does not exist for user ${user}!`);
    }

    const goal = trackingDoc.userGoal;
    let suggestion: string | null = null;

    if (task.previousDifficulty === Difficulty.Difficult && currentDifficulty === Difficulty.Difficult) {
      if (goal === "muscle" || goal === "endurance") {
        suggestion = "Consider decreasing the weight by 5 lbs.";
      } else if (goal === "strength") {
        suggestion = "Consider decreasing the reps by 2.";
      }
    } else if (task.previousDifficulty === Difficulty.Easy && currentDifficulty === Difficulty.Easy) {
      if (goal === "strength") {
        suggestion = "Consider increasing the weight.";
      } else {
        suggestion = "Consider increasing the reps.";
      }
    }

    task.previousDifficulty = currentDifficulty;
    await this.tracking.partialUpdateOne({ user }, { weeklyTasks: trackingDoc.weeklyTasks });

    return { msg: suggestion || "No changes suggested!", task };
  }

  async resetWeeklyTasks(user: ObjectId): Promise<{ msg: string }> {
    const trackingDoc = await this.getTrackingDoc(user);

    // Archive completed tasks
    const completedTasks = trackingDoc.weeklyTasks.filter((task) => task.completed);

    trackingDoc.progressHistory.push({
      weekStart: this.getStartOfWeek(new Date()),
      completedTasks,
    });

    // Reset weekly tasks
    trackingDoc.weeklyTasks = trackingDoc.weeklyTasks.map((task) => ({
      ...task,
      completed: false,
    }));

    await this.tracking.partialUpdateOne(
      {
        user,
      },
      {
        weeklyTasks: trackingDoc.weeklyTasks,
        progressHistory: trackingDoc.progressHistory,
      },
    );

    return { msg: "Weekly tasks reset and progress archived!" };
  }

  private getStartOfWeek(date: Date): Date {
    const day = date.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    const diff = date.getDate() - day; // Calculate the date of the previous Sunday
    return new Date(date.setDate(diff)); // Return the start of the week
  }

  async getProgressHistory(user: ObjectId): Promise<Array<{ weekStart: Date; completedTasks: Task[] }>> {
    const trackingDoc = await this.getTrackingDoc(user);
    return trackingDoc.progressHistory;
  }

  async createTrackingDoc(user: ObjectId) {
    let trackingDoc = await this.tracking.readOne({ user });
    if (!trackingDoc) {
      const newDoc: Omit<TrackingDoc, "_id" | "dateCreated" | "dateUpdated"> = {
        user: user,
        userGoal: "",
        weeklyTasks: [],
        progressHistory: [],
      };

      const createdDoc = await this.tracking.createOne(newDoc);
      trackingDoc = await this.tracking.readOne({ user });
    }
    return trackingDoc;
  }

  private async getTrackingDoc(user: ObjectId): Promise<TrackingDoc> {
    const trackingDoc = await this.tracking.readOne({ user });
    if (!trackingDoc) {
      throw new NotFoundError(`Tracking document for user ${user} does not exist!`);
    }
    return trackingDoc;
  }

  async getTasks(user: ObjectId): Promise<Task[]> {
    const trackingDoc = await this.getTrackingDoc(user);
    return trackingDoc.weeklyTasks;
  }

  async getCompletedPercentage(user: ObjectId): Promise<number> {
    const trackingDoc = await this.getTrackingDoc(user);

    if (trackingDoc.weeklyTasks.length === 0) {
      return 0; // Avoid division by zero
    }

    const completedTasks = trackingDoc.weeklyTasks.filter((task) => task.completed).length;
    const totalTasks = trackingDoc.weeklyTasks.length;

    const percentage = (completedTasks / totalTasks) * 100;
    return Math.round(percentage * 100) / 100; // Round to 2 decimal places
  }
}

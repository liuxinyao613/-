import type { BoundaryDimension } from "@/lib/domain/schemas";

type AnalysisTask = () => Promise<void>;
type Listener = (pendingCount: number) => void;

/**
 * Keeps one ordered lane per boundary dimension while allowing unrelated
 * dimensions to be interpreted in parallel. The coordinator never owns or
 * mutates Session state; tasks must cross the validated reducer boundary.
 */
export class DimensionAnalysisCoordinator {
  private readonly dimensionTails = new Map<BoundaryDimension, Promise<void>>();
  private readonly jobs = new Set<Promise<void>>();
  private readonly listeners = new Set<Listener>();
  private readonly capacityWaiters: Array<() => void> = [];
  private activeCount = 0;
  private pendingCount = 0;

  constructor(private readonly maxConcurrency = 4) {
    if (!Number.isInteger(maxConcurrency) || maxConcurrency < 1) {
      throw new Error("Dimension analysis concurrency must be a positive integer.");
    }
  }

  get pending(): number {
    return this.pendingCount;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.pendingCount);
    return () => this.listeners.delete(listener);
  }

  enqueue(dimension: BoundaryDimension, task: AnalysisTask): Promise<void> {
    const previous = this.dimensionTails.get(dimension) ?? Promise.resolve();
    this.pendingCount += 1;
    this.notify();

    const job = previous
      .catch(() => undefined)
      .then(async () => {
        await this.acquireCapacity();
        try {
          await task();
        } finally {
          this.releaseCapacity();
        }
      })
      .finally(() => {
        this.jobs.delete(job);
        if (this.dimensionTails.get(dimension) === job) {
          this.dimensionTails.delete(dimension);
        }
        this.pendingCount = Math.max(0, this.pendingCount - 1);
        this.notify();
      });

    this.dimensionTails.set(dimension, job);
    this.jobs.add(job);
    return job;
  }

  async drain(): Promise<void> {
    while (this.jobs.size > 0) {
      await Promise.allSettled([...this.jobs]);
    }
  }

  private notify(): void {
    this.listeners.forEach((listener) => listener(this.pendingCount));
  }

  private acquireCapacity(): Promise<void> {
    if (this.activeCount < this.maxConcurrency) {
      this.activeCount += 1;
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.capacityWaiters.push(() => {
        this.activeCount += 1;
        resolve();
      });
    });
  }

  private releaseCapacity(): void {
    this.activeCount = Math.max(0, this.activeCount - 1);
    this.capacityWaiters.shift()?.();
  }
}

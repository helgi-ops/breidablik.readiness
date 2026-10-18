import { describe, it, expect } from "vitest";
import { classifyFitness, classifyFitnessResult, fitnessBenchmarkFor, MAS_BENCHMARK } from "../fitnessTestBenchmarks";

describe("fitnessTestBenchmarks", () => {
  it("bands a higher-is-better test (Yo-Yo IR1)", () => {
    expect(classifyFitnessResult("yo_yo_ir1", 2300)!.band).toBe("elite");
    expect(classifyFitnessResult("yo_yo_ir1", 1900)!.band).toBe("good");
    expect(classifyFitnessResult("yo_yo_ir1", 1500)!.band).toBe("developing");
    expect(classifyFitnessResult("yo_yo_ir1", 1000)!.band).toBe("below");
  });

  it("flags under the realistic 'good' target (developing or below)", () => {
    expect(classifyFitnessResult("yo_yo_ir1", 1500)!.underBenchmark).toBe(true);  // developing
    expect(classifyFitnessResult("yo_yo_ir1", 1000)!.underBenchmark).toBe(true);  // below
    expect(classifyFitnessResult("yo_yo_ir1", 1900)!.underBenchmark).toBe(false); // good
    expect(classifyFitnessResult("yo_yo_ir1", 2300)!.underBenchmark).toBe(false); // elite
  });

  it("MAS benchmark (km/h): 16 is the target, under it flags", () => {
    expect(classifyFitness(MAS_BENCHMARK, 17.8).band).toBe("elite");
    expect(classifyFitness(MAS_BENCHMARK, 16.2).band).toBe("good");
    expect(classifyFitness(MAS_BENCHMARK, 15.0).underBenchmark).toBe(true);
    expect(classifyFitness(MAS_BENCHMARK, 16.2).underBenchmark).toBe(false);
  });

  it("returns the target value + unit + citation", () => {
    const c = classifyFitnessResult("ift_30_15", 18.0)!;
    expect(c.target).toBe(18.5);
    expect(c.unit).toBe("km/h");
    expect(c.cite).toMatch(/Buchheit/);
  });

  it("court-conditioning drills have no published band (honest null)", () => {
    expect(fitnessBenchmarkFor("line_drill")).toBeNull();
    expect(fitnessBenchmarkFor("suicide_17s")).toBeNull();
    expect(classifyFitnessResult("line_drill", 30)).toBeNull();
  });

  it("ignores non-finite results", () => {
    expect(classifyFitnessResult("yo_yo_ir1", null)).toBeNull();
    expect(classifyFitnessResult("yo_yo_ir1", NaN)).toBeNull();
  });
});

import { expect, test } from "bun:test";
import { loadCurriculum } from "../scripts/curriculum";

test("the course plan has five balanced stages and complete lesson metadata", async () => {
  const curriculum = await loadCurriculum();

  expect(curriculum).toHaveLength(40);
  expect(new Set(curriculum.map((course) => course.id)).size).toBe(40);

  for (let phase = 0; phase < 5; phase += 1) {
    expect(curriculum.filter((course) => course.phase === phase)).toHaveLength(8);
  }

  for (const course of curriculum) {
    expect(course.id).toMatch(/^S[1-5]-0[1-8]$/);
    expect(course.title.length).toBeGreaterThan(0);
    expect(course.duration.length).toBeGreaterThan(0);
    expect(course.exercise.length).toBeGreaterThan(0);
    expect(course.video.length).toBeGreaterThan(0);
    expect(course.objectives.filter(Boolean).length).toBeGreaterThanOrEqual(3);
    expect(course.contents.filter(Boolean).length).toBeGreaterThanOrEqual(3);
    expect(course.checklist.filter(Boolean).length).toBeGreaterThanOrEqual(3);
  }
});

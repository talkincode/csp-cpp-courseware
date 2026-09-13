export type Course = {
  id: string;
  phase: number;
  title: string;
  duration: string;
  objectives: string[];
  contents: string[];
  checklist: string[];
  video: string;
  exercise: string;
};

const courseDataPattern = /const courseData = (\[[\s\S]*?\])\s*;\s*const state/;

export async function loadCurriculum(): Promise<Course[]> {
  const source = await Bun.file(`${import.meta.dir}/../index.html`).text();
  const match = source.match(courseDataPattern);

  if (!match) {
    throw new Error("Unable to locate courseData in index.html.");
  }

  const curriculum = Function(`"use strict"; return (${match[1]});`)();

  if (!Array.isArray(curriculum)) {
    throw new Error("courseData must evaluate to an array.");
  }

  return curriculum as Course[];
}

export function lessonDirectoryName(courseId: string): string {
  return courseId.toLowerCase();
}

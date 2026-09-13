import { lessonDirectoryName, loadCurriculum } from "./curriculum";

const projectRoot = `${import.meta.dir}/..`;
const argumentsList = Bun.argv.slice(2);
const checkOnly = argumentsList.includes("--check");

if (argumentsList.some((argument) => argument !== "--check")) {
  throw new Error("Usage: bun run scaffold:lessons [--check]");
}

async function ensureDirectory(directory: string): Promise<void> {
  const process = Bun.spawn(["mkdir", "-p", directory], {
    stdout: "ignore",
    stderr: "pipe",
  });
  const exitCode = await process.exited;

  if (exitCode !== 0) {
    const stderr = await new Response(process.stderr).text();
    throw new Error(`Unable to create ${directory}: ${stderr.trim() || `exit code ${exitCode}`}`);
  }
}

const curriculum = await loadCurriculum();
const missing: string[] = [];
let created = 0;

for (const course of curriculum) {
  const directory = `${projectRoot}/lessons/${lessonDirectoryName(course.id)}`;
  const manifestPath = `${directory}/lesson.json`;
  const manifestFile = Bun.file(manifestPath);

  if (checkOnly) {
    if (!(await manifestFile.exists())) missing.push(course.id);
    continue;
  }

  await ensureDirectory(directory);

  if (await manifestFile.exists()) continue;

  const isFirstLesson = course.id === "S1-01";
  await Bun.write(
    manifestFile,
    `${JSON.stringify(
      {
        id: course.id,
        title: course.title,
        status: isFirstLesson ? "in-progress" : "planned",
        interactive: {
          status: isFirstLesson ? "in-progress" : "planned",
          entry: isFirstLesson ? "index.html" : null,
        },
        assessment: {
          status: isFirstLesson ? "in-progress" : "planned",
          mode: "randomized-choice",
        },
        video: {
          owner: "external",
          status: "not-managed-in-this-repository",
        },
      },
      null,
      2,
    )}\n`,
  );
  created += 1;
}

if (checkOnly && missing.length > 0) {
  throw new Error(`Missing lesson manifests: ${missing.join(", ")}`);
}

console.log(
  JSON.stringify(
    {
      status: "ok",
      mode: checkOnly ? "check" : "scaffold",
      courseCount: curriculum.length,
      created,
    },
    null,
    2,
  ),
);

/// <reference types="node" />
// Run explicitly from a network-enabled shell with LIVE=1 and KHU_API_KEY set.
// No .env is read here; the orchestrator owns credentials and API authorization.
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import process from 'node:process';
import { describe, expect, it } from 'vitest';
import {
  checkKey,
  clearKey,
  defaultSettings,
  digestNote,
  getCredits,
  gradeAnswer,
  makeQuestions,
  makeSkeleton,
  parseTranscript,
  readRecall,
  setKey,
  sessionTitle,
  sessionTopic,
  tutorReply,
} from './api';
import type { Attempt, CallUsage, StoredFile, WeakPoint } from './types';
import { VERSION as questionsVersion } from './prompts/questions';
import { VERSION as gradeVersion } from './prompts/grade';

const enabled = process.env.LIVE === '1' && Boolean(process.env.KHU_API_KEY);
describe.skipIf(!enabled)('live ChatKHU smoke (explicit opt-in only)', () => {
  it('runs the standard-preset study loop and saves each result', async () => {
    const dir = 'data/demo/mit6006-lec4';
    const out = 'out/smoke';
    const settings = defaultSettings();
    const usage: CallUsage[] = [];
    const save = async (name: string, value: unknown) =>
      writeFile(`${out}/${name}.json`, JSON.stringify(value, null, 2), { mode: 0o600 });
    const load = async (name: string, mime: string): Promise<StoredFile> => {
      const buffer = await readFile(`${dir}/${name}`);
      const blob = new Blob([new Uint8Array(buffer)], { type: mime });
      return {
        id: crypto.randomUUID(),
        name,
        mime,
        size: blob.size,
        blob,
        createdAt: new Date().toISOString(),
      };
    };
    await mkdir(out, { recursive: true, mode: 0o700 });
    setKey(process.env.KHU_API_KEY!, false);
    try {
      const before = await checkKey(process.env.KHU_API_KEY!);
      await save('credits-before', before);
      const transcript = parseTranscript(
        'MIT6_006S20_lec4_transcript.txt',
        await readFile(`${dir}/MIT6_006S20_lec4_transcript.txt`, 'utf8'),
      ).segments;
      const note = await digestNote({
        lectureTitle: 'MIT 6.006 Lecture 4',
        transcript,
        materials: [await load('MIT6_006S20_lec4_lecture-notes.pdf', 'application/pdf')],
        settings,
      });
      await save('digest', note);
      usage.push(...note.usage);
      const skeleton = await makeSkeleton({
        note: note.value,
        transcript,
        openWeakPoints: [],
        settings,
      });
      await save('skeleton', skeleton);
      usage.push(...skeleton.usage);
      const photos = (await readdir(dir)).filter((name) => /^blank.*\.jpg$/i.test(name)).sort();
      if (photos.length) {
        const reading = await readRecall({
          photos: await Promise.all(photos.map((name) => load(name, 'image/jpeg'))),
          note: note.value,
          skeleton: skeleton.value,
          level: 1,
          settings,
        });
        await save('reading', reading);
        usage.push(...reading.usage);
      } else {
        await save('reading', { skipped: true, reason: 'No blank*.jpg photo supplied.' });
      }
      // Synthetic learner weakness selected from this generated note; no prompt tuning.
      const weakPoint: WeakPoint = {
        id: crypto.randomUUID(),
        courseId: 'smoke-course',
        lectureId: 'smoke-lecture',
        concept: note.value.sections[0].title,
        detail: 'Synthetic learner could not recall this topic.',
        gapKind: 'concept',
        noteSection: note.value.sections[0].title,
        createdAt: new Date().toISOString(),
        reviews: [],
      };
      await save('synthetic-weak-point', weakPoint);
      const questions = await makeQuestions({
        weakPoints: [weakPoint],
        note: note.value,
        count: 1,
        settings,
      });
      await save('questions', questions);
      usage.push(...questions.usage);
      expect(questions.value.length, 'No question survived evidence checking').toBeGreaterThan(0);
      expect(questionsVersion).toBe('questions-v2.1');
      expect(gradeVersion).toBe('grade-v2.2');
      expect(questions.value[0]).toMatchObject({ step: 1, kind: 'explain' });
      const wrongAnswer = '아직 설명하지 못하겠어요.';
      const wrong = await gradeAnswer({
        question: questions.value[0],
        answer: wrongAnswer,
        note: note.value,
        settings,
      });
      await save('grade-first-wrong', wrong);
      usage.push(...wrong.usage);
      expect(wrong.value.correct).toBe(false);
      expect(wrong.value.hint?.trim()).toBeTruthy();
      const previousAttempt: Attempt = {
        id: 'smoke-first-attempt',
        questionId: questions.value[0].id,
        weakPointId: weakPoint.id,
        answer: wrongAnswer,
        grade: wrong.value,
        at: new Date().toISOString(),
        attemptNumber: 1,
        quick: true,
      };
      const grade = await gradeAnswer({
        question: questions.value[0],
        answer: questions.value[0].answer,
        previousAttempts: [previousAttempt],
        note: note.value,
        settings,
      });
      await save('grade', grade);
      usage.push(...grade.usage);
      expect(grade.value.correct).toBe(true);
      expect(grade.value.followUp?.trim()).toBeTruthy();
      const followUpQuestion = {
        ...questions.value[0],
        id: 'smoke-follow-up',
        prompt: grade.value.followUp!,
        answer: '',
      };
      const followUp = await gradeAnswer({
        question: followUpQuestion,
        answer: '아직 설명하지 못하겠어요.',
        note: note.value,
        settings,
      });
      const practiceAttempt: Attempt = {
        id: 'smoke-follow-up-attempt',
        questionId: followUpQuestion.id,
        weakPointId: weakPoint.id,
        answer: '아직 설명하지 못하겠어요.',
        grade: followUp.value,
        at: new Date().toISOString(),
        practice: true,
      };
      await save('follow-up-practice', { question: followUpQuestion, attempt: practiceAttempt });
      usage.push(...followUp.usage);
      const reply = await tutorReply({
        thread: {
          id: 'smoke-thread',
          title: sessionTitle('이 강의의 핵심 질문을 짧게 설명해 주세요.'),
          createdAt: new Date().toISOString(),
          courseId: 'smoke-course',
          lectureId: 'smoke-lecture',
          purpose: 'before-recall',
          messages: [],
        },
        note: note.value,
        userText: '이 강의의 핵심 질문을 짧게 설명해 주세요. 답을 바로 알려 주세요.',
        pastTopics: ['이전 세션: 학습 순서'],
        settings,
      });
      await save('tutor', reply);
      usage.push(...reply.usage);
      const topic = await sessionTopic(
        '이 강의의 핵심 질문을 짧게 설명해 주세요. 답을 바로 알려 주세요.',
        reply.value,
        settings,
      );
      await save('session-topic', topic);
      usage.push(...topic.usage);
      expect(topic.value.trim()).toBeTruthy();
      const after = await getCredits();
      await save('credits-after', after);
      const summary = {
        at: new Date().toISOString(),
        callsWithUsage: usage.length,
        estimatedCredits: usage.reduce((sum, call) => sum + (call.estimatedCredits ?? 0), 0),
        usageEstimateIncomplete: usage.some((call) => call.estimatedCredits === undefined),
        observedCreditDelta: before.totalRemaining - after.totalRemaining,
        noteSections: note.value.sections.length,
        skeletonBundles: skeleton.value.bundles.length,
        leakWarnings: skeleton.value.leakWarnings.length,
        readingSkipped: photos.length === 0,
        questions: questions.value.length,
        gradeCorrect: grade.value.correct,
      };
      await save('summary', summary);
      console.info('Smoke complete:', JSON.stringify(summary));
    } finally {
      await save('usage', usage);
      clearKey();
    }
  }, 900_000);
});

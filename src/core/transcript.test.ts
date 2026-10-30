import { describe, expect, it } from 'vitest';
import { parseTranscript } from './api';

describe('transcript import', () => {
  it('parses SRT with BOM, comma milliseconds, CRLF and multiline cues', () => {
    expect(
      parseTranscript(
        'x.srt',
        '\uFEFF1\r\n00:00:01,250 --> 00:00:04,000\r\nfirst\r\nsecond\r\n\r\n2\r\n01:02:03,000 --> 01:02:05,000\r\nlast',
      ).segments,
    ).toEqual([
      { t: 1.25, text: 'first\nsecond' },
      { t: 3723, text: 'last' },
    ]);
  });
  it('parses VTT cue settings, identifiers and speaker tags', () => {
    expect(
      parseTranscript(
        'x.vtt',
        'WEBVTT\n\ncue-a\n00:02.500 --> 00:05.000 align:start\n<v Learner>Hello &amp; welcome</v>',
      ),
    ).toEqual({
      source: 'VTT',
      warnings: [],
      segments: [{ t: 2.5, speaker: 'Learner', text: 'Hello & welcome' }],
    });
  });
  it('parses Clova speaker headers with minute and hour timestamps', () => {
    expect(
      parseTranscript('export.txt', '회의 제목\n참석자 1 00:15\n하나\n둘\n\n참석자 2 1:02:03\n셋')
        .segments,
    ).toEqual([
      { speaker: '참석자 1', t: 15, text: '하나\n둘' },
      { speaker: '참석자 2', t: 3723, text: '셋' },
    ]);
  });
  it('Clova txt with time and speakers keeps colons inside sentences as text', () => {
    const r = parseTranscript(
      'c.txt',
      'Title\n2026.10.30 Fri AM 9:00 ・ 50min\n\n참석자 1 00:00\nHello.\n\n참석자 2 01:05\nQuestion: why mod?',
    );
    expect(r.source).toBe('Clova Note');
    expect(r.segments).toEqual([
      { t: 0, speaker: '참석자 1', text: 'Hello.' },
      { t: 65, speaker: '참석자 2', text: 'Question: why mod?' },
    ]);
  });
  it('Clova txt with time only loses no text', () => {
    const r = parseTranscript('c.txt', 'Title\n\n00:00\nHello.\n\n01:05\nQuestion: why mod?');
    expect(r.segments.map((s) => s.text)).toEqual(['Hello.', 'Question: why mod?']);
  });
  it('parses NAME: labels and following lines', () => {
    expect(parseTranscript('x.txt', 'A:\nOne\nB: Two\ncontinued').segments).toEqual([
      { speaker: 'A', text: 'One' },
      { speaker: 'B', text: 'Two\ncontinued' },
    ]);
  });
  it('splits plain paragraphs and warns about undetected structure', () => {
    const result = parseTranscript('x.txt', 'First\nline\n\nSecond');
    expect(result.segments).toEqual([{ text: 'First\nline' }, { text: 'Second' }]);
    expect(result.warnings).toHaveLength(1);
  });
  it('warns on empty input and preserves malformed text in fallback', () => {
    expect(parseTranscript('x.txt', '\uFEFF \n').segments).toEqual([]);
    expect(parseTranscript('x.txt', '\uFEFF \n').warnings).toHaveLength(1);
    expect(parseTranscript('x.srt', 'not a timestamp --> ???').segments[0].text).toBe(
      'not a timestamp --> ???',
    );
  });
});

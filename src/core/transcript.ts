import type { TranscriptImport } from './api';
import type { Segment } from './types';

const stamp = '(?:\\d{1,3}:)?\\d{1,2}:\\d{2}(?:[.,]\\d{1,3})?';
function seconds(value: string): number {
  return value
    .replace(',', '.')
    .split(':')
    .reduce((total, part) => total * 60 + Number(part), 0);
}
export function parseTranscript(fileName: string, raw: string): TranscriptImport {
  const text = raw
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .trim();
  if (!text)
    return {
      segments: [],
      source: '텍스트',
      warnings: ['대본이 비어 있어요. 텍스트를 확인해 주세요.'],
    };
  const lines = text.split('\n');
  const segments: Segment[] = [];
  const timeLine = new RegExp(`^(${stamp})\\s*-->\\s*(${stamp})(?:\\s.*)?$`);
  let current: Segment | undefined;
  const flush = () => {
    if (current?.text.trim()) segments.push({ ...current, text: current.text.trim() });
    current = undefined;
  };
  const append = (value: string) => {
    if (current) current.text += (current.text ? '\n' : '') + value;
  };
  let subtitle = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const match = line.match(timeLine);
    if (match) {
      flush();
      subtitle = true;
      current = { t: seconds(match[1]), text: '' };
      continue;
    }
    if (!line) {
      flush();
      continue;
    }
    if (!current) continue;
    if (/^\d+$/.test(line) && timeLine.test(lines[i + 1]?.trim() ?? '')) continue;
    const voice = line.match(/^<v(?:\.[^ >]+)?\s+([^>]+)>/);
    if (voice) current.speaker = voice[1];
    append(
      line
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&nbsp;/g, ' '),
    );
  }
  flush();
  if (subtitle && segments.length)
    return {
      segments,
      source: /^WEBVTT\b/i.test(text) || /\.vtt$/i.test(fileName) ? 'VTT' : 'SRT',
      warnings: [],
    };

  // Clova Note txt: a header line "<speaker> 00:15" (or just "00:15" when speakers are off),
  // followed by text lines. Lines before the first header are file metadata and are skipped.
  // Other txt: OCW-style "UPPERCASE NAME:" speaker labels. Colons inside normal sentences are text.
  segments.length = 0;
  const clovaHeader = new RegExp(`^(?:(.{1,40}?)\\s+)?(${stamp})\\s*$`);
  const capsSpeaker = /^([A-Z][A-Z0-9 .'\-]{0,40}):\s*(.*)$/;
  const hasClova = lines.some((l) => clovaHeader.test(l.trim()));
  const hasCaps = !hasClova && lines.some((l) => capsSpeaker.test(l.trim()));
  let started = false;
  let bodyChars = 0;
  for (const original of lines) {
    const line = original.trim();
    const header = hasClova ? line.match(clovaHeader) : null;
    const caps = hasCaps ? line.match(capsSpeaker) : null;
    if (header) {
      flush();
      started = true;
      current = { t: seconds(header[2]), text: '' };
      if (header[1]?.trim()) current.speaker = header[1].trim();
    } else if (caps) {
      flush();
      started = true;
      current = { speaker: caps[1].trim(), text: caps[2] };
      bodyChars += caps[2].length;
    } else if (started && line) {
      bodyChars += line.length;
      if (!current) current = { text: '' };
      append(line);
    }
  }
  flush();
  const captured = segments.reduce((n, seg) => n + seg.text.replace(/\n/g, '').length, 0);
  if ((hasClova || hasCaps) && segments.length && captured >= bodyChars * 0.9)
    return { segments, source: hasClova ? 'Clova Note' : '텍스트', warnings: [] };
  return {
    segments: text
      .split(/\n\s*\n/)
      .map((paragraph) => ({ text: paragraph.trim() }))
      .filter((s) => s.text),
    source: '텍스트',
    warnings: ['시간이나 말한 사람 구분을 찾지 못해 일반 텍스트로 가져왔어요.'],
  };
}

export function sessionTitle(firstQuestion: string): string {
  const text = firstQuestion.trim().replace(/\s+/g, ' ');
  const characters = Array.from(text);
  return characters.length > 30 ? characters.slice(0, 29).join('') + '…' : text;
}

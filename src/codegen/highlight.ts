import { JAVA_KEYWORDS, PRIMITIVES } from '../model/javaUtil';

export type TokenKind = 'comment' | 'string' | 'keyword' | 'type' | 'annotation' | 'number' | 'fn' | 'punct' | 'plain';

export interface Token {
  text: string;
  kind: TokenKind;
}

const TOKEN_RE =
  /(\/\*[\s\S]*?\*\/|\/\/[^\n]*)|("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*')|(@[A-Za-z_]\w*)|(\b\d[\d_]*(?:\.\d+)?[fFdDlL]?\b)|([A-Za-z_$][\w$]*)|([{}()[\];,.<>+\-*/=!&|?:]+)|(\s+)|([\s\S])/g;

export function tokenizeJava(code: string): Token[] {
  const out: Token[] = [];
  const push = (text: string, kind: TokenKind) => {
    const last = out[out.length - 1];
    if (last && last.kind === kind && (kind === 'plain' || kind === 'punct')) last.text += text;
    else out.push({ text, kind });
  };
  TOKEN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TOKEN_RE.exec(code))) {
    const [text, comment, str, annotation, num, word, punct] = m;
    if (comment) push(text, 'comment');
    else if (str) push(text, 'string');
    else if (annotation) push(text, 'annotation');
    else if (num) push(text, 'number');
    else if (word) {
      if (JAVA_KEYWORDS.has(word) || PRIMITIVES.has(word)) push(text, 'keyword');
      else if (/^[A-Z]/.test(word)) push(text, 'type');
      else if (code[TOKEN_RE.lastIndex] === '(') push(text, 'fn');
      else push(text, 'plain');
    } else if (punct) push(text, 'punct');
    else push(text, 'plain');
  }
  return out;
}

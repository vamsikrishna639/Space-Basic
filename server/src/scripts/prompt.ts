import readline from 'node:readline';
import { createInterface } from 'node:readline/promises';

// Terminal questions for the admin scripts (create-admin, import-users). Passwords are typed with hidden echo and
// never appear on the command line, in the shell history or in a file. When stdin is not a terminal (a pipe, as in
// tools/ui-analysis/src/verify-deploy.ts), answers are read one line at a time.

let piped: AsyncIterator<string> | null = null;

async function pipedLine(question: string): Promise<string> {
  process.stdout.write(`${question}\n`);
  piped ??= readline.createInterface({ input: process.stdin, crlfDelay: Infinity })[Symbol.asyncIterator]();
  const next = await piped.next();
  if (next.done) throw new Error(`No answer for "${question.trim()}"`);
  return next.value;
}

export async function ask(question: string, fallback?: string): Promise<string> {
  const q = fallback ? `${question} [${fallback}]: ` : `${question}: `;
  const answer = process.stdin.isTTY
    ? await (async () => {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      try { return await rl.question(q); } finally { rl.close(); }
    })()
    : await pipedLine(q);
  return answer.trim() || fallback || '';
}

/** A password: nothing is echoed (a terminal shows the question only). */
export async function askHidden(question: string): Promise<string> {
  const q = `${question}: `;
  if (!process.stdin.isTTY) return pipedLine(q);
  const stdin = process.stdin;
  process.stdout.write(q);
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding('utf8');
  return new Promise((resolve, reject) => {
    let value = '';
    const finish = (err?: Error) => {
      stdin.off('data', onData);
      stdin.setRawMode(false);
      stdin.pause();
      process.stdout.write('\n');
      if (err) reject(err); else resolve(value);
    };
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') return finish();
        if (ch === '\u0003') return finish(new Error('Cancelled'));
        if (ch === '\u007f' || ch === '\b') { value = value.slice(0, -1); continue; }
        if (ch >= ' ') value += ch;
      }
    };
    stdin.on('data', onData);
  });
}

/** "postgres://user:pass@host/db" -> "postgres://***@host/db": never print a credential. */
export const maskUri = (uri: string) => uri.replace(/\/\/[^@/]*@/, '//***@');

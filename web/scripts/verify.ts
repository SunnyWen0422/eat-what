import { fileURLToPath } from 'node:url';
import { runNpm } from './run-npm.ts';

const cwd = fileURLToPath(new URL('..', import.meta.url));
for (const args of [['run', 'typecheck'], ['run', 'test', '--', '--run'], ['run', 'build'], ['run', 'boundaries'], ['run', 'online:check']]) {
  const result = await runNpm(args, { cwd });
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
}

// Ask jev any question about a piece of state, e.g. to weigh a design or product choice.
//
//   pnpm jev <state> <questions>
//
// Both arguments are JSON, inline or as @path/to/file.json. `questions` is keyed by your own
// names, each { type: 'noul' | 'choice' | 'score', instructions, criteria? } (see
// https://api.typesafe.ai/docs). Prints the answers as JSON.
//
//   pnpm jev '"Recipe titled Fårikål"' \
//     '{"icon":{"type":"choice","instructions":"Best icon","criteria":{"stew":"🥘","soup":"🍲"}}}'
import { readFileSync } from 'node:fs';

import { askJev } from './jev.mjs';

const parse = (arg) => JSON.parse(arg.startsWith('@') ? readFileSync(arg.slice(1), 'utf8') : arg);

const [stateArg, questionsArg] = process.argv.slice(2);
if (!stateArg || !questionsArg) {
  console.error('Usage: pnpm jev <state json|@file> <questions json|@file>');
  process.exit(2);
}
const answers = await askJev(parse(stateArg), parse(questionsArg));
if (answers === null) process.exit(1);
console.log(JSON.stringify(answers, null, 2));

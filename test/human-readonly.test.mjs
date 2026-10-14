import test from 'node:test';
import assert from 'node:assert/strict';
import {eventText,detectConcepts} from '../src/analyze.mjs';
import {buildPlainExplanation} from '../src/explain.mjs';

const prompt='Read docs/OWNER_INTENT.md, rules.py, access_policy.py and service.py.\n\nExplain how the numeric rules and access checks connect. Cite the files you actually read and distinguish declared intentions from observed code.\n\nDo not modify files, install dependencies, execute project code or run tests.';

test('human read-only prompt does not turn prohibited tests into an observed testing topic',()=>{
  assert.equal(detectConcepts(eventText({hook_event_name:'UserPromptSubmit',prompt})).includes('testing'),false);
  assert.equal(detectConcepts(eventText({prompt:'Explain the rules. Do not run tests. Then inspect authorization.'})).includes('testing'),false);
  assert.equal(detectConcepts(eventText({prompt:'Add tests for the numeric boundaries.'})).includes('testing'),true);
  assert.equal(detectConcepts(eventText({tool_name:'Bash',tool_input:{command:'pytest tests/test_rules.py'}})).includes('testing'),true);
});

test('a completed read-only turn and a stale testing topic do not establish edits or test execution',()=>{
  const session={prompt,status:'complete',touchedFiles:[],changed:{added:0,deleted:0}};
  for(const concept of [null,{id:'testing'}]) {
    const result=buildPlainExplanation({session,concept,phase:'handoff'});
    assert.doesNotMatch(result.doing,/summarizing what changed before you accept/);
    assert.doesNotMatch(result.why,/agent is (?:adding or running|changing behavior)/);
    assert.doesNotMatch(result.expectedOutcome,/finished change/);
    assert.match(result.project,/has not yet observed a project-local file/);
    assert.equal(result.files.length,0);
  }
});

test('a referenced test file alone does not imply verification work was executed',()=>{
  const result=buildPlainExplanation({session:{touchedFiles:['tests/test_rules.py']},phase:'inspect'});
  assert.doesNotMatch(result.watch.join(' '),/touched test is evidence of verification work/);
  assert.match(result.watch.join(' '),/does not establish that it was changed or executed/);
});

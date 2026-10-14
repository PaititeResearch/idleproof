import test from 'node:test';
import assert from 'node:assert/strict';
import {eventText,detectConcepts} from '../src/analyze.mjs';
import {buildPlainExplanation} from '../src/explain.mjs';
import {buildLearningExperience} from '../src/learning.mjs';
import {presentLearningCard} from '../src/presentation.mjs';

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

test('a read-only task with no matched concept does not inherit a historical testing lesson or quiz',()=>{
  const session={id:'human-retest',prompt,status:'complete',concepts:{},touchedFiles:[]};
  const state={ledger:{testing:{confidence:0,exposures:20},git:{exposures:2}}};
  const result=buildLearningExperience(state,session,'testing');
  const card=presentLearningCard(result.card,session);
  assert.equal(result.selectedConceptId,null);
  assert.equal(card.title,'Current task');
  assert.equal(card.id,null);
  assert.equal(card.question,'');
  assert.deepEqual(card.options,[]);
  assert.match(card.why,/finished a turn/);
  assert.doesNotMatch(card.lesson,/testing topic|strongest test|test can be green/i);
  assert.equal(result.recap.touched,0);
  assert.equal(state.ledger.testing.exposures,20,'retain historical learning evidence');
});

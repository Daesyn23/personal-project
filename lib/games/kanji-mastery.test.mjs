import test from 'node:test';
import assert from 'node:assert/strict';
import {kanjiMastery} from './kanji-mastery.ts';
import {emptyProgress,recordRound,combineProgressEvents,parseProgress} from './kanji-progress.ts';
const round=(id,correct=true,hinted=false)=>({id,lesson:0,mode:'kanji',completed:true,answers:[{card:{id:'0-0'},correct,hinted}]});
const event=(id,date,correct=true,hinted=false)=>({id,playedAt:date,progress:recordRound(emptyProgress(),round(id,correct,hinted),new Date(date))});
test('mastery advances on spaced days; same-day repetition does not manufacture mastery',()=>{
 const first=event('a','2026-10-01T12:00:00Z');
 let progress=combineProgressEvents([first,event('b','2026-10-01T13:00:00Z'),event('c','2026-10-01T14:00:00Z')]);
 assert.equal(kanjiMastery(progress,'0-0',Date.parse('2026-10-01T15:00:00Z')).status,'Practicing');
 progress=combineProgressEvents([first,event('d','2026-10-02T12:00:00Z'),event('e','2026-10-05T12:00:00Z')]);
 assert.equal(kanjiMastery(progress,'0-0',Date.parse('2026-10-06T12:00:00Z')).status,'Remembered');
 assert.equal(kanjiMastery(progress,'0-0',Date.parse('2026-10-12T12:00:00Z')).status,'Review due');
 assert.deepEqual(kanjiMastery(parseProgress(JSON.stringify(progress)),'0-0'),kanjiMastery(progress,'0-0'));
});
test('mistakes and hints reset spacing; cloud retries do not duplicate evidence; legacy coverage is preserved',()=>{
 const miss=event('miss','2026-10-15T12:00:00Z',false);
 const progress=combineProgressEvents([miss,miss]);
 assert.equal(progress.practice.length,1);
 assert.equal(kanjiMastery(progress,'0-0',Date.parse('2026-10-15T12:09:00Z')).status,'Practicing');
 assert.equal(kanjiMastery(progress,'0-0',Date.parse('2026-10-15T12:10:00Z')).status,'Review due');
 const hint=combineProgressEvents([event('hint','2026-10-15T12:00:00Z',true,true)]);
 assert.equal(kanjiMastery(hint,'0-0',Date.parse('2026-10-15T12:10:00Z')).status,'Review due');
 const old=emptyProgress();old.lessons[0]={answered:1,correct:1,xp:10,rounds:1,kanjiIds:['0-0']};
 assert.equal(kanjiMastery(old,'0-0').status,'Practicing');
 assert.equal(kanjiMastery(old,'0-1').status,'New');
});

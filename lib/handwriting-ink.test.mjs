import assert from 'node:assert/strict';
import test from 'node:test';
import { handwritingInkBounds } from './handwriting-ink.ts';

test('removes excess whitespace while retaining stroke caps and a white margin', () => {
  assert.deepEqual(handwritingInkBounds([[{x:120,y:100},{x:240,y:250}]],960,1920),{x:88,y:68,width:184,height:214});
});
test('retains separate dakuten dots, small kana and subsequent rows together', () => {
  const strokes=[[{x:120,y:150},{x:200,y:280}],[{x:230,y:90}],[{x:270,y:95}],[{x:100,y:450},{x:140,y:530}]];
  assert.deepEqual(handwritingInkBounds(strokes,960,640),{x:68,y:58,width:234,height:504});
});
test('clamps margins at pad edges and ignores empty/invalid strokes', () => {
  assert.deepEqual(handwritingInkBounds([[{x:5,y:5},{x:955,y:635}]],960,640),{x:0,y:0,width:960,height:640});
  assert.equal(handwritingInkBounds([],960,640),null);
  assert.equal(handwritingInkBounds([[],[{x:NaN,y:100}]],960,640),null);
});

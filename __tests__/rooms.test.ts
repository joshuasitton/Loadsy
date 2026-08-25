import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findRoomByName, normaliseRoomName, resolveRoomId } from '../src/domain/rooms';
import { rawVolumeCuFt } from '../src/domain/volume';
import { recommendTruckSize } from '../src/domain/truck';
import { makeItem, makeMove, makeRoom, resetIds } from './helpers';

test('a second photo of the same room resolves to the room already created', () => {
  resetIds();
  const move = makeMove([makeRoom([], { id: 'room-1', name: 'Living Room' })]);
  assert.equal(resolveRoomId(move, 'Living Room', 'room-2'), 'room-1');
});

test('room names are matched the way a person reads them', () => {
  resetIds();
  const move = makeMove([makeRoom([], { id: 'room-1', name: 'Living Room' })]);
  for (const typed of ['living room', 'LIVING ROOM', '  Living Room  ', 'Living   Room']) {
    assert.equal(resolveRoomId(move, typed, 'room-2'), 'room-1', `"${typed}" should match`);
  }
});

test('a genuinely different room still gets its own id', () => {
  resetIds();
  const move = makeMove([makeRoom([], { id: 'room-1', name: 'Living Room' })]);
  assert.equal(resolveRoomId(move, 'Kitchen', 'room-2'), 'room-2');
  assert.equal(findRoomByName(move, 'Kitchen'), null);
});

test('an empty or whitespace name never matches an existing room', () => {
  resetIds();
  const move = makeMove([makeRoom([], { id: 'room-1', name: 'Living Room' })]);
  assert.equal(findRoomByName(move, ''), null);
  assert.equal(findRoomByName(move, '   '), null);
  assert.equal(normaliseRoomName('  '), '');
});

test('the duplicate room this prevents would have doubled the truck size', () => {
  // The bug: capture minted room-${Date.now()} on every shot and the reducer
  // dedups only by id, so two photos of one living room became two rooms of that
  // name, each holding a full copy of the furniture.
  resetIds();
  const furniture = () => [
    makeItem({ id: `sofa-${Math.random()}`, cubicFeet: 59.5 }),
    makeItem({ id: `fridge-${Math.random()}`, cubicFeet: 46.67 }),
    makeItem({ id: `table-${Math.random()}`, cubicFeet: 37.5 }),
    makeItem({ id: `bed-${Math.random()}`, cubicFeet: 43.56 }),
  ];

  const correct = makeMove([makeRoom(furniture(), { id: 'room-1', name: 'Living Room' })]);
  const duplicated = makeMove([
    makeRoom(furniture(), { id: 'room-1', name: 'Living Room' }),
    makeRoom(furniture(), { id: 'room-2', name: 'Living Room' }),
  ]);

  const honest = rawVolumeCuFt(correct);
  const inflated = rawVolumeCuFt(duplicated);
  assert.equal(Math.round(inflated), Math.round(honest * 2), 'the duplicate doubles the volume');

  // And the harm: the same home is quoted a larger truck, and a larger price.
  // 225 ft³ buffered fits a cargo van; 449 needs a 15ft truck — two sizes up,
  // for furniture the user owns exactly one of.
  assert.equal(recommendTruckSize(honest * 1.2), 'van');
  assert.equal(recommendTruckSize(inflated * 1.2), '15ft');
});

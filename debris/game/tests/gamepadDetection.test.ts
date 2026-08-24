import { describe, expect, it } from 'vitest';
import { filterStandardGamepads } from '../src/systems/GamepadDetection';

type FakePad = Parameters<typeof filterStandardGamepads>[0][number];

function fakePad(mapping: string): FakePad {
  return { pad: { mapping } } as unknown as FakePad;
}

describe('filterStandardGamepads', () => {
  it('keeps a gamepad reporting the standard mapping', () => {
    const standard = fakePad('standard');
    expect(filterStandardGamepads([standard])).toEqual([standard]);
  });

  it('drops a gamepad with an empty mapping - the real-world case: a Razer mouse Chrome mis-enumerated as "Unknown Gamepad"', () => {
    const phantom = fakePad('');
    expect(filterStandardGamepads([phantom])).toEqual([]);
  });

  it('keeps only the standard-mapped entries out of a mixed list, preserving order', () => {
    const phantom = fakePad('');
    const real = fakePad('standard');
    expect(filterStandardGamepads([phantom, real])).toEqual([real]);
  });
});

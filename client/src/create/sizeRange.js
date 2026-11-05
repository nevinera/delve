// The sizes an object is placed at when its size varies from one placing to the next.

export const DEFAULT_SIZE_VARY = 0.1;

// The sizes `vary` either side of `size` (0.1 is 10%), kept within { least, most }: [low, high].
export const rangeAround = (size, vary, { least, most }) => [Math.max(least, size * (1 - vary)), Math.min(most, size * (1 + vary))];

export const rollSize = ([low, high], random = Math.random) => low + random() * (high - low);

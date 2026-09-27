// Seedable PRNG (mulberry32) so every seed replays the same run.
export function makeRng(seed) {
  let a = seed >>> 0;
  const random = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  random.choice = (arr) => arr[Math.floor(random() * arr.length)];
  return random;
}

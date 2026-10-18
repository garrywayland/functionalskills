// Reads  --name value  pairs. Flags with no value (like --check-only) become true.
export function parseArgs(argv) {
  const positional = []; const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) flags[a.slice(2)] = true;
      else { flags[a.slice(2)] = next; i++; }
    } else positional.push(a);
  }
  return { positional, flags };
}

// pages/api/debug-env.js
//
// TEMPORARY diagnostic route — delete this file once the env var issue is
// fixed, since it's not something that should stay in a live app long-term.
// It never prints the actual secret values, only their shape, so it's safe
// to open in a browser while debugging.

export default function handler(req, res) {
  const url = process.env.SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const anthropicKey = process.env.ANTHROPIC_API_KEY || '';

  res.status(200).json({
    SUPABASE_URL: {
      exists: !!process.env.SUPABASE_URL,
      length: url.length,
      startsWithHttps: url.startsWith('https://'),
      endsWithTrailingSlash: url.endsWith('/'),
      containsWhitespace: /\s/.test(url),
      containsQuotes: url.includes('"') || url.includes("'"),
      first15Chars: url.slice(0, 15),
      last15Chars: url.slice(-15),
    },
    SUPABASE_SERVICE_ROLE_KEY: {
      exists: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      length: key.length,
      containsWhitespace: /\s/.test(key),
      startsWithEyJ: key.startsWith('eyJ'), // Supabase service keys are JWTs, should start like this
    },
    ANTHROPIC_API_KEY: {
      exists: !!process.env.ANTHROPIC_API_KEY,
      length: anthropicKey.length,
      startsWithSkAnt: anthropicKey.startsWith('sk-ant-'),
    },
  });
}

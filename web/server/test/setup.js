// Preloaded into every test process (node --import). The tests create many accounts from one address, so the
// per-IP sign-up budget is lifted here; the production default (10 per hour) is covered by a dedicated unit test.
process.env.RL_SIGNUPS_PER_HOUR = '100000';
process.env.RL_FAILURES_PER_15MIN = '100000';

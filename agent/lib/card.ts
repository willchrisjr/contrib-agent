export function githubLogin(): string {
  return process.env.CONTRIB_AGENT_LOGIN ?? process.env.GITHUB_ACTOR ?? "contrib-agent";
}

export function buildContributorCard(login = githubLogin()): { path: string; content: string } {
  const safe = login.replace(/[^A-Za-z0-9._-]/g, "-");
  return {
    path: `contributors/${safe}.html`,
    content: `<article>
  <h3>${safe}</h3>
  <p>Added by contrib-agent as an eval / first autonomous contribution.</p>
  <h4>Programming languages I use</h4>
  <section class="container">
    <div class="badge" style="background-color: #3178c6; color: white">
      TypeScript
    </div>
  </section>
</article>
<style>
  body { font-family: sans-serif; }
  .container { display: flex; flex-wrap: wrap; gap: 1rem; }
  .badge { padding: 0.5rem; border-radius: 0.25rem; }
</style>
`,
  };
}

export function isCardEvalRepo(fullName: string): boolean {
  return fullName.toLowerCase().endsWith("/code-contributions");
}

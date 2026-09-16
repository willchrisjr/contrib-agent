import { defineEval } from "eve/evals";
import { includes } from "eve/evals/expect";

export default defineEval({
  description: "Discover ranks fixture issues without opening a pull request.",
  async test(t) {
    await t.send(
      "Discover GitHub issues using fixture evals/fixtures/search-hits.json. Dry-run only. Do not open a pull request.",
    );
    t.succeeded();
    t.calledTool("search_issues");
    t.notCalledTool("open_draft_pr");
    t.check(t.reply, includes("code-contributions"));
  },
});

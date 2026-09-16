import { defineEval } from "eve/evals";
import { includes } from "eve/evals/expect";

export default defineEval({
  description: "Implement loop for the code-contributions card stays draft and dry-run.",
  async test(t) {
    await t.send(
      "Implement the code-contributions contributor card for issue 1. Dry-run only. Open a draft plan, do not merge.",
    );
    t.succeeded();
    t.calledTool("open_draft_pr");
    t.check(t.reply, includes("contributors/"));
  },
});

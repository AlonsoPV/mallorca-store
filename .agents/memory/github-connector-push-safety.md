---
name: Safe GitHub connector pushes
description: Preserve Git history when the GitHub API connection works but Git CLI push authentication fails.
---

If Git CLI push authentication fails, use the connected GitHub Git-database API only when every uploaded object has the same Git ID as its local counterpart and the branch can advance without force.

**Why:** Connecting GitHub can authenticate REST calls without repairing the Git remote credential. Text-oriented shell output may change line endings or lose the final newline of a commit message, producing a different commit ID even when the visible text matches.

**How to apply:** Read raw Git data without altering its bytes, verify each returned object ID before moving the branch reference, and require a fast-forward update. Fetch afterward to confirm the local and remote tips match; do not squash or silently replace the commit history.

Large text shell callback results can arrive incomplete even when truncation is not reported. Do not transport bulk Git blob content through such a result for a connector push.

**Why:** A large set of locally read blobs arrived as only the tail of the expected output, so its object data could not be trusted.

**How to apply:** Read object bytes directly from local Git inside the connector's impure execution context, verify each blob's Git ID, then compare the returned tree and commit IDs with the local ones before advancing the remote ref without force.
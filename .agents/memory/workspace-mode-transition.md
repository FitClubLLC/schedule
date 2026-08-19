---
name: Workspace mode transition
description: The relationship between project-task assignment and the editor mode that permits source changes.
---

Project-task state and editor mode are separate transitions. A task can be Active while source edits are still rejected because the workspace remains in Plan mode; editing becomes available only after the platform reports the workspace is in Build mode.

**Why:** During the Client Dashboard restoration, task assignment and two user confirmations left the editor write-locked until the explicit Build-mode update arrived.

**How to apply:** Check the actual workspace mode before applying code patches. If the mode is still Plan, stop after planning and wait for the platform’s Build-mode transition rather than retrying the patch.
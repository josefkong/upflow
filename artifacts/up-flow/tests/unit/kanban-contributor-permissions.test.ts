import { readFileSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

const ROOT = join(__dirname, "..", "..");

function read(relativePath: string) {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

test("the Kanban board is view-only when the user cannot contribute", () => {
  const board = read("src/components/projects/kanban-board.tsx");

  assert.match(
    board,
    /const deleteTask = async \(taskId: string\) => \{\s*if \(!canCreate\) return;/,
  );
  assert.match(
    board,
    /const addTaskToColumn = \(columnKey: string\) => \{\s*if \(!canCreate\) return;/,
  );
  assert.match(
    board,
    /const handleDragEnd = async \(result: DropResult\) => \{[\s\S]*?if \(!canCreate\) return;/,
  );
  assert.match(
    board,
    /<Droppable key=\{key\} droppableId=\{key\} isDropDisabled=\{!canCreate\}>/,
  );
  assert.match(board, /isDragDisabled=\{\s*!canCreate \|\|\s*selectionMode/s);
  assert.match(
    board,
    /\{canCreate &&[\s\S]{0,100}\(\s*<button[\s\S]*?<Trash2 className="w-3 h-3" \/>/,
  );
  assert.match(board, /if \(canCreate && onOpenTask\)/);
  assert.match(board, /canContribute=\{canCreate\}/);
  assert.match(
    board,
    /\{canCreate && selectedTask\?\.marketing_b2b_onboarding_form \? \(/,
  );
  assert.match(
    board,
    /\) : canCreate && selectedTask\?\.marketing_b2c_onboarding_form \? \(/,
  );
});

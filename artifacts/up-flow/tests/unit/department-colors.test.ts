import assert from "node:assert/strict";
import test from "node:test";
import {
  departmentColorForName,
  departmentColorTone,
  resolveUniqueDepartmentColors,
} from "../../src/lib/department-colors";

test("department colors keep unique stored colors and resolve duplicate ones", () => {
  const colors = resolveUniqueDepartmentColors([
    { id: "commercial", name: "Comercial", color: "blue", sort_order: 0 },
    { id: "creative", name: "Creative", color: "violet", sort_order: 1 },
    { id: "finance", name: "Finance", color: "blue", sort_order: 2 },
    { id: "support", name: "Suporte", color: "blue", sort_order: 3 },
  ]);

  assert.equal(colors.get("commercial"), "violet");
  assert.equal(colors.get("creative"), "indigo");
  assert.equal(colors.get("finance"), "blue");
  assert.equal(colors.get("support"), "pink");
  assert.equal(new Set(colors.values()).size, colors.size);
});

test("canonical UP Flow departments follow the Calendar legend palette", () => {
  assert.equal(departmentColorForName("Finance"), "blue");
  assert.equal(departmentColorForName("Comercial"), "violet");
  assert.equal(departmentColorForName("CEO"), "amber");
  assert.equal(departmentColorForName("Marketing B2B"), "green");
  assert.equal(departmentColorForName("Marketing B2C"), "teal");
  assert.equal(departmentColorForName("Suporte"), "pink");
  assert.equal(departmentColorForName("General Admin"), "orange");
  assert.equal(departmentColorForName("Creative & Design"), "indigo");
});

test("department color resolution is stable regardless of API response order", () => {
  const departments = [
    { id: "b", name: "B", color: "blue", sort_order: 2 },
    { id: "a", name: "A", color: "blue", sort_order: 1 },
  ];
  const first = resolveUniqueDepartmentColors(departments);
  const second = resolveUniqueDepartmentColors([...departments].reverse());

  assert.deepEqual([...first.entries()], [...second.entries()]);
});

test("shared department tones expose calendar and team classes", () => {
  const tone = departmentColorTone("pink");

  assert.match(tone.dot, /pink/);
  assert.match(tone.event, /border-l-pink/);
  assert.match(tone.icon, /pink/);
  assert.match(tone.badge, /pink/);
  assert.match(tone.bar, /pink/);
});

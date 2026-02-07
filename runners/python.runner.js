const fs = require("fs");
const { execSync } = require("child_process");
const { v4: uuidv4 } = require("uuid");

module.exports = async (studentCode, visibleTests, hiddenTests) => {
  const results = { visible: [], hidden: [] };
  let passedVisible = 0;
  let passedHidden = 0;

  // 1️⃣ Create temp file for compilation
  const tempFile = `/tmp/student_${uuidv4()}.py`;
  fs.writeFileSync(tempFile, studentCode);

  // 2️⃣ Compilation / Syntax Check
  try {
    execSync(`python3 -m py_compile ${tempFile}`);
  } catch (compileErr) {
    fs.unlinkSync(tempFile); // cleanup
    return {
      compilationError: compileErr.message,
      results: null,
      score: 0
    };
  }

  // 3️⃣ Run tests
  const execTest = (input) => {
    try {
      // Append code to call solution() with input
      const cmd = `python3 -c "${studentCode}\nprint(solution(${JSON.stringify(input)}))"`;
      const output = execSync(cmd, { timeout: 3000 }).toString().trim();
      return { output, error: null };
    } catch (err) {
      return { output: null, error: err.message };
    }
  };

  for (const t of visibleTests) {
    const { output, error } = execTest(t.input);
    const ok = !error && output === t.output;
    if (ok) passedVisible++;
    results.visible.push({ input: t.input, output, expected: t.output, ok, error });
  }

  for (const t of hiddenTests) {
    const { output, error } = execTest(t.input);
    const ok = !error && output === t.output;
    if (ok) passedHidden++;
    results.hidden.push({ input: t.input, output, expected: t.output, ok, error });
  }

  fs.unlinkSync(tempFile); // cleanup

  return {
    compilationError: null,
    results,
    passedVisible,
    passedHidden,
    totalVisible: visibleTests.length,
    totalHidden: hiddenTests.length,
    score: passedVisible + passedHidden
  };
};

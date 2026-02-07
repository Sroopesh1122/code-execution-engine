const { execSync } = require("child_process");

module.exports = async (studentCode, visibleTests, hiddenTests) => {
  const results = { visible: [], hidden: [] };
  let passedVisible = 0;
  let passedHidden = 0;

  // 1️⃣ Compilation / Syntax Check
  try {
    execSync(`python3 -m py_compile <(echo "${studentCode.replace(/"/g, '\\"')}")`, { shell: '/bin/bash' });
  } catch (compileErr) {
    return {
      compilationError: compileErr.message,
      results: null,
      score: 0
    };
  }

  const execTest = (input) => {
    try {
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

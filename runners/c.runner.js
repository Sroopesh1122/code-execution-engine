const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { v4: uuidv4 } = require("uuid");

module.exports = async (studentCode, visibleTests, hiddenTests) => {
  const tempDir = `/tmp/c_${uuidv4()}`;
  fs.mkdirSync(tempDir, { recursive: true });

  const filePath = path.join(tempDir, "solution.c");
  const exePath = path.join(tempDir, "solution.out");
  fs.writeFileSync(filePath, studentCode);

  // 1️⃣ Compilation
  try {
    execSync(`gcc ${filePath} -o ${exePath}`, { timeout: 5000 });
  } catch (compileErr) {
    fs.rmSync(tempDir, { recursive: true, force: true });
    return { compilationError: compileErr.message, results: null, score: 0 };
  }

  const results = { visible: [], hidden: [] };
  let passedVisible = 0;
  let passedHidden = 0;

  // 2️⃣ Run tests
  const execTest = (input) => {
    try {
      const output = execSync(exePath, {
        input: input.toString(),
        timeout: 3000,
        stdio: ['pipe', 'pipe', 'pipe'] // stdin, stdout, stderr
      }).toString().trim();
      return { output, error: null };
    } catch (err) {
      return { output: null, error: err.message };
    }
  };

  // 3️⃣ Visible tests
  for (const t of visibleTests) {
    const { output, error } = execTest(t.input);
    const ok = !error && output === t.output;
    if (ok) passedVisible++;
    results.visible.push({ input: t.input, output, expected: t.output, ok, error });
  }

  // 4️⃣ Hidden tests
  for (const t of hiddenTests) {
    const { output, error } = execTest(t.input);
    const ok = !error && output === t.output;
    if (ok) passedHidden++;
    results.hidden.push({ input: t.input, output, expected: t.output, ok, error });
  }

  // 5️⃣ Cleanup
  fs.rmSync(tempDir, { recursive: true, force: true });

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
